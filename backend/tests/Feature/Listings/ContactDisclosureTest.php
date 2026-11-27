<?php

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Events\Listings\ContactQuotaExceeded;
use App\Exceptions\Listings\ContactUnavailable;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Listings\ContactDisclosure;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Laravel\Pulse\Pulse;
use Laravel\Pulse\Recorders\CacheInteractions;
use Tests\Support\FailingCacheStore;

/*
 * WP-43, SEC-REQ-028: the per-user disclosure quota on the `array` store with a frozen clock. The day is the Tashkent
 * day (UTC+5): it starts at 19:00 UTC.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Date::setTestNow('2026-11-27 09:00:00');
    config(['contacts.soft_limit' => 3, 'contacts.hard_limit' => 5]);
});

function disclosure(): ContactDisclosure
{
    return app(ContactDisclosure::class);
}

/** Asks for each listing as `ContactService::disclose()` does: `decide()`, and `record()` when it is answered. */
function askFor(User $user, int ...$numbers): array
{
    $answers = [];

    foreach ($numbers as $number) {
        $answers[$number] = disclosure()->decide($user, $number);

        if ($answers[$number]) {
            disclosure()->record($user, $number);
        }
    }

    return $answers;
}

/** @return list<array{level: string, message: string, context: array<array-key, mixed>}> */
function quotaLogLines(callable $run): array
{
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = ['level' => $entry->level, 'message' => $entry->message, 'context' => $entry->context];
    });
    $run();

    return array_values($lines->getArrayCopy());
}

it('answers the first soft-limit listings, refuses the next ones and flags the account once past the hard limit', function (): void {
    Event::fake([ContactQuotaExceeded::class]);
    $user = User::factory()->telegram()->create();

    expect(askFor($user, 101, 102, 103))->toBe([101 => true, 102 => true, 103 => true])
        ->and(askFor($user, 104, 105))->toBe([104 => false, 105 => false])
        ->and(AccessGrant::query()->count())->toBe(0);
    Event::assertNotDispatched(ContactQuotaExceeded::class);

    expect(askFor($user, 106))->toBe([106 => false]);

    $grant = AccessGrant::query()->sole();
    expect($grant->user_id)->toBe($user->id)
        ->and($grant->state)->toBe(AccessGrantState::Admitted)
        ->and($grant->admitted_via)->toBe(AdmittedVia::Open)
        ->and($grant->flag_reason)->toBe('contact_quota')
        ->and($grant->flagged_at?->toIso8601String())->toBe('2026-11-27T09:00:00+00:00');
    Event::assertDispatchedTimes(ContactQuotaExceeded::class, 1);
    Event::assertDispatched(ContactQuotaExceeded::class, fn (ContactQuotaExceeded $event): bool => $event->userId === $user->id && $event->asked === 6 && $event->day === '2026-11-27');

    $this->travel(1)->hours();
    expect(askFor($user, 107, 108))->toBe([107 => false, 108 => false])
        ->and(AccessGrant::query()->sole()->flagged_at?->toIso8601String())->toBe('2026-11-27T09:00:00+00:00');
    Event::assertDispatchedTimes(ContactQuotaExceeded::class, 1);
});

it('always answers a listing answered earlier that day again, counting it once, and keeps a refused one refused', function (): void {
    $user = User::factory()->create();

    askFor($user, 101, 102);
    expect(askFor($user, 101, 101, 102))->toBe([101 => true, 102 => true])
        ->and(askFor($user, 103))->toBe([103 => true])
        ->and(askFor($user, 104))->toBe([104 => false])
        ->and(askFor($user, 104))->toBe([104 => false])
        ->and(askFor($user, 101, 102, 103))->toBe([101 => true, 102 => true, 103 => true])
        ->and(Cache::get(ContactDisclosure::key($user)))->toBe(['n' => [101 => true, 102 => true, 103 => true, 104 => false], 'f' => false]);
});

it('counts the day of Asia/Tashkent: a new day at 19:00 UTC, not at midnight UTC', function (): void {
    $user = User::factory()->create();

    Date::setTestNow('2026-11-27 18:59:59');
    expect(askFor($user, 101, 102, 103, 104))->toBe([101 => true, 102 => true, 103 => true, 104 => false]);

    Date::setTestNow('2026-11-27 19:00:00');
    expect(askFor($user, 104, 105, 106, 107))->toBe([104 => true, 105 => true, 106 => true, 107 => false]);

    Date::setTestNow('2026-11-28 00:00:00');
    expect(askFor($user, 108))->toBe([108 => false]);
});

it('keeps a day for one hour after the end of its Tashkent day', function (): void {
    $user = User::factory()->create();
    Date::setTestNow('2026-11-27 10:00:00');
    askFor($user, 101);
    $key = ContactDisclosure::key($user);

    expect($key)->toBe("contact:{$user->id}:2026-11-27");

    Date::setTestNow('2026-11-27 19:59:59');
    expect(Cache::has($key))->toBeTrue();

    Date::setTestNow('2026-11-27 20:00:01');
    expect(Cache::has($key))->toBeFalse();
});

it('refuses nothing and stores nothing while both limits are blank', function (): void {
    config(['contacts.soft_limit' => null, 'contacts.hard_limit' => null]);
    $user = User::factory()->create();

    expect(array_unique(askFor($user, ...range(1, 50))))->toBe([1 => true])
        ->and(Cache::has(ContactDisclosure::key($user)))->toBeFalse()
        ->and(AccessGrant::query()->count())->toBe(0);
});

it('flags without refusing when only the hard limit is set, and refuses without flagging when only the soft one is', function (): void {
    config(['contacts.soft_limit' => null, 'contacts.hard_limit' => 2]);
    $flagged = User::factory()->create();

    expect(array_unique(askFor($flagged, 1, 2, 3)))->toBe([1 => true])
        ->and(AccessGrant::query()->sole()->user_id)->toBe($flagged->id);

    config(['contacts.soft_limit' => 1, 'contacts.hard_limit' => null]);
    $refused = User::factory()->create();

    expect(askFor($refused, 1, 2, 3, 4, 5, 6, 7))->toBe([1 => true, 2 => false, 3 => false, 4 => false, 5 => false, 6 => false, 7 => false])
        ->and(AccessGrant::query()->count())->toBe(1);
});

it('keeps a counter per user', function (): void {
    [$first, $second] = User::factory()->count(2)->create()->all();

    askFor($first, 101, 102, 103);

    expect(askFor($first, 104))->toBe([104 => false])
        ->and(askFor($second, 104, 105, 106))->toBe([104 => true, 105 => true, 106 => true]);
});

it('flags an existing grant without changing its state or how it was admitted', function (AccessGrantState $state, ?AdmittedVia $via): void {
    $user = User::factory()->create();
    AccessGrant::query()->create(['user_id' => $user->id, 'state' => $state, 'admitted_via' => $via]);

    askFor($user, 1, 2, 3, 4, 5, 6);

    $grant = AccessGrant::query()->sole();
    expect($grant->state)->toBe($state)
        ->and($grant->admitted_via)->toBe($via)
        ->and($grant->flag_reason)->toBe('contact_quota')
        ->and($grant->flagged_at)->not->toBeNull();
})->with([
    'blocked before any admission' => [AccessGrantState::Blocked, null],
    'admitted by an invite' => [AccessGrantState::Admitted, AdmittedVia::Invite],
    'an owner' => [AccessGrantState::Admitted, AdmittedVia::Owner],
]);

it('logs the flag with the internal user id only: no phone number, no Telegram id', function (): void {
    $user = User::factory()->telegram()->create(['telegram_user_id' => 279058397]);

    $lines = quotaLogLines(fn () => askFor($user, 1, 2, 3, 4, 5, 6));
    $serialised = json_encode($lines, JSON_THROW_ON_ERROR);

    expect($lines)->toHaveCount(1)
        ->and($lines[0]['level'])->toBe('warning')
        ->and($lines[0]['context'])->toBe(['user_id' => $user->id, 'asked' => 6])
        ->and($serialised)->not->toContain('279058397')
        ->and($serialised)->not->toContain('+998');
});

it('fails closed when the cache store fails: refused, with one warning a minute, never an exception of the store', function (): void {
    $user = User::factory()->create();
    FailingCacheStore::install("contact:{$user->id}:");

    $lines = quotaLogLines(function () use ($user): void {
        expect(disclosure()->decide($user, 101))->toBeFalse()
            ->and(disclosure()->decide($user, 102))->toBeFalse()
            ->and(fn () => disclosure()->record($user, 101))->toThrow(ContactUnavailable::class);
    });

    expect($lines)->toHaveCount(1)
        ->and($lines[0]['level'])->toBe('warning')
        ->and($lines[0]['context'])->toBe(['failure' => 'RuntimeException']);
});

it('fails closed when even the warning cannot be counted, warning each time', function (): void {
    $user = User::factory()->create();
    FailingCacheStore::install('contact:');

    $lines = quotaLogLines(fn () => [disclosure()->decide($user, 101), disclosure()->decide($user, 102)]);

    expect($lines)->toHaveCount(2);
});

it('keeps the day keys, which name a user, out of Pulse', function (): void {
    $recorder = new CacheInteractions(app(Pulse::class));
    $user = User::factory()->create();

    foreach ([ContactDisclosure::key($user), ContactDisclosure::key($user).':lock', 'contact:once:store_failed'] as $key) {
        expect((fn (): bool => $this->shouldIgnore($key))->call($recorder))->toBeTrue();
    }
});
