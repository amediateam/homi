<?php

use App\Exceptions\Sources\SourceUnavailable;
use App\Models\HiddenListing;
use App\Models\Radar;
use App\Models\User;
use App\Services\Sources\Data\FlowEstimate;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\Support\ContractShapes;
use Tests\Support\FakeListingSource;
use Tests\Support\FilterArrays;
use Tests\Support\JsonShape;
use Tests\Support\RadarApi;

/*
 * WP-45, step 9: `GET /radars` lists the caller's radars from HOMI's table, in creation order, with the 25-key filters
 * and `hidden` = `hidden_count` (`meta.source = native`). While radars are switched off (DEC-51) it answers `[]` without
 * a query to a radar table and without a source call, even for a user who has radars.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->user = User::factory()->create();
    RadarApi::actAs($this->user);
});

it('lists the caller\'s radars in creation order, without previews unless asked', function (): void {
    $older = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'posted_days' => 7])->paused()->create(['created_at' => now()->subDays(3), 'hidden_count' => 4]);
    $newer = Radar::factory()->for($this->user)->create(['created_at' => now()->subDay(), 'mode' => 'digest']);
    Radar::factory()->for(User::factory())->create(['created_at' => now()->subDays(2)]);

    $response = $this->getJson('/api/v1/radars')->assertOk()->assertJsonPath('meta.source', 'native');

    JsonShape::assertSame(['success' => 'bool', 'data' => ['*' => ContractShapes::RADAR], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    expect(array_column($response->json('data'), 'id'))->toBe([$older->id, $newer->id])
        ->and($response->json('data.0'))->toBe([
            'id' => $older->id,
            'active' => false,
            'mode' => 'instant',
            'hidden' => 4,
            'created_at' => $older->created_at->toIso8601String(),
            'filters' => FilterArrays::defaults(['price_max' => 700, 'posted_days' => 7]),
        ])
        ->and($response->json('data.1.mode'))->toBe('digest');
});

it('answers an empty list for a user without radars', function (): void {
    Radar::factory()->for(User::factory())->create();

    $this->getJson('/api/v1/radars')->assertOk()->assertExactJson(['success' => true, 'data' => [], 'meta' => ['source' => 'native']]);
});

it('reads the list in one radar query, whatever its length, and asks no source without include', function (): void {
    $source = FakeListingSource::bind();
    $this->getJson('/api/v1/radars')->assertOk();
    Radar::factory()->for($this->user)->create();
    [, $one] = RadarApi::counted(fn (): TestResponse => $this->getJson('/api/v1/radars')->assertOk());
    Radar::factory()->for($this->user)->count(9)->create();
    [$response, $ten] = RadarApi::counted(fn (): TestResponse => $this->getJson('/api/v1/radars')->assertOk());

    expect($response->json('data'))->toHaveCount(10)
        ->and(count($ten))->toBe(count($one))
        ->and(RadarApi::radarStatements($ten))->toHaveCount(1)
        ->and($source->calls)->toBe([]);
});

it('answers [] while radars are switched off, without a radar query or a source call, with or without previews', function (string $uri): void {
    config(['radar.creation_enabled' => false]);
    Radar::factory()->for($this->user)->count(2)->create();
    $source = FakeListingSource::bind();

    [$response, $statements] = RadarApi::counted(fn (): TestResponse => $this->getJson($uri));

    $response->assertOk()->assertExactJson(['success' => true, 'data' => [], 'meta' => ['source' => 'native']]);
    expect(RadarApi::radarStatements($statements))->toBe([])
        ->and($source->calls)->toBe([]);
})->with(['/api/v1/radars', '/api/v1/radars?include=previews']);

it('refuses an include other than previews', function (): void {
    $this->getJson('/api/v1/radars?include=everything')->assertUnprocessable()->assertJsonValidationErrors(['include']);
});

it('adds each radar\'s preview with include=previews: five items, the count and the flow, in the contract shape', function (): void {
    $source = FakeListingSource::bind()->withItems([100001 => [], 100002 => [], 100003 => [], 100004 => [], 100005 => [], 100006 => []]);
    $source->count = 42;
    $source->flow = new FlowEstimate(9, 7, []);
    $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100001]);

    $response = $this->getJson('/api/v1/radars?include=previews')->assertOk()->assertJsonPath('meta.source', 'native');

    JsonShape::assertSame(['success' => 'bool', 'data' => ['*' => [...ContractShapes::RADAR, 'preview' => ContractShapes::RADAR_PREVIEW]], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    expect($response->json('data.0.id'))->toBe($radar->id)
        ->and(array_column($response->json('data.0.preview.items'), 'number'))->toBe([100002, 100003, 100004, 100005, 100006])
        ->and($response->json('data.0.preview.count'))->toBe(42)
        ->and($response->json('data.0.preview.flow'))->toBe(['week' => 9, 'days' => 7]);
});

it('answers the list with preview null when the source fails, and never fails the list', function (): void {
    $source = FakeListingSource::bind()->withItems([100001 => []]);
    $source->count = 1;
    $source->flow = new FlowEstimate(1, 7, []);
    $source->failure = new SourceUnavailable;
    Radar::factory()->for($this->user)->count(2)->sequence(['created_at' => now()->subMinute()], ['created_at' => now()])->create();

    $response = $this->getJson('/api/v1/radars?include=previews')->assertOk();

    expect(array_column($response->json('data'), 'preview'))->toBe([null, null])
        ->and(count($source->callsOf('feed')))->toBe(1);
});
