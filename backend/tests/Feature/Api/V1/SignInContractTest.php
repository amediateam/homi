<?php

use App\Enums\AccessReason;
use App\Models\User;
use App\Services\Sources\Stub\StubUser;
use Illuminate\Support\Facades\Date;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/** `POST /api/v1/auth/telegram` on stubs (WP-11): any valid body signs in the one stub user; nothing is verified. */
function signIn(array $headers = []): TestResponse
{
    return test()->postJson('/api/v1/auth/telegram', ['init_data' => 'query_id=AAHomiSyntheticQuery&user=%7B%7D&auth_date=1&hash=00'], $headers);
}

beforeEach(fn () => config(['sources.native_stubs' => true]));

it('issues a bearer token for the stub user in the shape of the contract', function (): void {
    Date::setTestNow('2026-11-15 09:30:00');

    $response = signIn()->assertOk();

    JsonShape::assertSame([
        'success' => 'bool',
        'data' => ['token' => 'string', 'token_type' => 'string', 'expires_at' => 'string', 'user' => ContractShapes::ME],
        'meta' => ['source' => 'string'],
    ], JsonShape::of($response->json()));
    $response->assertJsonPath('meta.source', 'stub')
        ->assertJsonPath('data.token_type', 'Bearer')
        ->assertJsonPath('data.expires_at', '2026-11-16T09:30:00+00:00')
        ->assertJsonPath('data.user.locale', 'ru');
    expect(PersonalAccessToken::findToken($response->json('data.token'))?->abilities)->toBe(['app:read', 'app:write']);
});

it('returns a token that authenticates GET /me', function (): void {
    $token = signIn()->json('data.token');

    $this->withToken($token)->getJson('/api/v1/me')->assertOk()->assertJsonPath('meta.source', 'stub');
});

it('creates one stub user and a new token per sign-in', function (): void {
    signIn()->assertOk();
    signIn()->assertOk();

    $user = User::query()->sole();
    expect($user->email)->toBe(StubUser::EMAIL)
        ->and($user->tokens()->count())->toBe(2);
});

it('gives the token no media rights', function (): void {
    $token = signIn()->json('data.token');

    $this->withToken($token)->postJson('/api/v1/media/presign', ['mime' => 'image/jpeg'])
        ->assertForbidden()
        ->assertJsonPath('code', 'forbidden');
});

it('refuses a body without a valid init_data', function (array $body): void {
    $this->postJson('/api/v1/auth/telegram', $body)
        ->assertUnprocessable()
        ->assertJsonPath('code', 'validation_failed')
        ->assertJsonValidationErrors('init_data');

    expect(User::query()->count())->toBe(0);
})->with([
    'missing' => [[]],
    'empty' => [['init_data' => '']],
    'not a string' => [['init_data' => ['a' => 'b']]],
    '4 097 bytes' => [['init_data' => str_repeat('a', 4097)]],
]);

it('accepts init_data of exactly 4 096 bytes', function (): void {
    $this->postJson('/api/v1/auth/telegram', ['init_data' => str_repeat('a', 4096)])->assertOk();
});

it('tells a stale launch apart from a bad one', function (string $scenario, string $code): void {
    signIn(['X-Stub-Scenario' => $scenario])->assertUnauthorized()->assertJsonPath('code', $code)->assertJsonMissingPath('reason');

    expect(PersonalAccessToken::query()->count())->toBe(0);
})->with([
    'auth_expired' => ['auth_expired', 'auth_expired'],
    'invalid_init_data' => ['invalid_init_data', 'invalid_init_data'],
]);

it('refuses access with the reason of each access scenario and issues no token', function (AccessReason $reason): void {
    signIn(['X-Stub-Scenario' => "access_{$reason->value}"])
        ->assertForbidden()
        ->assertJsonPath('code', 'access_denied')
        ->assertJsonPath('reason', $reason->value);

    expect(PersonalAccessToken::query()->count())->toBe(0);
})->with(AccessReason::cases());

it('answers the user of the me scenario', function (): void {
    signIn(['X-Stub-Scenario' => 'first_launch'])->assertOk()->assertJsonPath('data.user.locale_chosen', false);
});
