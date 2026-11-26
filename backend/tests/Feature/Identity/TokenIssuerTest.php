<?php

use App\Models\User;
use App\Services\Identity\TokenIssuer;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Date;
use Laravel\Sanctum\PersonalAccessToken;

function issueMiniAppToken(User $user): string
{
    return app(TokenIssuer::class)->issue($user)->plainTextToken;
}

it('issues a miniapp token with the app abilities only that expires after a day', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    $user = User::factory()->telegram()->create();

    $token = app(TokenIssuer::class)->issue($user);

    expect($token->accessToken->name)->toBe('miniapp')
        ->and($token->accessToken->abilities)->toBe(['app:read', 'app:write'])
        ->and($token->accessToken->expires_at?->toIso8601String())->toBe('2026-11-27T09:00:00+00:00')
        ->and($token->accessToken->tokenable?->is($user))->toBeTrue()
        ->and(PersonalAccessToken::findToken($token->plainTextToken)?->is($token->accessToken))->toBeTrue();
});

it('takes the lifetime from the configuration', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    config(['access.token_ttl_minutes' => 30]);

    $token = app(TokenIssuer::class)->issue(User::factory()->telegram()->create());

    expect($token->accessToken->expires_at?->toIso8601String())->toBe('2026-11-26T09:30:00+00:00');
});

it('writes the configured prefix into the token', function (): void {
    config(['sanctum.token_prefix' => 'homi_']);

    expect(issueMiniAppToken(User::factory()->telegram()->create()))->toMatch('/^\d+\|homi_/');
});

it('revokes the oldest token when a sixth one is issued', function (): void {
    $user = User::factory()->telegram()->create();
    $tokens = array_map(fn (): string => issueMiniAppToken($user), range(1, 6));

    expect(PersonalAccessToken::findToken($tokens[0]))->toBeNull()
        ->and(array_map(fn (string $token): bool => PersonalAccessToken::findToken($token) !== null, array_slice($tokens, 1)))->toBe([true, true, true, true, true])
        ->and($user->tokens()->count())->toBe(5);
});

it('takes the cap from the configuration', function (): void {
    config(['access.max_tokens' => 2]);
    $user = User::factory()->telegram()->create();

    $tokens = array_map(fn (): string => issueMiniAppToken($user), range(1, 3));

    expect(PersonalAccessToken::findToken($tokens[0]))->toBeNull()
        ->and($user->tokens()->pluck('id')->all())->toBe(array_map(fn (string $token): int => (int) explode('|', $token)[0], array_slice($tokens, 1)));
});

it('counts only the unexpired miniapp tokens of the user against the cap', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    $user = User::factory()->telegram()->create();
    $other = User::factory()->telegram()->create();
    $expired = $user->createToken('miniapp', ['app:read', 'app:write'], now()->subMinute());
    $otherName = $user->createToken('arm', ['arm:read'], now()->addDay());
    $otherUsers = issueMiniAppToken($other);

    $tokens = array_map(fn (): string => issueMiniAppToken($user), range(1, 5));

    expect(array_map(fn (string $token): bool => PersonalAccessToken::findToken($token) !== null, [...$tokens, $otherUsers]))->toBe([true, true, true, true, true, true])
        ->and(PersonalAccessToken::query()->whereKey($expired->accessToken->id)->exists())->toBeTrue()
        ->and(PersonalAccessToken::query()->whereKey($otherName->accessToken->id)->exists())->toBeTrue();
});

it('lets the token read the app and refuses it a media write', function (): void {
    $token = issueMiniAppToken(User::factory()->telegram()->create());

    $this->withToken($token)->getJson('/api/v1/settings')->assertOk();
    $this->withToken($token)->postJson('/api/v1/media/presign', ['mime' => 'image/jpeg'])
        ->assertForbidden()
        ->assertJsonPath('code', 'forbidden');
});

it('stops authenticating once the token has expired', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    $token = issueMiniAppToken(User::factory()->telegram()->create());

    Date::setTestNow('2026-11-27 08:59:59');
    $this->withToken($token)->getJson('/api/v1/me')->assertOk();

    app('auth')->forgetGuards();
    Date::setTestNow('2026-11-27 09:00:01');
    $this->withToken($token)->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
});

it('prunes expired tokens a day after they expire, every day', function (): void {
    $prune = collect(app(Schedule::class)->events())
        ->filter(fn (Event $event): bool => str_ends_with((string) $event->command, 'sanctum:prune-expired --hours=24'));

    expect($prune)->toHaveCount(1)
        ->and($prune->first()?->expression)->toBe('0 0 * * *');
});
