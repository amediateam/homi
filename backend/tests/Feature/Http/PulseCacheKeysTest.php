<?php

use App\Models\User;
use Illuminate\Cache\Events\CacheHit;
use Illuminate\Cache\Events\CacheMissed;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Event;
use Laravel\Pulse\Pulse;
use Laravel\Pulse\Recorders\CacheInteractions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\InitDataSigner;

/**
 * Pulse's cache recorder stores every cache key it sees (WP-40, SEC-REQ-047): the keys that name a user — the sign-in
 * counters, the access decision, the cards he opened — are in its `ignore` list of `config/pulse.php`, and the hashed
 * keys of the framework's `throttle` middleware, one per user or address, are grouped into one record. The keys are
 * captured from a real sign-in and a real card open, so a renamed key fails here, and judged by the recorder itself.
 */
/** The recorder's own rule, called on a real instance: it reads its `ignore` list under its own class name. */
function pulseRecordsCacheKey(string $key): bool
{
    $recorder = new CacheInteractions(app(Pulse::class));

    return (fn (): bool => ! $this->shouldIgnore($key))->call($recorder);
}

/** The key the recorder stores for a cache key, from its `groups` list, called on a real instance. */
function pulseCacheKeyGroup(string $key): string
{
    $recorder = new CacheInteractions(app(Pulse::class));

    return (fn (): string => $this->group($key))->call($recorder);
}

/** @return Collection<int, string> the distinct cache keys read while the callback runs */
function cacheKeysReadBy(Closure $callback): Collection
{
    $keys = new ArrayObject;
    Event::listen([CacheHit::class, CacheMissed::class], function (CacheHit|CacheMissed $event) use ($keys): void {
        $keys->append($event->key);
    });

    $callback();

    return collect($keys->getArrayCopy())->unique()->values();
}

it('records none of the keys that name a user, read by a sign-in and a card open', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');

    $keys = cacheKeysReadBy(function (): void {
        test()->postJson('/api/v1/auth/telegram', ['init_data' => InitDataSigner::valid(now()->getTimestamp())])->assertOk();
        Sanctum::actingAs(User::query()->sole(), ['app:read', 'app:write']);
        test()->getJson('/api/v1/listings/100001')->assertOk();
    });

    $id = User::query()->sole()->id;
    $personal = $keys->filter(fn (string $key): bool => preg_match('/^(auth|access|listing-opens):/', $key) === 1);
    expect($personal)->toContain("auth:user:{$id}", "access:decision:{$id}", "listing-opens:user:{$id}:100001", "listing-opens:user:{$id}")
        ->and($personal->filter(fn (string $key): bool => str_starts_with($key, 'auth:exchanges:')))->not->toBeEmpty()
        ->and($personal->filter(pulseRecordsCacheKey(...))->all())->toBe([]);
});

it('still records the other keys', function (string $key): void {
    expect(pulseRecordsCacheKey($key))->toBeTrue();
})->with(['sources:logged:0f1e2d', 'reference:ru', 'user:42']);

it('records neither twin of a rate limiter key that names a user', function (string $key): void {
    expect(pulseRecordsCacheKey($key))->toBeFalse();
})->with(['listing-opens:user:42:timer', 'auth:user:42:timer', 'auth:exchanges:a1b2c3d4e5f6:timer']);

it('stores the hashed throttle keys of a sign-in and a card open as one group', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');

    $keys = cacheKeysReadBy(function (): void {
        test()->postJson('/api/v1/auth/telegram', ['init_data' => InitDataSigner::valid(now()->getTimestamp())])->assertOk();
        Sanctum::actingAs(User::query()->sole(), ['app:read', 'app:write']);
        test()->getJson('/api/v1/listings/100001')->assertOk();
    });

    $throttle = $keys->filter(fn (string $key): bool => preg_match('/^[0-9a-f]{32}(:timer)?$/', $key) === 1);
    expect($throttle)->not->toBeEmpty()
        ->and($throttle->map(pulseCacheKeyGroup(...))->unique()->values()->all())->toBe(['throttle:*']);
});

it('groups both twins of a hashed throttle key', function (string $key): void {
    expect(pulseCacheKeyGroup($key))->toBe('throttle:*');
})->with([
    'the hits' => md5('v1-listing'.'user:42'),
    'the timer' => md5('v1-listing'.'user:42').':timer',
]);

it('leaves the keys that only look like a hashed throttle key as they are', function (string $key): void {
    expect(pulseCacheKeyGroup($key))->toBe($key);
})->with([
    'a named key' => 'reference:ru',
    '31 hex digits' => substr(md5('api'), 1),
    '33 hex digits' => md5('api').'a',
    'upper case' => strtoupper(md5('api')),
    'another suffix' => md5('api').':lock',
]);
