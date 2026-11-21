<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
    config(['owner.enabled' => false]);
});

it('with the switch off the writes that change content or create or resume a listing answer 403 owner_disabled before validation', function (): void {
    $id = '01JF0000000000000000000004';
    $refused = [
        fn () => $this->postJson('/api/v1/owner/listings'),
        fn () => $this->patchJson("/api/v1/owner/listings/{$id}", ['rooms' => 99]),
        fn () => $this->postJson("/api/v1/owner/listings/{$id}/photos"),
        fn () => $this->deleteJson("/api/v1/owner/listings/{$id}/photos/01JF0000000000000000000041"),
        fn () => $this->putJson("/api/v1/owner/listings/{$id}/photos/order", ['ids' => []]),
        fn () => $this->putJson("/api/v1/owner/listings/{$id}/contact-mode", ['mode' => 'bad']),
        fn () => $this->postJson("/api/v1/owner/listings/{$id}/phone-request"),
        fn () => $this->postJson("/api/v1/owner/listings/{$id}/publish"),
        fn () => $this->putJson('/api/v1/owner/listings/01JF0000000000000000000005/status', ['status' => 'active']),
    ];

    foreach ($refused as $call) {
        $call()->assertForbidden()->assertJsonPath('code', 'owner_disabled');
    }
});

it('with the switch off the reads, the ways down, the answers and the waitlist stay open; the reference says so', function (): void {
    $this->getJson('/api/v1/owner/listings')->assertOk();
    $this->getJson('/api/v1/owner/listings/01JF0000000000000000000003')->assertOk();
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000003/status', ['status' => 'paused'])->assertOk();
    $this->deleteJson('/api/v1/owner/listings/01JF0000000000000000000001')->assertNoContent();
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000201/answer', ['action' => 'give'])->assertOk();
    $this->putJson('/api/v1/owner/waitlist')->assertNoContent();
    $this->getJson('/api/v1/owner/place?lat=41.3&lon=69.2')->assertOk();
    $this->getJson('/api/v1/reference')->assertOk()->assertJsonPath('data.owner_enabled', false);
});

it('with the switch on the reference says owner_enabled, the limits and the cabinet renovations by locale', function (): void {
    config(['owner.enabled' => true]);

    $this->getJson('/api/v1/reference', ['Accept-Language' => 'ru'])->assertOk()->assertJsonPath('data.owner_enabled', true)
        ->assertJsonPath('data.limits.owner_listings', 2)->assertJsonPath('data.limits.owner_photos', 10)
        ->assertJsonPath('data.limits.requests', ['day' => 10, 'week' => 30, 'pause_minutes' => 10])
        ->assertJsonPath('data.renovations.owner.0', ['code' => 'euro', 'name' => 'Евроремонт']);
    $this->getJson('/api/v1/reference', ['Accept-Language' => 'en'])->assertJsonPath('data.renovations.owner.0.name', 'Euro-style renovation');
});

it('without a token the owner methods answer 401', function (): void {
    $this->app['auth']->forgetGuards();

    $this->withHeaders(['Authorization' => ''])->getJson('/api/v1/owner/listings')->assertUnauthorized();
});
