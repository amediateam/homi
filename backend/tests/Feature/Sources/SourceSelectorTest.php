<?php

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\SourceSelector;
use Illuminate\Support\Facades\Log;
use Laravel\Pennant\Feature;
use Tests\Support\FakeCapabilityController;

function fakeDriverFor(?int $userId): SourceDriver
{
    return app(SourceSelector::class)->driverFor(FakeCapabilityController::FEATURE, $userId === null ? null : FakeCapabilityController::user($userId));
}

beforeEach(function (): void {
    FakeCapabilityController::install(['local' => 'stub', 'staging' => 'legacy', 'production' => 'native', '*' => 'legacy']);
});

it('uses the default of the environment while the rule is empty', function (string $environment, SourceDriver $driver): void {
    app()['env'] = $environment;

    expect(fakeDriverFor(null))->toBe($driver)
        ->and(fakeDriverFor(1))->toBe($driver);
})->with([
    'local' => ['local', SourceDriver::Stub],
    'staging' => ['staging', SourceDriver::Legacy],
    'production' => ['production', SourceDriver::Native],
    'any other, by the * fallback' => ['testing', SourceDriver::Legacy],
]);

it('lets everyone win over the default', function (): void {
    FakeCapabilityController::storeRule(['everyone' => 'native']);

    expect(fakeDriverFor(null))->toBe(SourceDriver::Native)
        ->and(fakeDriverFor(5))->toBe(SourceDriver::Native);
});

it('gives a share of users the share driver, stably', function (int $percent, int $min, int $max): void {
    FakeCapabilityController::storeRule(['everyone' => 'legacy', 'share' => ['driver' => 'native', 'percent' => $percent]]);
    $ids = range(1, 1000);
    $picked = fn (): array => array_values(array_filter($ids, fn (int $id): bool => fakeDriverFor($id) === SourceDriver::Native));

    $first = $picked();

    expect(count($first))->toBeGreaterThanOrEqual($min)->toBeLessThanOrEqual($max)
        ->and($picked())->toBe($first);
})->with([
    'none at 0 %' => [0, 0, 0],
    'about a tenth at 10 %' => [10, 60, 140],
    'all at 100 %' => [100, 1000, 1000],
]);

it('lets a named user win over the share', function (): void {
    FakeCapabilityController::storeRule(['share' => ['driver' => 'native', 'percent' => 100], 'users' => [42 => 'stub']]);

    expect(fakeDriverFor(42))->toBe(SourceDriver::Stub)
        ->and(fakeDriverFor(43))->toBe(SourceDriver::Native);
});

it('never applies the share or named users without a user', function (): void {
    FakeCapabilityController::storeRule(['share' => ['driver' => 'native', 'percent' => 100], 'users' => [42 => 'stub']]);

    expect(fakeDriverFor(null))->toBe(SourceDriver::Legacy);
});

it('ignores a malformed rule, uses the default and logs once', function (mixed $rule): void {
    FakeCapabilityController::storeRule(is_array($rule) ? $rule : ['everyone' => $rule]);
    Log::spy();

    expect(fakeDriverFor(1))->toBe(SourceDriver::Legacy)
        ->and(fakeDriverFor(1))->toBe(SourceDriver::Legacy);
    Log::shouldHaveReceived('error')->once();
})->with([
    'an unknown key' => [['everybody' => 'native']],
    'a share without a percent' => [['share' => ['driver' => 'native']]],
    'a percent over 100' => [['share' => ['driver' => 'native', 'percent' => 101]]],
    'a driver that is not a string' => [['everyone' => 7]],
    'users that are not a map' => [['users' => 'native']],
    'an unknown driver name' => [['everyone' => 'kvadro']],
]);

it('reads a stored value that is not a rule as malformed', function (): void {
    Feature::globally()->activate(FakeCapabilityController::FEATURE, 'native');
    Log::spy();

    expect(fakeDriverFor(null))->toBe(SourceDriver::Legacy);
    Log::shouldHaveReceived('error')->once();
});

it('falls back to the default when the rule names stub and stubs are off', function (): void {
    config(['sources.allow_stub' => false]);
    FakeCapabilityController::storeRule(['everyone' => 'stub']);

    expect(fakeDriverFor(null))->toBe(SourceDriver::Legacy);
});

it('answers source_unavailable when stubs are off and the default is stub', function (): void {
    config(['sources.allow_stub' => false]);
    app()['env'] = 'local';

    expect(fn () => fakeDriverFor(null))->toThrow(SourceUnavailable::class);
});

it('refuses a feature that is not configured', function (): void {
    expect(fn () => app(SourceSelector::class)->driverFor('source.nothing', null))->toThrow(InvalidArgumentException::class);
});
