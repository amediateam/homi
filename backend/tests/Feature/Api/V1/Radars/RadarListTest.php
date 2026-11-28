<?php

use App\Models\Radar;
use App\Models\User;
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
