<?php

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Listings\ContactDisclosure;
use Illuminate\Support\Facades\DB;

/*
 * WP-43, SEC-REQ-028: the flag of the disclosure quota is an upsert on `access_grants`, written by whichever request
 * passes the hard limit. Ten child processes (each with its own `array` cache, so each passes the limit) flag one user
 * who has no row, at once: one row must remain, `admitted` via `open` and flagged, and no write may fail. A block of
 * an operator racing the flags must stay a block: the flag never writes `state` or `admitted_via` of a row.
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

it('keeps one admitted, flagged row when ten requests flag a user without one at once', function (): void {
    $id = User::factory()->create()->id;
    $startAt = microtime(true) + 2.0;
    $tasks = [];

    for ($task = 0; $task < 10; $task++) {
        $tasks[] = flagTask($id, $startAt);
    }

    expect(concurrently($tasks))->toBe(array_fill(0, 10, true));

    $grant = AccessGrant::query()->sole();
    expect($grant->user_id)->toBe($id)
        ->and($grant->state)->toBe(AccessGrantState::Admitted)
        ->and($grant->admitted_via)->toBe(AdmittedVia::Open)
        ->and($grant->flag_reason)->toBe('contact_quota')
        ->and($grant->flagged_at)->not->toBeNull();
});

it('keeps an operator\'s block that races the flags, and flags it', function (): void {
    $id = User::factory()->create()->id;
    $startAt = microtime(true) + 2.0;
    $tasks = [];

    for ($task = 0; $task < 6; $task++) {
        $tasks[] = flagTask($id, $startAt);
    }

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
        ->and($grant->flag_reason)->toBe('contact_quota')
        ->and($grant->flagged_at)->not->toBeNull()
        ->and(DB::table('access_grants')->count())->toBe(1);
});
