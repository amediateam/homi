<?php

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Listings\ContactDisclosure;
use Illuminate\Support\Facades\DB;

/*
 * WP-43, SEC-REQ-028: the flag of the disclosure quota marks an existing `access_grants` row only (`flagged_at`,
 * `flag_reason`), written by whichever request passes the hard limit; it never creates a row and never writes `state`
 * or `admitted_via`, so it cannot let anyone in. Child processes (each with its own `array` cache, so each passes the
 * limit) flag one user at once: a user without a row keeps none, an existing row keeps its state and admission and is
 * flagged, no write fails, and a block of an operator racing the flags stays a block.
 */

/** A child that asks for two listings with a hard limit of 1, so it flags the user. */
function flagTask(int $id, float $startAt): Closure
{
    return static function () use ($id, $startAt): bool {
        config(['contacts.soft_limit' => null, 'contacts.hard_limit' => 1]);
        $user = User::query()->findOrFail($id);
        $quota = app(ContactDisclosure::class);

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        $quota->record($user, 1);
        $quota->record($user, 2);

        return true;
    };
}

/** @return list<Closure(): bool> */
function flagTasks(int $id, int $count, float $startAt): array
{
    $tasks = [];

    for ($task = 0; $task < $count; $task++) {
        $tasks[] = flagTask($id, $startAt);
    }

    return $tasks;
}

it('writes no row when ten requests flag a user without one at once', function (): void {
    $id = User::factory()->create()->id;

    expect(concurrently(flagTasks($id, 10, microtime(true) + 2.0)))->toBe(array_fill(0, 10, true))
        ->and(DB::table('access_grants')->count())->toBe(0);
});

it('flags an existing row when ten requests flag it at once, keeping its state and how it was admitted', function (): void {
    $id = User::factory()->create()->id;
    AccessGrant::query()->create(['user_id' => $id, 'state' => AccessGrantState::Admitted, 'admitted_via' => AdmittedVia::Invite]);

    expect(concurrently(flagTasks($id, 10, microtime(true) + 2.0)))->toBe(array_fill(0, 10, true));

    $grant = AccessGrant::query()->sole();
    expect($grant->user_id)->toBe($id)
        ->and($grant->state)->toBe(AccessGrantState::Admitted)
        ->and($grant->admitted_via)->toBe(AdmittedVia::Invite)
        ->and($grant->flag_reason)->toBe('contact_quota')
        ->and($grant->flagged_at)->not->toBeNull();
});

it('keeps an operator\'s block that races the flags of an admitted row, and flags it', function (): void {
    $id = User::factory()->create()->id;
    AccessGrant::query()->create(['user_id' => $id, 'state' => AccessGrantState::Admitted, 'admitted_via' => AdmittedVia::Open]);
    $startAt = microtime(true) + 2.0;
    $tasks = flagTasks($id, 6, $startAt);

    $tasks[] = static function () use ($id, $startAt): bool {
        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        // The write of `access:block`.
        AccessGrant::query()->upsert(
            [['user_id' => $id, 'state' => AccessGrantState::Blocked->value, 'admitted_via' => null]],
            ['user_id'],
            ['state'],
        );

        return true;
    };

    expect(concurrently($tasks))->toBe(array_fill(0, 7, true));

    $grant = AccessGrant::query()->sole();
    expect($grant->state)->toBe(AccessGrantState::Blocked)
        ->and($grant->admitted_via)->toBe(AdmittedVia::Open)
        ->and($grant->flag_reason)->toBe('contact_quota')
        ->and($grant->flagged_at)->not->toBeNull()
        ->and(DB::table('access_grants')->count())->toBe(1);
});
