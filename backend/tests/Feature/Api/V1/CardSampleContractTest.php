<?php

use App\Enums\AccessReason;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\JsonShape;

/** `POST /api/v1/settings/card-sample` on stubs (intake of legacy `index-BnFvC-Ft.js`, API-036): nothing is sent. */
function actAsCardSampleUser(array $abilities = ['app:read', 'app:write']): void
{
    Sanctum::actingAs(User::factory()->create(), $abilities);
}

it('answers that the sample was sent, as JSON with a boolean (fix of LB-APP-052)', function (): void {
    actAsCardSampleUser();

    $response = $this->postJson('/api/v1/settings/card-sample')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['sent' => 'bool'], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.sent', true)->assertJsonPath('meta.source', 'stub');
});

it('answers sent: false for the scenario card_sample_unsent', function (): void {
    actAsCardSampleUser();

    $this->postJson('/api/v1/settings/card-sample', [], ['X-Stub-Scenario' => 'card_sample_unsent'])
        ->assertOk()
        ->assertJsonPath('data.sent', false);
});

it('ignores a body', function (): void {
    actAsCardSampleUser();

    $this->postJson('/api/v1/settings/card-sample', ['card_style' => 'rich'])->assertOk()->assertJsonPath('data.sent', true);
});

it('needs app:write', function (): void {
    actAsCardSampleUser(['app:read']);

    $this->postJson('/api/v1/settings/card-sample')->assertForbidden()->assertJsonPath('code', 'forbidden');
});

it('answers the reserved and the access scenarios', function (): void {
    actAsCardSampleUser();

    $this->postJson('/api/v1/settings/card-sample', [], ['X-Stub-Scenario' => 'source_unavailable'])
        ->assertServiceUnavailable()
        ->assertJsonPath('code', 'source_unavailable');
    $this->postJson('/api/v1/settings/card-sample', [], ['X-Stub-Scenario' => 'access_blocked'])
        ->assertForbidden()
        ->assertJsonPath('reason', AccessReason::Blocked->value);
});

it('refuses a request without a session', function (): void {
    $this->postJson('/api/v1/settings/card-sample')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
});
