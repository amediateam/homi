<?php

use App\Enums\AccessReason;
use App\Exceptions\AccessDenied;
use App\Exceptions\Sources\LegacyContractError;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\User;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Legacy\LegacyCall;
use App\Services\Sources\Legacy\LegacyClient;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\Legacy\LegacyWaitBudget;
use App\Services\Sources\SourceContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Support\EnvOverride;
use Tests\Support\FilterArrays;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * The pooled reads of the card previews (WP-42 review: M1, L2, L3, L4 and the verdict on background batches): each
 * read goes out in the second the limiter gave it a place, a batch has an overall deadline, a background batch waits
 * within its own budget, and a pooled read is mapped, retried, counted and addressed as a single read is. The clock is
 * frozen at 700 ms into a second and moves only with the faked sleeps and where a test moves it.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake(syncWithCarbon: true);
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 5]);
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-27 12:00:00')->addMilliseconds(700));
});

function pooledSource(): LegacyListingSource
{
    return app(LegacyListingSource::class);
}

function poolUser(string $locale = 'ru', string $currency = 'USD'): SourceContext
{
    return new SourceContext($locale, $currency, User::factory()->create());
}

/** @return list<int> the first `$count` listings of the two feed pages */
function feedNumbers(int $count): array
{
    $items = [...LegacyFixtures::golden('feed.default')['items'], ...LegacyFixtures::golden('feed.page2')['items']];

    return array_slice(array_map(intval(...), array_column($items, 'id')), 0, $count);
}

/** A fake that records the second each legacy request was sent in, answering from the fixtures. */
function recordSeconds(ArrayObject $seconds): void
{
    LegacyListingsHttp::fake(function (Request $request) use ($seconds): mixed {
        $seconds[] = now()->format('H:i:s');

        return null;
    });
}

/** @return array<string, int> how many requests went out in each second */
function perSecond(ArrayObject $seconds): array
{
    return array_count_values($seconds->getArrayCopy());
}

/**
 * `config/legacy.php` read with the given environment values.
 *
 * @param  array<string, string>  $env
 * @return array<string, mixed>
 */
function legacyConfigWith(array $env): array
{
    if ($env === []) {
        return require config_path('legacy.php');
    }

    $key = array_key_first($env);
    $value = $env[$key];
    unset($env[$key]);

    return EnvOverride::with($key, $value, fn (): array => legacyConfigWith($env));
}

function contractErrors(): int
{
    return (int) Cache::get('legacy:v1:listings:counter:contract_errors:'.now()->format('Y-m-d'));
}

it('sends each pooled read in the second the limiter gave it a place, never more than per_second in one second (M1)', function (): void {
    config(['legacy.previews.concurrency' => 10]);
    $seconds = new ArrayObject;
    recordSeconds($seconds);
    $numbers = feedNumbers(10);

    $previews = pooledSource()->previews($numbers, poolUser());

    expect(array_keys($previews))->toBe($numbers)
        ->and(perSecond($seconds))->toBe(['12:00:00' => 5, '12:00:01' => 5]);
    Sleep::assertSequence([Sleep::for(300)->milliseconds()]);
});

it('sends the reads that find a place in a partly used second at once, and the others in the next one (M1)', function (): void {
    $seconds = new ArrayObject;
    recordSeconds($seconds);
    Cache::put('legacy:out:'.now()->getTimestamp(), 3, 2);
    $reads = array_combine(feedNumbers(5), array_map(fn (int $number): array => ["/api/listings/{$number}", ['preview' => 1]], feedNumbers(5)));

    $results = app(LegacyClient::class)->pool($reads, new LegacyCall, new LegacyWaitBudget(4000));

    expect($results)->each->toBeArray()
        ->and(perSecond($seconds))->toBe(['12:00:00' => 2, '12:00:01' => 3]);
});

it('refuses the pooled reads that find no place within a single read\'s wait when no shared wait is given', function (): void {
    $seconds = new ArrayObject;
    recordSeconds($seconds);
    $reads = array_combine(feedNumbers(12), array_map(fn (int $number): array => ["/api/listings/{$number}", ['preview' => 1]], feedNumbers(12)));

    $results = app(LegacyClient::class)->pool($reads);

    expect(array_map(fn (mixed $result): string => is_array($result) ? 'read' : class_basename($result), array_values($results)))
        ->toBe([...array_fill(0, 10, 'read'), 'SourceUnavailable', 'SourceUnavailable'])
        ->and(perSecond($seconds))->toBe(['12:00:00' => 5, '12:00:01' => 5]);
});

it('lets a background batch wait for places within its own budget, and makes it unavailable once that is spent', function (): void {
    expect(config('legacy.previews.background_wait_ms'))->toBe(2000);
    $seconds = new ArrayObject;
    recordSeconds($seconds);

    // The background share of 5 a second is 2: 700 ms, then 1 000 ms of waiting give three seconds of two places.
    $previews = pooledSource()->previews(feedNumbers(6), SourceContext::system());

    expect(array_keys($previews))->toBe(feedNumbers(6))
        ->and(perSecond($seconds))->toBe(['12:00:00' => 2, '12:00:01' => 2, '12:00:02' => 2]);

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-27 12:01:00')->addMilliseconds(700));
    Cache::flush();

    expect(fn () => pooledSource()->previews(feedNumbers(8), SourceContext::system()))->toThrow(SourceUnavailable::class);

    $cached = array_values(array_filter(feedNumbers(8), fn (int $number): bool => Cache::has("legacy:v1:listings:preview:{$number}:ru:USD")));
    expect($cached)->toBe(feedNumbers(6));
});

it('never makes a background single read wait, as before', function (): void {
    LegacyListingsHttp::fake();
    config(['legacy.cache.count' => 0, 'legacy.rate.per_second' => 2, 'legacy.rate.background_share' => 0.5]);
    $system = SourceContext::system();

    pooledSource()->count(SearchFilters::fromNormalised(FilterArrays::defaults()), $system);

    expect(fn () => pooledSource()->count(SearchFilters::fromNormalised(FilterArrays::defaults()), $system))->toThrow(SourceUnavailable::class);
    Sleep::assertNeverSlept();
});

it('makes the batch unavailable once its deadline passes, keeping the previews answered before (L4)', function (): void {
    config(['legacy.previews.deadline_ms' => 1000, 'legacy.previews.concurrency' => 2, 'legacy.rate.per_second' => 1000]);
    $sent = new ArrayObject;
    LegacyListingsHttp::fake(function (Request $request) use ($sent): mixed {
        $sent[] = LegacyListingsHttp::path($request);
        CarbonImmutable::setTestNow(now()->addMilliseconds(600));

        return null;
    });
    $numbers = feedNumbers(4);

    expect(fn () => pooledSource()->previews($numbers, poolUser()))->toThrow(SourceUnavailable::class);

    expect($sent->getArrayCopy())->toBe(["/api/listings/{$numbers[0]}", "/api/listings/{$numbers[1]}"])
        ->and(Cache::has("legacy:v1:listings:preview:{$numbers[0]}:ru:USD"))->toBeTrue()
        ->and(Cache::has("legacy:v1:listings:preview:{$numbers[1]}:ru:USD"))->toBeTrue()
        ->and(Cache::has("legacy:v1:listings:preview:{$numbers[2]}:ru:USD"))->toBeFalse();
});

it('cuts the reads the deadline leaves unanswered, without a retry and without counting them against legacy (L4)', function (): void {
    config(['legacy.previews.deadline_ms' => 1000, 'legacy.rate.per_second' => 1000]);
    $sent = new ArrayObject;
    LegacyListingsHttp::fake(function (Request $request) use ($sent): mixed {
        $sent[] = LegacyListingsHttp::path($request);
        CarbonImmutable::setTestNow(now()->addMilliseconds(300));

        return (Http::failedConnection())($request);
    });

    expect(fn () => pooledSource()->previews(feedNumbers(5), poolUser()))->toThrow(SourceUnavailable::class);

    expect($sent)->toHaveCount(5)
        ->and(Cache::get('legacy:breaker:failures'))->toBeNull()
        ->and(Cache::has('legacy:breaker:open_until'))->toBeFalse();
});

it('ends every pooled request by the deadline: a later round gets a shorter timeout and connect timeout (L4)', function (): void {
    config(['legacy.previews.deadline_ms' => 3000, 'legacy.previews.concurrency' => 2, 'legacy.rate.per_second' => 1000]);
    $timeouts = new ArrayObject;
    LegacyListingsHttp::fake(function (Request $request, array $options) use ($timeouts): mixed {
        $timeouts[] = [$options['timeout'] ?? null, $options['connect_timeout'] ?? null];
        CarbonImmutable::setTestNow(now()->addMilliseconds(1000));

        return null;
    });

    expect(array_keys(pooledSource()->previews(feedNumbers(4), poolUser())))->toBe(feedNumbers(4))
        ->and($timeouts->getArrayCopy())->toBe([[3.0, 3.0], [3.0, 3.0], [1.0, 1.0], [1.0, 1.0]]);
});

it('keeps the configured timeouts while the deadline is further away than one timeout', function (): void {
    config(['legacy.rate.per_second' => 1000]);
    $timeouts = new ArrayObject;
    LegacyListingsHttp::fake(function (Request $request, array $options) use ($timeouts): mixed {
        $timeouts[] = [$options['timeout'] ?? null, $options['connect_timeout'] ?? null];

        return null;
    });

    pooledSource()->previews(feedNumbers(2), poolUser());

    expect($timeouts->getArrayCopy())->toEqual([[15, 5], [15, 5]]);
});

it('gives the previews a deadline of their wait and one HTTP timeout unless the environment sets one', function (): void {
    $config = legacyConfigWith(...);

    expect($config([])['previews'])->toMatchArray(['max_wait_ms' => 4000, 'background_wait_ms' => 2000, 'deadline_ms' => 19_000])
        ->and($config(['LEGACY_PREVIEWS_MAX_WAIT_MS' => '2500'])['previews']['deadline_ms'])->toBe(17_500)
        ->and($config(['LEGACY_PREVIEWS_DEADLINE_MS' => '8000'])['previews']['deadline_ms'])->toBe(8000)
        ->and($config(['LEGACY_PREVIEWS_DEADLINE_MS' => ' '])['previews']['deadline_ms'])->toBe(19_000)
        ->and($config(['LEGACY_PREVIEWS_DEADLINE_MS' => '0'])['previews']['deadline_ms'])->toBe(19_000)
        ->and($config(['LEGACY_PREVIEWS_BACKGROUND_WAIT_MS' => '3000'])['previews']['background_wait_ms'])->toBe(3000)
        ->and($config(['LEGACY_PREVIEWS_BACKGROUND_WAIT_MS' => 'soon'])['previews']['background_wait_ms'])->toBe(2000);
});

it('retries a pooled read that failed in transit once, leaving the other reads of its round alone (L3)', function (): void {
    config(['legacy.rate.per_second' => 1000]);
    $numbers = feedNumbers(3);
    $sent = new ArrayObject;
    LegacyListingsHttp::fake(function (Request $request) use ($sent, $numbers): mixed {
        $path = LegacyListingsHttp::path($request);
        $sent[] = $path;

        return $path === "/api/listings/{$numbers[1]}" && count(array_keys($sent->getArrayCopy(), $path, true)) === 1
            ? (Http::failedConnection())($request)
            : null;
    });

    $previews = pooledSource()->previews($numbers, poolUser());

    expect(array_keys($previews))->toBe($numbers)
        ->and(array_count_values($sent->getArrayCopy()))->toBe([
            "/api/listings/{$numbers[0]}" => 1,
            "/api/listings/{$numbers[1]}" => 2,
            "/api/listings/{$numbers[2]}" => 1,
        ]);
});

it('fails only the pooled read that failed in transit twice, counting it against legacy once (L3)', function (): void {
    config(['legacy.rate.per_second' => 1000]);
    $failing = '/api/listings/'.feedNumbers(2)[1];
    LegacyListingsHttp::fake(fn (Request $request): mixed => LegacyListingsHttp::path($request) === $failing ? (Http::failedConnection())($request) : null);
    $reads = ['ok' => ['/api/listings/'.feedNumbers(1)[0], ['preview' => 1]], 'down' => [$failing, ['preview' => 1]]];

    $results = app(LegacyClient::class)->pool($reads);

    expect($results['ok'])->toBeArray()
        ->and($results['down'])->toBeInstanceOf(SourceUnavailable::class)
        ->and((int) Cache::get('legacy:breaker:failures'))->toBe(1);
});

it('sends the language and the currency of the call with every pooled read, as a single read does (L3)', function (string $via): void {
    config(['legacy.rate.per_second' => 1000, 'legacy.locale.via' => $via, 'legacy.locale.name' => $via === 'query' ? 'lang' : 'Accept-Language', 'legacy.currency.via' => $via, 'legacy.currency.name' => $via === 'query' ? 'currency' : 'X-Currency']);
    LegacyListingsHttp::fake();
    $numbers = feedNumbers(3);

    pooledSource()->details($numbers[0], poolUser('uz', 'UZS'));
    pooledSource()->previews(array_slice($numbers, 1), poolUser('uz', 'UZS'));

    $single = LegacyListingsHttp::sent("/api/listings/{$numbers[0]}")[0];
    $pooled = [LegacyListingsHttp::sent("/api/listings/{$numbers[1]}")[0], LegacyListingsHttp::sent("/api/listings/{$numbers[2]}")[0]];

    foreach ($pooled as $request) {
        if ($via === 'query') {
            expect(LegacyListingsHttp::query($request))->toBe('preview=1&lang=uz_Latn&currency=UZS')
                ->and(LegacyListingsHttp::query($single))->toBe('lang=uz_Latn&currency=UZS');
        } else {
            expect($request->header('Accept-Language'))->toBe(['uz_Latn'])->toBe($single->header('Accept-Language'))
                ->and($request->header('X-Currency'))->toBe(['UZS'])->toBe($single->header('X-Currency'))
                ->and(LegacyListingsHttp::query($request))->toBe('preview=1');
        }
    }
})->with(['query', 'header']);

it('counts a contract error of a pooled read as a single read counts it (L2)', function (): void {
    config(['legacy.rate.per_second' => 1000]);
    LegacyListingsHttp::fake(fn (Request $request): mixed => Http::response('not json', 200));
    $numbers = feedNumbers(2);

    expect(fn () => pooledSource()->preview($numbers[0], poolUser()))->toThrow(LegacyContractError::class);
    expect(contractErrors())->toBe(1);

    expect(fn () => pooledSource()->previews([$numbers[1]], poolUser()))->toThrow(SourceUnavailable::class);
    expect(contractErrors())->toBe(2);
});

it('answers a batch of previews on legacy\'s pause as the pause, 403 with the reason paused, and never as a breaker failure', function (): void {
    config(['legacy.rate.per_second' => 1000]);
    $numbers = feedNumbers(3);
    LegacyListingsHttp::fake(fn (Request $request): mixed => LegacyListingsHttp::path($request) === "/api/listings/{$numbers[1]}" ? Http::response(['detail' => 'paused'], 403) : null);

    try {
        pooledSource()->previews($numbers, poolUser());
        $this->fail('The batch was answered during the pause.');
    } catch (AccessDenied $paused) {
        expect($paused->reason)->toBe(AccessReason::Paused);
    }

    expect(Cache::get('legacy:breaker:failures'))->toBeNull();
});
