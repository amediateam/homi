<?php

use App\Models\FoundAnswer;
use App\Models\User;
use App\Services\Radar\FoundAskPolicy;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/*
 * WP-45, step 8 (task `KV-BE-104`, Q-API-030): whether pausing or deleting a radar asks «Нашли жильё?». Yes when the
 * user has answered nothing in the last `radar.found_cooldown_days` (30) days and was not asked in the last 24 hours;
 * the answer «yes» is remembered under `found:asked:<user id>`, so the app and the bot — one policy — never ask twice.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->freezeTime();
    $this->user = User::factory()->create();
    $this->policy = app(FoundAskPolicy::class);
});

it('asks the first time, for a pause and for a delete', function (string $trigger): void {
    expect($this->policy->shouldAsk($this->user, $trigger))->toBeTrue()
        ->and(Cache::has("found:asked:{$this->user->id}"))->toBeTrue();
})->with(['pause', 'delete']);

it('does not ask again within 24 hours, whichever trigger asked first', function (): void {
    expect($this->policy->shouldAsk($this->user, 'pause'))->toBeTrue()
        ->and($this->policy->shouldAsk($this->user, 'delete'))->toBeFalse();

    $this->travel(24 * 60 - 1)->minutes();
    expect($this->policy->shouldAsk($this->user, 'pause'))->toBeFalse();

    $this->travel(2)->minutes();
    expect($this->policy->shouldAsk($this->user, 'pause'))->toBeTrue();
});

it('does not ask within 30 days after an answer, and asks again after them', function (): void {
    FoundAnswer::factory()->for($this->user)->create(['created_at' => now()->subDays(30)->addMinute()]);

    expect($this->policy->shouldAsk($this->user, 'delete'))->toBeFalse()
        ->and(Cache::has("found:asked:{$this->user->id}"))->toBeFalse();

    $this->travel(2)->minutes();
    expect($this->policy->shouldAsk($this->user, 'delete'))->toBeTrue();
});

it('counts an answer of where alone as an answer', function (): void {
    FoundAnswer::factory()->for($this->user)->create(['answer' => null, 'trigger' => null, 'where' => 'olx']);

    expect($this->policy->shouldAsk($this->user, 'pause'))->toBeFalse();
});

it('follows the configured cooldown', function (): void {
    config(['radar.found_cooldown_days' => 2]);
    FoundAnswer::factory()->for($this->user)->create(['created_at' => now()->subDays(3)]);

    expect($this->policy->shouldAsk($this->user, 'pause'))->toBeTrue();
});

it('keeps each user apart, and another user\'s answer counts for nobody else', function (): void {
    $other = User::factory()->create();
    FoundAnswer::factory()->for($other)->create();

    expect($this->policy->shouldAsk($this->user, 'pause'))->toBeTrue()
        ->and($this->policy->shouldAsk($other, 'pause'))->toBeFalse()
        ->and($this->policy->shouldAsk(User::factory()->create(), 'pause'))->toBeTrue();
});

it('shares the state with the bot: a policy resolved again sees the same mark', function (): void {
    expect($this->policy->shouldAsk($this->user, 'pause'))->toBeTrue()
        ->and(app(FoundAskPolicy::class)->shouldAsk($this->user->fresh() ?? $this->user, 'delete'))->toBeFalse();
});

it('refuses a trigger other than pause or delete', function (): void {
    expect(fn () => $this->policy->shouldAsk($this->user, 'resume'))->toThrow(InvalidArgumentException::class);
});
