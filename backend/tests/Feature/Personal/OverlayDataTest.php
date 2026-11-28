<?php

use App\Models\AuthorMark;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingRef;
use App\Models\ListingView;
use App\Models\User;
use App\Services\Listings\Contracts\OverlayData;
use App\Services\Listings\ListingOverlay;
use App\Services\Personal\EloquentOverlayData;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\MapPoint;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FilterArrays;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;
use Tests\Support\ListingArrays;

/*
 * WP-44, step 7: `EloquentOverlayData` over HOMI's tables, bound in place of WP-42's `NullOverlayData`, and the overlay
 * tests of WP-42 (`ListingOverlayTest`, on a fake) run again against real rows: favourites and views as flags, hidden
 * listings and blocked authors left out of the caller's feed and map only, HOMI's rented and realtor marks for
 * everyone, the card answered anyway, the legacy feed's top-up and a full walk, and the routes of the stub and legacy
 * drivers. The per-user sets are read once per request's context; the realtor keys are cached for 60 s.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000, 'contacts.author_key_secret' => 'overlay-data-test-secret-of-32-bytes-or-more']);
});

function realOverlay(): ListingOverlay
{
    app()->forgetScopedInstances();

    return app(ListingOverlay::class);
}

/** @param  array<string, mixed>  $filters */
function realFilters(array $filters = []): SearchFilters
{
    return SearchFilters::fromNormalised([...FilterArrays::defaults(), ...$filters]);
}

function realContext(?User $user): SourceContext
{
    return new SourceContext('ru', 'USD', $user);
}

/** @param  array<string, mixed>  $overrides */
function realSummary(int $number, array $overrides = []): ListingSummary
{
    return ListingSummary::fromArray(ListingArrays::preview(['number' => $number, ...$overrides]));
}

/** @param  list<int>  $numbers */
function realPage(array $numbers): ListingPage
{
    return new ListingPage(array_map(fn (int $number): ListingSummary => realSummary($number), $numbers), 'next');
}

/** @param  list<int>  $numbers */
function realMap(array $numbers, int $total, int $withPoint): MapPoints
{
    return new MapPoints(array_map(fn (int $number): MapPoint => MapPoint::fromArray([
        'number' => $number, 'origin' => 'legacy', 'lat' => 41.3, 'lon' => 69.2, 'label' => '$600', 'tone' => null, 'priced' => true, 'usd' => 600,
    ]), $numbers), $total, $withPoint);
}

/** @return list<int> */
function realNumbers(ListingPage $page): array
{
    return array_map(fn (ListingSummary $item): int => $item->number, $page->items);
}

/** @param  list<int>  $numbers */
function fileRealAuthor(string $key, array $numbers): void
{
    foreach ($numbers as $number) {
        ListingRef::factory()->ofAuthor($key)->create(['listing_number' => $number]);
    }
}

it('is the overlay data the container binds', function (): void {
    expect(app(OverlayData::class))->toBeInstanceOf(EloquentOverlayData::class);
});

it('reads each set from its table: a user\'s own rows only, the numbers asked only, marks with their time only', function (): void {
    [$alice, $bob] = User::factory()->count(2)->create()->all();
    Favorite::factory()->for($alice)->create(['listing_number' => 1]);
    Favorite::factory()->for($alice)->create(['listing_number' => 9]);
    Favorite::factory()->for($bob)->create(['listing_number' => 2]);
    ListingView::factory()->for($alice)->create(['listing_number' => 2]);
    HiddenListing::factory()->for($alice)->create(['listing_number' => 3]);
    HiddenListing::factory()->for($bob)->create(['listing_number' => 4]);
    BlockedAuthor::factory()->for($alice)->create(['author_key' => 'phone:'.str_repeat('a', 32)]);
    BlockedAuthor::factory()->for($bob)->create(['author_key' => 'phone:'.str_repeat('b', 32)]);
    ListingMark::factory()->create(['listing_number' => 5]);
    ListingMark::factory()->create(['listing_number' => 6, 'rented_at' => null]);
    ListingMark::factory()->create(['listing_number' => 99]);
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('c', 32)]);
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('d', 32), 'realtor_marked_at' => null, 'source' => null]);
    $data = app(EloquentOverlayData::class);

    expect($data->favorites($alice, [1, 2, 3]))->toBe([1])
        ->and($data->favorites($alice, []))->toBe([])
        ->and($data->viewed($alice, [1, 2]))->toBe([2])
        ->and($data->hiddenNumbers($alice))->toBe([3])
        ->and($data->blockedAuthorKeys($alice))->toBe(['phone:'.str_repeat('a', 32)])
        ->and($data->rentedByVotes([4, 5, 6]))->toBe([5])
        ->and($data->rentedByVotes([]))->toBe([])
        ->and($data->realtorAuthorKeys())->toBe(['phone:'.str_repeat('c', 32)]);
});

it('caches the realtor keys for 60 seconds, as an array of strings', function (): void {
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('c', 32)]);
    $data = app(EloquentOverlayData::class);

    expect($data->realtorAuthorKeys())->toBe(['phone:'.str_repeat('c', 32)]);

    AuthorMark::factory()->create(['author_key' => 'source:late_channel']);

    expect($data->realtorAuthorKeys())->toHaveCount(1)
        ->and(Cache::get(EloquentOverlayData::REALTOR_KEYS))->toBe(['phone:'.str_repeat('c', 32)]);

    $this->travel(61)->seconds();

    expect($data->realtorAuthorKeys())->toEqualCanonicalizing(['phone:'.str_repeat('c', 32), 'source:late_channel']);
});

it('reads the realtor keys again when the cache holds something else', function (mixed $stored): void {
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('c', 32)]);
    Cache::put(EloquentOverlayData::REALTOR_KEYS, $stored, 60);

    expect(app(EloquentOverlayData::class)->realtorAuthorKeys())->toBe(['phone:'.str_repeat('c', 32)]);
})->with([
    'a string' => ['phone:x'],
    'a map' => [['a' => 'phone:x']],
    'a list with a number' => [['phone:x', 5]],
]);

it('sets favorite and viewed from the rows on every feed item, over the source\'s own values', function (): void {
    $user = User::factory()->create();
    Favorite::factory()->for($user)->create(['listing_number' => 2]);
    Favorite::factory()->for($user)->create(['listing_number' => 3]);
    ListingView::factory()->for($user)->create(['listing_number' => 3]);
    $page = new ListingPage([realSummary(1, ['favorite' => true, 'viewed' => true]), realSummary(2), realSummary(3)], 'next');

    $items = realOverlay()->feed($page, realFilters(), realContext($user))->items;

    expect(array_map(fn (ListingSummary $item): array => [$item->number, $item->favorite, $item->viewed], $items))
        ->toBe([[1, false, false], [2, true, false], [3, true, true]]);
});

it('leaves out of the caller\'s feed and map his hidden listings and his blocked authors\' — and only his', function (): void {
    [$user, $other] = User::factory()->count(2)->create()->all();
    HiddenListing::factory()->for($user)->create(['listing_number' => 2]);
    HiddenListing::factory()->for($user)->create(['listing_number' => 900]);
    BlockedAuthor::factory()->for($user)->create(['author_key' => 'phone:'.str_repeat('e', 32)]);
    fileRealAuthor('phone:'.str_repeat('e', 32), [4, 5]);
    fileRealAuthor('phone:'.str_repeat('f', 32), [6]);

    $page = realOverlay()->feed(realPage([1, 2, 3, 4, 5, 6]), realFilters(), realContext($user));
    $map = realOverlay()->map(realMap([1, 2, 3, 4, 5, 6], 10, 8), realFilters(), realContext($user));

    expect(realNumbers($page))->toBe([1, 3, 6])
        ->and($page->nextCursor)->toBe('next')
        ->and(array_map(fn (MapPoint $point): int => $point->number, $map->points))->toBe([1, 3, 6])
        ->and([$map->total, $map->withPoint])->toBe([7, 5])
        ->and(realNumbers(realOverlay()->feed(realPage([1, 2, 3, 4, 5, 6]), realFilters(), realContext($other))))->toBe([1, 2, 3, 4, 5, 6]);
});

it('still answers the card of a hidden listing or a blocked author\'s, with its flags', function (): void {
    $user = User::factory()->create();
    HiddenListing::factory()->for($user)->create(['listing_number' => 100012]);
    Favorite::factory()->for($user)->create(['listing_number' => 100012]);
    BlockedAuthor::factory()->for($user)->create(['author_key' => 'phone:'.str_repeat('e', 32)]);
    fileRealAuthor('phone:'.str_repeat('e', 32), [100012]);

    $preview = realOverlay()->preview(realSummary(100012), realContext($user));

    expect($preview->number)->toBe(100012)->and($preview->favorite)->toBeTrue();
});

it('leaves out the listings HOMI\'s votes mark as rented for everyone, a system context too; a row without its time marks nothing', function (): void {
    $user = User::factory()->create();
    ListingMark::factory()->create(['listing_number' => 3]);
    ListingMark::factory()->create(['listing_number' => 2, 'rented_at' => null]);

    expect(realNumbers(realOverlay()->feed(realPage([1, 2, 3]), realFilters(), SourceContext::system())))->toBe([1, 2])
        ->and(realNumbers(realOverlay()->feed(realPage([1, 2, 3]), realFilters(), realContext($user))))->toBe([1, 2]);
});

it('flips a realtor-marked author\'s listings to not an owner\'s, and leaves them out under owners and no_agents only', function (string $owner, array $expected): void {
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('r', 32)]);
    fileRealAuthor('phone:'.str_repeat('r', 32), [2]);
    $verified = new ListingPage(array_map(fn (int $number): ListingSummary => realSummary($number, ['owner_verified' => true]), [1, 2, 3]), 'next');

    $page = realOverlay()->feed($verified, realFilters(['owner' => $owner]), SourceContext::system());

    expect(realNumbers($page))->toBe($expected);

    foreach ($page->items as $item) {
        expect([$item->isOwner, $item->ownerVerified])->toBe($item->number === 2 ? [false, false] : [true, true]);
    }
})->with([
    'any' => ['any', [1, 2, 3]],
    'owners' => ['owners', [1, 3]],
    'no agents' => ['no_agents', [1, 3]],
]);

it('marks the items of a personal list with the flags and realtor marks, and never leaves one out', function (): void {
    $user = User::factory()->create();
    HiddenListing::factory()->for($user)->create(['listing_number' => 2]);
    Favorite::factory()->for($user)->create(['listing_number' => 2]);
    ListingMark::factory()->create(['listing_number' => 3]);
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('r', 32)]);
    fileRealAuthor('phone:'.str_repeat('r', 32), [1]);

    $items = realOverlay()->items([realSummary(1), realSummary(2), realSummary(3)], realContext($user));

    expect(array_map(fn (ListingSummary $item): array => [$item->number, $item->favorite, $item->isOwner], $items))
        ->toBe([[1, false, false], [2, true, true], [3, false, true]]);
});

it('hides a listing from the caller\'s feed and map through the routes, and returns it on unhide; another user still sees it', function (): void {
    [$user, $other] = User::factory()->count(2)->create()->all();
    Sanctum::actingAs($user, ['app:read', 'app:write']);
    $numbers = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');
    $whole = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');
    $hidden = $numbers[0];

    $this->putJson("/api/v1/hidden/listings/{$hidden}")->assertNoContent();
    $feed = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');
    $map = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');
    Sanctum::actingAs($other, ['app:read', 'app:write']);
    $theirs = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');
    Sanctum::actingAs($user, ['app:read', 'app:write']);
    $this->deleteJson("/api/v1/hidden/listings/{$hidden}")->assertNoContent();
    $back = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');

    expect($feed)->not->toContain($hidden)
        ->and(array_column($map['points'], 'number'))->not->toContain($hidden)
        ->and($map['total'])->toBe($whole['total'] - 1)
        ->and($theirs)->toContain($hidden)
        ->and($back)->toContain($hidden);
});

it('shows a favourite set through the route as a filled heart in the feed, on the card and in the history', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read', 'app:write']);

    $this->putJson('/api/v1/favorites/100012')->assertOk();
    $this->getJson('/api/v1/listings/100012')->assertOk()->assertJsonPath('data.favorite', true)->assertJsonPath('data.viewed', true);

    expect($this->getJson('/api/v1/history')->assertOk()->json('data.0'))->toMatchArray(['number' => 100012, 'favorite' => true, 'viewed' => true])
        ->and($this->getJson('/api/v1/favorites')->assertOk()->json('data.0'))->toMatchArray(['number' => 100012, 'favorite' => true, 'viewed' => true]);

    $this->deleteJson('/api/v1/favorites/100012')->assertOk();
    $this->getJson('/api/v1/listings/100012?preview=1')->assertOk()->assertJsonPath('data.favorite', false);
});

it('keeps a hidden favourite in the favourites and in «Скрытое», a filled heart in both', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read', 'app:write']);
    $this->putJson('/api/v1/favorites/100012')->assertOk();
    $this->putJson('/api/v1/hidden/listings/100012')->assertNoContent();

    expect($this->getJson('/api/v1/favorites')->assertOk()->json('data.0.number'))->toBe(100012)
        ->and($this->getJson('/api/v1/hidden')->assertOk()->json('data.listings.0'))->toMatchArray(['number' => 100012, 'favorite' => true]);
});

it('blocks an author through the route and leaves the author\'s filed listings out of the caller\'s legacy feed', function (): void {
    LegacyListingsHttp::fake();
    foreach (['feed', 'card'] as $method) {
        Feature::globally()->activate("source.listings.{$method}", ['everyone' => 'legacy']);
    }
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read', 'app:write']);
    $before = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');

    $blocked = $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk()->json('data.listing_numbers');
    $after = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');
    $this->deleteJson('/api/v1/listings/100001/blocked-author')->assertNoContent();
    $back = array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');

    expect($before)->toContain(100001)
        ->and($blocked)->toContain(100001)
        ->and($after)->not->toContain(100001)
        ->and($back)->toContain(100001);
});

it('shows two users different results from one cached legacy answer, from real rows', function (): void {
    LegacyListingsHttp::fake();
    foreach (['feed', 'count', 'new', 'flow', 'map', 'card'] as $method) {
        Feature::globally()->activate("source.listings.{$method}", ['everyone' => 'legacy']);
    }
    [$alice, $bob] = User::factory()->count(2)->create()->all();
    HiddenListing::factory()->for($alice)->create(['listing_number' => 100018]);
    Favorite::factory()->for($alice)->create(['listing_number' => 100001]);
    Favorite::factory()->for($bob)->create(['listing_number' => 100002]);

    Sanctum::actingAs($alice, ['app:read']);
    $aliceMap = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');
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
 * The legacy feed's top-up through the real overlay and real rows: synthetic legacy pages of 20 (numbers k·1000 + 1 …
 * k·1000 + 20, the last page's cursor `null`).
 */

function realSyntheticFeed(int $pages): void
{
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

/** @return list<int> */
function realSyntheticNumbers(int $page, int $from = 1, int $to = 20): array
{
    return array_map(fn (int $i): int => $page * 1000 + $i, range($from, $to));
}

function realLegacyFeed(User $user, ?string $cursor = null, int $limit = 20): ListingPage
{
    app()->forgetScopedInstances();

    return app(LegacyListingSource::class)->feed(new ListingQuery(realFilters(), cursor: $cursor, limit: $limit), realContext($user));
}

it('tops a legacy page with 12 of 20 hidden up from one more legacy page', function (): void {
    $user = User::factory()->create();
    realSyntheticFeed(5);
    HiddenListing::query()->insert(array_map(fn (int $number): array => ['user_id' => $user->id, 'listing_number' => $number, 'reason' => 'manual', 'created_at' => now()], realSyntheticNumbers(1, 1, 12)));

    expect(realNumbers(realLegacyFeed($user)))->toBe([...realSyntheticNumbers(1, 13, 20), ...realSyntheticNumbers(2, 1, 12)])
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(2);
});

it('delivers every listing the overlay keeps exactly once in a full walk, with a blocked author too', function (): void {
    $user = User::factory()->create();
    $all = [...realSyntheticNumbers(1), ...realSyntheticNumbers(2), ...realSyntheticNumbers(3)];
    $hidden = array_values(array_filter($all, fn (int $number): bool => $number % 3 === 0));
    realSyntheticFeed(3);
    HiddenListing::query()->insert(array_map(fn (int $number): array => ['user_id' => $user->id, 'listing_number' => $number, 'reason' => 'manual', 'created_at' => now()], $hidden));
    BlockedAuthor::factory()->for($user)->ofSource('blocked_channel')->create();
    fileRealAuthor('source:blocked_channel', [1001, 2002, 3005]);
    $numbers = [];
    $cursor = null;
    $pages = 0;

    do {
        $page = realLegacyFeed($user, $cursor, 7);
        $numbers = [...$numbers, ...realNumbers($page)];
        $cursor = $page->nextCursor;
        $pages++;
    } while ($cursor !== null && $pages < 50);

    expect($numbers)->toBe(array_values(array_diff($all, $hidden, [1001, 2002, 3005])))
        ->and($cursor)->toBeNull();
});
