<?php

use Laravel\Pennant\Feature;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/**
 * Every key at any depth of a decoded answer.
 *
 * @return list<string>
 */
function landingKeysOf(array $data): array
{
    $keys = [];

    foreach ($data as $key => $value) {
        $keys[] = (string) $key;
        $keys = is_array($value) ? [...$keys, ...landingKeysOf($value)] : $keys;
    }

    return $keys;
}

it('answers the live numbers without a token, cacheable', function (): void {
    $response = $this->getJson('/api/v1/landing/live')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::LANDING_LIVE, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('meta.source', 'stub');
    expect($response->headers->get('Cache-Control'))->toContain('public')->toContain('max-age=300')
        ->and($response->headers->get('Vary'))->toContain('Accept-Language');
});

it('answers the pins of rent by default and of sale on request', function (): void {
    $rent = $this->getJson('/api/v1/landing/pins')->assertOk();
    $sale = $this->getJson('/api/v1/landing/pins?deal=sale')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::LANDING_PINS, 'meta' => ['source' => 'string']], JsonShape::of($rent->json()));
    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::LANDING_PINS, 'meta' => ['source' => 'string']], JsonShape::of($sale->json()));
    expect($rent->json('data.bargains_week'))->toBeInt()
        ->and($rent->json('data.medians'))->not->toBeEmpty()
        ->and($sale->json('data.bargains_week'))->toBeNull()
        ->and($sale->json('data.medians'))->toBe([])
        ->and($rent->json('data.pins.0.photo_url'))->toStartWith(config('media.public_url').'/stub/')
        ->and($rent->json('data.pins.0.link'))->toContain('startapp=l_');
});

it('refuses an unknown deal', function (): void {
    $this->getJson('/api/v1/landing/pins?deal=x')->assertStatus(422)->assertJsonValidationErrors(['deal']);
});

it('names the districts in the request language', function (): void {
    $ru = $this->getJson('/api/v1/landing/pins', ['Accept-Language' => 'ru'])->json('data.pins.0.district');
    $uz = $this->getJson('/api/v1/landing/pins', ['Accept-Language' => 'uz'])->json('data.pins.0.district');

    expect($uz['code'])->toBe($ru['code'])->and($uz['name'])->not->toBe($ru['name']);
});

it('carries no personal data', function (string $path): void {
    expect(array_intersect(landingKeysOf($this->getJson("/api/v1/{$path}")->assertOk()->json()), ['phone', 'text', 'author']))->toBe([]);
})->with(['landing/live', 'landing/pins', 'landing/pins?deal=sale']);

it('answers 503 when the flag names an unbound driver', function (string $feature, string $path): void {
    Feature::globally()->activate($feature, ['everyone' => 'legacy']);

    $this->getJson("/api/v1/{$path}")->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
})->with([['source.landing.live', 'landing/live'], ['source.landing.pins', 'landing/pins']]);
