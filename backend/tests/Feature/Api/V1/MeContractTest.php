<?php

use App\Enums\AccessReason;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

function actAsAppUser(array $abilities = ['app:read', 'app:write']): User
{
    $user = User::factory()->create();
    Sanctum::actingAs($user, $abilities);

    return $user;
}

it('answers the user part in the shape of the contract, from the stub', function (): void {
    actAsAppUser();

    $response = $this->getJson('/api/v1/me')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::ME, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('meta.source', 'stub')
        ->assertJsonPath('data.locale', 'ru')
        ->assertJsonPath('data.theme', 'auto')
        ->assertJsonPath('data.city', 'tashkent');
});

it('answers the first-launch, no-city and Uzbek scenarios', function (string $scenario, array $expected): void {
    actAsAppUser();

    $data = $this->getJson('/api/v1/me', ['X-Stub-Scenario' => $scenario])->assertOk()->json('data');

    expect($data)->toMatchArray($expected);
})->with([
    'first_launch' => ['first_launch', ['locale_chosen' => false, 'city' => null, 'city_chosen' => false]],
    'no_city' => ['no_city', ['city' => 'tashkent', 'city_chosen' => false, 'locale_chosen' => true]],
    'uz' => ['uz', ['locale' => 'uz', 'currency' => 'UZS']],
]);

it('refuses access with the reason of each access scenario', function (AccessReason $reason): void {
    actAsAppUser();

    $this->getJson('/api/v1/me', ['X-Stub-Scenario' => "access_{$reason->value}"])
        ->assertForbidden()
        ->assertExactJson(['success' => false, 'message' => 'Access denied.', 'code' => 'access_denied', 'reason' => $reason->value]);
})->with(AccessReason::cases());

it('needs a session and the app:read ability', function (): void {
    $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');

    actAsAppUser(['media:write']);
    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('code', 'forbidden');
});
