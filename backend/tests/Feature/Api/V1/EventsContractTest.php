<?php

use App\Http\Requests\Api\V1\StoreEventRequest;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

/** `POST /api/v1/events` on stubs (WP-11): validates and answers 204; nothing is stored until WP-47. */
function actAsEventUser(array $abilities = ['app:read', 'app:write']): void
{
    Sanctum::actingAs(User::factory()->create(), $abilities);
}

it('accepts every name of the catalogue with 204 and no body', function (string $name): void {
    actAsEventUser();

    $response = $this->postJson('/api/v1/events', ['name' => $name, 'props' => ['listing_id' => 71234, 'src' => 'button']]);

    $response->assertNoContent();
    expect($response->getContent())->toBe('');
})->with(StoreEventRequest::CATALOGUE);

it('knows the 21 names of the legacy vocabulary', function (): void {
    expect(StoreEventRequest::CATALOGUE)->toHaveCount(21)
        ->toContain('app_launch', 'return_prompt_shown', 'feed_radar_closed', 'contact_call');
});

it('accepts an unknown name or unknown properties with 204', function (array $body): void {
    actAsEventUser();

    $this->postJson('/api/v1/events', $body)->assertNoContent();
})->with([
    'an unknown name' => [['name' => 'something_new']],
    'a name outside the pattern' => [['name' => 'Not-A-Name']],
    'unknown properties' => [['name' => 'app_launch', 'props' => ['whatever' => [1, 2, 3]]]],
]);

it('refuses a body over 8 KB with 413 before validating it', function (): void {
    actAsEventUser();

    $this->postJson('/api/v1/events', ['name' => 'app_error', 'props' => ['error' => ['message' => str_repeat('x', 9 * 1024)]]])
        ->assertStatus(413)
        ->assertJsonPath('code', 'payload_too_large');
});

it('accepts a body just under the cap', function (): void {
    actAsEventUser();

    $this->postJson('/api/v1/events', ['name' => 'app_error', 'props' => ['error' => ['message' => str_repeat('x', 8000)]]])
        ->assertNoContent();
});

it('refuses only a missing or non-string name, or props that are not an object, with 422', function (array $body, string $field): void {
    actAsEventUser();

    $this->postJson('/api/v1/events', $body)
        ->assertUnprocessable()
        ->assertJsonPath('code', 'validation_failed')
        ->assertJsonValidationErrors($field);
})->with([
    'a missing name' => [['props' => []], 'name'],
    'a name that is not a string' => [['name' => 7], 'name'],
    'props that are not an object' => [['name' => 'app_launch', 'props' => 'listing_id=7'], 'props'],
]);

it('never takes an event without a session, and needs app:write', function (): void {
    $this->postJson('/api/v1/events', ['name' => 'app_launch'])->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');

    actAsEventUser(['app:read']);
    $this->postJson('/api/v1/events', ['name' => 'app_launch'])->assertForbidden()->assertJsonPath('code', 'forbidden');
});

it('refuses access in an access scenario', function (): void {
    actAsEventUser();

    $this->postJson('/api/v1/events', ['name' => 'app_launch'], ['X-Stub-Scenario' => 'access_blocked'])
        ->assertForbidden()
        ->assertJsonPath('reason', 'blocked');
});
