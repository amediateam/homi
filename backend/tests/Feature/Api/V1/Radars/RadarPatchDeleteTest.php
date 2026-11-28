<?php

use App\Enums\Identity\BotChatState;
use App\Enums\Radar\HideRuleKind;
use App\Enums\RadarMode;
use App\Models\FoundAnswer;
use App\Models\ListingView;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Policies\RadarPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Tests\Support\ContractShapes;
use Tests\Support\FakeListingSource;
use Tests\Support\JsonShape;
use Tests\Support\RadarApi;

/*
 * WP-45, step 9: `PATCH /radars/{id}` (exactly one change: switch on with `starter`, pause with `ask_found`, the mode,
 * `unhide`) and `DELETE /radars/{id}` (`{"ask_found": …}`, a second call `404`) on HOMI's radars; «Нашли жильё?» asks
 * through `FoundAskPolicy`. A radar is looked up through the caller's radars, then checked by `RadarPolicy`.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->freezeTime();
    $this->user = User::factory()->create(['bot_chat_state' => BotChatState::Active]);
    RadarApi::actAs($this->user);
});

describe('PATCH /radars/{id}', function (): void {
    it('switches a paused radar on and answers its starter, never ask_found', function (): void {
        $radar = Radar::factory()->for($this->user)->paused()->create();

        $response = $this->patchJson("/api/v1/radars/{$radar->id}", ['active' => true])->assertOk();

        JsonShape::assertSame(ContractShapes::RADAR, JsonShape::of($response->json('data.radar')));
        $response->assertJsonPath('meta.source', 'native')->assertJsonPath('data.radar.active', true)->assertJsonPath('data.starter', 0);
        expect(array_keys($response->json('data')))->toBe(['radar', 'starter'])
            ->and($radar->fresh()?->only(['active', 'paused_at']))->toBe(['active' => true, 'paused_at' => null]);
    });

    it('answers the unseen starter of a resume when the starter is on', function (): void {
        config(['radar.starter_enabled' => true]);
        FakeListingSource::bind()->withItems([100001 => [], 100002 => [], 100003 => []]);
        ListingView::factory()->for($this->user)->create(['listing_number' => 100002]);
        $radar = Radar::factory()->for($this->user)->paused()->create();

        $this->patchJson("/api/v1/radars/{$radar->id}", ['active' => true])->assertOk()->assertJsonPath('data.starter', 2);
    });

    it('refuses a resume at the limit with 409 radar_limit and keeps the radar paused', function (): void {
        config(['radar.max' => 1]);
        Radar::factory()->for($this->user)->create();
        $radar = Radar::factory()->for($this->user)->paused()->create();

        $this->patchJson("/api/v1/radars/{$radar->id}", ['active' => true])->assertStatus(409)->assertJsonPath('code', 'radar_limit');

        expect($radar->fresh()?->active)->toBeFalse();
    });

    it('refuses a resume with 409 no_chat while the bot cannot write, and keeps the radar paused', function (): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();
        $radar = Radar::factory()->for($this->user)->paused()->create();

        $this->patchJson("/api/v1/radars/{$radar->id}", ['active' => true])->assertStatus(409)->assertJsonPath('code', 'no_chat');

        expect($radar->fresh()?->active)->toBeFalse();
    });

    it('answers a switch-on of a radar already on with starter 0, and still checks the chat first', function (): void {
        $radar = Radar::factory()->for($this->user)->create();

        $this->patchJson("/api/v1/radars/{$radar->id}", ['active' => true])->assertOk()->assertJsonPath('data.starter', 0);

        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();
        $this->patchJson("/api/v1/radars/{$radar->id}", ['active' => true])->assertStatus(409)->assertJsonPath('code', 'no_chat');
    });

    it('pauses without the chat check and asks «Нашли жильё?» once in 24 hours', function (): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Blocked])->save();
        [$first, $second] = Radar::factory()->for($this->user)->count(2)->create()->all();

        $response = $this->patchJson("/api/v1/radars/{$first->id}", ['active' => false])->assertOk()
            ->assertJsonPath('data.radar.active', false)->assertJsonPath('data.ask_found', true);
        $this->patchJson("/api/v1/radars/{$second->id}", ['active' => false])->assertOk()->assertJsonPath('data.ask_found', false);
        $this->patchJson("/api/v1/radars/{$first->id}", ['active' => false])->assertOk()->assertJsonPath('data.ask_found', false);

        expect(array_keys($response->json('data')))->toBe(['radar', 'ask_found'])
            ->and($first->fresh()?->paused_at?->toIso8601String())->toBe(now()->toIso8601String());
    });

    it('does not ask after an answer of the last 30 days', function (): void {
        FoundAnswer::factory()->for($this->user)->create(['created_at' => now()->subDays(29)]);
        $radar = Radar::factory()->for($this->user)->create();

        $this->patchJson("/api/v1/radars/{$radar->id}", ['active' => false])->assertOk()->assertJsonPath('data.ask_found', false);
    });

    it('switches the mode and answers only the radar', function (): void {
        $radar = Radar::factory()->for($this->user)->paused()->create();

        $response = $this->patchJson("/api/v1/radars/{$radar->id}", ['mode' => 'digest'])->assertOk()
            ->assertJsonPath('data.radar.mode', 'digest')->assertJsonPath('data.radar.active', false);

        expect(array_keys($response->json('data')))->toBe(['radar'])
            ->and($radar->fresh()?->mode)->toBe(RadarMode::Digest);
    });

    it('unhides: clears the radar\'s rules and answers hidden 0', function (): void {
        $radar = Radar::factory()->for($this->user)->create(['hidden_count' => 3]);
        RadarHideRule::factory()->for($radar)->create(['kind' => HideRuleKind::Channel, 'target' => 'a_channel']);
        $other = RadarHideRule::factory()->for(Radar::factory()->for($this->user))->create();

        $response = $this->patchJson("/api/v1/radars/{$radar->id}", ['unhide' => true])->assertOk()->assertJsonPath('data.radar.hidden', 0);

        expect(array_keys($response->json('data')))->toBe(['radar'])
            ->and($radar->fresh()?->hidden_count)->toBe(0)
            ->and(RadarHideRule::query()->pluck('id')->all())->toBe([$other->id]);
    });

    it('refuses a body that is not exactly one known change, changing nothing', function (array $body): void {
        $radar = Radar::factory()->for($this->user)->paused()->create(['hidden_count' => 2]);
        $before = RadarApi::rowsOf($this->user);

        $this->patchJson("/api/v1/radars/{$radar->id}", $body)->assertUnprocessable()->assertJsonPath('code', 'validation_failed');

        expect(RadarApi::rowsOf($this->user))->toBe($before);
    })->with([
        'empty' => [[]],
        'two keys' => [['active' => true, 'mode' => 'digest']],
        'an unknown key' => [['active' => true, 'colour' => 'red']],
        'an unknown mode' => [['mode' => 'weekly']],
        'unhide false' => [['unhide' => false]],
    ]);

    it('answers another user\'s radar exactly as an unknown id, and leaves it as it was', function (array $body): void {
        $radar = Radar::factory()->for($this->user)->paused()->create(['hidden_count' => 2]);
        RadarHideRule::factory()->for($radar)->create();

        RadarApi::assertForeignLikeUnknown($this->user, $radar, 'PATCH', '', $body);
    })->with([
        'switch on' => [['active' => true]],
        'pause' => [['active' => false]],
        'mode' => [['mode' => 'digest']],
        'unhide' => [['unhide' => true]],
    ]);
});

describe('DELETE /radars/{id}', function (): void {
    it('deletes the radar with its rules and answers ask_found; a second call is 404', function (): void {
        $radar = Radar::factory()->for($this->user)->create();
        RadarHideRule::factory()->for($radar)->create();

        $this->deleteJson("/api/v1/radars/{$radar->id}")->assertOk()->assertExactJson(['success' => true, 'data' => ['ask_found' => true], 'meta' => ['source' => 'native']]);

        expect(Radar::query()->count())->toBe(0)->and(RadarHideRule::query()->count())->toBe(0);
        $this->deleteJson("/api/v1/radars/{$radar->id}")->assertNotFound()->assertJsonPath('code', 'not_found');
    });

    it('asks «Нашли жильё?» at most once a day across pause and delete', function (): void {
        [$first, $second] = Radar::factory()->for($this->user)->count(2)->create()->all();

        $this->patchJson("/api/v1/radars/{$first->id}", ['active' => false])->assertOk()->assertJsonPath('data.ask_found', true);
        $this->deleteJson("/api/v1/radars/{$second->id}")->assertOk()->assertJsonPath('data.ask_found', false);
    });

    it('spends no question on a radar it does not find', function (): void {
        $radar = Radar::factory()->for($this->user)->create();

        $this->deleteJson('/api/v1/radars/'.RadarApi::UNKNOWN_ID)->assertNotFound();
        $this->deleteJson("/api/v1/radars/{$radar->id}")->assertOk()->assertJsonPath('data.ask_found', true);
    });

    it('deletes while radars are switched off', function (): void {
        config(['radar.creation_enabled' => false]);
        $radar = Radar::factory()->for($this->user)->paused()->create();

        $this->deleteJson("/api/v1/radars/{$radar->id}")->assertOk()->assertJsonPath('data.ask_found', true);

        expect(Radar::query()->count())->toBe(0);
    });

    it('answers another user\'s radar exactly as an unknown id, and leaves it as it was', function (): void {
        $radar = Radar::factory()->for($this->user)->create();
        RadarHideRule::factory()->for($radar)->create();

        RadarApi::assertForeignLikeUnknown($this->user, $radar, 'DELETE', '', []);
    });
});

it('refuses every PATCH with 403 radars_disabled while radars are switched off, changing nothing', function (array $body): void {
    config(['radar.creation_enabled' => false]);
    $radar = Radar::factory()->for($this->user)->paused()->create(['hidden_count' => 1]);
    RadarHideRule::factory()->for($radar)->create();
    $before = RadarApi::rowsOf($this->user);

    $this->patchJson("/api/v1/radars/{$radar->id}", $body)->assertForbidden()->assertJsonPath('code', 'radars_disabled');

    expect(RadarApi::rowsOf($this->user))->toBe($before);
})->with([
    'switch on' => [['active' => true]],
    'pause' => [['active' => false]],
    'mode' => [['mode' => 'digest']],
    'unhide' => [['unhide' => true]],
    'a bad body' => [['colour' => 'red']],
]);

it('lets RadarPolicy pass the owner only, and refuses anyone else as not found', function (string $ability): void {
    $radar = Radar::factory()->for($this->user)->create();
    $other = User::factory()->create();

    expect(Gate::forUser($this->user)->inspect($ability, $radar)->allowed())->toBeTrue()
        ->and(Gate::forUser($other)->inspect($ability, $radar)->status())->toBe(404)
        ->and(Gate::getPolicyFor(Radar::class))->toBeInstanceOf(RadarPolicy::class);
})->with(['view', 'update', 'delete']);
