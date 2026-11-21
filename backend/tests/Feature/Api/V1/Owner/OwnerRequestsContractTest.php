<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

it('lists the requests of a listing as a cursor list, newest first, every flag present', function (): void {
    $response = $this->getJson('/api/v1/owner/listings/01JF0000000000000000000003/requests?limit=3')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['*' => ContractShapes::OWNER_REQUEST], 'meta' => ['source' => 'string', 'next_cursor' => 'string']], JsonShape::of($response->json()));
    expect($response->json('data'))->toHaveCount(3)->and($response->json('meta.next_cursor'))->toBeString();
    $this->getJson('/api/v1/owner/listings/01JF0000000000000000000003/requests?cursor=nonsense')->assertOk()->assertJsonPath('data', []);
    $this->getJson('/api/v1/owner/listings/01JF0000000000000000000099/requests')->assertNotFound();
});

it('answers: give, decline, a reason, undo, late; an answer the flags do not allow is 409', function (): void {
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000201/answer', ['action' => 'give'])->assertOk()->assertJsonPath('data.status', 'given')->assertJsonPath('data.can_late', true);
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000201/answer', ['action' => 'decline'])->assertOk()->assertJsonPath('data.status', 'declined')->assertJsonPath('data.can_undo', true);
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000203/answer', ['action' => 'undo'])->assertOk()->assertJsonPath('data.status', 'pending');
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000203/answer', ['action' => 'reason_agent'])->assertOk()->assertJsonPath('data.status', 'agent')->assertJsonPath('data.agent_marked', true);
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000204/answer', ['action' => 'late'])->assertOk()->assertJsonPath('data.status', 'agent');
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000206/answer', ['action' => 'give'])->assertStatus(409)->assertJsonPath('code', 'request_answer_closed');
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000201/answer', ['action' => 'give'], ['X-Stub-Scenario' => 'request_answer_closed'])->assertStatus(409);
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000201/answer', ['action' => 'maybe'])->assertStatus(422)->assertJsonValidationErrors(['action']);
});

it('the waitlist answers 204, also on a repeat; GET /me says waitlisted in its scenario', function (): void {
    $this->putJson('/api/v1/owner/waitlist')->assertNoContent();
    $this->putJson('/api/v1/owner/waitlist')->assertNoContent();
    $this->getJson('/api/v1/me', ['X-Stub-Scenario' => 'owner_waitlisted'])->assertOk()->assertJsonPath('data.owner.waitlisted', true);
    $this->getJson('/api/v1/me', ['X-Stub-Scenario' => 'owner_empty'])->assertJsonPath('data.owner', ['pending' => 0, 'has_listings' => false, 'waitlisted' => false]);
});

it('every profile waits for no request, so the owner signals stay quiet; owner_pending has the two of the list (WP-82)', function (string $scenario): void {
    $this->getJson('/api/v1/me', ['X-Stub-Scenario' => $scenario])->assertOk()->assertJsonPath('data.owner.pending', 0);
})->with(['default', 'no_city', 'uz', 'owner_waitlisted', 'replay']);

it('owner_pending: two requests wait, as on the stub list\'s listing 01JF…03', function (): void {
    $this->getJson('/api/v1/me', ['X-Stub-Scenario' => 'owner_pending'])->assertOk()->assertJsonPath('data.owner', ['pending' => 2, 'has_listings' => true, 'waitlisted' => false]);
    $this->getJson('/api/v1/owner/listings')->assertOk()->assertJsonPath('data.items.3.id', '01JF0000000000000000000003')->assertJsonPath('data.items.3.stats.pending', 2);
});
