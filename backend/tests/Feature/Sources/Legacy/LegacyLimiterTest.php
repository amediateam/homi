<?php

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Legacy\LegacyCall;
use App\Services\Sources\Legacy\LegacyClient;
use App\Services\Sources\Legacy\LegacyLimiter;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake(syncWithCarbon: true);
    config(['legacy.rate.per_second' => 5, 'legacy.rate.max_wait_ms' => 500, 'legacy.rate.background_share' => 0.4]);
});

/** The clock at a millisecond of a second. */
function atMillisecond(int $ms): void
{
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-26 12:00:00')->addMilliseconds($ms));
}

function limiter(): LegacyLimiter
{
    return app(LegacyLimiter::class);
}

/** Whether a call gets a place; a refusal is `false`. */
function place(bool $background = false): bool
{
    try {
        limiter()->acquire($background);
    } catch (SourceUnavailable) {
        return false;
    }

    return true;
}

it('lets per_second calls through in one second without waiting', function (): void {
    atMillisecond(100);

    expect(array_map(fn (): bool => place(), range(1, 5)))->toBe([true, true, true, true, true]);
    Sleep::assertNeverSlept();
});

it('makes the next call wait into the next second when that is within the wait it may spend', function (): void {
    atMillisecond(700);
    array_map(fn (): bool => place(), range(1, 5));

    expect(place())->toBeTrue();
    Sleep::assertSequence([Sleep::for(300)->milliseconds()]);
    expect(now()->format('s.v'))->toBe('01.000');
});

it('refuses at once a call that would wait longer than max_wait_ms', function (): void {
    atMillisecond(200);
    array_map(fn (): bool => place(), range(1, 5));

    expect(place())->toBeFalse();
    Sleep::assertNeverSlept();
});

it('gives background calls their share of a second only, and never makes them wait', function (): void {
    atMillisecond(900);

    expect([place(true), place(true), place(true)])->toBe([true, true, false]);
    Sleep::assertNeverSlept();
    expect([place(), place(), place()])->toBe([true, true, true]);
});

it('counts background calls against the second, so a user call then waits', function (): void {
    atMillisecond(800);
    place(true);
    place(true);
    array_map(fn (): bool => place(), range(1, 3));

    expect(place())->toBeTrue();
    Sleep::assertSequence([Sleep::for(200)->milliseconds()]);
});

it('refuses a background call when the second is full of user calls', function (): void {
    atMillisecond(100);
    array_map(fn (): bool => place(), range(1, 5));

    expect(place(true))->toBeFalse();
});

it('answers unavailable through the client without sending when no place is free', function (): void {
    config(['legacy.fake' => false, 'legacy.base_url' => 'https://legacy.test', 'legacy.service_key' => 'limiter-key']);
    Http::fake(['legacy.test/*' => Http::response([])]);
    atMillisecond(100);

    foreach (range(1, 5) as $call) {
        app(LegacyClient::class)->get('/api/cities');
    }

    expect(fn () => app(LegacyClient::class)->get('/api/cities', [], new LegacyCall(background: true)))->toThrow(SourceUnavailable::class);
    Http::assertSentCount(5);
});

it('gives background calls at least one place when the rate is low', function (): void {
    config(['legacy.rate.per_second' => 2]);
    atMillisecond(100);

    expect([place(true), place(true)])->toBe([true, false]);
});
