<?php

use App\Models\SourceFlagChange;
use Illuminate\Support\Facades\Artisan;
use Laravel\Pennant\Feature;
use Tests\Support\FakeCapabilityController;

/*
 * WP-10: changes of one source rule made at the same time must not lose each other. Each child process configures
 * the test capability itself (a child boots the application from scratch) and runs `sources:set`; one task sets the
 * share, five others set five different named users. Without the lock per feature, two transactions read the same
 * old rule and the later write drops the earlier part.
 */
it('keeps every part of the rule when sources:set runs in parallel', function (): void {
    $share = static function (): int {
        FakeCapabilityController::install();

        return Artisan::call('sources:set', ['feature' => FakeCapabilityController::FEATURE, 'driver' => 'legacy', '--share' => '10', '--by' => 'race', '--reason' => 'share']);
    };
    $user = static function (int $id): Closure {
        return static function () use ($id): int {
            FakeCapabilityController::install();

            return Artisan::call('sources:set', ['feature' => FakeCapabilityController::FEATURE, 'driver' => 'legacy', '--user' => [(string) $id], '--by' => 'race', '--reason' => 'user']);
        };
    };

    $exitCodes = concurrently([$share, $user(11), $user(12), $user(13), $user(14), $user(15)]);

    FakeCapabilityController::install();
    Feature::flushCache();
    $rule = Feature::globally()->value(FakeCapabilityController::FEATURE);
    $users = $rule['users'] ?? [];
    ksort($users);

    expect($exitCodes)->toBe([0, 0, 0, 0, 0, 0])
        ->and($rule['share'] ?? null)->toBe(['driver' => 'legacy', 'percent' => 10])
        ->and($users)->toBe([11 => 'legacy', 12 => 'legacy', 13 => 'legacy', 14 => 'legacy', 15 => 'legacy'])
        ->and(SourceFlagChange::query()->where('actor', 'race')->count())->toBe(6);
});
