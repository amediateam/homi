<?php

use Illuminate\Testing\TestResponse;
use Tests\Support\EnvOverride;

/**
 * Whose forwarded address the per-address limiters believe (WP-40, `config/trustedproxy.php`, decision 7): only the
 * `X-Forwarded-For` of a trusted proxy (the Next servers of the Mini App) names the client; any other caller is
 * counted under the address that connected. `GET /reference` (`v1-public`) counts one request per minute here.
 */
beforeEach(function (): void {
    $this->freezeTime();
    config(['rate_limits.public.per_minute' => 1]);
});

function referenceFrom(string $peer, ?string $forwardedFor = null): TestResponse
{
    test()->withServerVariables(['REMOTE_ADDR' => $peer]);

    return test()->getJson('/api/v1/reference', $forwardedFor === null ? [] : ['X-Forwarded-For' => $forwardedFor]);
}

it('gives two clients behind a trusted proxy two buckets', function (): void {
    config(['trustedproxy.proxies' => '10.0.0.5, 10.0.1.0/24']);

    referenceFrom('10.0.0.5', '203.0.113.10')->assertOk();
    referenceFrom('10.0.0.5', '198.51.100.20')->assertOk();
    // The same client through the other trusted server (a range) shares his bucket.
    referenceFrom('10.0.1.7', '203.0.113.10')->assertTooManyRequests();
});

it('believes only the address the trusted proxy appended, not what the client put before it', function (): void {
    config(['trustedproxy.proxies' => '10.0.0.5']);

    referenceFrom('10.0.0.5', '192.0.2.1, 203.0.113.10')->assertOk();
    referenceFrom('10.0.0.5', '192.0.2.2, 203.0.113.10')->assertTooManyRequests();
    referenceFrom('10.0.0.5', '203.0.113.11')->assertOk();
});

it('ignores a forwarded address from a caller that is not a trusted proxy', function (?string $proxies): void {
    config(['trustedproxy.proxies' => $proxies]);

    referenceFrom('198.51.100.7', '203.0.113.10')->assertOk();
    referenceFrom('198.51.100.7', '203.0.113.11')->assertTooManyRequests();
})->with(['another proxy is trusted' => '10.0.0.5', 'no proxy is trusted' => null]);

it('counts the sign-in per client address behind a trusted proxy', function (): void {
    config(['trustedproxy.proxies' => '10.0.0.5', 'rate_limits.auth.per_address' => 1]);
    test()->withServerVariables(['REMOTE_ADDR' => '10.0.0.5']);

    $this->postJson('/api/v1/auth/telegram', ['init_data' => 'a'], ['X-Forwarded-For' => '203.0.113.10'])->assertUnauthorized();
    $this->postJson('/api/v1/auth/telegram', ['init_data' => 'a'], ['X-Forwarded-For' => '198.51.100.20'])->assertUnauthorized();
    $this->postJson('/api/v1/auth/telegram', ['init_data' => 'a'], ['X-Forwarded-For' => '203.0.113.10'])->assertTooManyRequests();
});

it('reads TRUSTED_PROXIES as a trimmed list, and a blank, missing or wildcard one as nobody', function (?string $value, ?string $expected): void {
    $config = EnvOverride::with('TRUSTED_PROXIES', $value, fn (): array => require config_path('trustedproxy.php'));

    expect($config['proxies'])->toBe($expected);
})->with([
    'unset' => [null, null],
    'blank' => ['  ', null],
    'a list' => [' 10.0.0.5, 10.0.1.0/24 ', '10.0.0.5, 10.0.1.0/24'],
    'every caller' => ['*', null],
    'every caller, padded' => [' * ', null],
    'every caller, the other spelling' => ['**', null],
]);

it('ignores a forwarded address from any caller when TRUSTED_PROXIES is a wildcard', function (): void {
    $config = EnvOverride::with('TRUSTED_PROXIES', '*', fn (): array => require config_path('trustedproxy.php'));
    config(['trustedproxy.proxies' => $config['proxies']]);

    referenceFrom('198.51.100.7', '203.0.113.10')->assertOk();
    referenceFrom('198.51.100.7', '203.0.113.11')->assertTooManyRequests();
});
