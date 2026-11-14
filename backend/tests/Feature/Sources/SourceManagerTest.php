<?php

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\User;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Tests\Support\FakeCapabilityController;
use Tests\Support\FakeLegacySource;
use Tests\Support\FakeStubSource;

beforeEach(function (): void {
    FakeCapabilityController::install();
});

it('returns the bound instance together with the driver', function (): void {
    $resolved = app(SourceManager::class)->resolve(FakeCapabilityController::FEATURE, SourceContext::system());

    expect($resolved->driver)->toBe(SourceDriver::Stub)
        ->and($resolved->source)->toBeInstanceOf(FakeStubSource::class);

    FakeCapabilityController::storeRule(['everyone' => 'legacy']);
    $resolved = app(SourceManager::class)->resolve(FakeCapabilityController::FEATURE, SourceContext::system());

    expect($resolved->driver)->toBe(SourceDriver::Legacy)
        ->and($resolved->source)->toBeInstanceOf(FakeLegacySource::class);
});

it('says in meta.source which driver answered, and follows the flag on the next request', function (): void {
    $this->getJson('/api/v1/_test/fake', ['Accept-Language' => 'uz'])
        ->assertOk()
        ->assertExactJson(['success' => true, 'data' => ['from' => 'stub', 'locale' => 'uz'], 'meta' => ['source' => 'stub']]);

    FakeCapabilityController::storeRule(['everyone' => 'legacy']);

    $this->getJson('/api/v1/_test/fake')
        ->assertOk()
        ->assertJsonPath('data.from', 'legacy')
        ->assertJsonPath('meta.source', 'legacy');
});

it('follows a rule for a named user', function (): void {
    $user = User::factory()->create();
    FakeCapabilityController::storeRule(['users' => [$user->id => 'legacy']]);

    $this->actingAs($user)->getJson('/api/v1/_test/fake')->assertJsonPath('meta.source', 'legacy');
    $this->actingAs(User::factory()->create())->getJson('/api/v1/_test/fake')->assertJsonPath('meta.source', 'stub');
});

it('answers 503 source_unavailable when the chosen driver is not bound', function (): void {
    FakeCapabilityController::storeRule(['everyone' => 'native']);

    $this->getJson('/api/v1/_test/fake')
        ->assertStatus(503)
        ->assertJsonPath('code', 'source_unavailable');
});

it('refuses a typed shortcut for a feature of another capability', function (): void {
    expect(fn () => app(SourceManager::class)->listings(FakeCapabilityController::FEATURE, SourceContext::system()))
        ->toThrow(LogicException::class);
});

it('refuses a bound class that does not implement the contract', function (): void {
    FakeCapabilityController::install(drivers: ['stub' => stdClass::class]);

    expect(fn () => app(SourceManager::class)->resolve(FakeCapabilityController::FEATURE, SourceContext::system()))
        ->toThrow(LogicException::class);
});

it('has the three capability contracts configured', function (): void {
    expect(config('sources.capabilities.listings.contract'))->toBe(ListingSource::class)
        ->and(array_keys(config('sources.capabilities')))->toContain('reference', 'listings', 'landing');
});

it('answers source_unavailable for a feature whose default driver is unbound', function (): void {
    FakeCapabilityController::install(['*' => 'native']);

    expect(fn () => app(SourceManager::class)->resolve(FakeCapabilityController::FEATURE, SourceContext::system()))
        ->toThrow(SourceUnavailable::class);
});
