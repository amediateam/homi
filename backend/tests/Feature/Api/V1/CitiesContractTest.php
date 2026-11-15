<?php

use Laravel\Pennant\Feature;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

it('answers without a token, one entry per city of the reference data', function (): void {
    $response = $this->getJson('/api/v1/cities')->assertOk();

    JsonShape::assertSame(ContractShapes::CITIES, JsonShape::of($response->json()));
    $response->assertJsonPath('meta.source', 'stub');
    $references = $this->getJson('/api/v1/reference')->json('data.cities');
    expect(array_column($response->json('data'), 'code'))->toBe(array_column($references, 'code'));
});

it('always has the three counts and may lack a deal in presets and typical prices', function (): void {
    $region = collect($this->getJson('/api/v1/cities')->json('data'))->firstWhere('code', 'tashkent_region');

    expect(array_keys($region['counts']))->toBe(['rent_long', 'rent_daily', 'sale'])
        ->and(array_keys($region['price_presets']))->toBe(['rent_long'])
        ->and(array_keys($region['typical_price']))->toBe(['rent_long']);
});

it('has no daily rent anywhere in the no_daily scenario', function (): void {
    $cities = $this->getJson('/api/v1/cities', ['X-Stub-Scenario' => 'no_daily'])->assertOk()->json('data');

    expect(array_unique(array_column(array_column($cities, 'counts'), 'rent_daily')))->toBe([0]);
});

it('answers 503 source_unavailable when the flag names an unbound driver', function (): void {
    Feature::globally()->activate('source.cities', ['everyone' => 'native']);

    $this->getJson('/api/v1/cities')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});
