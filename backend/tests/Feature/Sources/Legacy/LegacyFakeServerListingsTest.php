<?php

use App\Exceptions\Sources\SourceNotFound;
use App\Services\Sources\Legacy\LegacyClient;
use App\Services\Sources\Legacy\LegacyFakeServer;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Support\LegacyFixtures;

/*
 * The listing paths of the fixture server (WP-42): what the `legacy` driver's tests talk to while `legacy.fake` is on.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
});

function fakeLegacyWithKey(): PendingRequest
{
    return app(LegacyFakeServer::class)->factory()->baseUrl('https://legacy.invalid')->withHeaders([config('legacy.auth.header') => 'fake-service-key']);
}

it('answers each listing path with its golden fixture', function (string $path, string $fixture): void {
    expect(fakeLegacyWithKey()->get($path)->json())->toBe(LegacyFixtures::golden($fixture));
})->with([
    'feed' => ['/api/feed?city=tashkent&deal=rent_long&owner=any&types=apartment&limit=20', 'feed.default'],
    'count' => ['/api/feed/count?city=tashkent&deal=rent_long', 'count'],
    'new since' => ['/api/feed/new?city=tashkent&deal=rent_long&since=1795000000', 'feed_new'],
    'flow' => ['/api/feed/flow?city=tashkent&deal=rent_long', 'flow'],
    'flow of a narrow search' => ['/api/feed/flow?city=tashkent&deal=rent_long&price_max=700', 'flow.options'],
    'map' => ['/api/map?city=tashkent&deal=rent_long', 'map'],
]);

it('pages the feed: the first page names the second, which ends the list; any other cursor is an empty page', function (): void {
    $first = fakeLegacyWithKey()->get('/api/feed?limit=20')->json();
    $second = fakeLegacyWithKey()->get('/api/feed?limit=20&cursor='.$first['next_cursor'])->json();

    expect($first['next_cursor'])->toBe(LegacyFakeServer::FEED_PAGE_2_CURSOR)
        ->and($first['items'])->toHaveCount(20)
        ->and($second)->toBe(LegacyFixtures::golden('feed.page2'))
        ->and($second['next_cursor'])->toBeNull()
        ->and(array_intersect(array_column($first['items'], 'id'), array_column($second['items'], 'id')))->toBe([])
        ->and(fakeLegacyWithKey()->get('/api/feed?cursor=s1.20')->json())->toBe(LegacyFixtures::golden('feed.empty'));
});

it('counts as many listings as the two feed pages reach, and maps the ones with coordinates', function (): void {
    $items = [...LegacyFixtures::golden('feed.default')['items'], ...LegacyFixtures::golden('feed.page2')['items']];
    $withCoordinates = array_filter($items, fn (array $item): bool => $item['lat'] !== null && $item['lon'] !== null);
    $map = LegacyFixtures::golden('map');

    expect(LegacyFixtures::golden('count')['count'])->toBe(count($items))
        ->and($map['total'])->toBe(count($items))
        ->and($map['with_point'])->toBe(count($withCoordinates))
        ->and(array_map(intval(...), array_column(array_filter($map['points'], fn (array $point): bool => $point['lat'] !== null), 'id')))->toEqualCanonicalizing(array_column($withCoordinates, 'id'))
        ->and(array_map(intval(...), array_column(array_filter($map['points'], fn (array $point): bool => $point['lat'] === null), 'id')))->toBe([100007]);
});

it('answers the card of a known id and 404 for any other', function (int $id, string $fixture): void {
    expect(fakeLegacyWithKey()->get("/api/listings/{$id}")->json())->toBe(LegacyFixtures::golden($fixture));
})->with(array_map(fn (string $fixture, int $id): array => [$id, $fixture], LegacyFakeServer::CARDS, array_keys(LegacyFakeServer::CARDS)));

it('answers the merged duplicate with the surviving number', function (): void {
    expect(fakeLegacyWithKey()->get('/api/listings/100016')->json('id'))->toBe(100001);
});

/**
 * The feed items of the two golden pages, by id: each listing's own preview.
 *
 * @return array<int, array<array-key, mixed>>
 */
function goldenFeedItems(): array
{
    $items = [...LegacyFixtures::golden('feed.default')['items'], ...LegacyFixtures::golden('feed.page2')['items']];

    return array_column($items, null, 'id');
}

it('answers every listing of the catalogue: a card fixture, else its feed item as a card with the required keys', function (): void {
    foreach (goldenFeedItems() as $id => $item) {
        $card = fakeLegacyWithKey()->get("/api/listings/{$id}")->json();

        if (isset(LegacyFakeServer::CARDS[$id])) {
            expect($card)->toBe(LegacyFixtures::golden(LegacyFakeServer::CARDS[$id]));

            continue;
        }

        expect($card)->toBe($item + ['photos' => $item['photos_preview'], 'facts' => [], 'sources' => []]);
    }

    expect(goldenFeedItems())->toHaveCount(24);
});

it('answers each listing\'s own preview: the preview fixture for 100001, else the feed item of the card\'s id', function (int $asked, int $answered): void {
    $preview = fakeLegacyWithKey()->get("/api/listings/{$asked}?preview=1")->json();
    $expected = $answered === 100001 ? LegacyFixtures::golden('listing.preview') : goldenFeedItems()[$answered];

    expect($preview)->toBe($expected)
        ->and($preview['id'])->toBe($answered)
        ->and($preview)->not->toHaveKeys(['photos', 'facts', 'sources']);
})->with([[100001, 100001], [100005, 100005], [100016, 100001], [100002, 100002], [100025, 100025], [100014, 100014]]);

it('answers 404 for an unknown card, its preview and a path that is not a number', function (string $path): void {
    $response = fakeLegacyWithKey()->get($path);

    expect($response->status())->toBe(404)
        ->and($response->json())->toBe(['detail' => 'Not Found']);
})->with(['/api/listings/999999', '/api/listings/999999?preview=1', '/api/listings/abc', '/api/listings/100001/extra']);

it('refuses every listing path without the auth header', function (string $path): void {
    $response = app(LegacyFakeServer::class)->factory()->get("https://legacy.invalid{$path}");

    expect($response->status())->toBe(401);
})->with(['/api/feed', '/api/feed/count', '/api/feed/new', '/api/feed/flow', '/api/map', '/api/listings/100001', '/api/listings/100001?preview=1']);

it('serves the listing fixtures through the legacy client in fake mode', function (): void {
    $client = app(LegacyClient::class);

    expect($client->get('/api/feed', ['city' => 'tashkent', 'types' => ['apartment', 'room'], 'limit' => 20, 'cursor' => LegacyFakeServer::FEED_PAGE_2_CURSOR]))
        ->toBe(LegacyFixtures::golden('feed.page2'))
        ->and($client->get('/api/listings/100016')['id'])->toBe(100001)
        ->and(fn () => $client->get('/api/listings/999999'))->toThrow(SourceNotFound::class);
});
