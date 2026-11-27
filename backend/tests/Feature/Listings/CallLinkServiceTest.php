<?php

use App\Exceptions\Sources\SourceUnavailable;
use App\Models\User;
use App\Services\Listings\CallLinkClaims;
use App\Services\Listings\CallLinkService;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/*
 * WP-43, KV-BE-037, SEC-REQ-026: HOMI's signed call links. A link of 600 s is valid until 660 s after it was issued
 * (60 s of skew); the token is the base64url of its claims, a dot and the base64url of their HMAC-SHA-256.
 */

const CALL_KEY = 'call-link-test-key-of-at-least-32-bytes';

const CALL_KEY_NEXT = 'call-link-next-key-of-at-least-32-bytes';

beforeEach(function (): void {
    Http::preventStrayRequests();
    Date::setTestNow('2026-11-27 09:00:00');
    config(['app.url' => 'https://api.homi.test', 'contacts.call_link_signing_key' => CALL_KEY, 'contacts.call_link_signing_key_previous' => '']);
});

function callLinks(): CallLinkService
{
    return app(CallLinkService::class);
}

/** The token of a call page address. */
function tokenOf(string $url): string
{
    return substr($url, strrpos($url, '/') + 1);
}

/** @return array<array-key, mixed> the decoded claims of a token, unverified */
function claimsOf(string $token): array
{
    return json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true, flags: JSON_THROW_ON_ERROR);
}

function encodedClaims(array $claims): string
{
    return rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
}

it('issues a link to the call page whose token holds the listing, the user, the locale and the expiry, never a phone', function (): void {
    $user = User::factory()->create();

    $link = callLinks()->issue($user, 100001, 'uz');
    $token = tokenOf($link->url);

    expect($link->url)->toStartWith('https://api.homi.test/call/')
        ->and($link->url)->toMatch('~^https://api\.homi\.test/call/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$~')
        ->and($link->expiresAt->toIso8601String())->toBe('2026-11-27T09:10:00+00:00')
        ->and(claimsOf($token))->toBe(['n' => 100001, 'u' => $user->id, 'l' => 'uz', 'x' => 1795770600])
        ->and(strlen($token))->toBeLessThan(CallLinkService::MAX_TOKEN_LENGTH)
        ->and(callLinks()->verify($token))->toEqual(new CallLinkClaims(100001, $user->id, 'uz', 1795770600));
});

it('builds the address on contacts.call_page_base when it is set', function (): void {
    config(['contacts.call_page_base' => 'https://call.homi.test/']);

    expect(callLinks()->issue(User::factory()->create(), 7, 'ru')->url)->toStartWith('https://call.homi.test/call/');
});

it('keeps a link valid until 60 s after its expiry', function (int $seconds, bool $expired): void {
    $token = tokenOf(callLinks()->issue(User::factory()->create(), 100001, 'ru')->url);

    $this->travel($seconds)->seconds();

    expect(callLinks()->verify($token)?->expired())->toBe($expired);
})->with([
    'at once' => [0, false],
    'at +600 s' => [600, false],
    'at +659 s' => [659, false],
    'at +660 s' => [660, false],
    'at +661 s' => [661, true],
    'a day later' => [86_400, true],
]);

it('gives two links of one listing two tokens, both valid', function (): void {
    $user = User::factory()->create();
    $first = tokenOf(callLinks()->issue($user, 100001, 'ru')->url);
    $this->travel(1)->seconds();
    $second = tokenOf(callLinks()->issue($user, 100001, 'ru')->url);

    expect($second)->not->toBe($first)
        ->and(callLinks()->verify($first))->not->toBeNull()
        ->and(callLinks()->verify($second))->not->toBeNull();
});

it('refuses an altered payload, an altered signature and anything that is not a token', function (Closure $alter): void {
    $token = tokenOf(callLinks()->issue(User::factory()->create(), 100001, 'ru')->url);

    expect(callLinks()->verify($alter($token)))->toBeNull();
})->with([
    'the number changed' => [fn (string $token): string => encodedClaims(['n' => 100002] + claimsOf($token)).'.'.explode('.', $token)[1]],
    'the user changed' => [fn (string $token): string => encodedClaims(['u' => 999] + claimsOf($token)).'.'.explode('.', $token)[1]],
    'the expiry moved' => [fn (string $token): string => encodedClaims(['x' => claimsOf($token)['x'] + 86_400] + claimsOf($token)).'.'.explode('.', $token)[1]],
    'a signature character changed' => [fn (string $token): string => substr($token, 0, -1).(str_ends_with($token, 'A') ? 'B' : 'A')],
    'the signature cut' => [fn (string $token): string => substr($token, 0, -2)],
    'no signature' => [fn (string $token): string => explode('.', $token)[0]],
    'an empty signature' => [fn (string $token): string => explode('.', $token)[0].'.'],
    'two dots' => [fn (string $token): string => $token.'.x'],
    'padded base64' => [fn (string $token): string => $token.'='],
    'too long' => [fn (string $token): string => str_repeat('A', CallLinkService::MAX_TOKEN_LENGTH).'.'.explode('.', $token)[1]],
    'empty' => [fn (string $token): string => ''],
    'the stub token' => [fn (string $token): string => 'stub-token-100001'],
]);

it('refuses a correctly signed payload that is not exactly what it issues', function (array $claims): void {
    $payload = encodedClaims($claims);
    $signature = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, CALL_KEY, true)), '+/', '-_'), '=');

    expect(callLinks()->verify("{$payload}.{$signature}"))->toBeNull();
})->with([
    'a fifth claim' => [['n' => 1, 'u' => 1, 'l' => 'ru', 'x' => 1795770600, 'p' => '+998001234567']],
    'claims in another order' => [['u' => 1, 'n' => 1, 'l' => 'ru', 'x' => 1795770600]],
    'a number as a string' => [['n' => '1', 'u' => 1, 'l' => 'ru', 'x' => 1795770600]],
    'number 0' => [['n' => 0, 'u' => 1, 'l' => 'ru', 'x' => 1795770600]],
    'an unknown locale' => [['n' => 1, 'u' => 1, 'l' => 'de', 'x' => 1795770600]],
    'a nested value' => [['n' => 1, 'u' => 1, 'l' => ['ru'], 'x' => 1795770600]],
]);

it('accepts a token of the previous key while it is set, and only then', function (): void {
    $token = tokenOf(callLinks()->issue(User::factory()->create(), 100001, 'ru')->url);

    config(['contacts.call_link_signing_key' => CALL_KEY_NEXT, 'contacts.call_link_signing_key_previous' => CALL_KEY]);
    expect(callLinks()->verify($token))->not->toBeNull()
        ->and(callLinks()->verify(tokenOf(callLinks()->issue(User::factory()->create(), 1, 'ru')->url)))->not->toBeNull();

    config(['contacts.call_link_signing_key_previous' => '']);
    expect(callLinks()->verify($token))->toBeNull();

    config(['contacts.call_link_signing_key_previous' => substr(CALL_KEY, 0, 31)]);
    expect(callLinks()->verify($token))->toBeNull();
});

it('uses a key derived from the application key in local and testing when the configured one is blank or short', function (string $configured): void {
    config(['contacts.call_link_signing_key' => $configured]);
    $token = tokenOf(callLinks()->issue(User::factory()->create(), 100001, 'ru')->url);
    [$payload, $signature] = explode('.', $token);
    $derived = hash_hmac('sha256', 'homi-call-link', config('app.key'));

    expect($signature)->toBe(rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, $derived, true)), '+/', '-_'), '='))
        ->and(callLinks()->verify($token))->not->toBeNull();

    config(['contacts.call_link_signing_key' => CALL_KEY]);
    expect(callLinks()->verify($token))->toBeNull();
})->with(['blank' => [''], 'one byte short' => [substr(CALL_KEY, 0, 31)]]);

it('issues no link outside local and testing without a key: 503, one warning a minute, and accepts no token', function (string $environment): void {
    $token = tokenOf(callLinks()->issue(User::factory()->create(), 100001, 'ru')->url);
    config(['contacts.call_link_signing_key' => substr(CALL_KEY, 0, 31)]);
    $this->app->instance('env', $environment);
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = $entry;
    });

    try {
        foreach ([1, 2] as $attempt) {
            expect(fn () => callLinks()->issue(User::factory()->create(), 100001, 'ru'))->toThrow(SourceUnavailable::class);
        }

        expect(callLinks()->verify($token))->toBeNull()
            ->and($lines)->toHaveCount(1)
            ->and($lines[0]->level)->toBe('warning')
            ->and($lines[0]->message)->not->toContain(substr(CALL_KEY, 0, 8))
            ->and($lines[0]->context)->toBe([]);
    } finally {
        $this->app->instance('env', 'testing');
    }
})->with(['production', 'staging']);

it('refuses to issue a link for a number below 1 or a locale HOMI does not serve', function (int $number, string $locale): void {
    expect(fn () => callLinks()->issue(User::factory()->create(), $number, $locale))->toThrow(InvalidArgumentException::class);
})->with([[0, 'ru'], [-1, 'ru'], [1, 'de'], [1, 'uz_Latn']]);
