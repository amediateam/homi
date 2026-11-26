<?php

use App\Enums\Access\AccessGrantState;
use App\Enums\AccessState;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Access\AccessGate;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;

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

/*
 * `access:block` writes its grant without the seat lock. Here another connection commits a block right after the gate
 * counted the seats and before it inserts the admission: the insert meets the committed key, and on PostgreSQL the
 * failed insert must not abort the gate's transaction (it runs under a savepoint), so the stored block decides.
 */
it('lets a block committed by another connection between the seat count and the admission decide', function (): void {
    config(['access.mode' => 'open', 'access.max_seats' => 5, 'access.paused' => false, 'access.require_chat' => false]);
    config(['database.connections.pgsql_block' => config('database.connections.pgsql')]);
    $user = User::factory()->telegram()->create();
    $raced = false;

    DB::listen(function (QueryExecuted $query) use ($user, &$raced): void {
        if (! $raced && $query->connectionName === 'pgsql' && str_contains($query->sql, 'count(*)') && str_contains($query->sql, 'access_grants')) {
            $raced = true;
            AccessGrant::on('pgsql_block')->create(['user_id' => $user->id, 'state' => AccessGrantState::Blocked]);
        }
    });

    try {
        expect(app(AccessGate::class)->decide($user)->state)->toBe(AccessState::Blocked)
            ->and($raced)->toBeTrue()
            ->and(AccessGrant::query()->sole()->state)->toBe(AccessGrantState::Blocked)
            ->and(DB::transactionLevel())->toBe(0);
    } finally {
        DB::disconnect('pgsql_block');
    }
});
