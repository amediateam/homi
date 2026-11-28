<?php

use App\Enums\Radar\HideRuleKind;
use App\Models\ListingRef;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Services\Radar\HideRuleSet;
use App\Services\Radar\RadarHideRuleService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Http;

/*
 * WP-45, step 7 (task `KV-BE-106`, DEV-033, DEV-034): hide rules exist per radar. `add` is idempotent;
 * `addFromListing` (the bot's «Скрыть похожие», WP-53) takes the channel, district code or author key that
 * `listing_refs` files for the listing — its survivor's, for a merged duplicate — and puts the rule on the radar of
 * the card, or on every active radar of the user when there is none (Q-BOT-028); author rules only while
 * `radar.author_hide_rules` is on. `clearAll` (`PATCH {"unhide": true}`) deletes them all and zeroes `hidden`.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->user = User::factory()->create();
    $this->service = app(RadarHideRuleService::class);
});

/** @return list<array{0: string, 1: string, 2: string}> the rules stored, as radar id, kind and target */
function storedHideRules(): array
{
    return RadarHideRule::query()->orderBy('radar_id')->orderBy('kind')->orderBy('target')->get()
        ->map(fn (RadarHideRule $rule): array => [$rule->radar_id, $rule->kind->value, $rule->target])->all();
}

it('adds a rule once however often it is added', function (): void {
    $radar = Radar::factory()->for($this->user)->create();

    expect($this->service->add($this->user, $radar, HideRuleKind::Channel, 'arenda_tashkent'))->toBeTrue()
        ->and($this->service->add($this->user, $radar, HideRuleKind::Channel, '@Arenda_Tashkent'))->toBeTrue()
        ->and($this->service->add($this->user, $radar, HideRuleKind::District, 'yunusobod'))->toBeTrue()
        ->and(storedHideRules())->toBe([[$radar->id, 'channel', 'arenda_tashkent'], [$radar->id, 'district', 'yunusobod']]);
});

it('refuses a blank or too long target', function (HideRuleKind $kind, string $target): void {
    $radar = Radar::factory()->for($this->user)->create();

    expect($this->service->add($this->user, $radar, $kind, $target))->toBeFalse()
        ->and(RadarHideRule::query()->count())->toBe(0);
})->with([
    'blank' => [HideRuleKind::District, ''],
    'spaces' => [HideRuleKind::District, '   '],
    'too long' => [HideRuleKind::District, str_repeat('a', 97)],
    'a bare at sign' => [HideRuleKind::Channel, '@'],
]);

it('adds author rules only while the switch is on', function (): void {
    $radar = Radar::factory()->for($this->user)->create();
    $key = 'phone:'.str_repeat('b', 32);

    expect($this->service->add($this->user, $radar, HideRuleKind::Author, $key))->toBeFalse()
        ->and(RadarHideRule::query()->count())->toBe(0);

    config(['radar.author_hide_rules' => true]);

    expect($this->service->add($this->user, $radar, HideRuleKind::Author, $key))->toBeTrue()
        ->and(storedHideRules())->toBe([[$radar->id, 'author', $key]]);
});

it('refuses a radar of another user like an unknown one', function (Closure $write): void {
    $foreign = Radar::factory()->create();
    ListingRef::factory()->create(['listing_number' => 100012, 'source_channel' => 'arenda_tashkent']);

    expect(fn () => $write($this->service, $this->user, $foreign))->toThrow(ModelNotFoundException::class)
        ->and(RadarHideRule::query()->count())->toBe(0);
})->with([
    'add' => [fn (RadarHideRuleService $service, User $user, Radar $radar): bool => $service->add($user, $radar, HideRuleKind::Channel, 'arenda_tashkent')],
    'from a listing' => [fn (RadarHideRuleService $service, User $user, Radar $radar): bool => $service->addFromListing($user, 100012, HideRuleKind::Channel, $radar)],
]);

describe('from a listing', function (): void {
    beforeEach(function (): void {
        ListingRef::factory()->ofAuthor('phone:'.str_repeat('c', 32))->create([
            'listing_number' => 100012, 'source_channel' => 'arenda_tashkent', 'district_code' => 'yunusobod',
        ]);
    });

    it('puts the rule of the listing on the radar of the card only', function (HideRuleKind $kind, string $target): void {
        config(['radar.author_hide_rules' => true]);
        $origin = Radar::factory()->for($this->user)->create();
        Radar::factory()->for($this->user)->create();

        expect($this->service->addFromListing($this->user, 100012, $kind, $origin))->toBeTrue()
            ->and(storedHideRules())->toBe([[$origin->id, $kind->value, $target]]);
    })->with([
        'channel' => [HideRuleKind::Channel, 'arenda_tashkent'],
        'district' => [HideRuleKind::District, 'yunusobod'],
        'author' => [HideRuleKind::Author, 'phone:'.str_repeat('c', 32)],
    ]);

    it('puts the rule on every active radar of the user when the card has no radar', function (): void {
        $first = Radar::factory()->for($this->user)->create();
        $second = Radar::factory()->for($this->user)->create();
        Radar::factory()->for($this->user)->paused()->create();
        Radar::factory()->create();

        expect($this->service->addFromListing($this->user, 100012, HideRuleKind::Channel, null))->toBeTrue()
            ->and(storedHideRules())->toEqualCanonicalizing([[$first->id, 'channel', 'arenda_tashkent'], [$second->id, 'channel', 'arenda_tashkent']]);
    });

    it('adds nothing when the user has no active radar', function (): void {
        Radar::factory()->for($this->user)->paused()->create();

        expect($this->service->addFromListing($this->user, 100012, HideRuleKind::Channel, null))->toBeFalse()
            ->and(RadarHideRule::query()->count())->toBe(0);
    });

    it('takes the channel of the survivor of a merged duplicate', function (): void {
        ListingRef::factory()->create(['listing_number' => 100016, 'source_channel' => 'old_channel', 'merged_into' => 100012]);
        $origin = Radar::factory()->for($this->user)->create();

        expect($this->service->addFromListing($this->user, 100016, HideRuleKind::Channel, $origin))->toBeTrue()
            ->and(storedHideRules())->toBe([[$origin->id, 'channel', 'arenda_tashkent']]);
    });

    it('adds nothing and answers false for a listing without that target', function (int $number, HideRuleKind $kind): void {
        ListingRef::factory()->create(['listing_number' => 100013, 'source_channel' => null, 'district_code' => null, 'author_key' => null]);
        $origin = Radar::factory()->for($this->user)->create();

        expect($this->service->addFromListing($this->user, $number, $kind, $origin))->toBeFalse()
            ->and(RadarHideRule::query()->count())->toBe(0);
    })->with([
        'unknown listing' => [999999, HideRuleKind::Channel],
        'no channel' => [100013, HideRuleKind::Channel],
        'no district' => [100013, HideRuleKind::District],
        'author rules off' => [100012, HideRuleKind::Author],
    ]);
});

it('clears every rule of the radar and zeroes its counter, and leaves the other radars alone', function (): void {
    $radar = Radar::factory()->for($this->user)->create(['hidden_count' => 4]);
    $other = Radar::factory()->for($this->user)->create(['hidden_count' => 2]);
    RadarHideRule::factory()->count(3)->for($radar)->create();
    RadarHideRule::factory()->for($other)->create();

    $this->service->clearAll($radar);

    expect($radar->fresh()?->hidden_count)->toBe(0)
        ->and($radar->hideRules()->count())->toBe(0)
        ->and($other->fresh()?->hidden_count)->toBe(2)
        ->and($other->hideRules()->count())->toBe(1);
});

it('reads the rules of one radar into a set that excludes per kind', function (): void {
    $radar = Radar::factory()->for($this->user)->create();
    RadarHideRule::factory()->for($radar)->create(['kind' => HideRuleKind::Channel, 'target' => 'arenda_tashkent']);
    RadarHideRule::factory()->for($radar)->create(['kind' => HideRuleKind::District, 'target' => 'yunusobod']);
    RadarHideRule::factory()->for($radar)->create(['kind' => HideRuleKind::Author, 'target' => 'phone:'.str_repeat('d', 32)]);
    RadarHideRule::factory()->for(Radar::factory()->for($this->user))->create(['kind' => HideRuleKind::Channel, 'target' => 'other_channel']);

    $rules = $this->service->rulesFor($radar);

    expect($rules->excludes('arenda_tashkent', null, null))->toBeTrue()
        ->and($rules->excludes('@Arenda_Tashkent', null, null))->toBeTrue()
        ->and($rules->excludes(null, 'yunusobod', null))->toBeTrue()
        ->and($rules->excludes(null, null, 'phone:'.str_repeat('d', 32)))->toBeTrue()
        ->and($rules->excludes('other_channel', 'mirobod', 'phone:'.str_repeat('e', 32)))->toBeFalse()
        ->and($rules->excludes(null, null, null))->toBeFalse()
        ->and($rules->hasAuthorRules())->toBeTrue()
        ->and($rules->isEmpty())->toBeFalse()
        ->and(HideRuleSet::none()->excludes('arenda_tashkent', 'yunusobod', 'phone:'.str_repeat('d', 32)))->toBeFalse()
        ->and(HideRuleSet::none()->isEmpty())->toBeTrue();
});
