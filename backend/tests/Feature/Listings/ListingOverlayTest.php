<?php

use App\Enums\ContactRequestStatus;
use App\Http\Resources\Api\V1\ListingDetailsResource;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Models\ListingRef;
use App\Models\ListingView;
use App\Models\User;
use App\Services\Listings\Contracts\ListingExclusion;
use App\Services\Listings\Contracts\OwnerOverlayData;
use App\Services\Listings\ListingOverlay;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\ContactRequestState;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\MapPoint;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\FixtureStore;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeOverlayData;
use Tests\Support\FilterArrays;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;
use Tests\Support\ListingArrays;
use Tests\TestCase;

/*
 * HOMI's overlay of listing answers (WP-42, "Overlay"), with a fake `OverlayData`: the flags, the exclusions of feed
 * and map (hidden, blocked authors through `listing_refs`, rented by votes), the realtor marks, the owner part of the
 * card, the routes of every driver, one cached legacy answer seen by two users, and the legacy feed's top-up through
 * the real overlay.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    $this->data = FakeOverlayData::bind();
});

function overlay(): ListingOverlay
{
    return app(ListingOverlay::class);
}

/** @param  array<string, mixed>  $filters */
function overlayFilters(array $filters = []): SearchFilters
{
    return SearchFilters::fromNormalised([...FilterArrays::defaults(), ...$filters]);
}

function overlayContext(?User $user): SourceContext
{
    return new SourceContext('ru', 'USD', $user);
}

/** @param  array<string, mixed>  $overrides */
function summaryOf(int $number, array $overrides = []): ListingSummary
{
    return ListingSummary::fromArray(ListingArrays::preview(['number' => $number, ...$overrides]));
}

/** @param  array<string, mixed>  $overrides */
function cardOf(int $number, array $overrides = []): ListingDetails
{
    return ListingDetails::fromArray(ListingArrays::details(['number' => $number, ...$overrides]));
}

/** @param  list<int>  $numbers */
function pageOf(array $numbers, ?string $cursor = 'next'): ListingPage
{
    return new ListingPage(array_map(fn (int $number): ListingSummary => summaryOf($number), $numbers), $cursor);
}

/** @param  list<int>  $numbers */
function mapOf(array $numbers, int $total, int $withPoint): MapPoints
{
    return new MapPoints(array_map(fn (int $number): MapPoint => MapPoint::fromArray([
        'number' => $number, 'origin' => 'legacy', 'lat' => 41.3, 'lon' => 69.2, 'label' => '$600', 'tone' => null, 'priced' => true, 'usd' => 600,
    ]), $numbers), $total, $withPoint);
}

/** @return list<int> */
function itemNumbers(ListingPage $page): array
{
    return array_map(fn (ListingSummary $item): int => $item->number, $page->items);
}

/** @param  list<int>  $numbers */
function fileUnder(string $authorKey, array $numbers): void
{
    foreach ($numbers as $number) {
        ListingRef::factory()->ofAuthor($authorKey)->create(['listing_number' => $number]);
    }
}

function legacyListingFeatures(): void
{
    foreach (['feed', 'count', 'new', 'flow', 'map', 'card'] as $method) {
        Feature::globally()->activate("source.listings.{$method}", ['everyone' => 'legacy']);
    }
}

it('sets favorite and viewed from HOMI\'s data on every item, over the source\'s own values', function (): void {
    $user = User::factory()->create();
    $this->data->favorites[$user->id] = [2, 3];
    $this->data->viewed[$user->id] = [3];
    $page = new ListingPage([summaryOf(1, ['favorite' => true, 'viewed' => true]), summaryOf(2), summaryOf(3)], 'next');

    $items = overlay()->feed($page, overlayFilters(), overlayContext($user))->items;

    expect(array_map(fn (ListingSummary $item): array => [$item->number, $item->favorite, $item->viewed], $items))
        ->toBe([[1, false, false], [2, true, false], [3, true, true]]);
});

it('removes hidden listings and those of blocked authors from the feed and the map, and keeps the cursor', function (): void {
    $user = User::factory()->create();
    $this->data->hidden[$user->id] = [2, 900];
    $this->data->blocked[$user->id] = ['phone:blocked'];
    fileUnder('phone:blocked', [4, 5]);
    fileUnder('phone:other', [6]);

    $page = overlay()->feed(pageOf([1, 2, 3, 4, 5, 6]), overlayFilters(), overlayContext($user));
    $map = overlay()->map(mapOf([1, 2, 3, 4, 5, 6], 10, 8), overlayFilters(), overlayContext($user));

    expect(itemNumbers($page))->toBe([1, 3, 6])
        ->and($page->nextCursor)->toBe('next')
        ->and(array_map(fn (MapPoint $point): int => $point->number, $map->points))->toBe([1, 3, 6])
        ->and($map->total)->toBe(7)
        ->and($map->withPoint)->toBe(5);
});

it('still answers the card of a hidden listing or a blocked author, with its flags', function (): void {
    $user = User::factory()->create();
    $this->data->hidden[$user->id] = [100012];
    $this->data->blocked[$user->id] = ['phone:blocked'];
    $this->data->favorites[$user->id] = [100012];
    fileUnder('phone:blocked', [100012]);

    $card = overlay()->card(cardOf(100012), overlayContext($user));

    expect($card->preview->number)->toBe(100012)
        ->and($card->preview->favorite)->toBeTrue()
        ->and(overlay()->preview(summaryOf(100012), overlayContext($user))->favorite)->toBeTrue();
});

it('removes the listings HOMI\'s votes mark as rented, for a system context too, where nothing personal applies', function (): void {
    $user = User::factory()->create();
    $this->data->rented = [3];
    $this->data->hidden[$user->id] = [2];
    $this->data->favorites[$user->id] = [1];

    $system = overlay()->feed(pageOf([1, 2, 3]), overlayFilters(), SourceContext::system());

    expect(itemNumbers($system))->toBe([1, 2])
        ->and($system->items[0]->favorite)->toBeFalse()
        ->and(itemNumbers(overlay()->feed(pageOf([1, 2, 3]), overlayFilters(), overlayContext($user))))->toBe([1]);
});

it('flips a realtor-marked author\'s listings to not an owner\'s, and removes them under owners and no_agents only', function (string $owner, array $expected): void {
    $this->data->realtors = ['phone:realtor'];
    fileUnder('phone:realtor', [2]);
    $verified = new ListingPage(array_map(fn (int $number): ListingSummary => summaryOf($number, ['owner_verified' => true]), [1, 2, 3]), 'next');

    $page = overlay()->feed($verified, overlayFilters(['owner' => $owner]), SourceContext::system());
    $map = overlay()->map(mapOf([1, 2, 3], 3, 3), overlayFilters(['owner' => $owner]), SourceContext::system());

    expect(itemNumbers($page))->toBe($expected)
        ->and(array_map(fn (MapPoint $point): int => $point->number, $map->points))->toBe($expected)
        ->and($map->total)->toBe(count($expected));

    foreach ($page->items as $item) {
        $json = (new ListingPreviewResource($item))->resolve();
        expect([$json['is_owner'], $json['owner_verified']])->toBe($item->number === 2 ? [false, false] : [true, true]);
    }
})->with([
    'any' => ['any', [1, 2, 3]],
    'owners' => ['owners', [1, 3]],
    'no agents' => ['no_agents', [1, 3]],
]);

it('marks a realtor\'s card and its preview: not an owner\'s, not verified, no tier, and no invitation to place a listing', function (): void {
    $user = User::factory()->create();
    $this->data->realtors = ['phone:realtor'];
    fileUnder('phone:realtor', [100012]);
    $source = cardOf(100012, ['owner_verified' => true, 'owner' => ['tier' => 'verified', 'mine' => false, 'listing_id' => null, 'entry' => true, 'response_minutes' => null, 'description' => null]]);

    $card = overlay()->card($source, overlayContext($user));
    $json = (new ListingDetailsResource($card))->response()->getData(true)['data'];
    $preview = (new ListingPreviewResource(overlay()->preview(summaryOf(100012, ['owner_verified' => true]), overlayContext($user))))->resolve();

    expect($card->preview->isOwner)->toBeFalse()
        ->and($card->preview->ownerVerified)->toBeFalse()
        ->and($card->owner->tier)->toBeNull()
        ->and($card->owner->entry)->toBeFalse()
        ->and([$json['is_owner'], $json['owner_verified'], $json['owner']['tier']])->toBe([false, false, null])
        ->and([$preview['is_owner'], $preview['owner_verified']])->toBe([false, false]);
});

it('writes owner.entry (DEC-94): an owner\'s listing that is not the caller\'s own, while the cabinet is on', function (): void {
    $user = User::factory()->create();
    $owners = (array) ListingArrays::details()['owner'];

    expect(overlay()->card(cardOf(100012), overlayContext($user))->owner->entry)->toBeTrue()
        ->and(overlay()->card(cardOf(100012, ['is_owner' => false]), overlayContext($user))->owner->entry)->toBeFalse()
        ->and(overlay()->card(cardOf(100012, ['owner' => [...$owners, 'mine' => true, 'listing_id' => '01JF0000000000000000000003']]), overlayContext($user))->owner->entry)->toBeFalse();

    config(['owner.enabled' => false]);
    expect(overlay()->card(cardOf(100012), overlayContext($user))->owner->entry)->toBeFalse();
});

it('leaves the source\'s owner and request parts while no owner data is bound, and writes them once one is', function (): void {
    $user = User::factory()->create();
    $mineCard = cardOf(10000008, ['origin' => 'native', 'owner' => [...(array) ListingArrays::details()['owner'], 'mine' => true, 'listing_id' => '01JF0000000000000000000003']]);
    $requestCard = cardOf(10000003, ['origin' => 'native', 'contact' => ['has_phone' => false, 'contact_url' => null, 'contact_paid' => false, 'mode' => 'request', 'request' => ['status' => 'pending', 'sent_at' => null]]]);

    expect(overlay()->card($mineCard, overlayContext($user))->owner->listingId)->toBe('01JF0000000000000000000003')
        ->and(overlay()->card($requestCard, overlayContext($user))->contactRequest?->status)->toBe(ContactRequestStatus::Pending);

    app()->instance(OwnerOverlayData::class, new class implements OwnerOverlayData
    {
        public function ownListings(User $user, array $numbers): ?array
        {
            return in_array(100012, $numbers, true) ? [100012 => '01JF0000000000000000000009'] : [];
        }

        public function contactRequests(User $user, array $numbers): ?array
        {
            return in_array(10000003, $numbers, true) ? [10000003 => new ContactRequestState(ContactRequestStatus::Given, null)] : [];
        }
    });
    app()->forgetScopedInstances();

    $own = overlay()->card(cardOf(100012), overlayContext($user));
    $given = overlay()->card($requestCard, overlayContext($user));

    expect(overlay()->card($mineCard, overlayContext($user))->owner->mine)->toBeFalse()
        ->and($own->owner->mine)->toBeTrue()
        ->and($own->owner->listingId)->toBe('01JF0000000000000000000009')
        ->and($own->owner->entry)->toBeFalse()
        ->and($given->contactRequest?->status)->toBe(ContactRequestStatus::Given)
        ->and($given->hasPhone)->toBeTrue()
        ->and(overlay()->card(cardOf(100012), overlayContext($user))->contactRequest)->toBeNull();
});

it('overlays nothing while sources.native_stubs is on', function (): void {
    config(['sources.native_stubs' => true]);
    $user = User::factory()->create();
    $this->data->hidden[$user->id] = [2];
    $this->data->favorites[$user->id] = [1];
    $this->data->rented = [3];

    $page = overlay()->feed(pageOf([1, 2, 3]), overlayFilters(), overlayContext($user));

    expect(itemNumbers($page))->toBe([1, 2, 3])
        ->and($page->items[0]->favorite)->toBeFalse()
        ->and(overlay()->map(mapOf([1, 2, 3], 3, 3), overlayFilters(), overlayContext($user))->points)->toHaveCount(3)
        ->and(overlay()->excluded($page->items, overlayFilters(), overlayContext($user)))->toBe([])
        ->and(overlay()->card(cardOf(1), overlayContext($user))->preview->favorite)->toBeFalse()
        ->and($this->data->reads)->toBe(0);
});

/** @return int the statements on `listing_refs` that `$run` sends */
function listingRefsQueries(Closure $run): int
{
    DB::flushQueryLog();
    DB::enableQueryLog();
    $run();
    $queries = array_filter(DB::getQueryLog(), fn (array $query): bool => str_contains((string) $query['query'], 'listing_refs'));
    DB::disableQueryLog();

    return count($queries);
}

it('reads HOMI\'s data once per list, and asks listing_refs only when a key could match', function (): void {
    $user = User::factory()->create();

    $none = listingRefsQueries(fn (): ListingPage => overlay()->feed(pageOf(range(1, 20)), overlayFilters(), overlayContext($user)));

    expect($none)->toBe(0)
        ->and($this->data->reads)->toBe(6)
        ->and($this->data->calls)->toEqual(['hiddenNumbers' => 1, 'rentedByVotes' => 1, 'blockedAuthorKeys' => 1, 'realtorAuthorKeys' => 1, 'favorites' => 1, 'viewed' => 1]);

    $this->data->blocked[$user->id] = ['phone:blocked'];
    $blocked = listingRefsQueries(fn (): ListingPage => overlay()->feed(pageOf(range(1, 20)), overlayFilters(), overlayContext($user)));
    $this->data->blocked = [];
    $this->data->realtors = ['phone:realtor'];
    $realtor = listingRefsQueries(fn (): ListingPage => overlay()->feed(pageOf(range(1, 20)), overlayFilters(), overlayContext($user)));

    expect($blocked)->toBe(1)
        ->and($realtor)->toBe(1);
});

it('reads only the flags and the realtor keys for a card and its preview, never the exclusion sets', function (): void {
    $user = User::factory()->create();
    $this->data->hidden[$user->id] = [100012];
    $this->data->rented = [100012];

    overlay()->card(cardOf(100012), overlayContext($user));
    $card = $this->data->calls;
    $this->data->calls = [];
    overlay()->preview(summaryOf(100012), overlayContext($user));

    expect($card)->toEqual(['realtorAuthorKeys' => 1, 'favorites' => 1, 'viewed' => 1])
        ->and($this->data->calls)->toEqual(['realtorAuthorKeys' => 1, 'favorites' => 1, 'viewed' => 1]);
});

it('reads each set of a caller once for a legacy feed page with one top-up, through the route', function (): void {
    $user = User::factory()->create();
    overlaidSyntheticFeed(5, $user, $this->data, overlaidPageNumbers(1, 1, 12));
    $this->data->blocked[$user->id] = ['phone:blocked'];
    Feature::globally()->activate('source.listings.feed', ['everyone' => 'legacy']);
    Sanctum::actingAs($user, ['app:read']);

    $queries = listingRefsQueries(fn () => $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->assertJsonPath('meta.source', 'legacy')->assertJsonCount(20, 'data'));

    expect(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(2)
        ->and($this->data->callsOf('hiddenNumbers'))->toBe(1)
        ->and($this->data->callsOf('blockedAuthorKeys'))->toBe(1)
        ->and($this->data->callsOf('realtorAuthorKeys'))->toBe(1)
        ->and($this->data->callsOf('favorites'))->toBe(1)
        ->and($this->data->callsOf('viewed'))->toBe(1)
        ->and($this->data->callsOf('rentedByVotes'))->toBe(3)
        ->and($queries)->toBe(3);
});

it('binds one overlay per request lifecycle: the exclusion of the legacy feed is the controllers\' overlay', function (): void {
    $first = app(ListingOverlay::class);

    expect(app(ListingExclusion::class))->toBe($first)
        ->and(app(ListingOverlay::class))->toBe($first);

    app()->forgetScopedInstances();

    expect(app(ListingOverlay::class))->not->toBe($first)
        ->and(app(ListingExclusion::class))->toBe(app(ListingOverlay::class));
});

/**
 * Binds a stub fixture store over a copy of the fixtures in which every listing of the catalogue is a favourite and
 * viewed, so a test sees whether the overlay and the view recorder touched an answer. The copy is removed after the
 * test; the shared catalogue is never changed.
 */
function flaggedFixtures(TestCase $test): void
{
    $root = sys_get_temp_dir().'/homi-fixtures-'.bin2hex(random_bytes(6));
    File::copyDirectory(resource_path('fixtures/v1'), $root);
    $catalog = json_decode((string) file_get_contents("{$root}/listings/catalog.json"), true, flags: JSON_THROW_ON_ERROR);
    $flagged = array_map(fn (array $entry): array => [...$entry, 'favorite' => true, 'viewed' => true], $catalog);
    file_put_contents("{$root}/listings/catalog.json", json_encode($flagged, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    app()->instance(FixtureStore::class, new FixtureStore($root));
    (fn () => $this->beforeApplicationDestroyed(fn (): bool => File::deleteDirectory($root)))->call($test);
}

it('skips the overlay and the view recorder on the feed and card routes while sources.native_stubs is on', function (): void {
    config(['sources.native_stubs' => true]);
    flaggedFixtures($this);
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read']);
    $feed = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->assertJsonPath('meta.source', 'stub');
    $number = $feed->json('data.0.number');
    $this->data->hidden[$user->id] = [$number];

    $again = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk();
    $card = $this->getJson("/api/v1/listings/{$number}")->assertOk();
    $preview = $this->getJson("/api/v1/listings/{$number}?preview=1")->assertOk();

    expect(array_unique(array_column($feed->json('data'), 'favorite')))->toBe([true])
        ->and(array_unique(array_column($feed->json('data'), 'viewed')))->toBe([true])
        ->and($again->json('data.0.number'))->toBe($number)
        ->and([$card->json('data.favorite'), $card->json('data.viewed')])->toBe([true, true])
        ->and([$preview->json('data.favorite'), $preview->json('data.viewed')])->toBe([true, true])
        ->and($this->data->reads)->toBe(0)
        ->and(ListingView::query()->count())->toBe(0);
});

it('overwrites the flags of the same flagged fixture once sources.native_stubs is off', function (): void {
    flaggedFixtures($this);
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read']);

    $feed = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->assertJsonPath('meta.source', 'stub');
    $number = $feed->json('data.0.number');
    $card = $this->getJson("/api/v1/listings/{$number}")->assertOk();

    expect(array_unique(array_column($feed->json('data'), 'favorite')))->toBe([false])
        ->and(array_unique(array_column($feed->json('data'), 'viewed')))->toBe([false])
        ->and([$card->json('data.favorite'), $card->json('data.viewed')])->toBe([false, true])
        ->and(ListingView::query()->count())->toBe(1);
});

it('overlays the stub driver\'s feed, map and card on the routes', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read']);
    $numbers = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');
    $whole = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');
    [$hidden, $favourite] = [$numbers[0], $numbers[1]];
    $this->data->hidden[$user->id] = [$hidden];
    $this->data->favorites[$user->id] = [$favourite];

    $feed = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->assertJsonPath('meta.source', 'stub');
    $map = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');

    expect(array_column($feed->json('data'), 'number'))->not->toContain($hidden)
        ->and($feed->json('data.0.number'))->toBe($favourite)
        ->and($feed->json('data.0.favorite'))->toBeTrue()
        ->and(array_column($map['points'], 'number'))->not->toContain($hidden)
        ->and($map['total'])->toBe($whole['total'] - 1)
        ->and($map['with_point'])->toBe($whole['with_point'] - 1);
    $this->getJson("/api/v1/listings/{$hidden}")->assertOk()->assertJsonPath('data.number', $hidden)->assertJsonPath('data.favorite', false);
    $this->getJson("/api/v1/listings/{$favourite}?preview=1")->assertOk()->assertJsonPath('data.favorite', true);
});

it('shows two users different results from one cached legacy answer', function (): void {
    LegacyListingsHttp::fake();
    legacyListingFeatures();
    [$alice, $bob] = User::factory()->count(2)->create()->all();
    $this->data->hidden[$alice->id] = [100018];
    $this->data->favorites[$alice->id] = [100001];
    $this->data->favorites[$bob->id] = [100002];

    Sanctum::actingAs($alice, ['app:read']);
    $aliceMap = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->assertJsonPath('meta.source', 'legacy')->json('data');
    $aliceCard = $this->getJson('/api/v1/listings/100001')->assertOk()->json('data');
    Sanctum::actingAs($bob, ['app:read']);
    $bobMap = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');
    $bobCard = $this->getJson('/api/v1/listings/100001')->assertOk()->json('data');

    expect(LegacyListingsHttp::sent('/api/map'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1)
        ->and(array_column($aliceMap['points'], 'number'))->not->toContain(100018)
        ->and(array_column($bobMap['points'], 'number'))->toContain(100018)
        ->and($aliceMap['total'])->toBe($bobMap['total'] - 1)
        ->and($aliceCard['favorite'])->toBeTrue()
        ->and($bobCard['favorite'])->toBeFalse();
});

/*
 * The legacy feed's top-up through the real overlay: synthetic legacy pages of 20 (`p<k>`: numbers k·1000 + 1 …
 * k·1000 + 20, the cursor of page k + 1, the last page `null`), the excluded ones hidden by the caller.
 */

/** @param  list<int>  $hidden */
function overlaidSyntheticFeed(int $pages, User $user, FakeOverlayData $data, array $hidden): void
{
    $data->hidden[$user->id] = $hidden;

    LegacyListingsHttp::fake(function (Request $request) use ($pages): mixed {
        if (LegacyListingsHttp::path($request) !== '/api/feed') {
            return null;
        }

        parse_str(LegacyListingsHttp::query($request), $query);
        $cursor = $query['cursor'] ?? null;
        $page = $cursor === null ? 1 : (int) substr((string) $cursor, 1);

        return Http::response([
            'items' => $page <= $pages ? array_map(fn (int $i): array => ['id' => $page * 1000 + $i, 'photos_preview' => []], range(1, 20)) : [],
            'next_cursor' => $page < $pages ? 'p'.($page + 1) : null,
        ]);
    });
}

/** @return list<int> the numbers of synthetic page `$page`, items `$from` … `$to` */
function overlaidPageNumbers(int $page, int $from = 1, int $to = 20): array
{
    return array_map(fn (int $i): int => $page * 1000 + $i, range($from, $to));
}

function overlaidFeedPage(User $user, ?string $cursor = null, int $limit = 20): ListingPage
{
    return app(LegacyListingSource::class)->feed(new ListingQuery(overlayFilters(), cursor: $cursor, limit: $limit), overlayContext($user));
}

it('tops a legacy page with 12 of 20 hidden up from one more legacy page, and not one with three', function (): void {
    $user = User::factory()->create();
    overlaidSyntheticFeed(5, $user, $this->data, overlaidPageNumbers(1, 1, 12));

    expect(itemNumbers(overlaidFeedPage($user)))->toBe([...overlaidPageNumbers(1, 13, 20), ...overlaidPageNumbers(2, 1, 12)])
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(2);

    $other = User::factory()->create();
    $this->data->hidden[$other->id] = [1002, 1010, 1019];

    expect(overlaidFeedPage($other)->items)->toHaveCount(17)
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(3);
});

it('reads at most two extra legacy pages for one HOMI page through the overlay', function (): void {
    $user = User::factory()->create();
    overlaidSyntheticFeed(5, $user, $this->data, [...overlaidPageNumbers(1), ...overlaidPageNumbers(2), ...overlaidPageNumbers(3)]);

    expect(overlaidFeedPage($user)->items)->toBe([])
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(3);
});

it('delivers every listing the overlay keeps exactly once in a full walk, with a blocked author too', function (): void {
    $user = User::factory()->create();
    $all = [...overlaidPageNumbers(1), ...overlaidPageNumbers(2), ...overlaidPageNumbers(3)];
    $hidden = array_values(array_filter($all, fn (int $number): bool => $number % 3 === 0));
    overlaidSyntheticFeed(3, $user, $this->data, $hidden);
    $this->data->blocked[$user->id] = ['source:blocked_channel'];
    fileUnder('source:blocked_channel', [1001, 2002, 3005]);
    $numbers = [];
    $cursor = null;
    $pages = 0;

    do {
        $page = overlaidFeedPage($user, $cursor, 7);
        $numbers = [...$numbers, ...itemNumbers($page)];
        $cursor = $page->nextCursor;
        $pages++;
    } while ($cursor !== null && $pages < 50);

    expect($numbers)->toBe(array_values(array_diff($all, $hidden, [1001, 2002, 3005])))
        ->and($cursor)->toBeNull();
});
