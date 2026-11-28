<?php

use App\Enums\Identity\BotChatState;
use App\Events\Radar\RadarSaved;
use App\Models\Radar;
use App\Models\User;
use App\Services\Sources\Data\FlowEstimate;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Tests\Support\ContractShapes;
use Tests\Support\FakeListingSource;
use Tests\Support\FilterArrays;
use Tests\Support\JsonShape;
use Tests\Support\RadarApi;

/*
 * WP-45, step 9: `POST /radars` and `PUT /radars/{id}` on HOMI's radars (the shapes of WP-13, `meta.source = native`).
 * The switch of DEC-51 is on as `phpunit.xml` sets it; the chat check and the starter are off as the servers start,
 * and switched on where a case needs them. The listings come from the stub driver, or `FakeListingSource`.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->user = User::factory()->create(['bot_chat_state' => BotChatState::Active]);
    RadarApi::actAs($this->user);
});

describe('POST /radars', function (): void {
    it('creates a radar with the normalised filters and answers 201 from HOMI', function (): void {
        $response = $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 700], ['entry' => 'few', 'relaxed' => 'price']))->assertCreated();

        JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::RADAR_MUTATION, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
        $radar = Radar::query()->sole();
        $response->assertJsonPath('meta.source', 'native')
            ->assertJsonPath('data.kind', 'created')
            ->assertJsonPath('data.starter', 0)
            ->assertJsonPath('data.radar.id', $radar->id)
            ->assertJsonPath('data.radar.active', true)
            ->assertJsonPath('data.radar.mode', 'instant')
            ->assertJsonPath('data.radar.hidden', 0)
            ->assertJsonPath('data.radar.created_at', $radar->created_at->toIso8601String());
        expect(array_keys($response->json('data')))->toBe(['radar', 'kind', 'starter', 'options', 'relaxed'])
            ->and($response->json('data.radar.filters'))->toBe(FilterArrays::defaults(['price_max' => 700]))
            ->and($response->json('data.relaxed'))->toBeArray()
            ->and([$radar->user_id, $radar->entry, $radar->relax_code, $radar->filters])->toBe([$this->user->id, 'few', 'price', FilterArrays::defaults(['price_max' => 700])]);
    });

    it('stores every entry of the Mini App as given', function (string $entry): void {
        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 701], ['entry' => $entry]))->assertCreated();

        expect(Radar::query()->sole()->entry)->toBe($entry);
    })->with(['filters', 'empty', 'few', 'prompt', 'feed', 'return']);

    it('refuses a body the request rules refuse, writing nothing', function (array $body, string $field): void {
        $this->postJson('/api/v1/radars', $body)->assertUnprocessable()->assertJsonPath('code', 'validation_failed')->assertJsonValidationErrors([$field]);

        expect(Radar::query()->count())->toBe(0);
    })->with([
        'no entry' => [['filters' => ['city' => 'tashkent', 'deal' => 'rent_long']], 'entry'],
        'an entry of the bot' => [RadarApi::body([], ['entry' => 'bot_wizard']), 'entry'],
        'a banner' => [RadarApi::body([], ['entry' => 'banner']), 'entry'],
        'no filters' => [['entry' => 'filters'], 'filters'],
        'a list of filters' => [['filters' => ['tashkent'], 'entry' => 'filters'], 'filters'],
        'an unknown deal' => [RadarApi::body(['deal' => 'x']), 'filters.deal'],
        'a bad relaxed code' => [RadarApi::body([], ['relaxed' => 'Not A Code']), 'relaxed'],
    ]);

    it('answers the active radar of the same search as existing, 200, without a write — posted_days and order aside', function (): void {
        $twin = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'districts' => ['mirobod', 'yunusobod'], 'posted_days' => 7])->create();
        $before = RadarApi::rowsOf($this->user);

        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 700, 'districts' => ['yunusobod', 'mirobod'], 'posted_days' => 1]))->assertOk()
            ->assertJsonPath('data.kind', 'existing')->assertJsonPath('data.radar.id', $twin->id)->assertJsonPath('data.starter', 0)
            ->assertJsonPath('data.options', [])->assertJsonPath('data.relaxed', []);

        expect(RadarApi::rowsOf($this->user))->toBe($before);
    });

    it('switches a paused radar of the same search back on as reactivated, 200, with the new entry', function (): void {
        $twin = Radar::factory()->for($this->user)->filters(['price_max' => 700])->paused()->create(['entry' => 'filters']);

        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 700], ['entry' => 'return']))->assertOk()
            ->assertJsonPath('data.kind', 'reactivated')->assertJsonPath('data.radar.id', $twin->id)->assertJsonPath('data.radar.active', true);

        expect($twin->fresh()?->only(['active', 'entry', 'paused_at']))->toBe(['active' => true, 'entry' => 'return', 'paused_at' => null])
            ->and(Radar::query()->count())->toBe(1);
    });

    it('refuses the radar over the limit with 409 radar_limit, counting active radars only, and writes nothing', function (): void {
        config(['radar.max' => 2]);
        Radar::factory()->for($this->user)->count(2)->create();
        Radar::factory()->for($this->user)->paused()->create();
        $before = RadarApi::rowsOf($this->user);

        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 702]))->assertStatus(409)->assertJsonPath('code', 'radar_limit');

        expect(RadarApi::rowsOf($this->user))->toBe($before);
    });

    it('answers 409 no_chat before any write while the bot cannot write, and the repeat after access writes one radar', function (BotChatState $state): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => $state])->save();

        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 703]))->assertStatus(409)->assertJsonPath('code', 'no_chat');
        expect(Radar::query()->count())->toBe(0);

        $this->user->forceFill(['bot_chat_state' => BotChatState::Active])->save();
        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 703]))->assertCreated();
        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 703]))->assertOk()->assertJsonPath('data.kind', 'existing');

        expect(Radar::query()->count())->toBe(1);
    })->with([BotChatState::Never, BotChatState::Blocked]);

    it('tells the no_chat and the limit answers apart, no_chat first', function (): void {
        config(['radar.require_chat' => true, 'radar.max' => 1]);
        Radar::factory()->for($this->user)->create();
        $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();

        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 704]))->assertStatus(409)->assertJsonPath('code', 'no_chat');

        $this->user->forceFill(['bot_chat_state' => BotChatState::Active])->save();
        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 704]))->assertStatus(409)->assertJsonPath('code', 'radar_limit');
    });

    it('answers the starter the listing source gives when the starter is on', function (): void {
        config(['radar.starter_enabled' => true]);
        $source = FakeListingSource::bind()->withItems([100001 => [], 100002 => []]);

        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 705]), ['Accept-Language' => 'uz'])->assertCreated()
            ->assertJsonPath('data.starter', 2)->assertJsonPath('data.options', [])->assertJsonPath('data.relaxed', []);

        expect($source->callsOf('feed')[0][2]->locale)->toBe('uz')
            ->and($source->callsOf('feed')[0][2]->user?->id)->toBe($this->user->id);
    });
});

describe('PUT /radars/{id}', function (): void {
    it('replaces the filters, keeps the radar paused or active, and answers updated from HOMI', function (bool $active): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create($active ? [] : ['active' => false, 'paused_at' => now()]);

        $response = $this->putJson("/api/v1/radars/{$radar->id}", RadarApi::body(['price_max' => 900], ['relaxed' => 'price']))->assertOk();

        JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::RADAR_MUTATION, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
        $response->assertJsonPath('meta.source', 'native')->assertJsonPath('data.kind', 'updated')
            ->assertJsonPath('data.radar.id', $radar->id)->assertJsonPath('data.radar.active', $active)->assertJsonPath('data.radar.filters.price_max', 900);
        expect($radar->fresh()?->only(['active', 'relax_code']))->toBe(['active' => $active, 'relax_code' => 'price'])
            ->and($radar->fresh()?->filters)->toBe(FilterArrays::defaults(['price_max' => 900]));
    })->with(['active' => true, 'paused' => false]);

    it('finds the radar by a lower-case id as well', function (): void {
        $radar = Radar::factory()->for($this->user)->create();

        $this->putJson('/api/v1/radars/'.strtolower($radar->id), RadarApi::body(['price_max' => 906]))->assertOk()->assertJsonPath('data.radar.id', $radar->id);
    });

    it('writes nothing for the filters the radar already has', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'posted_days' => 7])->create();
        $before = RadarApi::rowsOf($this->user);

        $this->putJson("/api/v1/radars/{$radar->id}", RadarApi::body(['price_max' => 700, 'posted_days' => 1]))->assertOk()
            ->assertJsonPath('data.kind', 'updated')->assertJsonPath('data.starter', 0)->assertJsonPath('data.options', [])->assertJsonPath('data.relaxed', []);

        expect(RadarApi::rowsOf($this->user))->toBe($before);
    });

    it('refuses the filters of another radar of the user with 409 radar_duplicate and changes nothing', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();
        Radar::factory()->for($this->user)->filters(['price_max' => 900])->paused()->create();
        $before = RadarApi::rowsOf($this->user);

        $this->putJson("/api/v1/radars/{$radar->id}", RadarApi::body(['price_max' => 900]))->assertStatus(409)->assertJsonPath('code', 'radar_duplicate');

        expect(RadarApi::rowsOf($this->user))->toBe($before);
    });

    it('answers 409 no_chat before any change while the bot cannot write', function (): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Blocked])->save();
        $radar = Radar::factory()->for($this->user)->create();
        $before = RadarApi::rowsOf($this->user);

        $this->putJson("/api/v1/radars/{$radar->id}", RadarApi::body(['price_max' => 907]))->assertStatus(409)->assertJsonPath('code', 'no_chat');

        expect(RadarApi::rowsOf($this->user))->toBe($before);
    });

    it('validates the body before it looks the radar up', function (): void {
        $this->putJson('/api/v1/radars/'.RadarApi::UNKNOWN_ID, ['filters' => []])->assertUnprocessable()->assertJsonValidationErrors(['filters']);
    });

    it('answers another user\'s radar exactly as an unknown id, and leaves it as it was', function (): void {
        $radar = Radar::factory()->for($this->user)->create();

        RadarApi::assertForeignLikeUnknown($this->user, $radar, 'PUT', '', RadarApi::body(['price_max' => 908]));
    });
});

describe('a failure after the commit', function (): void {
    beforeEach(function (): void {
        Event::fake([RadarSaved::class]);
        Exceptions::fake();
        $this->source = FakeListingSource::bind()->withItems([100001 => []]);
        $this->source->count = 1;
        $this->source->flow = new FlowEstimate(1, 7, []);
        $this->source->failure = new RuntimeException('the source answered garbage');
    });

    it('keeps a create, answers 201 with an empty starter and no options, and announces it once', function (bool $starter): void {
        config(['radar.starter_enabled' => $starter]);

        $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 777]))->assertCreated()
            ->assertJsonPath('data.kind', 'created')->assertJsonPath('data.starter', 0)
            ->assertJsonPath('data.options', [])->assertJsonPath('data.relaxed', []);

        $radar = Radar::query()->sole();
        expect($this->source->calls)->not->toBe([]);
        Event::assertDispatchedTimes(RadarSaved::class, 1);
        Event::assertDispatched(RadarSaved::class, fn (RadarSaved $event): bool => $event->radarId === $radar->id && $event->starterNumbers === []);
        Exceptions::assertReported(fn (RuntimeException $e): bool => $e->getMessage() === 'the source answered garbage');
    })->with(['starter on' => true, 'starter off' => false]);

    it('keeps a replace, answers updated with an empty starter and no options, and announces it once', function (bool $starter): void {
        config(['radar.starter_enabled' => $starter]);
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();

        $this->putJson("/api/v1/radars/{$radar->id}", RadarApi::body(['price_max' => 778]))->assertOk()
            ->assertJsonPath('data.kind', 'updated')->assertJsonPath('data.starter', 0)
            ->assertJsonPath('data.options', [])->assertJsonPath('data.relaxed', []);

        expect($radar->fresh()?->filters['price_max'])->toBe(778);
        Event::assertDispatchedTimes(RadarSaved::class, 1);
        Exceptions::assertReported(RuntimeException::class);
    })->with(['starter on' => true, 'starter off' => false]);
});

describe('switched off (DEC-51)', function (): void {
    it('refuses both writes with 403 radars_disabled before validation, and writes nothing', function (string $method, bool $known, array $body): void {
        config(['radar.creation_enabled' => false]);
        $radar = Radar::factory()->for($this->user)->create();
        $before = RadarApi::rowsOf($this->user);
        $path = $method === 'POST' ? '/api/v1/radars' : '/api/v1/radars/'.($known ? $radar->id : RadarApi::UNKNOWN_ID);

        $this->json($method, $path, $body)->assertForbidden()->assertJsonPath('code', 'radars_disabled');

        expect(RadarApi::rowsOf($this->user))->toBe($before);
    })->with([
        'create' => ['POST', true, RadarApi::body(['price_max' => 909])],
        'create with a bad body' => ['POST', true, ['entry' => 'banner']],
        'replace' => ['PUT', true, RadarApi::body(['price_max' => 909])],
        'replace an unknown radar' => ['PUT', false, []],
    ]);
});
