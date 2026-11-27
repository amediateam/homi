<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Models\User;
use App\Services\Listings\Contracts\ListingExclusion;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Legacy\LegacyFeedCursor;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Tests\Support\FilterArrays;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * The paging of the legacy feed (WP-42, "Feed paging and top-up"), with a fake `ListingExclusion` in place of the
 * overlay of stage C: legacy pages of 20 (`p<k>`: numbers k·1000 + 1 … k·1000 + 20, the cursor of page k + 1, the
 * last page `null`), a HOMI page topped up while it holds fewer than half its limit, and the `l1.` cursor.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
});

/**
 * Legacy answers `$pages` synthetic feed pages; `$excluded` numbers are left out by the exclusion.
 *
 * @param  list<int>  $excluded
 */
function syntheticFeed(int $pages, array $excluded = []): void
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

    excludeNumbers($excluded);
}

/** @param  list<int>  $numbers */
function excludeNumbers(array $numbers): void
{
    app()->instance(ListingExclusion::class, new class($numbers) implements ListingExclusion
    {
        /** @param  list<int>  $numbers */
        public function __construct(private readonly array $numbers) {}

        public function excluded(array $items, SearchFilters $filters, SourceContext $context): array
        {
            return array_values(array_intersect(array_map(fn (ListingSummary $item): int => $item->number, $items), $this->numbers));
        }
    });
}

/** @return list<int> the numbers of synthetic page `$page`, items `$from` … `$to` */
function pageNumbers(int $page, int $from = 1, int $to = 20): array
{
    return array_map(fn (int $i): int => $page * 1000 + $i, range($from, $to));
}

function feedPage(?string $cursor = null, int $limit = 20): ListingPage
{
    return app(LegacyListingSource::class)->feed(
        new ListingQuery(SearchFilters::fromNormalised(FilterArrays::defaults()), cursor: $cursor, limit: $limit),
        new SourceContext('ru', 'USD', User::factory()->create()),
    );
}

/** @return list<int> */
function numbersOf(ListingPage $page): array
{
    return array_map(fn (ListingSummary $item): int => $item->number, $page->items);
}

/**
 * Every page from the first, following the cursor; at most 100 pages.
 *
 * @return array{numbers: list<int>, pages: int}
 */
function walkFeed(int $limit): array
{
    $numbers = [];
    $cursor = null;
    $pages = 0;

    do {
        $page = feedPage($cursor, $limit);
        $numbers = [...$numbers, ...numbersOf($page)];
        $cursor = $page->nextCursor;
        $pages++;
    } while ($cursor !== null && $pages < 100);

    return ['numbers' => $numbers, 'pages' => $pages];
}

function base64Cursor(string $json): string
{
    return LegacyFeedCursor::PREFIX.rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
}

it('tops a page with 12 of 20 excluded up from one more legacy page', function (): void {
    syntheticFeed(5, pageNumbers(1, 1, 12));

    $page = feedPage();

    expect(numbersOf($page))->toBe([...pageNumbers(1, 13, 20), ...pageNumbers(2, 1, 12)])
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(2)
        ->and(LegacyFeedCursor::decode((string) $page->nextCursor))->toEqual(new LegacyFeedCursor('p2', 12));
});

it('does not top up a page with three excluded', function (): void {
    syntheticFeed(5, [1002, 1010, 1019]);

    $page = feedPage();

    expect(numbersOf($page))->toHaveCount(17)
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(1)
        ->and(LegacyFeedCursor::decode((string) $page->nextCursor))->toEqual(new LegacyFeedCursor('p2', 0));
});

it('reads at most two extra legacy pages, and passes legacy\'s cursor on even after an empty page', function (): void {
    syntheticFeed(5, [...pageNumbers(1), ...pageNumbers(2), ...pageNumbers(3)]);

    $page = feedPage();

    expect($page->items)->toBe([])
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(3)
        ->and(LegacyFeedCursor::decode((string) $page->nextCursor))->toEqual(new LegacyFeedCursor('p4', 0));

    expect(numbersOf(feedPage($page->nextCursor)))->toBe(pageNumbers(4));
});

it('reads no extra page when the top-up is off', function (): void {
    config(['legacy.feed.top_up_pages' => 0]);
    syntheticFeed(5, pageNumbers(1, 1, 15));

    expect(numbersOf(feedPage()))->toBe(pageNumbers(1, 16, 20))
        ->and(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(1);
});

it('never answers more than the limit', function (int $limit, int $expected): void {
    syntheticFeed(5);

    $page = feedPage(limit: $limit);

    expect($page->items)->toHaveCount($expected)
        ->and(count($page->items))->toBeLessThanOrEqual($limit);
})->with([
    'one' => [1, 1],
    'five' => [5, 5],
    'twenty' => [20, 20],
    'fifty: two legacy pages reach half of it' => [50, 40],
]);

it('resumes inside a partly used legacy page', function (): void {
    syntheticFeed(2);

    $first = feedPage(limit: 5);
    $second = feedPage($first->nextCursor, 5);

    expect(LegacyFeedCursor::decode((string) $first->nextCursor))->toEqual(new LegacyFeedCursor(null, 5))
        ->and(numbersOf($second))->toBe(pageNumbers(1, 6, 10))
        ->and(LegacyFeedCursor::decode((string) $second->nextCursor))->toEqual(new LegacyFeedCursor(null, 10));
});

it('counts a position over the excluded items too, so the next page starts after the last one delivered', function (): void {
    syntheticFeed(2, [1001, 1002, 1003]);

    $first = feedPage(limit: 5);

    expect(numbersOf($first))->toBe(pageNumbers(1, 4, 8))
        ->and(LegacyFeedCursor::decode((string) $first->nextCursor))->toEqual(new LegacyFeedCursor(null, 8));

    // Listing 1004 is hidden after it was delivered: the walk goes on at 1009 all the same.
    excludeNumbers([1001, 1002, 1003, 1004]);
    expect(numbersOf(feedPage($first->nextCursor, 5)))->toBe(pageNumbers(1, 9, 13));
});

it('delivers every item that is not excluded exactly once in a full walk, and ends with a null cursor', function (int $limit): void {
    $excluded = array_values(array_filter([...pageNumbers(1), ...pageNumbers(2), ...pageNumbers(3), ...pageNumbers(4)], fn (int $number): bool => $number % 3 === 0));
    syntheticFeed(4, $excluded);

    $walk = walkFeed($limit);
    $expected = array_values(array_diff([...pageNumbers(1), ...pageNumbers(2), ...pageNumbers(3), ...pageNumbers(4)], $excluded));

    expect($walk['numbers'])->toBe($expected)
        ->and($walk['pages'])->toBeLessThan(100);
})->with([7, 20, 50]);

it('walks the golden pages with nothing excluded and delivers each of their 24 items once', function (int $limit): void {
    $golden = array_map(fn (array $item): int => (int) $item['id'], [...LegacyFixtures::golden('feed.default')['items'], ...LegacyFixtures::golden('feed.page2')['items']]);

    expect(walkFeed($limit)['numbers'])->toBe($golden);
})->with([7, 20, 50]);

it('ends the list quietly on a cursor it did not give, without asking legacy', function (string $cursor): void {
    syntheticFeed(5);

    $page = feedPage($cursor);

    expect($page->items)->toBe([])
        ->and($page->nextCursor)->toBeNull();
    Http::assertNothingSent();
})->with([
    'a stub cursor' => 's1.20',
    'the prefix only' => 'l1.',
    'not base64url' => 'l1.!!!',
    'base64 with a space' => 'l1.eyJjIjpudWxs LCJvIjowfQ',
    'not JSON' => base64Cursor('{"c":'),
    'a JSON list' => base64Cursor('["p2",0]'),
    'c a number' => base64Cursor('{"c":5,"o":0}'),
    'c empty' => base64Cursor('{"c":"","o":0}'),
    'o negative' => base64Cursor('{"c":"p2","o":-1}'),
    'o 100' => base64Cursor('{"c":"p2","o":100}'),
    'o a string' => base64Cursor('{"c":"p2","o":"3"}'),
    'o a fraction' => base64Cursor('{"c":"p2","o":1.5}'),
    'a key more' => base64Cursor('{"c":"p2","o":0,"x":1}'),
    'o missing' => base64Cursor('{"c":"p2"}'),
    'nested' => base64Cursor('{"c":{"a":1},"o":0}'),
    'longer than 512 bytes' => base64Cursor('{"c":"'.str_repeat('p', 400).'","o":0}'),
    'c longer than 256 bytes' => base64Cursor('{"c":"'.str_repeat('p', 257).'","o":0}'),
]);

it('takes back the cursors it gives', function (?string $legacy, int $offset): void {
    $cursor = (new LegacyFeedCursor($legacy, $offset))->encode();

    expect($cursor)->toStartWith('l1.')->toMatch('/^l1\.[A-Za-z0-9_-]+$/')
        ->and(LegacyFeedCursor::decode($cursor))->toEqual(new LegacyFeedCursor($legacy, $offset));
})->with([
    'first page' => [null, 0],
    'inside the first page' => [null, 13],
    'a legacy cursor with every character' => ['a/b+c=d?e&f é "g"', 99],
    'the longest legacy cursor, within 512 bytes' => [str_repeat('c', LegacyFeedCursor::MAX_LEGACY_BYTES), 99],
]);

it('refuses a legacy cursor over 256 bytes as a contract error naming next_cursor', function (): void {
    LegacyListingsHttp::fake(fn (Request $request): mixed => LegacyListingsHttp::path($request) === '/api/feed'
        ? Http::response(['items' => array_map(fn (int $i): array => ['id' => $i, 'photos_preview' => []], range(1, 20)), 'next_cursor' => str_repeat('c', 257)])
        : null);

    try {
        feedPage();
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe(['next_cursor'])
            ->and($error->path)->toBe('/api/feed');

        return;
    }

    throw new LogicException('A legacy cursor of 257 bytes was passed on.');
});

it('ends the list with an error logged when a legacy cursor of 256 bytes encodes past 512', function (): void {
    LegacyListingsHttp::fake(fn (Request $request): mixed => LegacyListingsHttp::path($request) === '/api/feed'
        ? Http::response(['items' => array_map(fn (int $i): array => ['id' => $i, 'photos_preview' => []], range(1, 20)), 'next_cursor' => str_repeat('"', 256)])
        : null);
    $errors = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($errors): void {
        if ($entry->level === 'error') {
            $errors[] = $entry->context;
        }
    });

    $page = feedPage();

    expect(strlen((new LegacyFeedCursor(str_repeat('"', 256), 0))->encode()))->toBeGreaterThan(LegacyFeedCursor::MAX_BYTES)
        ->and($page->items)->toHaveCount(20)
        ->and($page->nextCursor)->toBeNull()
        ->and($errors->getArrayCopy())->toBe([['path' => '/api/feed', 'problem' => 'too long to pass on', 'keys' => ['next_cursor']]]);
});
