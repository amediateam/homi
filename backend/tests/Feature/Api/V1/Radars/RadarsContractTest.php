<?php

use App\Http\Controllers\Api\V1\Radars\RadarController;
use App\Http\Controllers\Api\V1\Radars\RadarRelaxController;
use App\Http\Requests\Api\V1\Radars\ListRadarsRequest;
use App\Http\Requests\Api\V1\Radars\PatchRadarRequest;
use App\Http\Requests\Api\V1\Radars\RelaxRadarRequest;
use App\Http\Requests\Api\V1\Radars\StoreRadarRequest;
use App\Http\Requests\Api\V1\Radars\UpdateRadarRequest;
use App\Models\User;
use App\Services\Sources\Stub\StubRadars;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\FilterArrays;
use Tests\Support\JsonShape;

/*
 * The six radar methods of WP-13 as the native stubs answer them (WP-45, brief decision 11): while
 * `sources.native_stubs` is on, `NativeStubs` answers the fixtures of `radars/` and stores nothing, as the end-to-end
 * suite expects — the same three radars whatever was written, `meta.source = stub`, the scenarios of WP-13, and the
 * switched-off state of DEC-51 (the four writes `403 radars_disabled` before the stub, the list `[]`, `DELETE` as
 * usual).
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    config(['sources.native_stubs' => true]);
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

/** A radar id of `radars/list.json`. */
const RADAR_ID = '01JD0000000000000000000001';

/** @return array<string, mixed> */
function radarBody(array $overrides = []): array
{
    return ['filters' => ['city' => 'tashkent', 'deal' => 'rent_long', 'price_max' => 700], 'entry' => 'filters', ...$overrides];
}

it('lists the radars in creation order, without previews unless asked', function (): void {
    $plain = $this->getJson('/api/v1/radars')->assertOk();
    $withPreviews = $this->getJson('/api/v1/radars?include=previews')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['*' => ContractShapes::RADAR], 'meta' => ['source' => 'string']], JsonShape::of($plain->json()));
    JsonShape::assertSame(['success' => 'bool', 'data' => ['*' => [...ContractShapes::RADAR, 'preview' => ContractShapes::RADAR_PREVIEW]], 'meta' => ['source' => 'string']], JsonShape::of($withPreviews->json()));
    expect($plain->json('data'))->toHaveCount(3)
        ->and(array_column($plain->json('data'), 'created_at'))->toBe(collect($plain->json('data'))->pluck('created_at')->sort()->values()->all())
        ->and(array_keys($plain->json('data.0.filters')))->toBe(FilterArrays::KEYS)
        ->and(array_column($withPreviews->json('data'), 'preview'))->toHaveCount(3)
        ->and(count($withPreviews->json('data.0.preview.items')))->toBeLessThanOrEqual(5);
    $plain->assertJsonPath('meta.source', 'stub');
});

it('answers an empty list in the empty scenario', function (): void {
    $this->getJson('/api/v1/radars', ['X-Stub-Scenario' => 'empty'])->assertOk()->assertJsonPath('data', []);
});

it('creates a radar with the normalised filters', function (): void {
    $response = $this->postJson('/api/v1/radars', radarBody())->assertCreated();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::RADAR_MUTATION, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    expect(array_keys($response->json('data')))->toBe(['radar', 'kind', 'starter', 'options', 'relaxed'])
        ->and($response->json('data.radar.filters'))->toBe(FilterArrays::defaults(['price_max' => 700]));
    $response->assertJsonPath('data.kind', 'created');
});

it('accepts the six entry values and refuses others', function (): void {
    foreach (['filters', 'empty', 'few', 'prompt', 'feed', 'return'] as $entry) {
        $this->postJson('/api/v1/radars', radarBody(['entry' => $entry]))->assertCreated();
    }

    $this->postJson('/api/v1/radars', radarBody(['entry' => 'banner']))->assertStatus(422)->assertJsonValidationErrors(['entry']);
    $this->postJson('/api/v1/radars', ['filters' => radarBody()['filters']])->assertStatus(422)->assertJsonValidationErrors(['entry']);
    $this->postJson('/api/v1/radars', radarBody(['relaxed' => 'Not A Code']))->assertStatus(422)->assertJsonValidationErrors(['relaxed']);
});

it('names the bad filter under filters', function (array $filters, string $field): void {
    $this->postJson('/api/v1/radars', radarBody(['filters' => $filters]))->assertStatus(422)->assertJsonValidationErrors([$field]);
})->with([
    'missing' => [[], 'filters'],
    'unknown deal' => [['city' => 'tashkent', 'deal' => 'x'], 'filters.deal'],
    'unknown district' => [['city' => 'tashkent', 'deal' => 'rent_long', 'districts' => ['atlantis']], 'filters.districts'],
]);

it('answers the create scenarios', function (string $scenario, int $status, ?string $kind, ?int $starter): void {
    $response = $this->postJson('/api/v1/radars', radarBody(), ['X-Stub-Scenario' => $scenario])->assertStatus($status);

    if ($kind !== null) {
        $response->assertJsonPath('data.kind', $kind)->assertJsonPath('data.starter', $starter);
    }
})->with([
    'existing' => ['existing', 200, 'existing', 0],
    'starter' => ['starter', 201, 'created', 3],
    'few' => ['few', 201, 'created', 0],
]);

it('fills options only when nothing was sent', function (): void {
    expect($this->postJson('/api/v1/radars', radarBody(), ['X-Stub-Scenario' => 'few'])->json('data.options'))->not->toBeEmpty()
        ->and($this->postJson('/api/v1/radars', radarBody(), ['X-Stub-Scenario' => 'starter'])->json('data.options'))->toBe([]);
});

it('tells the radar errors apart by code', function (string $method, string $path, array $body, string $scenario, int $status): void {
    $this->json($method, "/api/v1/{$path}", $body, ['X-Stub-Scenario' => $scenario])->assertStatus($status)->assertJsonPath('code', $scenario);
})->with([
    'no chat on create' => ['POST', 'radars', radarBody(), 'no_chat', 409],
    'no chat on update' => ['PUT', 'radars/'.RADAR_ID, radarBody(), 'no_chat', 409],
    'no chat on switching on' => ['PATCH', 'radars/'.RADAR_ID, ['active' => true], 'no_chat', 409],
    'no chat on relax' => ['POST', 'radars/'.RADAR_ID.'/relax', ['code' => 'price_more'], 'no_chat', 409],
    'limit on create' => ['POST', 'radars', radarBody(), 'radar_limit', 409],
    'limit on switching on' => ['PATCH', 'radars/'.RADAR_ID, ['active' => true], 'radar_limit', 409],
    'duplicate on update' => ['PUT', 'radars/'.RADAR_ID, radarBody(), 'radar_duplicate', 409],
    'duplicate on relax' => ['POST', 'radars/'.RADAR_ID.'/relax', ['code' => 'price_more'], 'radar_duplicate', 409],
]);

it('replaces the filters of a radar and keeps active', function (): void {
    $response = $this->putJson('/api/v1/radars/'.RADAR_ID, radarBody())->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::RADAR_MUTATION, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.kind', 'updated')->assertJsonPath('data.radar.id', RADAR_ID)->assertJsonPath('data.radar.filters.price_max', 700);
});

it('answers 404 for a radar it does not know', function (string $method, string $suffix, array $body): void {
    foreach (['01JD0000000000000000000099', 'not-a-ulid'] as $id) {
        $this->json($method, "/api/v1/radars/{$id}{$suffix}", $body)->assertStatus(404)->assertJsonPath('code', 'not_found');
    }
})->with([['PUT', '', radarBody()], ['PATCH', '', ['mode' => 'digest']], ['DELETE', '', []], ['POST', '/relax', ['code' => 'price_more']]]);

it('changes one thing with PATCH', function (array $body, array $expected, array $absent): void {
    $response = $this->patchJson('/api/v1/radars/'.RADAR_ID, $body)->assertOk();

    JsonShape::assertSame(ContractShapes::RADAR, JsonShape::of($response->json('data.radar')));

    foreach ($expected as $path => $value) {
        $response->assertJsonPath("data.{$path}", $value);
    }

    foreach ($absent as $key) {
        expect($response->json('data'))->not->toHaveKey($key);
    }
})->with([
    'switch on' => [['active' => true], ['radar.active' => true, 'starter' => 2], ['ask_found']],
    'pause' => [['active' => false], ['radar.active' => false, 'ask_found' => false], ['starter']],
    'digest' => [['mode' => 'digest'], ['radar.mode' => 'digest'], ['starter', 'ask_found']],
    'unhide' => [['unhide' => true], ['radar.hidden' => 0], ['starter', 'ask_found']],
]);

it('asks for the survey on pause and delete in the ask_found scenario', function (): void {
    $this->patchJson('/api/v1/radars/'.RADAR_ID, ['active' => false], ['X-Stub-Scenario' => 'ask_found'])->assertOk()->assertJsonPath('data.ask_found', true);
    $this->deleteJson('/api/v1/radars/'.RADAR_ID, [], ['X-Stub-Scenario' => 'ask_found'])->assertOk()->assertJsonPath('data', ['ask_found' => true]);
    $this->deleteJson('/api/v1/radars/'.RADAR_ID)->assertOk()->assertJsonPath('data', ['ask_found' => false]);
});

it('refuses a PATCH that is not exactly one known change', function (array $body): void {
    $this->patchJson('/api/v1/radars/'.RADAR_ID, $body)->assertStatus(422)->assertJsonPath('code', 'validation_failed');
})->with([
    'empty' => [[]],
    'two keys' => [['active' => true, 'mode' => 'digest']],
    'unknown mode' => [['mode' => 'weekly']],
    'unhide false' => [['unhide' => false]],
    'unknown key' => [['active' => true, 'colour' => 'red']],
]);

it('widens a radar by an offered code', function (): void {
    $this->postJson('/api/v1/radars/'.RADAR_ID.'/relax', ['code' => 'price_more'])->assertOk()
        ->assertJsonPath('data.starter', 3)->assertJsonPath('data.radar.id', RADAR_ID);
    $this->postJson('/api/v1/radars/'.RADAR_ID.'/relax', ['code' => 'no_such_option'])->assertStatus(422)->assertJsonValidationErrors(['code']);
});

describe('switched off (DEC-51)', function (): void {
    beforeEach(function (): void {
        config(['radar.creation_enabled' => false]);
    });

    it('refuses every write with 403 radars_disabled, before validation and scenarios', function (string $method, string $path, array $body): void {
        foreach ([[], ['X-Stub-Scenario' => 'no_chat']] as $headers) {
            $this->json($method, "/api/v1/{$path}", $body, $headers)->assertStatus(403)->assertJsonPath('code', 'radars_disabled');
        }
    })->with([
        'create' => ['POST', 'radars', radarBody()],
        'create with a bad body' => ['POST', 'radars', ['entry' => 'banner']],
        'update' => ['PUT', 'radars/'.RADAR_ID, radarBody()],
        'switch on' => ['PATCH', 'radars/'.RADAR_ID, ['active' => true]],
        'pause' => ['PATCH', 'radars/'.RADAR_ID, ['active' => false]],
        'mode' => ['PATCH', 'radars/'.RADAR_ID, ['mode' => 'digest']],
        'unhide' => ['PATCH', 'radars/'.RADAR_ID, ['unhide' => true]],
        'relax' => ['POST', 'radars/'.RADAR_ID.'/relax', ['code' => 'nonsense']],
        'unknown radar' => ['PUT', 'radars/01JD0000000000000000000099', []],
    ]);

    it('lists no radar and still deletes', function (): void {
        $this->getJson('/api/v1/radars')->assertOk()->assertJsonPath('data', []);
        $this->getJson('/api/v1/radars?include=previews', ['X-Stub-Scenario' => 'source_unavailable'])->assertOk()->assertJsonPath('data', []);
        $this->deleteJson('/api/v1/radars/'.RADAR_ID)->assertOk()->assertJsonPath('data.ask_found', false);
    });

    it('still needs a token', function (): void {
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', '')->postJson('/api/v1/radars', radarBody())->assertStatus(401);
    });
});

it('answers every radar route from the native stubs, never from the controllers', function (string $method, string $path, array $body, int $status): void {
    $this->app->instance(RadarController::class, new class(app(StubResponder::class), app(StubRadars::class)) extends RadarController
    {
        public function index(ListRadarsRequest $request): JsonResponse
        {
            throw new LogicException('The radar controller was reached.');
        }

        public function store(StoreRadarRequest $request): JsonResponse
        {
            throw new LogicException('The radar controller was reached.');
        }

        public function update(UpdateRadarRequest $request, string $id): JsonResponse
        {
            throw new LogicException('The radar controller was reached.');
        }

        public function patch(PatchRadarRequest $request, string $id): JsonResponse
        {
            throw new LogicException('The radar controller was reached.');
        }

        public function destroy(Request $request, string $id): JsonResponse
        {
            throw new LogicException('The radar controller was reached.');
        }
    });
    $this->app->instance(RadarRelaxController::class, new class extends RadarRelaxController
    {
        public function __invoke(RelaxRadarRequest $request, string $id, StubResponder $stubs, StubRadars $radars): JsonResponse
        {
            throw new LogicException('The radar relax controller was reached.');
        }
    });

    $this->json($method, "/api/v1/{$path}", $body)->assertStatus($status)->assertJsonPath('meta.source', 'stub');
})->with([
    'list' => ['GET', 'radars?include=previews', [], 200],
    'create' => ['POST', 'radars', radarBody(), 201],
    'update' => ['PUT', 'radars/'.RADAR_ID, radarBody(), 200],
    'patch' => ['PATCH', 'radars/'.RADAR_ID, ['active' => false], 200],
    'delete' => ['DELETE', 'radars/'.RADAR_ID, [], 200],
    'relax' => ['POST', 'radars/'.RADAR_ID.'/relax', ['code' => 'price_more'], 200],
]);
