<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
});

it('counts the new listings of the default filters by the stub rule', function (): void {
    $response = $this->getJson('/api/v1/listings/new?city=tashkent&deal=rent_long&since='.(time() - 86400))->assertOk();

    JsonShape::assertSame(ContractShapes::LISTING_COUNT, JsonShape::of($response->json()));
    expect($response->json('data.count'))->toBe(intdiv(45, 4))->toBeGreaterThanOrEqual(1);
});

it('answers 0 for a since in the future without asking the source', function (): void {
    $response = $this->getJson('/api/v1/listings/new?city=tashkent&deal=rent_long&since='.(time() + 3600), ['X-Stub-Scenario' => 'source_unavailable'])->assertOk();

    JsonShape::assertSame(ContractShapes::LISTING_COUNT, JsonShape::of($response->json()));
    expect($response->json('data.count'))->toBe(0);
});

it('accepts since 0', function (): void {
    $this->getJson('/api/v1/listings/new?city=tashkent&deal=rent_long&since=0')->assertOk()->assertJsonPath('data.count', 11);
});

it('refuses a missing or malformed since with 422', function (string $since): void {
    $this->getJson("/api/v1/listings/new?city=tashkent&deal=rent_long{$since}")->assertStatus(422)->assertJsonValidationErrors(['since']);
})->with(['', '&since=', '&since=abc', '&since=-1', '&since=1.5', '&since=4294967296']);

it('answers the new_none and new_one scenarios', function (string $scenario, int $count): void {
    $response = $this->getJson('/api/v1/listings/new?city=tashkent&deal=rent_long&since=0', ['X-Stub-Scenario' => $scenario])->assertOk();

    JsonShape::assertSame(ContractShapes::LISTING_COUNT, JsonShape::of($response->json()));
    expect($response->json('data.count'))->toBe($count);
})->with([['new_none', 0], ['new_one', 1]]);

it('answers 503 in the source_unavailable scenario and 422 for an invalid filter', function (): void {
    $this->getJson('/api/v1/listings/new?city=tashkent&deal=rent_long&since=0', ['X-Stub-Scenario' => 'source_unavailable'])
        ->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
    $this->getJson('/api/v1/listings/new?city=tashkent&deal=x&since=0')->assertStatus(422)->assertJsonValidationErrors(['deal']);
});
