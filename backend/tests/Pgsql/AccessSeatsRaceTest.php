<?php

use App\Enums\Access\AccessGrantState;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Access\AccessGate;

/*
 * WP-40, KV-BE-009, SEC-REQ-015: in `open` mode with two seats, twenty new users arrive at once. Each child process
 * asks the gate for its own user in its own PostgreSQL connection; the seat lock must admit exactly two of them and
 * refuse the rest with `full`. The configuration is set inside each child, which never sees the parent's, and every
 * child waits for one moment two seconds ahead, so that their admissions overlap instead of following their boots.
 */
it('admits exactly two of twenty users who arrive at once for two seats', function (): void {
    $tasks = [];
    $startAt = microtime(true) + 2.0;

    foreach (User::factory()->telegram()->count(20)->create() as $user) {
        $id = $user->id;
        $tasks[] = static function () use ($id, $startAt): string {
            config(['access.mode' => 'open', 'access.max_seats' => 2, 'access.paused' => false, 'access.require_chat' => false]);
            $user = User::query()->findOrFail($id);

            if ($startAt > microtime(true)) {
                time_sleep_until($startAt);
            }

            return app(AccessGate::class)->decide($user)->state->value;
        };
    }

    $states = array_count_values(concurrently($tasks));
    ksort($states);

    expect($states)->toBe(['full' => 18, 'granted' => 2])
        ->and(AccessGrant::query()->where('state', AccessGrantState::Admitted)->count())->toBe(2)
        ->and(AccessGrant::query()->count())->toBe(2);
});
