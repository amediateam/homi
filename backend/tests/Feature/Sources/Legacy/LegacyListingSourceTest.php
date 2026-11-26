<?php

use App\Enums\ListingSort;
use App\Exceptions\Listings\DailyLimitReached;
use App\Exceptions\Sources\LegacyContractError;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\User;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Legacy\LegacyClient;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\Legacy\Translators\FiltersTranslator;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\FilterArrays;
use Tests\Support\JsonShape;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * The legacy driver of the listing reads (WP-42 stage B): the routes with the features on `legacy` answer in the
 * shapes of WP-12, and the source caches, pools and maps legacy's outcomes as the specification says. The routes run
 * on the fixture server (`legacy.fake`); the tests that count or change legacy's answers use `LegacyListingsHttp`.
 * The limiter runs on the real clock with `Sleep` faked, so the tests raise its rate, except where it is the subject.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
});

/** The six read features of the listing capability, and the two WP-43 writes. */
const LEGACY_LISTING_FEATURES = ['feed', 'count', 'new', 'flow', 'map', 'card', 'contact', 'translation'];

function onLegacyListings(): void
{
    foreach (LEGACY_LISTING_FEATURES as $method) {
        Feature::globally()->activate("source.listings.{$method}", ['everyone' => 'legacy']);
    }
}

function legacyListings(): LegacyListingSource
{
    return app(LegacyListingSource::class);
}

function defaultFilters(): SearchFilters
{
    return SearchFilters::fromNormalised(FilterArrays::defaults());
}

function userContext(string $locale = 'ru', string $currency = 'USD'): SourceContext
{
    return new SourceContext($locale, $currency, User::factory()->create());
}

/** The city of a stub catalogue listing (its `stub` part, never answered). */
function stubCityOf(int $number): ?string
{
    foreach (LegacyFixtures::stub('listings/catalog') as $entry) {
        if (is_array($entry) && ($entry['number'] ?? null) === $number) {
            return $entry['stub']['city'] ?? null;
        }
    }

    return null;
}

/** @return list<array{level: string, message: string, context: array<array-key, mixed>}> the log lines of the callable */
function logLinesOf(callable $run): array
{
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = ['level' => $entry->level, 'message' => $entry->message, 'context' => $entry->context];
    });
    $run();

    return array_values($lines->getArrayCopy());
}

const LEGACY_ROUTE_QUERY = 'city=tashkent&deal=rent_long';

it('answers the listing reads through the legacy driver in the shapes of WP-12, in every language', function (string $locale): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    onLegacyListings();
    $headers = ['Accept-Language' => $locale];
    $query = LEGACY_ROUTE_QUERY;

    $feed = $this->getJson("/api/v1/listings?{$query}", $headers)->assertOk()->assertJsonPath('meta.source', 'legacy');
    JsonShape::assertSame(['success' => 'bool', 'data' => ['*' => ContractShapes::LISTING_PREVIEW], 'meta' => ['next_cursor' => 'string', 'source' => 'string']], JsonShape::of($feed->json()));
    expect($feed->json('data'))->toHaveCount(20)
        ->and($feed->json('meta.next_cursor'))->toStartWith('l1.');

    foreach (["/api/v1/listings/count?{$query}" => 24, "/api/v1/listings/new?{$query}&since=".(time() - 3600) => 12] as $url => $count) {
        $answer = $this->getJson($url, $headers)->assertOk()->assertJsonPath('meta.source', 'legacy')->assertJsonPath('data.count', $count);
        JsonShape::assertSame(ContractShapes::LISTING_COUNT, JsonShape::of($answer->json()));
    }

    $flow = $this->getJson("/api/v1/listings/flow?{$query}&price_max=700", $headers)->assertOk()->assertJsonPath('meta.source', 'legacy');
    JsonShape::assertSame(ContractShapes::FLOW, JsonShape::of($flow->json('data')));
    expect($flow->json('data.options'))->toHaveCount(2);

    $map = $this->getJson("/api/v1/listings/map?{$query}", $headers)->assertOk()->assertJsonPath('meta.source', 'legacy');
    JsonShape::assertSame(ContractShapes::MAP, JsonShape::of($map->json('data')));
    expect([count($map->json('data.points')), $map->json('data.with_point'), $map->json('data.total')])->toBe([23, 23, 24]);

    $card = $this->getJson('/api/v1/listings/100001', $headers)->assertOk()->assertJsonPath('meta.source', 'legacy');
    JsonShape::assertSame(ContractShapes::LISTING_DETAILS, JsonShape::of($card->json('data')));
    expect($card->json('data.number'))->toBe(100001)
        ->and($card->json('data.contact.has_phone'))->toBeFalse();

    $preview = $this->getJson('/api/v1/listings/100001?preview=1', $headers)->assertOk()->assertJsonPath('meta.source', 'legacy');
    JsonShape::assertSame(ContractShapes::LISTING_PREVIEW, JsonShape::of($preview->json('data')));
})->with(['ru', 'uz', 'en']);

it('answers every feed item, the card and the preview in the shape of the stub answer for the same listing', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    // The fixtures carry Russian names, which match the districts of the Russian reference data only.
    $ru = ['Accept-Language' => 'ru'];
    $stubCard = $this->getJson('/api/v1/listings/100001', $ru)->assertOk()->json('data');
    $stubPreviews = [];

    foreach ([...LegacyFixtures::golden('feed.default')['items'], ...LegacyFixtures::golden('feed.page2')['items']] as $item) {
        $number = (int) $item['id'];
        $stubPreviews[$number] = $this->getJson("/api/v1/listings/{$number}?preview=1", $ru)->assertOk()->json('data');
    }

    onLegacyListings();
    $items = [];
    $cursor = null;

    do {
        $page = $this->getJson('/api/v1/listings?'.LEGACY_ROUTE_QUERY.($cursor === null ? '' : '&cursor='.urlencode($cursor)), $ru)->assertOk();
        $items = [...$items, ...$page->json('data')];
        $cursor = $page->json('meta.next_cursor');
    } while ($cursor !== null);

    expect($items)->toHaveCount(24);

    foreach ($items as $item) {
        $stub = $stubPreviews[$item['number']];
        // The fixture server ignores the filters: a listing of another city keeps its district name, but only the
        // districts of the searched city give a code.
        $gaps = stubCityOf($item['number']) === 'tashkent' ? LegacyFixtures::PREVIEW_GAPS : [...LegacyFixtures::PREVIEW_GAPS, 'district.code'];
        JsonShape::assertSame(JsonShape::of($stub), JsonShape::of($item));
        expect(LegacyFixtures::nullGaps($stub, $item))->each->toBeIn($gaps);
    }

    $card = $this->getJson('/api/v1/listings/100001', $ru)->assertOk()->json('data');
    JsonShape::assertSame(JsonShape::of($stubCard), JsonShape::of($card));
    expect(LegacyFixtures::nullGaps($stubCard, $card))->each->toBeIn(LegacyFixtures::CARD_GAPS);

    $preview = $this->getJson('/api/v1/listings/100001?preview=1', $ru)->assertOk()->json('data');
    JsonShape::assertSame(JsonShape::of($stubPreviews[100001]), JsonShape::of($preview));
    expect(LegacyFixtures::nullGaps($stubPreviews[100001], $preview))->each->toBeIn(LegacyFixtures::PREVIEW_GAPS);
});

it('answers 404 not_found for a number legacy does not know, and does not ask again for a minute', function (): void {
    LegacyListingsHttp::fake();
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    onLegacyListings();

    $this->getJson('/api/v1/listings/999999')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->getJson('/api/v1/listings/999999?preview=1')->assertNotFound()->assertJsonPath('code', 'not_found');
    expect(LegacyListingsHttp::sent('/api/listings/999999'))->toHaveCount(1);

    $this->travel(61)->seconds();
    $this->getJson('/api/v1/listings/999999')->assertNotFound();
    expect(LegacyListingsHttp::sent('/api/listings/999999'))->toHaveCount(2);
});

it('answers 404 for a number at or above the native floor without asking legacy', function (): void {
    LegacyListingsHttp::fake();

    expect(fn () => legacyListings()->details(10_000_001, userContext()))->toThrow(SourceNotFound::class)
        ->and(fn () => legacyListings()->preview(10_000_001, userContext()))->toThrow(SourceNotFound::class)
        ->and(legacyListings()->previews([10_000_001], userContext()))->toBe([]);
    Http::assertNothingSent();
});

it('answers 503 source_unavailable on every read while legacy is down', function (string $url): void {
    LegacyListingsHttp::fake(fn (): mixed => Http::response(['detail' => 'down'], 500));
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    onLegacyListings();

    $this->getJson($url)->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
})->with([
    'feed' => '/api/v1/listings?'.LEGACY_ROUTE_QUERY,
    'count' => '/api/v1/listings/count?'.LEGACY_ROUTE_QUERY,
    'new since' => '/api/v1/listings/new?'.LEGACY_ROUTE_QUERY.'&since=1',
    'flow' => '/api/v1/listings/flow?'.LEGACY_ROUTE_QUERY,
    'map' => '/api/v1/listings/map?'.LEGACY_ROUTE_QUERY,
    'card' => '/api/v1/listings/100001',
    'preview' => '/api/v1/listings/100001?preview=1',
]);

it('answers 503 for the contact and the translation until WP-43 writes them', function (): void {
    LegacyListingsHttp::fake();
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
    onLegacyListings();

    $this->postJson('/api/v1/listings/100001/contact')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
    $this->postJson('/api/v1/listings/100001/translation')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
    Http::assertNothingSent();
});

it('passes legacy\'s daily limit of the card on as 429 rate_limited with reason daily, and as 503 elsewhere', function (): void {
    LegacyListingsHttp::fake(fn (): mixed => Http::response(['detail' => 'too many today'], 429, ['Retry-After' => '120']));
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    onLegacyListings();

    $this->getJson('/api/v1/listings/100001')
        ->assertStatus(429)
        ->assertHeader('Retry-After', '120')
        ->assertJsonPath('code', 'rate_limited')
        ->assertJsonPath('reason', 'daily');

    $this->getJson('/api/v1/listings/100001?preview=1')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
    $this->getJson('/api/v1/listings?'.LEGACY_ROUTE_QUERY)->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});

it('answers a new-since count of 12 from the filter query of the count plus since, without a sort', function (): void {
    LegacyListingsHttp::fake();
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    onLegacyListings();
    $query = LEGACY_ROUTE_QUERY.'&rooms_min=2&districts[]=yunusobod&sort=cheap';
    $since = time() - 3600;

    $this->getJson("/api/v1/listings/count?{$query}")->assertOk();
    $this->getJson("/api/v1/listings/new?{$query}&since={$since}")->assertOk()->assertJsonPath('data.count', 12);

    $count = LegacyListingsHttp::query(LegacyListingsHttp::sent('/api/feed/count')[0]);
    $new = LegacyListingsHttp::query(LegacyListingsHttp::sent('/api/feed/new')[0]);

    expect($new)->toBe("{$count}&since={$since}")
        ->and($new)->toContain('rooms_min=2')->toContain('districts=yunusobod')->not->toContain('sort=');
});

it('never caches the new-since count', function (): void {
    LegacyListingsHttp::fake();
    $since = time() - 3600;

    expect(legacyListings()->newSince(defaultFilters(), $since, userContext()))->toBe(12)
        ->and(legacyListings()->newSince(defaultFilters(), $since, userContext()))->toBe(12);
    expect(LegacyListingsHttp::sent('/api/feed/new'))->toHaveCount(2);
});

it('reads a new-since count of 12.0 as 12', function (): void {
    LegacyListingsHttp::fake(fn (Request $request): mixed => LegacyListingsHttp::path($request) === '/api/feed/new'
        ? Http::response('{"count": 12.0}', 200, ['Content-Type' => 'application/json'])
        : null);

    expect(legacyListings()->newSince(defaultFilters(), time() - 3600, userContext()))->toBe(12);
});

it('answers 503 and logs a contract error naming count when legacy\'s new-since count is not a whole number ≥ 0', function (string $body): void {
    LegacyListingsHttp::fake(fn (Request $request): mixed => LegacyListingsHttp::path($request) === '/api/feed/new'
        ? Http::response($body, 200, ['Content-Type' => 'application/json'])
        : null);
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    onLegacyListings();

    $lines = logLinesOf(function (): void {
        $this->getJson('/api/v1/listings/new?'.LEGACY_ROUTE_QUERY.'&since=1')
            ->assertStatus(503)
            ->assertJsonPath('code', 'source_unavailable')
            ->assertJsonMissingPath('data');
    });
    $errors = array_values(array_filter($lines, fn (array $line): bool => $line['message'] === 'A legacy answer does not fit its contract.'));

    expect($errors)->toHaveCount(1)
        ->and($errors[0]['context'])->toMatchArray(['path' => '/api/feed/new', 'keys' => ['count']]);

    try {
        legacyListings()->newSince(defaultFilters(), 1, userContext());
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe(['count']);

        return;
    }

    throw new LogicException('The new-since count was accepted.');
})->with([
    'missing' => '{}',
    'null' => '{"count": null}',
    'a string' => '{"count": "12"}',
    'negative' => '{"count": -1}',
    'a fraction' => '{"count": 2.5}',
]);

it('caches a card for a minute per number, language and currency', function (): void {
    LegacyListingsHttp::fake();

    legacyListings()->details(100001, userContext('ru'));
    legacyListings()->details(100001, userContext('ru'));
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1);

    legacyListings()->details(100001, userContext('uz'));
    legacyListings()->details(100001, userContext('ru', 'UZS'));
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(3);

    $this->travel(61)->seconds();
    legacyListings()->details(100001, userContext('ru'));
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(4);
});

it('keeps the masked card in the cache, without the phone keys and the per-user owner fields', function (): void {
    LegacyListingsHttp::fake();

    $details = legacyListings()->details(100001, userContext());
    $cached = Cache::get('legacy:v1:listings:card:100001:ru:USD');
    $serialised = json_encode($cached, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    expect($cached)->toBeArray()
        ->and($cached)->not->toHaveKeys(['phone', 'phone_display', 'call_url'])
        ->and($cached['contact'])->toMatchArray(['has_phone' => false, 'request' => null])
        ->and($cached['contact'])->not->toHaveKeys(['phone', 'phone_display', 'call_url'])
        ->and($cached['owner'])->toMatchArray(['mine' => false, 'listing_id' => null])
        ->and($cached['owner'])->not->toHaveKey('entry')
        ->and($cached['summary'])->toContain('+998 ** *** ** 67')
        ->and($cached['original']['text'])->toContain('+998 ** *** ** 67');

    foreach (['901234567', '90 123 45 67', '90 123-45-67', '123-45-67', '1234567'] as $digits) {
        expect($serialised)->not->toContain($digits);
    }

    expect(legacyListings()->details(100001, userContext())->summary)->toBe($details->summary);
});

it('serves a preview from the cached card, and caches the preview form beside it', function (): void {
    LegacyListingsHttp::fake();

    legacyListings()->details(100001, userContext());
    expect(legacyListings()->preview(100001, userContext())->number)->toBe(100001);
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1);

    legacyListings()->preview(100009, userContext());
    legacyListings()->preview(100009, userContext());
    $sent = LegacyListingsHttp::sent('/api/listings/100009');

    expect($sent)->toHaveCount(1)
        ->and(LegacyListingsHttp::query($sent[0]))->toBe('preview=1');
});

it('answers a merged duplicate with the surviving number', function (): void {
    LegacyListingsHttp::fake();

    expect(legacyListings()->details(100016, userContext())->preview->number)->toBe(100001)
        ->and(legacyListings()->preview(100016, userContext())->number)->toBe(100001);
});

it('never caches the feed', function (): void {
    LegacyListingsHttp::fake();
    $query = new ListingQuery(defaultFilters());

    legacyListings()->feed($query, userContext());
    legacyListings()->feed($query, userContext());

    expect(LegacyListingsHttp::sent('/api/feed'))->toHaveCount(2);
});

it('asks legacy for pages of 20 with the filters, the sort and the legacy cursor', function (): void {
    LegacyListingsHttp::fake();
    $page = legacyListings()->feed(new ListingQuery(defaultFilters(), ListingSort::Cheap, null, 20), userContext());
    legacyListings()->feed(new ListingQuery(defaultFilters(), ListingSort::Cheap, $page->nextCursor, 20), userContext());
    [$first, $second] = LegacyListingsHttp::sent('/api/feed');

    expect(LegacyListingsHttp::query($first))->toBe('city=tashkent&deal=rent_long&owner=any&types=apartment&limit=20&sort=cheap')
        ->and(LegacyListingsHttp::query($second))->toBe('city=tashkent&deal=rent_long&owner=any&types=apartment&limit=20&sort=cheap&cursor=fixture-cursor-page-2');
});

it('caches the count, the flow and the map for their configured seconds', function (string $method, string $path, int $seconds): void {
    LegacyListingsHttp::fake();
    $read = fn () => legacyListings()->{$method}(defaultFilters(), userContext());

    $read();
    $read();
    expect(LegacyListingsHttp::sent($path))->toHaveCount(1);

    $this->travel($seconds - 1)->seconds();
    $read();
    expect(LegacyListingsHttp::sent($path))->toHaveCount(1);

    $this->travel(2)->seconds();
    $read();
    expect(LegacyListingsHttp::sent($path))->toHaveCount(2);
})->with([
    'count, 30 s' => ['count', '/api/feed/count', 30],
    'flow, 60 s' => ['flow', '/api/feed/flow', 60],
    'map, 30 s' => ['map', '/api/map', 30],
]);

it('keys the count by language only and asks legacy for it in USD, and the map and the flow by currency too', function (): void {
    LegacyListingsHttp::fake();
    config(['legacy.currency.via' => 'query']);

    legacyListings()->count(defaultFilters(), userContext('ru', 'UZS'));
    legacyListings()->count(defaultFilters(), userContext('ru', 'USD'));
    legacyListings()->map(defaultFilters(), userContext('ru', 'UZS'));
    legacyListings()->map(defaultFilters(), userContext('ru', 'USD'));

    expect(LegacyListingsHttp::sent('/api/feed/count'))->toHaveCount(1)
        ->and(LegacyListingsHttp::query(LegacyListingsHttp::sent('/api/feed/count')[0]))->toContain('currency=USD')
        ->and(array_map(LegacyListingsHttp::query(...), LegacyListingsHttp::sent('/api/map')))->sequence(
            fn ($query) => $query->toContain('currency=UZS'),
            fn ($query) => $query->toContain('currency=USD'),
        );
});

it('asks legacy for every count when its cache is off', function (): void {
    LegacyListingsHttp::fake();
    config(['legacy.cache.count' => 0]);

    legacyListings()->count(defaultFilters(), userContext());
    legacyListings()->count(defaultFilters(), userContext());

    expect(LegacyListingsHttp::sent('/api/feed/count'))->toHaveCount(2);
});

it('reads a cached count that the store gives back as a numeric string, as Redis does', function (): void {
    LegacyListingsHttp::fake();
    $key = 'legacy:v1:listings:count:ru:'.sha1(LegacyClient::queryString(FiltersTranslator::toQuery(defaultFilters())));
    Cache::put($key, '17', 30);

    expect(legacyListings()->count(defaultFilters(), userContext()))->toBe(17);
    Http::assertNothingSent();
});

it('drops a cached card that no longer fits the card and reads it again', function (): void {
    LegacyListingsHttp::fake();
    Cache::put('legacy:v1:listings:card:100001:ru:USD', ['number' => 'not a card'], 60);

    expect(legacyListings()->details(100001, userContext())->preview->number)->toBe(100001);
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1);
});

it('reads seven previews at most five at a time, each through the limiter, and leaves out a 404', function (): void {
    config(['legacy.rate.per_second' => 5]);
    Sleep::fake(syncWithCarbon: true);
    $this->travelTo(now()->startOfSecond()->addMilliseconds(700));
    $sentAt = new ArrayObject;
    LegacyListingsHttp::fake(function (Request $request) use ($sentAt): mixed {
        $sentAt[] = [LegacyListingsHttp::path($request), now()->format('H:i:s.v')];

        return null;
    });
    $start = now();

    $previews = legacyListings()->previews([100001, 100004, 100005, 999999, 100009, 100011, 100024], userContext());

    expect(array_keys($previews))->toBe([100001, 100004, 100005, 100009, 100011, 100024])
        ->and(array_map(fn ($preview) => $preview->number, $previews))->toBe([100001 => 100001, 100004 => 100004, 100005 => 100005, 100009 => 100009, 100011 => 100011, 100024 => 100024])
        ->and(array_column($sentAt->getArrayCopy(), 1))->toBe([
            ...array_fill(0, 5, $start->format('H:i:s.v')),
            ...array_fill(0, 2, $start->copy()->addSecond()->startOfSecond()->format('H:i:s.v')),
        ])
        ->and(Cache::has('legacy:v1:listings:gone:999999'))->toBeTrue();

    foreach ($sentAt as [$path]) {
        expect($path)->toStartWith('/api/listings/');
    }
});

it('serves cached previews without asking, and asks for the others in one round', function (): void {
    LegacyListingsHttp::fake();
    legacyListings()->details(100001, userContext());
    legacyListings()->preview(100004, userContext());

    $previews = legacyListings()->previews([100004, 100001, 100005, 100004], userContext());

    expect(array_keys($previews))->toBe([100004, 100001, 100005]);
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100004'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100005'))->toHaveCount(1);
});

it('leaves an unavailable preview out with a warning, and is unavailable only when every preview is', function (): void {
    LegacyListingsHttp::fake(fn (Request $request): mixed => LegacyListingsHttp::path($request) === '/api/listings/100004' ? Http::response(['detail' => 'down'], 500) : null);

    $lines = logLinesOf(function () use (&$previews): void {
        $previews = legacyListings()->previews([100001, 100004], userContext());
    });

    expect(array_keys($previews))->toBe([100001])
        ->and(array_column($lines, 'message'))->toContain('Legacy previews failed and are left out.');

    LegacyListingsHttp::answer(fn (): mixed => Http::response(['detail' => 'down'], 500));
    expect(fn () => legacyListings()->previews([100005, 100009], userContext()))->toThrow(SourceUnavailable::class);
});

it('retries a preview that failed in transit once, like a single read', function (): void {
    $failures = new ArrayObject(['left' => 1]);
    LegacyListingsHttp::fake(function () use ($failures): mixed {
        if ($failures['left'] === 0) {
            return null;
        }

        $failures['left']--;

        return Http::response(['detail' => 'busy'], 503);
    });

    expect(array_keys(legacyListings()->previews([100001], userContext())))->toBe([100001])
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(2);
});

it('marks the calls of a system context as background calls in the limiter', function (): void {
    LegacyListingsHttp::fake();
    config(['legacy.cache.count' => 0]);
    $this->freezeTime();
    $bucket = 'legacy:out:bg:'.now()->getTimestamp();

    legacyListings()->count(defaultFilters(), SourceContext::system());
    expect(Cache::get($bucket))->toBe(1);

    legacyListings()->count(defaultFilters(), userContext());
    legacyListings()->previews([100001], userContext());
    expect(Cache::get($bucket))->toBe(1);

    legacyListings()->previews([100004], SourceContext::system());
    expect(Cache::get($bucket))->toBe(2);
});

it('gives a null district code, never a failed card, when the reference source is unavailable', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.reference', ['everyone' => 'native']);

    $card = legacyListings()->details(100001, userContext());

    expect($card->preview->districtCode)->toBeNull()
        ->and($card->preview->districtName)->not->toBeNull();
});

it('matches the district code through the reference source of the request\'s language', function (): void {
    LegacyListingsHttp::fake();

    expect(legacyListings()->details(100001, userContext())->preview->districtCode)
        ->toBe(LegacyFixtures::stubListing(100001)['district']['code']);
});

it('leaves the photo lists empty and warns at most once a minute while the media base is not set', function (): void {
    LegacyListingsHttp::fake();
    config(['legacy.media.public_url' => '']);

    $lines = logLinesOf(function () use (&$card): void {
        $card = legacyListings()->details(100001, userContext());
        legacyListings()->feed(new ListingQuery(defaultFilters()), userContext());
    });
    $warnings = array_filter($lines, fn (array $line): bool => str_starts_with($line['message'], 'LEGACY_MEDIA_PUBLIC_URL'));

    expect($card->photoItems)->toBe([])
        ->and($card->preview->photosPreview)->toBe([])
        ->and($card->preview->photosCover)->toBeNull()
        ->and($warnings)->toHaveCount(1);
});

it('counts the photo addresses it drops, whether the store keeps the counter as an int or a numeric string', function (): void {
    LegacyListingsHttp::fake();
    config(['legacy.media.hosts' => []]);
    $counter = 'legacy:v1:listings:counter:photos_dropped:'.now()->format('Y-m-d');
    Cache::put($counter, '3', 86_400);

    $lines = logLinesOf(function () use (&$card): void {
        $card = legacyListings()->details(100005, userContext());
    });
    $dropped = count(LegacyFixtures::golden('listing.daily')['photos']) + count(LegacyFixtures::golden('listing.daily')['photos_preview'] ?? []) + (isset(LegacyFixtures::golden('listing.daily')['cover']) ? 1 : 0);
    $warning = array_values(array_filter($lines, fn (array $line): bool => $line['message'] === 'Legacy photo addresses of an unknown form were dropped.'));

    expect($card->photoItems)->toBe([])
        ->and((int) Cache::get($counter))->toBe(3 + $dropped)
        ->and($warning)->toHaveCount(1)
        ->and($warning[0]['context'])->toBe(['today' => 3 + $dropped]);
});

it('pools reads and gives each its own outcome, keyed like the reads, as a single read would', function (): void {
    LegacyListingsHttp::fake(fn (Request $request): mixed => match (LegacyListingsHttp::path($request)) {
        '/api/listings/1' => Http::response(['detail' => 'busy'], 503),
        '/api/listings/2' => Http::response(['detail' => 'too many today'], 429),
        default => null,
    });

    $results = app(LegacyClient::class)->pool([
        'card' => ['/api/listings/100001', ['preview' => 1]],
        'gone' => ['/api/listings/999999'],
        'down' => ['/api/listings/1'],
        'daily' => ['/api/listings/2'],
    ]);

    expect(array_keys($results))->toBe(['card', 'gone', 'down', 'daily'])
        ->and($results['card'])->toBeArray()->toHaveKey('id', 100001)
        ->and($results['gone'])->toBeInstanceOf(SourceNotFound::class)
        ->and($results['down'])->toBeInstanceOf(SourceUnavailable::class)
        ->and($results['daily'])->toBeInstanceOf(DailyLimitReached::class)
        ->and(LegacyListingsHttp::sent('/api/listings/1'))->toHaveCount(2)
        ->and(LegacyListingsHttp::sent('/api/listings/2'))->toHaveCount(1)
        ->and(LegacyListingsHttp::query(LegacyListingsHttp::sent('/api/listings/100001')[0]))->toBe('preview=1');
    Http::assertSent(fn (Request $request): bool => $request->header('X-Service-Key') === ['listings-test-key']);
});

it('refuses every pooled read while the breaker is open, and sends none without a key', function (): void {
    LegacyListingsHttp::fake();
    Cache::put('legacy:breaker:open_until', now()->getTimestamp() + 30, 60);

    $results = app(LegacyClient::class)->pool([1 => ['/api/listings/100001'], 2 => ['/api/listings/100004']]);

    expect($results)->each->toBeInstanceOf(SourceUnavailable::class);

    Cache::forget('legacy:breaker:open_until');
    config(['legacy.service_key' => '']);
    expect(fn () => app(LegacyClient::class)->pool([1 => ['/api/listings/100001']]))->toThrow(SourceUnavailable::class);
    Http::assertNothingSent();
});
