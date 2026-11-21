<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

/** The active listing of `owner/list.json` (number 10000008). */
const OWNER_ACTIVE = '01JF0000000000000000000003';

it('lists every listing of the caller with max, can_add and past; items leave the true point and the number out', function (): void {
    $response = $this->getJson('/api/v1/owner/listings')->assertOk();
    $item = ContractShapes::OWNER_LISTING;
    unset($item['phone_display']);
    $item['form'] = array_diff_key(ContractShapes::OWNER_FORM, ['lat' => 1, 'lon' => 1]);

    JsonShape::assertSame(['success' => 'bool', 'data' => ['items' => ['*' => $item], 'max' => 'int', 'can_add' => 'bool', 'past' => 'int'], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    expect($response->json('data.items'))->toHaveCount(9)
        ->and(array_column($response->json('data.items'), 'status'))->toContain('draft', 'active', 'paused', 'rented', 'rejected')
        ->and($response->json('data.items.0'))->not->toHaveKey('phone_display')
        ->and($response->json('data.items.0.form'))->not->toHaveKey('lat');
    $response->assertJsonPath('data.max', 2)->assertJsonPath('data.can_add', false)->assertJsonPath('data.past', 3)->assertJsonPath('meta.source', 'stub');
});

it('answers the empty and the returning list', function (): void {
    $this->getJson('/api/v1/owner/listings', ['X-Stub-Scenario' => 'owner_empty'])->assertOk()->assertJsonPath('data.items', [])->assertJsonPath('data.can_add', true)->assertJsonPath('data.past', 0);
    $this->getJson('/api/v1/owner/listings', ['X-Stub-Scenario' => 'owner_returning'])->assertOk()->assertJsonPath('data.past', 3);
});

it('creates: the untouched draft (200) whatever the limit, a new draft (201) with no list, owner_limit in its scenario', function (): void {
    $this->postJson('/api/v1/owner/listings')->assertOk()->assertJsonPath('data.id', '01JF0000000000000000000001')->assertJsonPath('data.status', 'draft');
    $new = $this->postJson('/api/v1/owner/listings', [], ['X-Stub-Scenario' => 'owner_empty'])->assertCreated();
    $new->assertJsonPath('data.contact_mode', 'request')->assertJsonPath('data.form.currency', 'USD')->assertJsonPath('data.number', null);
    $this->postJson('/api/v1/owner/listings', [], ['X-Stub-Scenario' => 'owner_limit'])->assertStatus(409)
        ->assertJsonPath('code', 'owner_limit')->assertJsonPath('limit', 'account')->assertJsonPath('max', 2);
});

it('shows the owner listing object with the true point and the owner number; a foreign or unknown id is 404', function (): void {
    $response = $this->getJson('/api/v1/owner/listings/'.OWNER_ACTIVE)->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::OWNER_LISTING, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.number', 10000008)->assertJsonPath('data.form.lat', 41.36512)->assertJsonPath('data.phone_display', '+998 00 000-00-81');
    $this->getJson('/api/v1/owner/listings/01JF0000000000000000000099')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->getJson('/api/v1/owner/listings/not-a-ulid')->assertNotFound();
});

it('updates only the sent keys, null clears, a point brings a shown point; bad keys are named', function (): void {
    $response = $this->patchJson('/api/v1/owner/listings/01JF0000000000000000000002', ['rooms' => 3, 'landmark' => null, 'lat' => 41.311119, 'lon' => 69.279733])->assertOk();

    $response->assertJsonPath('data.form.rooms', 3)->assertJsonPath('data.form.price', 450)->assertJsonPath('data.form.lat', 41.31112)
        ->assertJsonPath('data.shown_point.radius_m', 500);
    $this->patchJson('/api/v1/owner/listings/01JF0000000000000000000002', ['floor' => 10, 'floors_total' => 9, 'rooms' => 9, 'lat' => 41.3])
        ->assertStatus(422)->assertJsonValidationErrors(['floor', 'rooms', 'lon']);
    $this->patchJson('/api/v1/owner/listings/01JF0000000000000000000002', ['tenants' => ['pets']])->assertStatus(422)->assertJsonValidationErrors(['tenants.0']);
    $this->patchJson('/api/v1/owner/listings/01JF0000000000000000000006', ['rooms' => 2])->assertStatus(409)->assertJsonPath('code', 'owner_listing_locked');
});

it('deletes a draft or a rejected listing; anything else is locked', function (): void {
    $this->deleteJson('/api/v1/owner/listings/01JF0000000000000000000001')->assertNoContent();
    $this->deleteJson('/api/v1/owner/listings/01JF0000000000000000000009')->assertNoContent();
    $this->deleteJson('/api/v1/owner/listings/'.OWNER_ACTIVE)->assertStatus(409)->assertJsonPath('code', 'owner_listing_locked');
});

it('changes the status: active ↔ paused, to rented or removed; a held listing does not resume; an unoffered status is 422', function (): void {
    $this->putJson('/api/v1/owner/listings/'.OWNER_ACTIVE.'/status', ['status' => 'paused'])->assertOk()->assertJsonPath('data.status', 'paused');
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000005/status', ['status' => 'active'])->assertOk()->assertJsonPath('data.status', 'active');
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000006/status', ['status' => 'active'])->assertStatus(409)->assertJsonPath('code', 'owner_listing_locked');
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000008/status', ['status' => 'paused'])->assertStatus(409);
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000001/status', ['status' => 'paused'])->assertStatus(422)->assertJsonValidationErrors(['status']);
    $this->putJson('/api/v1/owner/listings/'.OWNER_ACTIVE.'/status', ['status' => 'draft'])->assertStatus(422)->assertJsonValidationErrors(['status']);
});

it('needs app:read to read and app:write to write', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);

    $this->getJson('/api/v1/owner/listings')->assertOk();
    $this->postJson('/api/v1/owner/listings')->assertForbidden();
});
