<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

/** @return array<string, mixed> */
function contactRequestBody(array $overrides = []): array
{
    return ['who' => 'couple', 'people' => 2, 'move_in' => 'с 1 декабря', 'message' => 'Можно посмотреть?', 'init_data' => 'query_id=AAH&user=%7B%7D&auth_date=1&hash=x', ...$overrides];
}

it('answers by number: a new request 201 pending, an existing one 200 with its status, the refusals', function (int $number, int $status, ?string $answer, ?string $code): void {
    $response = $this->postJson("/api/v1/listings/{$number}/contact-request", contactRequestBody())->assertStatus($status);

    $answer === null ? $response->assertJsonPath('code', $code) : $response->assertJsonPath('data', ['status' => $answer]);
})->with([
    [10000001, 201, 'pending', null],
    [10000005, 201, 'pending', null],
    [10000002, 200, 'pending', null],
    [10000003, 200, 'given', null],
    [10000004, 200, 'declined', null],
    [10000006, 409, null, 'request_closed'],
    [10000007, 409, null, 'contact_open'],
    [10000008, 409, null, 'own_listing'],
    [100024, 409, null, 'request_closed'],
    [100001, 409, null, 'request_closed'],
]);

it('an unknown number is 404; a bad body names its fields; init_data is never echoed', function (): void {
    $this->postJson('/api/v1/listings/999404/contact-request', contactRequestBody())->assertNotFound();
    $bad = $this->postJson('/api/v1/listings/10000001/contact-request', ['who' => 'crowd', 'people' => 30, 'message' => str_repeat('a', 501)])->assertStatus(422)
        ->assertJsonValidationErrors(['who', 'people', 'message', 'init_data']);
    expect(json_encode($this->postJson('/api/v1/listings/10000001/contact-request', contactRequestBody())->json()))->not->toContain('query_id');
    expect($bad->json())->toHaveKey('errors');
});

it('the scenarios: no_chat, the limits with Retry-After, blocked, closed, own, open, the relay', function (): void {
    $this->postJson('/api/v1/listings/10000001/contact-request', contactRequestBody(), ['X-Stub-Scenario' => 'no_chat'])->assertStatus(409)->assertJsonPath('code', 'no_chat');
    foreach (['request_limit_fast' => ['requests_fast', '600'], 'request_limit_day' => ['requests_day', '3600'], 'request_limit_week' => ['requests_week', '86400']] as $scenario => [$reason, $retry]) {
        $this->postJson('/api/v1/listings/10000001/contact-request', contactRequestBody(), ['X-Stub-Scenario' => $scenario])->assertStatus(429)
            ->assertJsonPath('code', 'rate_limited')->assertJsonPath('reason', $reason)->assertHeader('Retry-After', $retry);
    }
    $this->postJson('/api/v1/listings/10000001/contact-request', contactRequestBody(), ['X-Stub-Scenario' => 'requests_blocked'])->assertForbidden()->assertJsonPath('code', 'requests_blocked');
    $this->postJson('/api/v1/listings/100024/contact-request', contactRequestBody(), ['X-Stub-Scenario' => 'relay_on'])->assertCreated()->assertJsonPath('data.status', 'pending');
    $this->getJson('/api/v1/listings/100024', ['X-Stub-Scenario' => 'relay_on'])->assertJsonPath('data.contact.mode', 'request');
    $this->getJson('/api/v1/listings/100024')->assertJsonPath('data.contact.mode', 'hidden')->assertJsonPath('data.owner.tier', 'self');
});

it('native cards: origin, owner and the request state; their contact only when given or in phone mode; no translation', function (): void {
    $this->getJson('/api/v1/listings/10000002')->assertOk()->assertJsonPath('data.origin', 'native')->assertJsonPath('data.contact.request.status', 'pending')
        ->assertJsonPath('data.author', ['kind' => 'phone', 'label' => 'Хозяин', 'count' => 1])->assertJsonPath('data.owner.tier', 'self');
    $this->getJson('/api/v1/listings/10000008')->assertJsonPath('data.owner.mine', true)->assertJsonPath('data.owner.listing_id', '01JF0000000000000000000003');
    $this->getJson('/api/v1/listings/10000001')->assertJsonPath('data.owner.description', fn (string $text): bool => ! preg_match('/\d{2} \d{3} \d{2} \d{2}/', $text));
    $this->postJson('/api/v1/listings/10000003/contact')->assertOk();
    $this->postJson('/api/v1/listings/10000007/contact')->assertOk();
    $this->postJson('/api/v1/listings/10000001/contact')->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    $this->postJson('/api/v1/listings/100024/contact')->assertNotFound();
    $this->postJson('/api/v1/listings/10000001/translation', ['locale' => 'uz'])->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->getJson('/api/v1/listings/100025')->assertJsonPath('data.owner.tier', 'claimed');
});

it('owner.entry follows DEC-94: an owner listing, not the caller own, only with the cabinet on', function (): void {
    $this->getJson('/api/v1/listings/10000001')->assertJsonPath('data.owner.entry', true);
    $this->getJson('/api/v1/listings/10000008')->assertJsonPath('data.owner.entry', false);
    config(['owner.enabled' => false]);
    $this->getJson('/api/v1/listings/10000001')->assertJsonPath('data.owner.entry', false);
});
