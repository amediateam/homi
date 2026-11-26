<?php

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Models\AccessGrant;
use App\Models\User;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;

/** The operator commands of the access gate (WP-40): `access:block` and `access:unblock`, by internal user id. */
const ACCESS_COMMAND_TELEGRAM_ID = 279058397;

it('blocks a user at once on every route, even while a granted decision is cached, and writes one log line without his Telegram id', function (): void {
    $user = User::factory()->telegram()->create(['telegram_user_id' => ACCESS_COMMAND_TELEGRAM_ID]);
    Sanctum::actingAs($user, ['app:read', 'app:write']);
    $this->getJson('/api/v1/me')->assertOk();
    $logged = [];
    Log::listen(function (MessageLogged $entry) use (&$logged): void {
        $logged[] = $entry;
    });

    $this->artisan('access:block', ['user' => (string) $user->id, '--by' => 'operator', '--reason' => 'spam from this account'])
        ->expectsOutputToContain("User {$user->id} is blocked.")
        ->assertSuccessful();

    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('code', 'access_denied')->assertJsonPath('reason', 'blocked');
    $this->postJson('/api/v1/events', ['name' => 'app_launch'])->assertForbidden()->assertJsonPath('reason', 'blocked');

    $grant = AccessGrant::query()->sole();
    expect($grant->user_id)->toBe($user->id)
        ->and($grant->state)->toBe(AccessGrantState::Blocked)
        ->and($grant->admitted_via)->toBeNull()
        ->and($logged)->toHaveCount(1)
        ->and($logged[0]->level)->toBe('notice')
        ->and($logged[0]->message)->toBe('Access blocked.')
        // The request id is the context the request before shared with the log (AssignRequestId).
        ->and(Arr::except($logged[0]->context, 'request_id'))->toBe(['user_id' => $user->id, 'by' => 'operator', 'reason' => 'spam from this account'])
        ->and(json_encode($logged[0]->context))->not->toContain((string) ACCESS_COMMAND_TELEGRAM_ID);
});

it('keeps how a blocked user had been admitted, and gives the admission back on unblock', function (): void {
    $grant = AccessGrant::factory()->create(['admitted_via' => AdmittedVia::Invite]);
    config(['access.mode' => 'invite']);
    Sanctum::actingAs($grant->user, ['app:read']);

    $this->artisan('access:block', ['user' => (string) $grant->user_id, '--by' => 'operator', '--reason' => 'checking a report'])->assertSuccessful();
    expect($grant->refresh()->state)->toBe(AccessGrantState::Blocked)
        ->and($grant->admitted_via)->toBe(AdmittedVia::Invite);
    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('reason', 'blocked');

    $this->artisan('access:unblock', ['user' => (string) $grant->user_id, '--by' => 'operator', '--reason' => 'the report was wrong'])
        ->expectsOutputToContain("User {$grant->user_id} is unblocked.")
        ->assertSuccessful();

    expect($grant->refresh()->state)->toBe(AccessGrantState::Admitted)
        ->and($grant->admitted_via)->toBe(AdmittedVia::Invite);
    $this->getJson('/api/v1/me')->assertOk();
});

it('deletes on unblock the grant of a user blocked before any admission, so the gate decides for him as for anyone', function (): void {
    $grant = AccessGrant::factory()->blockedBeforeAdmission()->create();
    config(['access.mode' => 'private']);
    Sanctum::actingAs($grant->user, ['app:read']);
    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('reason', 'blocked');

    $this->artisan('access:unblock', ['user' => (string) $grant->user_id, '--by' => 'operator', '--reason' => 'blocked by mistake'])->assertSuccessful();

    expect(AccessGrant::query()->count())->toBe(0);
    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('reason', 'private');
});

it('changes nothing and writes no log line for a user blocked already, or one not blocked', function (string $command, ?AccessGrantState $state, string $output): void {
    $user = User::factory()->telegram()->create();

    if ($state !== null) {
        AccessGrant::factory()->for($user)->create(['state' => $state]);
    }

    $before = AccessGrant::query()->get()->toArray();
    $logged = [];
    Log::listen(function (MessageLogged $entry) use (&$logged): void {
        $logged[] = $entry;
    });

    $this->artisan($command, ['user' => (string) $user->id, '--by' => 'operator', '--reason' => 'again'])
        ->expectsOutputToContain(sprintf($output, $user->id))
        ->assertSuccessful();

    expect(AccessGrant::query()->get()->toArray())->toBe($before)
        ->and($logged)->toBe([]);
})->with([
    'block a blocked user' => ['access:block', AccessGrantState::Blocked, 'User %d is blocked already.'],
    'unblock a user without a grant' => ['access:unblock', null, 'User %d is not blocked.'],
    'unblock an admitted user' => ['access:unblock', AccessGrantState::Admitted, 'User %d is not blocked.'],
]);

it('refuses to run without who and why, or without a known internal user id', function (string $command, array $arguments, string $error): void {
    $user = User::factory()->telegram()->create(['telegram_user_id' => ACCESS_COMMAND_TELEGRAM_ID]);
    $arguments = ['user' => (string) $user->id, '--by' => 'operator', '--reason' => 'spam', ...$arguments];

    $this->artisan($command, $arguments)->expectsOutputToContain($error)->assertFailed();

    expect(AccessGrant::query()->count())->toBe(0);
})->with([
    'block without --by' => ['access:block', ['--by' => null], '--by is required'],
    'block with a blank --reason' => ['access:block', ['--reason' => '  '], '--reason is required'],
    'unblock without --reason' => ['access:unblock', ['--reason' => null], '--reason is required'],
    'block by a Telegram id' => ['access:block', ['user' => (string) ACCESS_COMMAND_TELEGRAM_ID], 'There is no user '.ACCESS_COMMAND_TELEGRAM_ID],
    'block an id that is no number' => ['access:block', ['user' => 'abc'], 'internal user id'],
    'unblock an unknown id' => ['access:unblock', ['user' => '999999'], 'There is no user 999999'],
]);
