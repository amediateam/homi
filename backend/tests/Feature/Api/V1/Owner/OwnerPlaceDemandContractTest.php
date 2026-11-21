<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

it('the place of a point near Tashkent, and none elsewhere; both coordinates required', function (): void {
    $this->getJson('/api/v1/owner/place?lat=41.365&lon=69.284')->assertOk()->assertJsonPath('data', ['city' => 'tashkent', 'district_code' => 'yunusobod']);
    $this->getJson('/api/v1/owner/place?lat=40.0&lon=65.0')->assertOk()->assertJsonPath('data', ['city' => null, 'district_code' => null]);
    $this->getJson('/api/v1/owner/place?lat=41.365')->assertStatus(422)->assertJsonValidationErrors(['lon']);
});

it('the demand: a count from 5 on with the bounds, few for 1 … 4; city required', function (): void {
    $this->getJson('/api/v1/owner/demand?city=tashkent&rooms=2&price=600&currency=USD')->assertOk()
        ->assertJsonPath('data', ['count' => 7, 'few' => false, 'usual_low_usd' => 550, 'usual_high_usd' => 680]);
    $this->getJson('/api/v1/owner/demand?city=tashkent', ['X-Stub-Scenario' => 'demand_few'])->assertJsonPath('data.count', null)->assertJsonPath('data.few', true);
    $this->getJson('/api/v1/owner/demand?rooms=9')->assertStatus(422)->assertJsonValidationErrors(['city', 'rooms']);
});
