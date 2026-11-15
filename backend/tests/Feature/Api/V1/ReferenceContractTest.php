<?php

use Laravel\Pennant\Feature;
use Tests\Support\JsonShape;

/**
 * The contract of `GET /api/v1/reference` (WP-11): public, per locale, HOMI's configuration added for every driver.
 * A JSON number without a fraction decodes as an int, so rates and coordinates are `float|int`.
 */
const REFERENCE_SHAPE = [
    'success' => 'bool',
    'data' => [
        'bot' => ['username' => 'string', 'support_username' => 'string'],
        'limits' => ['radars' => 'int'],
        'radars_enabled' => 'bool',
        'rates' => ['usd_uzs' => 'float|int'],
        'map' => ['tiles_url' => 'null'],
        'features' => ['*' => 'string'],
        'locales' => ['*' => ['code' => 'string', 'name' => 'string']],
        'cities' => ['*' => [
            'code' => 'string', 'name' => 'string', 'center' => ['lat' => 'float|int', 'lon' => 'float|int'], 'zoom' => 'int',
            'is_region' => 'bool', 'has_metro' => 'bool', 'has_median' => 'bool',
            'districts' => ['*' => ['code' => 'string', 'name' => 'string']],
            'zones' => ['*' => ['code' => 'string', 'name' => 'string']],
        ]],
        'renovations' => [
            'rent_long' => ['*' => ['code' => 'string', 'name' => 'string']],
            'rent_daily' => ['*' => ['code' => 'string', 'name' => 'string']],
            'sale' => ['*' => ['code' => 'string', 'name' => 'string']],
        ],
        'appliances' => ['*' => ['code' => 'string', 'name' => 'string']],
        'price_presets' => ['rent_long' => ['*' => 'int'], 'rent_daily' => ['*' => 'int'], 'sale' => ['*' => 'int']],
    ],
    'meta' => ['source' => 'string'],
];

beforeEach(function (): void {
    config([
        'telegram.bot.username' => 'homi_stub_bot',
        'telegram.support.username' => 'homi_stub_support',
        'radar.max' => 10,
        'radar.creation_enabled' => true,
    ]);
});

it('answers without a token in the shape of the contract, from the stub', function (): void {
    $response = $this->getJson('/api/v1/reference', ['Accept-Language' => 'ru'])->assertOk();

    JsonShape::assertSame(REFERENCE_SHAPE, JsonShape::of($response->json()));
    $response->assertJsonPath('meta.source', 'stub')
        ->assertJsonPath('data.bot', ['username' => 'homi_stub_bot', 'support_username' => 'homi_stub_support'])
        ->assertJsonPath('data.limits.radars', 10)
        ->assertJsonPath('data.cities.0.code', 'tashkent')
        ->assertJsonPath('data.cities.0.name', 'Ташкент')
        ->assertHeader('Content-Language', 'ru');
    expect(array_column($response->json('data.cities'), 'code'))->toBe(['tashkent', 'tashkent_region', 'andijan']);
});

it('names everything in the language of the request', function (string $header, string $locale, string $tashkent): void {
    $this->getJson('/api/v1/reference', ['Accept-Language' => $header])
        ->assertOk()
        ->assertHeader('Content-Language', $locale)
        ->assertJsonPath('data.cities.0.name', $tashkent);
})->with([
    'Uzbek' => ['uz', 'uz', 'Toshkent'],
    'Uzbek with a script' => ['uz-Latn', 'uz', 'Toshkent'],
    'English' => ['en-GB', 'en', 'Tashkent'],
    'an unsupported language' => ['de', 'ru', 'Ташкент'],
]);

it('reports the radar switch of HOMI configuration and nothing else changes', function (): void {
    $on = $this->getJson('/api/v1/reference')->assertJsonPath('data.radars_enabled', true)->json();
    config(['radar.creation_enabled' => false]);
    $off = $this->getJson('/api/v1/reference')->assertJsonPath('data.radars_enabled', false)->json();

    unset($on['data']['radars_enabled'], $off['data']['radars_enabled']);
    expect($off)->toBe($on);
});

it('keeps only Tashkent in the single_city scenario', function (): void {
    $response = $this->getJson('/api/v1/reference', ['X-Stub-Scenario' => 'single_city', 'Accept-Language' => 'uz'])->assertOk();

    expect(array_column($response->json('data.cities'), 'code'))->toBe(['tashkent'])
        ->and($response->json('data.cities.0.name'))->toBe('Toshkent');
});

it('answers without a bot name in the no_bot scenario', function (): void {
    $this->getJson('/api/v1/reference', ['X-Stub-Scenario' => 'no_bot'])
        ->assertOk()
        ->assertJsonPath('data.bot', ['username' => null, 'support_username' => 'homi_stub_support']);
});

it('answers 503 source_unavailable when the flag names an unbound driver', function (): void {
    Feature::globally()->activate('source.reference', ['everyone' => 'legacy']);

    $this->getJson('/api/v1/reference')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});

it('may be cached per language', function (): void {
    $response = $this->getJson('/api/v1/reference')->assertOk();

    expect($response->headers->get('Vary'))->toContain('Accept-Language')
        ->and($response->headers->getCacheControlDirective('public'))->toBeTrue();
});
