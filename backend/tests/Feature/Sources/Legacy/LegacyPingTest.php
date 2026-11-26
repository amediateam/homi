<?php

use App\Providers\SourceServiceProvider;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
});

it('refuses to ping the fixtures', function (): void {
    config(['legacy.fake' => true]);
    Http::fake();

    $this->artisan('legacy:ping')->expectsOutputToContain('legacy.fake is on')->assertFailed();
    Http::assertNothingSent();
});

it('prints the outcome, the latency and the number of cities, never the key', function (): void {
    config(['legacy.fake' => false, 'legacy.base_url' => 'https://legacy.test', 'legacy.service_key' => 'ping-secret-key']);
    Http::fake(['legacy.test/api/cities' => Http::response([['code' => 'tashkent'], ['code' => 'andijan']])]);

    $this->artisan('legacy:ping')
        ->expectsOutputToContain('2 cities')
        ->doesntExpectOutputToContain('ping-secret-key')
        ->assertSuccessful();
});

it('fails with the v1 error of a refused key', function (): void {
    config(['legacy.fake' => false, 'legacy.base_url' => 'https://legacy.test', 'legacy.service_key' => 'ping-secret-key']);
    Http::fake(['legacy.test/*' => Http::response(['detail' => 'Unauthorized'], 401)]);

    $this->artisan('legacy:ping')
        ->expectsOutputToContain('503 source_unavailable')
        ->doesntExpectOutputToContain('ping-secret-key')
        ->assertFailed();
});

it('fails without a key, sending nothing', function (): void {
    config(['legacy.fake' => false, 'legacy.service_key' => '']);
    Http::fake();

    $this->artisan('legacy:ping')->expectsOutputToContain('source_unavailable')->assertFailed();
    Http::assertNothingSent();
});

it('refuses to boot production with the legacy fixtures', function (): void {
    config(['legacy.fake' => true, 'sources.native_stubs' => false]);
    $this->app->instance('env', 'production');

    expect(fn () => (new SourceServiceProvider($this->app))->boot())->toThrow(LogicException::class, 'LEGACY_FAKE');

    $this->app->instance('env', 'testing');
});

it('boots with the fixtures outside production and anywhere without them', function (string $environment, bool $fake): void {
    config(['legacy.fake' => $fake, 'sources.native_stubs' => false]);
    $this->app->instance('env', $environment);

    expect(fn () => (new SourceServiceProvider($this->app))->boot())->not->toThrow(LogicException::class);

    $this->app->instance('env', 'testing');
})->with([
    'local with' => ['local', true],
    'staging with' => ['staging', true],
    'production without' => ['production', false],
]);
