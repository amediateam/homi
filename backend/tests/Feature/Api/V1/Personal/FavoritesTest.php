<?php

use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\ListingRef;
use App\Models\User;
use App\Services\Listings\ListingNumber;
use App\Services\Personal\PersonalCursor;
use App\Services\Sources\Stub\StubListingSource;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Illuminate\Testing\TestResponse;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-44, step 4: favourites in HOMI's table (task `KV-BE-038`). `PUT` and `DELETE` set a target state, so a repeat
 * changes nothing; the list pages by row id, newest first, 20 by default (DEC-53), its items from the card source's
 * previews in row order — a number the source no longer knows (`404`) is left out (legacy marks it gone itself, the
 * pager never does), anything else it cannot give answers `503` (brief decision 12). The stub driver answers here; the legacy fixtures where channel and
 * post or a definite `404` matter.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000, 'contacts.author_key_secret' => 'favorites-test-secret-of-32-bytes-or-more']);
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/**
 * Numbers of the stub catalogue, legacy ones below the native floor.
 *
 * @return list<int>
 */
function stubCatalogueNumbers(int $count): array
{
    $numbers = array_values(array_filter(
        array_keys(app(StubListingSource::class)->entries()),
        fn (int $number): bool => ! ListingNumber::isNative($number),
    ));

    return array_slice($numbers, 0, $count);
}

/**
 * Saves the numbers as the user's favourites, the first one oldest.
 *
 * @param  list<int>  $numbers
 */
function favouriteInOrder(User $user, array $numbers): void
{
    foreach ($numbers as $i => $number) {
        Favorite::factory()->for($user)->create(['listing_number' => $number, 'created_at' => now()->subMinutes(count($numbers) - $i)]);
    }
}

/**
 * Every page of the favourites, with the given page size.
 *
 * @return list<TestResponse>
 */
function favouritePages(int $limit = 20): array
{
    $pages = [];
    $cursor = null;

    do {
        $page = test()->getJson('/api/v1/favorites?limit='.$limit.($cursor === null ? '' : '&cursor='.$cursor))->assertOk();
        $pages[] = $page;
        $cursor = $page->json('meta.next_cursor');
    } while ($cursor !== null && count($pages) < 10);

    return $pages;
}

/** @return list<int> */
function favouriteNumbersOf(TestResponse $page): array
{
    return array_column($page->json('data'), 'number');
}

function onLegacyFavourites(): void
{
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
}

it('sets a favourite with PUT and clears it with DELETE, idempotently, in HOMI\'s table', function (): void {
    foreach ([1, 2] as $attempt) {
        $this->putJson('/api/v1/favorites/100012')->assertOk()->assertExactJson(['success' => true, 'data' => ['favorite' => true], 'meta' => ['source' => 'native']]);
    }

    expect(Favorite::query()->where('user_id', $this->user->id)->pluck('listing_number')->all())->toBe([100012]);

    foreach ([1, 2] as $attempt) {
        $this->deleteJson('/api/v1/favorites/100012')->assertOk()->assertExactJson(['success' => true, 'data' => ['favorite' => false], 'meta' => ['source' => 'native']]);
    }

    expect(Favorite::query()->count())->toBe(0);
});

it('answers 404 for an unknown listing, and 503 while the source is down unless HOMI knows the listing', function (): void {
    $this->putJson('/api/v1/favorites/999404')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->putJson('/api/v1/favorites/0')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->putJson('/api/v1/favorites/999503')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
    $this->deleteJson('/api/v1/favorites/0')->assertNotFound()->assertJsonPath('code', 'not_found');

    expect(Favorite::query()->count())->toBe(0);

    ListingRef::factory()->create(['listing_number' => 999503]);
    $this->putJson('/api/v1/favorites/999503')->assertOk()->assertJsonPath('data.favorite', true);

    expect(Favorite::query()->sole()->listing_number)->toBe(999503);
});

it('clears a favourite without asking the source, so a listing the source no longer knows can leave the list', function (): void {
    favouriteInOrder($this->user, [123456]);

    $this->deleteJson('/api/v1/favorites/123456')->assertOk()->assertJsonPath('data.favorite', false);

    expect(Favorite::query()->count())->toBe(0);
});

it('stores a merged duplicate under its survivor, and clears it by either number', function (): void {
    $this->putJson('/api/v1/favorites/100016')->assertOk()->assertJsonPath('data.favorite', true);

    expect(Favorite::query()->sole()->listing_number)->toBe(100001);

    ListingRef::factory()->create(['listing_number' => 100001]);
    ListingRef::factory()->create(['listing_number' => 100016, 'merged_into' => 100001, 'author_key' => null]);
    $this->deleteJson('/api/v1/favorites/100016')->assertOk();

    expect(Favorite::query()->count())->toBe(0);
});

it('lists the favourites newest first, each a favourite, in the shape of WP-13 from the native source', function (): void {
    favouriteInOrder($this->user, [100012, 100013, 100003]);

    $page = $this->getJson('/api/v1/favorites')->assertOk();

    JsonShape::assertSame(
        ['success' => 'bool', 'data' => ['*' => ContractShapes::LISTING_PREVIEW], 'meta' => ['next_cursor' => 'null', 'source' => 'string']],
        JsonShape::of($page->json()),
    );
    expect(favouriteNumbersOf($page))->toBe([100003, 100013, 100012])
        ->and(array_unique(array_column($page->json('data'), 'favorite')))->toBe([true]);
    $page->assertJsonPath('meta.source', 'native')->assertJsonPath('meta.next_cursor', null);
});

it('pages 45 favourites by 20, 20 and 5, each listing once, the last page ending with null', function (): void {
    $numbers = stubCatalogueNumbers(45);
    favouriteInOrder($this->user, $numbers);

    $pages = favouritePages();

    expect(array_map(fn (TestResponse $page): int => count($page->json('data')), $pages))->toBe([20, 20, 5])
        ->and($pages[0]->json('meta.next_cursor'))->toStartWith('n1.')
        ->and($pages[2]->json('meta.next_cursor'))->toBeNull()
        ->and(array_merge(...array_map(favouriteNumbersOf(...), $pages)))->toBe(array_reverse($numbers));
});

it('answers every favourite in one page with limit=50', function (): void {
    favouriteInOrder($this->user, stubCatalogueNumbers(45));

    $page = $this->getJson('/api/v1/favorites?limit=50')->assertOk();

    expect($page->json('data'))->toHaveCount(45)->and($page->json('meta.next_cursor'))->toBeNull();
});

it('neither repeats nor skips a row when a favourite is added or removed between two pages', function (): void {
    $numbers = stubCatalogueNumbers(30);
    favouriteInOrder($this->user, array_slice($numbers, 0, 25));

    $first = $this->getJson('/api/v1/favorites')->assertOk();
    $this->putJson('/api/v1/favorites/'.$numbers[26])->assertOk();
    $this->deleteJson('/api/v1/favorites/'.$numbers[24])->assertOk();
    $second = $this->getJson('/api/v1/favorites?cursor='.$first->json('meta.next_cursor'))->assertOk();

    expect(favouriteNumbersOf($first))->toBe(array_reverse(array_slice($numbers, 5, 20)))
        ->and(favouriteNumbersOf($second))->toBe(array_reverse(array_slice($numbers, 0, 5)))
        ->and($second->json('meta.next_cursor'))->toBeNull();
});

it('ends the list quietly on a cursor it did not give', function (string $cursor): void {
    favouriteInOrder($this->user, [100012]);

    $this->getJson('/api/v1/favorites?cursor='.urlencode($cursor))->assertOk()
        ->assertJsonPath('data', [])->assertJsonPath('meta.next_cursor', null)->assertJsonPath('meta.source', 'native');
})->with([
    'another list\'s cursor' => 's1.20',
    'not base64' => 'n1.@@@',
    'not JSON' => 'n1.'.rtrim(strtr(base64_encode('nope'), '+/', '-_'), '='),
    'a key of another shape' => 'n1.'.rtrim(strtr(base64_encode('["a"]'), '+/', '-_'), '='),
    'a negative id' => 'n1.'.rtrim(strtr(base64_encode('[-1]'), '+/', '-_'), '='),
    'a row id of 0' => PersonalCursor::encode([0]),
    'a row id beyond the integers' => 'n1.'.rtrim(strtr(base64_encode('[99999999999999999999]'), '+/', '-_'), '='),
    'a history cursor' => PersonalCursor::encode([1764320400, 5]),
]);

it('takes the largest integer as a cursor\'s row id', function (): void {
    favouriteInOrder($this->user, [100012]);

    $this->getJson('/api/v1/favorites?cursor='.PersonalCursor::encode([PHP_INT_MAX]))->assertOk()
        ->assertJsonPath('data.0.number', 100012)->assertJsonPath('meta.next_cursor', null);
});

it('refuses a limit outside 1 … 50', function (): void {
    $this->getJson('/api/v1/favorites?limit=0')->assertStatus(422)->assertJsonValidationErrors(['limit']);
    $this->getJson('/api/v1/favorites?limit=51')->assertStatus(422)->assertJsonValidationErrors(['limit']);
});

it('skips a listing the card source leaves out, without marking it gone, and keeps the cursor of a page one shorter', function (): void {
    $numbers = stubCatalogueNumbers(21);
    favouriteInOrder($this->user, [...array_slice($numbers, 0, 10), 123456, ...array_slice($numbers, 10)]);
    ListingRef::factory()->create(['listing_number' => 123456]);

    $first = $this->getJson('/api/v1/favorites')->assertOk();

    expect($first->json('data'))->toHaveCount(19)
        ->and(favouriteNumbersOf($first))->not->toContain(123456)
        ->and($first->json('meta.next_cursor'))->toBeString()
        ->and(ListingRef::query()->find(123456)?->gone_at)->toBeNull()
        ->and(Favorite::query()->where('listing_number', 123456)->exists())->toBeTrue();
});

it('never marks a listing gone for everyone because one user\'s card driver leaves it out (review A, F1)', function (): void {
    $attacker = User::factory()->create();
    $key = 'phone:'.str_repeat('b', 32);
    ListingRef::factory()->ofAuthor($key)->create(['listing_number' => 5550001]);
    BlockedAuthor::factory()->for($this->user)->create(['author_key' => $key, 'kind' => 'phone', 'label' => '+998 ** *** ** 11']);
    // The operator's split rule: legacy for everyone, the stub for one named account.
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy', 'users' => [(string) $attacker->id => 'stub']]);
    $before = $this->getJson('/api/v1/hidden')->assertOk()->json('data.authors.0.count');

    Sanctum::actingAs($attacker, ['app:read', 'app:write']);
    $this->putJson('/api/v1/favorites/5550001')->assertOk();
    $page = $this->getJson('/api/v1/favorites')->assertOk();

    Sanctum::actingAs($this->user, ['app:read', 'app:write']);

    expect(favouriteNumbersOf($page))->toBe([])
        ->and(ListingRef::query()->find(5550001)?->gone_at)->toBeNull()
        ->and($before)->toBe(1)
        ->and($this->getJson('/api/v1/hidden')->assertOk()->json('data.authors.0.count'))->toBe(1);
});

it('answers 503 for the whole page while the source cannot give it', function (): void {
    favouriteInOrder($this->user, [100012]);

    $this->getJson('/api/v1/favorites', ['X-Stub-Scenario' => 'source_unavailable'])->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});

it('shows a favourite of a listing merged later under its survivor', function (): void {
    favouriteInOrder($this->user, [100016]);

    expect(favouriteNumbersOf($this->getJson('/api/v1/favorites')->assertOk()))->toBe([100001]);
});

it('leaves out an item legacy answered 404 for, which legacy itself marks gone, but answers 503 when one preview fails otherwise (decision 12)', function (): void {
    onLegacyFavourites();
    favouriteInOrder($this->user, [100001, 123456, 100004]);
    ListingRef::factory()->create(['listing_number' => 123456]);

    $page = $this->getJson('/api/v1/favorites')->assertOk();

    expect(favouriteNumbersOf($page))->toBe([100004, 100001])
        ->and(ListingRef::query()->find(123456)?->gone_at)->not->toBeNull();

    favouriteInOrder($this->user, [100005]);
    ListingRef::factory()->create(['listing_number' => 100005]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_contains($request->url(), '/api/listings/100005') ? Http::response(['detail' => 'boom'], 500) : null);

    $this->getJson('/api/v1/favorites')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');

    expect(ListingRef::query()->find(100005)?->gone_at)->toBeNull();
});

it('back-fills the channel and post of a favourite saved before HOMI had seen its card', function (): void {
    onLegacyFavourites();

    $this->putJson('/api/v1/favorites/100001')->assertOk()->assertJsonPath('data.favorite', true);

    $row = Favorite::query()->sole();
    expect([$row->listing_number, $row->source_channel, $row->source_post_id])->toBe([100001, 'stub_channel_a', 4001]);
});

it('keeps the favourites of each user to that user', function (): void {
    $other = User::factory()->create();
    favouriteInOrder($other, [100003]);

    $this->putJson('/api/v1/favorites/100012')->assertOk();
    $this->deleteJson('/api/v1/favorites/100003')->assertOk();

    expect(Favorite::query()->where('user_id', $other->id)->pluck('listing_number')->all())->toBe([100003])
        ->and(favouriteNumbersOf($this->getJson('/api/v1/favorites')->assertOk()))->toBe([100012]);
});

it('answers the 61st list write of a minute with 429, every list write in one bucket per user', function (): void {
    $this->freezeTime();

    foreach (range(1, 30) as $write) {
        $this->putJson('/api/v1/favorites/100012')->assertOk();
        $this->deleteJson('/api/v1/favorites/100012')->assertOk();
    }

    $this->putJson('/api/v1/favorites/100012')->assertTooManyRequests()->assertJsonPath('code', 'rate_limited');
    $this->putJson('/api/v1/hidden/listings/100012')->assertTooManyRequests();

    expect(Favorite::query()->count())->toBe(0);

    $this->travel(61)->seconds();
    $this->putJson('/api/v1/favorites/100012')->assertOk();
});
