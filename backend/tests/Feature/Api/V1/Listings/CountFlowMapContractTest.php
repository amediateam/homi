<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\FilterArrays;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
});

it('counts what paging reaches, for the same filters', function (string $query): void {
    $count = $this->getJson("/api/v1/listings/count?{$query}")->assertOk();
    $reached = 0;
    $cursor = null;

    do {
        $page = $this->getJson("/api/v1/listings?{$query}&limit=50".($cursor === null ? '' : "&cursor={$cursor}"))->json();
        $reached += count($page['data']);
        $cursor = $page['meta']['next_cursor'];
    } while ($cursor !== null);

    JsonShape::assertSame(ContractShapes::LISTING_COUNT, JsonShape::of($count->json()));
    expect($count->json('data.count'))->toBe($reached);
})->with(['city=tashkent&deal=rent_long', 'city=tashkent&deal=sale&types[]=apartment&types[]=house', 'city=andijan&deal=rent_long']);

it('estimates the flow, with suggestions only for a narrow search', function (): void {
    $wide = $this->getJson('/api/v1/listings/flow?city=tashkent&deal=rent_long')->assertOk();
    $narrow = $this->getJson('/api/v1/listings/flow?city=tashkent&deal=sale')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::FLOW, 'meta' => ['source' => 'string']], JsonShape::of($narrow->json()));
    expect($wide->json('data'))->toBe(['week' => 45, 'days' => 7, 'options' => []])
        ->and($narrow->json('data.options'))->not->toBeEmpty()
        ->and(array_keys($narrow->json('data.options.0.filters')))->toBe(FilterArrays::KEYS);
});

it('puts every pin of the filters on the map, all of them listings of the feed', function (): void {
    $map = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_daily&types[]=apartment&types[]=room')->assertOk();
    $feed = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_daily&types[]=apartment&types[]=room&limit=50')->json('data');

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::MAP, 'meta' => ['source' => 'string']], JsonShape::of($map->json()));
    expect(array_diff(array_column($map->json('data.points'), 'number'), array_column($feed, 'number')))->toBe([])
        ->and($map->json('data.total'))->toBe(count($feed))
        ->and(count($map->json('data.points')))->toBeLessThan($map->json('data.total'));
});

it('counts the listings with coordinates in with_point, which an uncut answer reaches', function (): void {
    $map = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_daily&types[]=apartment&types[]=room')->assertOk()->json('data');

    expect($map['with_point'])->toBe(1)
        ->and($map['points'])->toHaveCount(1)
        ->and($map['total'])->toBe(2);
});

it('answers fewer points than with_point in the map_cut scenario, with the same counts', function (): void {
    $whole = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long')->assertOk()->json('data');
    $cut = $this->getJson('/api/v1/listings/map?city=tashkent&deal=rent_long', ['X-Stub-Scenario' => 'map_cut'])->assertOk()->json('data');

    expect($cut['with_point'])->toBe($whole['with_point'])
        ->and($cut['total'])->toBe($whole['total'])
        ->and($cut['points'])->not->toBeEmpty()
        ->and(count($cut['points']))->toBeLessThan($cut['with_point'])
        ->and(array_diff(array_column($cut['points'], 'number'), array_column($whole['points'], 'number')))->toBe([]);
});

it('answers 503 in the source_unavailable scenario', function (string $path): void {
    $this->getJson("/api/v1/listings/{$path}?city=tashkent&deal=rent_long", ['X-Stub-Scenario' => 'source_unavailable'])
        ->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
})->with(['count', 'flow', 'map']);

it('refuses an invalid filter as the feed does', function (string $path): void {
    $this->getJson("/api/v1/listings/{$path}?city=tashkent&deal=rent_long&rooms_min=-1")->assertStatus(422)->assertJsonValidationErrors(['rooms_min']);
})->with(['count', 'flow', 'map']);
