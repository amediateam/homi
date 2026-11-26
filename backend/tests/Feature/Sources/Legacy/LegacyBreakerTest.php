<?php

use App\Exceptions\AccessDenied;
use App\Exceptions\ApiException;
use App\Exceptions\Listings\DailyLimitReached;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Legacy\LegacyBreaker;
use App\Services\Sources\Legacy\LegacyClient;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    $this->freezeTime();
    // The limiter is not under test here: the clock stands still, so more than five calls share one second.
    config(['legacy.fake' => false, 'legacy.base_url' => 'https://legacy.test', 'legacy.service_key' => 'breaker-test-key', 'legacy.rate.per_second' => 1000]);
    // One fake for the whole test: a later `Http::fake()` would not replace an earlier one. It answers from the queue
    // of `answerWith()` / `answerInTurn()`, repeating the last answer.
    $GLOBALS['legacyAnswers'] = [fn () => Http::response([], 500)];
    Http::fake(['legacy.test/*' => function () {
        $answers = &$GLOBALS['legacyAnswers'];
        $next = count($answers) > 1 ? array_shift($answers) : $answers[0];

        return $next();
    }]);
});

/** One call of the client; its failure is swallowed and returned. */
function breakerCall(): ?ApiException
{
    try {
        app(LegacyClient::class)->get('/api/cities');
    } catch (ApiException $failure) {
        return $failure;
    }

    return null;
}

/** Calls that each fail with a server error. */
function failTimes(int $times): void
{
    for ($i = 0; $i < $times; $i++) {
        breakerCall();
    }
}

/** From now on legacy answers this. */
function answerWith(int $status, array $body = [], array $headers = []): void
{
    $GLOBALS['legacyAnswers'] = [fn () => Http::response($body, $status, $headers)];
}

/**
 * Legacy answers these in turn, then repeats the last one.
 *
 * @param  list<Closure>  $answers
 */
function answerInTurn(array $answers): void
{
    $GLOBALS['legacyAnswers'] = $answers;
}

it('opens after five failures in a row, and then sends nothing while open', function (): void {
    answerWith(500);
    failTimes(5);
    Http::assertSentCount(5);

    expect(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(5);
});

it('stays closed while the failures are further apart than the window', function (): void {
    answerWith(500);
    failTimes(4);
    $this->travel(31)->seconds();
    failTimes(1);

    breakerCall();
    Http::assertSentCount(6);
});

it('starts counting again after an answered call that is not a failure', function (int $status, array $body): void {
    $failure = fn () => Http::response([], 500);
    answerInTurn([$failure, $failure, $failure, $failure, fn () => Http::response($body, $status), $failure, $failure, $failure, $failure, fn () => Http::response(['ok' => true])]);

    failTimes(9);
    breakerCall();

    Http::assertSentCount(10);
})->with([
    'a 2xx' => [200, ['ok' => true]],
    'a 404' => [404, ['detail' => 'Not Found']],
    'a contract error' => [422, ['detail' => []]],
    'a pause' => [403, ['detail' => 'paused']],
    'the daily limit' => [429, ['detail' => 'too many today']],
]);

it('counts a refused key and a timeout as failures', function (): void {
    answerInTurn([
        fn () => Http::response([], 401),
        fn () => Http::response([], 403),
        fn () => Http::failedConnection(),
        fn () => Http::failedConnection(),
        fn () => Http::response([], 503),
        fn () => Http::response([], 503),
        fn () => Http::response([], 401),
    ]);

    failTimes(5);

    expect(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(7);
});

it('lets exactly one probe through after it was open, while other callers still fail at once', function (): void {
    answerWith(500);
    failTimes(5);
    $this->travel(31)->seconds();
    answerWith(200, ['ok' => true]);

    $held = Cache::lock('legacy:breaker:probe', 30);
    expect($held->get())->toBeTrue()
        ->and(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(5);

    $held->release();
    expect(breakerCall())->toBeNull()
        ->and(breakerCall())->toBeNull();
    Http::assertSentCount(7);
    expect(Cache::get('legacy:breaker:open_until'))->toBeNull();
});

it('opens again when the probe fails', function (): void {
    answerWith(500);
    failTimes(5);
    $this->travel(31)->seconds();

    expect(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(6);
    expect(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(6);

    $this->travel(31)->seconds();
    answerWith(200, ['ok' => true]);
    expect(breakerCall())->toBeNull();
});

it('opens for the Retry-After of a 429, capped at five minutes', function (string $retryAfter, int $openFor): void {
    answerWith(429, ['detail' => 'slow down'], ['Retry-After' => $retryAfter]);
    breakerCall();

    $this->travel($openFor - 1)->seconds();
    expect(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(1);

    $this->travel(2)->seconds();
    answerWith(200, ['ok' => true]);
    expect(breakerCall())->toBeNull();
})->with([
    'its seconds' => ['120', 120],
    'capped' => ['9999', 300],
]);

it('leaves the breaker closed on the daily limit and writes one warning per answer', function (): void {
    answerWith(429, ['detail' => 'too many today']);
    $warnings = 0;
    Log::listen(function (MessageLogged $entry) use (&$warnings): void {
        $warnings += $entry->message === 'Legacy answered its daily limit.' ? 1 : 0;
    });

    for ($i = 0; $i < 6; $i++) {
        expect(breakerCall())->toBeInstanceOf(DailyLimitReached::class);
    }

    Http::assertSentCount(6);
    expect($warnings)->toBe(6)
        ->and(Cache::get('legacy:breaker:open_until'))->toBeNull();
});

it('does not count a pause of legacy as a failure', function (): void {
    answerWith(403, ['detail' => 'paused']);

    for ($i = 0; $i < 6; $i++) {
        expect(breakerCall())->toBeInstanceOf(AccessDenied::class);
    }

    Http::assertSentCount(6);
});

it('logs when it opens and when it closes', function (): void {
    $lines = [];
    Log::listen(function (MessageLogged $entry) use (&$lines): void {
        $lines[] = [$entry->level, $entry->message];
    });

    answerWith(500);
    failTimes(5);
    $this->travel(31)->seconds();
    answerWith(200, ['ok' => true]);
    breakerCall();

    expect($lines)->toContain(['warning', 'The legacy breaker opened.'])
        ->toContain(['warning', 'The legacy breaker closed.']);
});

it('stays open when the cache gives the stored time back as a numeric string, as Redis does', function (): void {
    Cache::put('legacy:breaker:open_until', (string) (now()->getTimestamp() + 30), 120);
    answerWith(200, ['ok' => true]);

    expect(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertNothingSent();

    $this->travel(31)->seconds();
    expect(breakerCall())->toBeNull();
});

it('answers the generic 503 message while open, naming neither legacy nor the breaker', function (): void {
    answerWith(500);
    failTimes(5);

    expect(breakerCall()?->getMessage())->toBe('The data source is unavailable.');
});

it('holds the probe lock while the probe is under way', function (): void {
    answerWith(500);
    failTimes(5);
    $this->travel(31)->seconds();
    $lockedDuringProbe = null;
    answerInTurn([function () use (&$lockedDuringProbe) {
        $lockedDuringProbe = ! Cache::lock('legacy:breaker:probe', 1)->get();

        return Http::response(['ok' => true]);
    }]);

    expect(breakerCall())->toBeNull()
        ->and($lockedDuringProbe)->toBeTrue();
});

it('is closed by its probe only, not by a call that was already under way when it opened', function (): void {
    answerWith(429, ['detail' => 'slow down'], ['Retry-After' => '120']);
    breakerCall();

    app(LegacyBreaker::class)->succeeded(null);

    expect(breakerCall())->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(1);
});
