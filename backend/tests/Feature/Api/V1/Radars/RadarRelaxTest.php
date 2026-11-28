<?php

use App\Enums\Identity\BotChatState;
use App\Models\Radar;
use App\Models\User;
use App\Services\Radar\RadarRelaxOptions;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\FlowOption;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\Support\ContractShapes;
use Tests\Support\FakeListingSource;
use Tests\Support\FilterArrays;
use Tests\Support\JsonShape;
use Tests\Support\RadarApi;

/*
 * WP-45, step 9: `POST /radars/{id}/relax` on HOMI's radars — the `code` of an option the radar's create or replace
 * offered (`options` of the answer) widens it by the rules of `PUT`; the answer is the radar with `starter` (the shape of
 * WP-13, `meta.source = native`). The listings come from `FakeListingSource`.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->user = User::factory()->create(['bot_chat_state' => BotChatState::Active]);
    RadarApi::actAs($this->user);
    $this->source = FakeListingSource::bind();
    $this->source->flow = new FlowEstimate(2, 7, [
        new FlowOption('price_more', 'До $900', '≈1 в день', 12, SearchFilters::fromNormalised(FilterArrays::defaults(['price_max' => 900]))),
        new FlowOption('districts', 'Все районы', '≈3 в день', 30, SearchFilters::fromNormalised(FilterArrays::defaults())),
    ]);
});

/** Creates a narrow radar through the API, so its options are offered; answers its id. */
function relaxRouteRadar(): string
{
    return (string) test()->postJson('/api/v1/radars', RadarApi::body(['price_max' => 700, 'districts' => ['yunusobod']]))->assertCreated()->json('data.radar.id');
}

it('offers the options in the answer of the create, and widens the radar by an offered code', function (): void {
    $create = $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 700, 'districts' => ['yunusobod']]))->assertCreated();
    $create->assertJsonPath('data.options', [
        ['code' => 'price_more', 'label' => 'До $900', 'rate' => '≈1 в день', 'count' => 12],
        ['code' => 'districts', 'label' => 'Все районы', 'rate' => '≈3 в день', 'count' => 30],
    ])->assertJsonPath('data.relaxed', []);
    config(['radar.starter_enabled' => true]);
    $this->source->withItems([100001 => [], 100002 => [], 100003 => []]);

    $response = $this->postJson('/api/v1/radars/'.$create->json('data.radar.id').'/relax', ['code' => 'districts'])->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['radar' => ContractShapes::RADAR, 'starter' => 'int'], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('meta.source', 'native')->assertJsonPath('data.starter', 3)->assertJsonPath('data.radar.filters', FilterArrays::defaults());
    expect(array_keys($response->json('data')))->toBe(['radar', 'starter'])
        ->and(Radar::query()->sole()->only(['relax_code', 'active']))->toBe(['relax_code' => 'districts', 'active' => true]);
    $this->getJson('/api/v1/radars')->assertJsonPath('data.0.filters', FilterArrays::defaults());
});

it('answers a relaxed hint instead of options when the source offers none', function (): void {
    $this->source->flow = new FlowEstimate(21, 7, []);

    $this->postJson('/api/v1/radars', RadarApi::body(['price_max' => 700]), ['Accept-Language' => 'en'])->assertCreated()
        ->assertJsonPath('data.options', [])->assertJsonPath('data.relaxed', [['text' => '≈3 a day']]);
});

it('refuses a code the radar did not offer with 422 on code, changing nothing', function (string $code): void {
    $id = relaxRouteRadar();
    $before = RadarApi::rowsOf($this->user);

    $this->postJson("/api/v1/radars/{$id}/relax", ['code' => $code])->assertUnprocessable()
        ->assertJsonPath('code', 'validation_failed')->assertJsonValidationErrors(['code']);

    expect(RadarApi::rowsOf($this->user))->toBe($before);
})->with(['not offered' => 'rooms', 'a flow code of WP-12' => 'price', 'malformed' => 'Price More!', 'blank' => '']);

it('offers a set computed again once the remembered one expired', function (): void {
    $id = relaxRouteRadar();
    Cache::forget(RadarRelaxOptions::key(Radar::query()->sole()));

    $this->postJson("/api/v1/radars/{$id}/relax", ['code' => 'price_more'])->assertOk()->assertJsonPath('data.radar.filters.price_max', 900);

    expect($this->source->callsOf('flow'))->toHaveCount(2);
});

it('refuses the filters of another radar of the user with 409 radar_duplicate', function (): void {
    Radar::factory()->for($this->user)->filters(['price_max' => 900])->create();
    $id = relaxRouteRadar();
    $before = RadarApi::rowsOf($this->user);

    $this->postJson("/api/v1/radars/{$id}/relax", ['code' => 'price_more'])->assertStatus(409)->assertJsonPath('code', 'radar_duplicate');

    expect(RadarApi::rowsOf($this->user))->toBe($before);
});

it('answers 409 no_chat before the code is checked, changing nothing', function (): void {
    $id = relaxRouteRadar();
    config(['radar.require_chat' => true]);
    $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();
    $before = RadarApi::rowsOf($this->user);

    $this->postJson("/api/v1/radars/{$id}/relax", ['code' => 'not_offered'])->assertStatus(409)->assertJsonPath('code', 'no_chat');

    expect(RadarApi::rowsOf($this->user))->toBe($before);
});

it('keeps a paused radar paused', function (): void {
    $id = relaxRouteRadar();
    $this->patchJson("/api/v1/radars/{$id}", ['active' => false])->assertOk();

    $this->postJson("/api/v1/radars/{$id}/relax", ['code' => 'price_more'])->assertOk()
        ->assertJsonPath('data.radar.active', false)->assertJsonPath('data.starter', 0);
});

it('answers another user\'s radar exactly as an unknown id, before any source call, and leaves it as it was', function (): void {
    $radar = Radar::query()->findOrFail(relaxRouteRadar());
    $calls = count($this->source->calls);

    RadarApi::assertForeignLikeUnknown($this->user, $radar, 'POST', '/relax', ['code' => 'price_more']);

    expect($this->source->calls)->toHaveCount($calls);
});

it('refuses a relax with 403 radars_disabled while radars are switched off', function (): void {
    $id = relaxRouteRadar();
    config(['radar.creation_enabled' => false]);

    $this->postJson("/api/v1/radars/{$id}/relax", ['code' => 'price_more'])->assertForbidden()->assertJsonPath('code', 'radars_disabled');

    expect(Radar::query()->sole()->filters['price_max'])->toBe(700);
});
