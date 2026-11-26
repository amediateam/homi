<?php

use App\Models\SourceFlagChange;
use App\Models\User;
use Laravel\Pennant\Feature;
use Tests\Support\FakeCapabilityController;

/** @return array<string, mixed> */
function storedFakeRule(): mixed
{
    Feature::flushCache();

    return Feature::globally()->value(FakeCapabilityController::FEATURE);
}

/**
 * @param  array<string, mixed>  $arguments
 * @return array<string, mixed>
 */
function sourceChange(array $arguments): array
{
    return ['feature' => FakeCapabilityController::FEATURE, '--by' => 'operator', '--reason' => 'test', ...$arguments];
}

beforeEach(function (): void {
    FakeCapabilityController::install();
});

it('sets the driver for everyone and writes one audit row with who and why', function (): void {
    $this->artisan('sources:set', sourceChange(['driver' => 'legacy', '--by' => 'alice', '--reason' => 'legacy is ready']))
        ->assertSuccessful();

    $change = SourceFlagChange::query()->sole();

    expect(storedFakeRule())->toBe(['everyone' => 'legacy'])
        ->and($change->feature)->toBe(FakeCapabilityController::FEATURE)
        ->and($change->actor)->toBe('alice')
        ->and($change->reason)->toBe('legacy is ready')
        ->and($change->old_rule)->toBe([])
        ->and($change->new_rule)->toBe(['everyone' => 'legacy'])
        ->and($change->environment)->toBe('testing');
});

it('sets a share and named users and keeps the earlier parts', function (): void {
    $this->artisan('sources:set', sourceChange(['driver' => 'legacy']))->assertSuccessful();
    $this->artisan('sources:set', sourceChange(['driver' => 'stub', '--share' => '10']))->assertSuccessful();
    $this->artisan('sources:set', sourceChange(['driver' => 'legacy', '--user' => ['5', '7']]))->assertSuccessful();

    expect(storedFakeRule())->toBe(['everyone' => 'legacy', 'share' => ['driver' => 'stub', 'percent' => 10], 'users' => [5 => 'legacy', 7 => 'legacy']])
        ->and(SourceFlagChange::query()->count())->toBe(3)
        ->and(SourceFlagChange::query()->latest('id')->first()?->old_rule)->toBe(['everyone' => 'legacy', 'share' => ['driver' => 'stub', 'percent' => 10]]);
});

it('changes the answer on the next request', function (): void {
    $this->getJson('/api/v1/_test/fake')->assertJsonPath('meta.source', 'stub');

    $this->artisan('sources:set', sourceChange(['driver' => 'legacy']))->assertSuccessful();

    $this->getJson('/api/v1/_test/fake')->assertJsonPath('meta.source', 'legacy');
});

it('refuses a change without who or why', function (string $missing): void {
    $arguments = sourceChange(['driver' => 'legacy']);
    unset($arguments[$missing]);

    $this->artisan('sources:set', $arguments)->assertFailed();

    expect(SourceFlagChange::query()->count())->toBe(0)
        ->and(storedFakeRule())->toBe([]);
})->with(['--by', '--reason']);

it('refuses a driver that is not bound, an unknown driver or feature, and a bad share or user', function (array $arguments): void {
    $this->artisan('sources:set', sourceChange($arguments))->assertFailed();

    expect(SourceFlagChange::query()->count())->toBe(0);
})->with([
    'not bound' => [['driver' => 'native']],
    'unknown driver' => [['driver' => 'kvadro']],
    'unknown feature' => [['driver' => 'stub', 'feature' => 'source.nothing']],
    'share over 100' => [['driver' => 'legacy', '--share' => '101']],
    'share not a number' => [['driver' => 'legacy', '--share' => 'ten']],
    'user not an id' => [['driver' => 'legacy', '--user' => ['abc']]],
]);

it('refuses stub while stubs are off', function (): void {
    config(['sources.allow_stub' => false]);

    $this->artisan('sources:set', sourceChange(['driver' => 'stub']))->assertFailed();

    expect(SourceFlagChange::query()->count())->toBe(0);
});

it('resets one part of the rule or all of it', function (): void {
    FakeCapabilityController::storeRule(['everyone' => 'legacy', 'share' => ['driver' => 'stub', 'percent' => 10], 'users' => [5 => 'legacy', 7 => 'stub']]);

    $this->artisan('sources:reset', sourceChange(['--share' => true]))->assertSuccessful();
    expect(storedFakeRule())->toBe(['everyone' => 'legacy', 'users' => [5 => 'legacy', 7 => 'stub']]);

    $this->artisan('sources:reset', sourceChange(['--user' => ['5']]))->assertSuccessful();
    expect(storedFakeRule())->toBe(['everyone' => 'legacy', 'users' => [7 => 'stub']]);

    $this->artisan('sources:reset', sourceChange([]))->assertSuccessful();
    expect(storedFakeRule())->toBe(['users' => [7 => 'stub']]);

    $this->artisan('sources:reset', sourceChange(['--all' => true]))->assertSuccessful();
    expect(storedFakeRule())->toBe([])
        ->and(SourceFlagChange::query()->where('actor', 'operator')->count())->toBe(4);
});

it('lists every feature with its capability, default, rule and bound drivers', function (): void {
    FakeCapabilityController::storeRule(['everyone' => 'legacy']);

    $this->artisan('sources:list')
        ->expectsTable(
            ['Feature', 'Capability', 'Default here', 'Rule', 'Bound drivers'],
            [
                ['source.reference', 'reference', 'stub', '(none)', 'stub, legacy'],
                ['source.cities', 'reference', 'stub', '(none)', 'stub, legacy'],
                ...array_map(
                    fn (string $method): array => ["source.listings.{$method}", 'listings', 'stub', '(none)', 'stub'],
                    ['feed', 'count', 'new', 'flow', 'map', 'card', 'contact', 'translation'],
                ),
                ['source.landing.live', 'landing', 'stub', '(none)', 'stub'],
                ['source.landing.pins', 'landing', 'stub', '(none)', 'stub'],
                [FakeCapabilityController::FEATURE, 'fake', 'stub', '{"everyone":"legacy"}', 'stub, legacy'],
            ],
        )
        ->assertSuccessful();
});

it('checks that every feature resolves to a bound driver here', function (): void {
    $this->artisan('sources:check')->assertSuccessful();

    FakeCapabilityController::storeRule(['users' => [5 => 'native']]);
    $this->artisan('sources:check')->assertFailed();

    FakeCapabilityController::storeRule([]);
    FakeCapabilityController::install(['*' => 'native']);
    $this->artisan('sources:check')->assertFailed();
});

it('records a change that did not come through the commands, as unknown', function (): void {
    Feature::globally()->activate(FakeCapabilityController::FEATURE, ['everyone' => 'legacy']);

    $change = SourceFlagChange::query()->sole();

    expect($change->actor)->toBe('unknown')
        ->and($change->old_rule)->toBeNull()
        ->and($change->new_rule)->toBe(['everyone' => 'legacy']);
});

it('records a purge of the features and ignores features that are not source features', function (): void {
    Feature::define('something-else', true);
    Feature::globally()->activate('something-else', false);
    Feature::purge(FakeCapabilityController::FEATURE);

    $change = SourceFlagChange::query()->sole();

    expect($change->actor)->toBe('unknown')
        ->and($change->new_rule)->toBeNull();
});

it('ignores a value stored for a single user, which no driver reads', function (): void {
    Feature::for(User::factory()->create())->activate(FakeCapabilityController::FEATURE, ['everyone' => 'legacy']);

    expect(SourceFlagChange::query()->count())->toBe(0);
});
