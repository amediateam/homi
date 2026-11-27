<?php

use App\Models\Favorite;
use App\Models\ListingRef;
use App\Models\ListingView;
use App\Models\User;
use App\Services\Listings\ListingNumber;
use App\Services\Personal\PersonalCursor;
use App\Services\Sources\Stub\StubListingSource;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/*
 * WP-44, step 5: the view history of `listing_views` (WP-42 records a full card read; task `KV-BE-039`), paged like
 * the feed by the composite keyset (`last_viewed_at`, `id`), newest first (brief decision 13): the cursor carries both,
 * so rows that share a second neither repeat nor go missing, on SQLite and PostgreSQL alike. Clearing deletes the
 * caller's rows, which also resets `viewed` everywhere. No cap (DEC-53).
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->travelTo('2026-11-28 09:00:00');
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/** @return list<int> */
function historyNumbersOf(TestResponse $page): array
{
    return array_column($page->json('data'), 'number');
}

/**
 * Every page of the history, with the given page size.
 *
 * @return list<TestResponse>
 */
function historyPages(int $limit = 20): array
{
    $pages = [];
    $cursor = null;

    do {
        $page = test()->getJson('/api/v1/history?limit='.$limit.($cursor === null ? '' : '&cursor='.$cursor))->assertOk();
        $pages[] = $page;
        $cursor = $page->json('meta.next_cursor');
    } while ($cursor !== null && count($pages) < 10);

    return $pages;
}

/** @return list<int> legacy numbers of the stub catalogue */
function historyCatalogueNumbers(int $count): array
{
    $numbers = array_values(array_filter(array_keys(app(StubListingSource::class)->entries()), fn (int $number): bool => ! ListingNumber::isNative($number)));

    return array_slice($numbers, 0, $count);
}

it('lists a full card read by a user in that user\'s history only, with viewed: true, from the native source', function (): void {
    $this->getJson('/api/v1/listings/100012')->assertOk();
    $this->getJson('/api/v1/listings/100013?preview=1')->assertOk();

    $page = $this->getJson('/api/v1/history')->assertOk();

    JsonShape::assertSame(
        ['success' => 'bool', 'data' => ['*' => ContractShapes::LISTING_PREVIEW], 'meta' => ['next_cursor' => 'null', 'source' => 'string']],
        JsonShape::of($page->json()),
    );
    expect(historyNumbersOf($page))->toBe([100012])
        ->and($page->json('data.0.viewed'))->toBeTrue();
    $page->assertJsonPath('meta.source', 'native');

    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
    $this->getJson('/api/v1/history')->assertOk()->assertJsonPath('data', []);
});

it('walks 45 views by last view, newest first, in pages of 20, 20 and 5 — rows sharing a second included', function (): void {
    $numbers = historyCatalogueNumbers(45);

    foreach ($numbers as $i => $number) {
        // Three views to a second: the keyset must order them by id within it.
        ListingView::factory()->for($this->user)->create(['listing_number' => $number, 'last_viewed_at' => now()->subSeconds(100 - intdiv($i, 3))]);
    }

    $pages = historyPages();

    expect(array_map(fn (TestResponse $page): int => count($page->json('data')), $pages))->toBe([20, 20, 5])
        ->and(array_merge(...array_map(historyNumbersOf(...), $pages)))->toBe(array_reverse($numbers))
        ->and($pages[2]->json('meta.next_cursor'))->toBeNull();
});

it('cuts a page inside a second that several views share, and resumes in it', function (): void {
    $numbers = historyCatalogueNumbers(5);

    foreach ($numbers as $number) {
        ListingView::factory()->for($this->user)->create(['listing_number' => $number, 'last_viewed_at' => now()->subMinute()]);
    }

    $pages = historyPages(2);

    expect(array_map(fn (TestResponse $page): array => historyNumbersOf($page), $pages))
        ->toBe([[$numbers[4], $numbers[3]], [$numbers[2], $numbers[1]], [$numbers[0]]]);
});

it('does not repeat on the next page a listing of the first page that is opened again meanwhile', function (): void {
    $numbers = historyCatalogueNumbers(25);

    foreach ($numbers as $i => $number) {
        ListingView::factory()->for($this->user)->create(['listing_number' => $number, 'last_viewed_at' => now()->subMinutes(30 - $i)]);
    }

    $first = $this->getJson('/api/v1/history')->assertOk();
    $this->travel(1)->seconds();
    $this->getJson('/api/v1/listings/'.$numbers[24])->assertOk();
    $this->getJson('/api/v1/listings/'.$numbers[10])->assertOk();
    $second = $this->getJson('/api/v1/history?cursor='.$first->json('meta.next_cursor'))->assertOk();

    expect(historyNumbersOf($first))->toBe(array_reverse(array_slice($numbers, 5, 20)))
        ->and(historyNumbersOf($second))->toBe(array_reverse(array_slice($numbers, 0, 5)))
        ->and(historyNumbersOf($this->getJson('/api/v1/history?limit=2')->assertOk()))->toBe([$numbers[24], $numbers[10]]);
});

it('ends the list quietly on a cursor it did not give, favourites\' among them', function (string $cursor): void {
    ListingView::factory()->for($this->user)->create(['listing_number' => 100012]);

    $this->getJson('/api/v1/history?cursor='.urlencode($cursor))->assertOk()
        ->assertJsonPath('data', [])->assertJsonPath('meta.next_cursor', null);
})->with([
    'a stub cursor' => 's1.20',
    'a favourites cursor' => PersonalCursor::encode([5]),
    'not base64' => 'n1.%%%',
    'a time that is not whole' => 'n1.'.rtrim(strtr(base64_encode('[1.5,3]'), '+/', '-_'), '='),
]);

it('skips a listing the card source leaves out, without marking it gone', function (): void {
    ListingView::factory()->for($this->user)->create(['listing_number' => 100012, 'last_viewed_at' => now()->subMinutes(2)]);
    ListingView::factory()->for($this->user)->create(['listing_number' => 123456, 'last_viewed_at' => now()->subMinute()]);
    ListingRef::factory()->create(['listing_number' => 123456]);

    expect(historyNumbersOf($this->getJson('/api/v1/history')->assertOk()))->toBe([100012])
        ->and(ListingRef::query()->find(123456)?->gone_at)->toBeNull();
});

it('answers 503 while the source cannot give the page', function (): void {
    ListingView::factory()->for($this->user)->create(['listing_number' => 100012]);

    $this->getJson('/api/v1/history', ['X-Stub-Scenario' => 'source_unavailable'])->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});

it('clears the history with 204, twice, leaving favourites, other users\' history and resetting viewed', function (): void {
    $other = User::factory()->create();
    ListingView::factory()->for($other)->create(['listing_number' => 100012]);
    Favorite::factory()->for($this->user)->create(['listing_number' => 100012]);
    $this->getJson('/api/v1/listings/100012')->assertOk()->assertJsonPath('data.viewed', true);
    $this->getJson('/api/v1/listings/100012?preview=1')->assertOk()->assertJsonPath('data.viewed', true);

    $this->deleteJson('/api/v1/history')->assertNoContent();
    $this->deleteJson('/api/v1/history')->assertNoContent();

    $this->getJson('/api/v1/history')->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.next_cursor', null);
    $this->getJson('/api/v1/listings/100012?preview=1')->assertOk()->assertJsonPath('data.viewed', false);
    expect(Favorite::query()->where('user_id', $this->user->id)->count())->toBe(1)
        ->and(ListingView::query()->where('user_id', $other->id)->count())->toBe(1);
});
