<?php

use App\Enums\Locale;
use App\Models\Source;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Identity\TelegramInitData;
use App\Services\Identity\UserResolver;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/** `GET /api/v1/me` on its native body (WP-40): the stub mode is off. */
function meUserFromLaunch(string $languageCode = 'uz'): User
{
    return app(UserResolver::class)->fromInitData(new TelegramInitData(
        telegramUserId: 279058397,
        isPremium: false,
        hasUsername: true,
        hasPhoto: false,
        allowsWriteToPm: true,
        languageCode: $languageCode,
        authDate: CarbonImmutable::now(),
        startParam: null,
        fingerprint: 'a1b2c3d4e5f6',
    ));
}

it('answers a first contact with nothing chosen, so the two first-launch pickers show', function (): void {
    $user = meUserFromLaunch('uz');
    Sanctum::actingAs($user, ['app:read']);

    $body = $this->getJson('/api/v1/me')->assertOk()->json();

    expect($body)->toBe([
        'success' => true,
        'data' => [
            'locale' => 'uz',
            'locale_chosen' => false,
            'currency' => 'USD',
            'theme' => 'auto',
            'city' => null,
            'city_chosen' => false,
            'team' => false,
            // JSON writes the rate 0.0 as 0.
            'analytics' => ['distinct_id' => $user->analytics_distinct_id, 'autocapture' => true, 'replay' => false, 'replay_rate' => 0],
            'owner' => ['pending' => 0, 'has_listings' => false, 'waitlisted' => false],
        ],
        'meta' => ['source' => 'native'],
    ]);
});

it('answers in the shape of the contract', function (): void {
    Sanctum::actingAs(UserSetting::factory()->chosen(Locale::En, 'andijan')->create()->user, ['app:read']);

    $response = $this->getJson('/api/v1/me')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::ME, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.locale', 'en')
        ->assertJsonPath('data.locale_chosen', true)
        ->assertJsonPath('data.city', 'andijan')
        ->assertJsonPath('data.city_chosen', true);
});

it('marks the language and the city chosen once a patch stores them', function (string $key, mixed $value, string $flag): void {
    Sanctum::actingAs(meUserFromLaunch('en'), ['app:read', 'app:write']);

    $this->patchJson('/api/v1/settings', [$key => $value])->assertOk();

    $this->getJson('/api/v1/me')->assertOk()
        ->assertJsonPath("data.{$key}", $value)
        ->assertJsonPath("data.{$flag}", true);
})->with([
    'the language' => ['locale', 'ru', 'locale_chosen'],
    'the city' => ['city', 'andijan', 'city_chosen'],
]);

it('says team for a team account', function (): void {
    $user = User::factory()->create(['is_team' => true]);
    Sanctum::actingAs($user, ['app:read']);

    $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.team', true);
});

it('tells the analytics client what the configuration says', function (): void {
    config(['analytics.client' => ['autocapture' => false, 'replay' => true, 'replay_rate' => 0.25]]);
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read']);

    expect($this->getJson('/api/v1/me')->assertOk()->json('data.analytics'))
        ->toBe(['distinct_id' => $user->analytics_distinct_id, 'autocapture' => false, 'replay' => true, 'replay_rate' => 0.25]);
});

it('reads an analytics setting written as a whole number or an env string', function (array $client, array $expected): void {
    config(['analytics.client' => $client]);
    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read']);

    expect($this->getJson('/api/v1/me')->assertOk()->json('data.analytics'))
        ->toBe(['distinct_id' => $user->analytics_distinct_id, ...$expected]);
})->with([
    'a whole rate' => [
        ['autocapture' => true, 'replay' => true, 'replay_rate' => 1],
        ['autocapture' => true, 'replay' => true, 'replay_rate' => 1],
    ],
    'env strings' => [
        ['autocapture' => '0', 'replay' => '1', 'replay_rate' => '0.5'],
        ['autocapture' => false, 'replay' => true, 'replay_rate' => 0.5],
    ],
    'unreadable values fall back to the defaults' => [
        ['autocapture' => 'maybe', 'replay' => 'sometimes', 'replay_rate' => 'half'],
        ['autocapture' => true, 'replay' => false, 'replay_rate' => 0],
    ],
    'missing and empty values fall back to the defaults' => [
        ['autocapture' => null, 'replay' => ''],
        ['autocapture' => true, 'replay' => false, 'replay_rate' => 0],
    ],
]);

it('gives a user without a settings row the defaults for his language', function (): void {
    $user = User::factory()->telegram()->create(['language_code' => 'en-GB']);
    Sanctum::actingAs($user, ['app:read']);

    $this->getJson('/api/v1/me')->assertOk()
        ->assertJsonPath('data.locale', 'en')
        ->assertJsonPath('data.locale_chosen', false);
    expect(UserSetting::query()->sole()->user_id)->toBe($user->id);
});

it('answers each user his own profile', function (): void {
    $first = UserSetting::factory()->chosen(Locale::Uz, 'andijan')->create()->user;
    $second = User::factory()->create();

    Sanctum::actingAs($second, ['app:read']);
    $this->getJson('/api/v1/me')->assertOk()
        ->assertJsonPath('data.locale', 'ru')
        ->assertJsonPath('data.city', null)
        ->assertJsonPath('data.analytics.distinct_id', $second->analytics_distinct_id);

    Sanctum::actingAs($first, ['app:read']);
    $this->getJson('/api/v1/me')->assertOk()
        ->assertJsonPath('data.locale', 'uz')
        ->assertJsonPath('data.city', 'andijan')
        ->assertJsonPath('data.analytics.distinct_id', $first->analytics_distinct_id);
});

it('ignores a stub scenario', function (): void {
    Sanctum::actingAs(UserSetting::factory()->chosen()->create()->user, ['app:read']);

    $this->getJson('/api/v1/me', ['X-Stub-Scenario' => 'first_launch'])->assertOk()
        ->assertJsonPath('meta.source', 'native')
        ->assertJsonPath('data.city_chosen', true);
    $this->getJson('/api/v1/me', ['X-Stub-Scenario' => 'access_blocked'])->assertOk();
});

it('needs a session and the app:read ability', function (): void {
    $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');

    Sanctum::actingAs(User::factory()->create(), ['media:write']);
    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('code', 'forbidden');
});

it('refuses a collector token that carries the app ability', function (): void {
    $token = Source::factory()->create()->createToken('collector', ['app:read'])->plainTextToken;

    $this->withToken($token)->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('code', 'forbidden');
    expect(UserSetting::query()->count())->toBe(0);
});
