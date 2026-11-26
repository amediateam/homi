<?php

use App\Enums\Identity\BotChatState;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Access\AccessGate;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Support\ContractShapes;
use Tests\Support\InitDataSigner;
use Tests\Support\JsonShape;

/** `POST /api/v1/auth/telegram` on its native body (WP-40): the stub mode is off, values are signed by `InitDataSigner`. */
beforeEach(function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
});

/** A launch value signed with the test bot token at the frozen time; `$overrides` as in `InitDataSigner::fields()`. */
function signedLaunch(array $overrides = []): string
{
    return InitDataSigner::valid(now()->getTimestamp(), $overrides);
}

function postSignIn(string $initData, array $headers = []): TestResponse
{
    return test()->postJson('/api/v1/auth/telegram', ['init_data' => $initData], $headers);
}

/** The fingerprint by which logs and the exchange counter name a value: the first 12 hex digits of SHA-256 of its hash. */
function fingerprintOf(string $initData): string
{
    return substr(hash('sha256', (string) InitDataSigner::field($initData, 'hash')), 0, 12);
}

/** @return Closure(): list<MessageLogged> the log entries written since the call */
function captureLog(): Closure
{
    $entries = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($entries): void {
        $entries->append($entry);
    });

    return fn (): array => array_values($entries->getArrayCopy());
}

it('signs in a first contact and answers a token and his object of GET /me in the shape of the contract', function (): void {
    $response = postSignIn(signedLaunch())->assertOk();

    JsonShape::assertSame([
        'success' => 'bool',
        'data' => ['token' => 'string', 'token_type' => 'string', 'expires_at' => 'string', 'user' => ContractShapes::ME],
        'meta' => ['source' => 'string'],
    ], JsonShape::of($response->json()));
    $user = User::query()->sole();
    $token = PersonalAccessToken::findToken($response->json('data.token'));
    expect($response->json('meta'))->toBe(['source' => 'native'])
        ->and($response->json('data.token_type'))->toBe('Bearer')
        ->and($response->json('data.expires_at'))->toBe('2026-11-27T09:00:00+00:00')
        ->and($response->json('data.user'))->toBe([
            'locale' => 'ru', 'locale_chosen' => false, 'currency' => 'USD', 'theme' => 'auto', 'city' => null, 'city_chosen' => false,
            'team' => false,
            'analytics' => ['distinct_id' => $user->analytics_distinct_id, 'autocapture' => true, 'replay' => false, 'replay_rate' => 0],
            'owner' => ['pending' => 0, 'has_listings' => false, 'waitlisted' => false],
        ])
        ->and($token?->tokenable?->is($user))->toBeTrue()
        ->and($token?->name)->toBe('miniapp')
        ->and($token?->abilities)->toBe(['app:read', 'app:write'])
        ->and($user->name)->toBeNull()
        ->and($user->email)->toBeNull()
        ->and($user->password)->toBeNull()
        ->and($user->telegram_user_id)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and($user->bot_chat_state)->toBe(BotChatState::Active);
});

it('returns a token that authenticates GET /me, which answers the same user natively', function (): void {
    $session = postSignIn(signedLaunch())->assertOk();

    $this->withToken($session->json('data.token'))->getJson('/api/v1/me')->assertOk()
        ->assertJsonPath('meta.source', 'native')
        ->assertJsonPath('data', $session->json('data.user'));
});

it('signs the same Telegram user in again as the same user, with a new token', function (): void {
    $first = postSignIn(signedLaunch())->assertOk()->json('data.token');
    $second = postSignIn(signedLaunch(['query_id' => 'AAHdF6IQAAAAAN0XohDhrOrd']))->assertOk()->json('data.token');

    expect($second)->not->toBe($first)
        ->and(User::query()->sole()->tokens()->count())->toBe(2);
});

it('refuses a value that is not signed by this bot with 401 invalid_init_data, without a reason, and creates nothing', function (Closure $value, ?string $botToken): void {
    if ($botToken !== null) {
        config(['telegram.bot.token' => $botToken]);
    }

    postSignIn($value())->assertUnauthorized()
        ->assertExactJson(['success' => false, 'message' => 'The Telegram launch data is invalid.', 'code' => 'invalid_init_data'])
        ->assertJsonMissingPath('reason');

    expect(User::query()->count())->toBe(0)
        ->and(PersonalAccessToken::query()->count())->toBe(0);
})->with([
    'another user id' => [fn (): string => InitDataSigner::tamper(signedLaunch(), 'user', '{"id":100000001,"first_name":"Eve"}'), null],
    'another bot' => [fn (): string => InitDataSigner::sign(InitDataSigner::fields(now()->getTimestamp()), '987654321:ANOTHER-bot-token'), null],
    'no hash' => [fn (): string => 'query_id=AAHomiSyntheticQuery&user=%7B%22id%22%3A1%7D&auth_date=1764147600', null],
    'not a launch value' => [fn (): string => 'a', null],
    'no bot token configured' => [fn (): string => signedLaunch(), ''],
]);

it('refuses a value older than the window with 401 auth_expired, without a reason', function (): void {
    postSignIn(InitDataSigner::valid(now()->getTimestamp() - 3601))->assertUnauthorized()
        ->assertJsonPath('code', 'auth_expired')
        ->assertJsonMissingPath('reason');

    expect(PersonalAccessToken::query()->count())->toBe(0);
});

it('exchanges one value twenty times and refuses the 21st with 429 rate_limited and Retry-After', function (): void {
    config(['rate_limits.auth.per_user' => 100, 'rate_limits.auth.per_address' => 100]);
    $value = signedLaunch();

    foreach (range(1, 20) as $exchange) {
        postSignIn($value)->assertOk();
    }

    $refused = postSignIn($value)->assertTooManyRequests()
        ->assertJsonPath('code', 'rate_limited')
        ->assertJsonMissingPath('reason');

    expect((int) $refused->headers->get('Retry-After'))->toBeGreaterThan(3590)->toBeLessThanOrEqual(3600)
        ->and(PersonalAccessToken::query()->count())->toBe(5);
    postSignIn(signedLaunch(['query_id' => 'AAHdF6IQAAAAAN0XohDhrOrd']))->assertOk();
});

it('accepts a replay of one value from a second address, with the same fingerprint in both log lines', function (): void {
    $value = signedLaunch();
    $log = captureLog();

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10']);
    postSignIn($value)->assertOk();
    $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.20']);
    postSignIn($value)->assertOk();

    $lines = array_values(array_filter($log(), fn (MessageLogged $entry): bool => $entry->message === 'Telegram sign-in.'));
    $context = ['fingerprint' => fingerprintOf($value), 'user_id' => User::query()->sole()->id];
    expect($lines)->toHaveCount(2)
        ->and(Arr::except($lines[0]->context, 'request_id'))->toBe($context)
        ->and(Arr::except($lines[1]->context, 'request_id'))->toBe($context);
});

it('refuses a sixth sign-in of one user within a minute, lets other users in, and lets him in a minute later', function (): void {
    foreach (range(1, 5) as $attempt) {
        postSignIn(signedLaunch(['query_id' => "AAHomiQuery{$attempt}"]))->assertOk();
    }

    $refused = postSignIn(signedLaunch(['query_id' => 'AAHomiQuery6']))->assertTooManyRequests()
        ->assertJsonPath('code', 'rate_limited')
        ->assertJsonMissingPath('reason');
    expect((int) $refused->headers->get('Retry-After'))->toBeGreaterThan(0)->toBeLessThanOrEqual(60);

    postSignIn(signedLaunch(['user' => ['id' => 100000001]]))->assertOk();

    $this->travel(61)->seconds();
    postSignIn(signedLaunch(['query_id' => 'AAHomiQuery7']))->assertOk();
});

it('reads the per-user limit leniently: digits as a number, anything else as the default of 5', function (mixed $value, int $allowed): void {
    config(['rate_limits.auth.per_user' => $value]);

    foreach (range(1, $allowed) as $attempt) {
        postSignIn(signedLaunch(['query_id' => "AAHomiQuery{$attempt}"]))->assertOk();
    }

    postSignIn(signedLaunch(['query_id' => 'AAHomiQueryOver']))->assertTooManyRequests()->assertJsonPath('code', 'rate_limited');
})->with([
    'a string of digits' => ['2', 2],
    'a word' => ['many', 5],
    'a blank string' => ['', 5],
    'zero' => [0, 5],
    'a fraction' => [2.5, 5],
]);

it('reads init_data from the JSON body only and ignores the query string', function (string $query, ?string $body, int $status): void {
    $values = ['valid' => signedLaunch(), 'forged' => InitDataSigner::tamper(signedLaunch(), 'auth_date', (string) (now()->getTimestamp() - 1))];

    $response = $this->postJson('/api/v1/auth/telegram?'.http_build_query(['init_data' => $values[$query]]), $body === null ? [] : ['init_data' => $values[$body]]);

    $response->assertStatus($status);
    if ($status === 422) {
        $response->assertJsonValidationErrors('init_data');
        expect(User::query()->count())->toBe(0);
    }

    if ($status === 401) {
        $response->assertJsonPath('code', 'invalid_init_data')->assertJsonMissingPath('reason');
    }
})->with([
    'a valid value in the query string alone' => ['valid', null, 422],
    'a forged value in the query string beside a valid body' => ['forged', 'valid', 200],
    'a valid value in the query string beside a forged body' => ['valid', 'forged', 401],
]);

it('never takes a launch value as a bearer', function (): void {
    $this->getJson('/api/v1/me', ['Authorization' => 'tma '.signedLaunch()])->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');

    expect(User::query()->count())->toBe(0);
});

it('gives the token no media rights', function (): void {
    $token = postSignIn(signedLaunch())->json('data.token');

    $this->withToken($token)->postJson('/api/v1/media/presign', ['mime' => 'image/jpeg'])
        ->assertForbidden()
        ->assertJsonPath('code', 'forbidden');
});

it('refuses access with the reason of the gate and issues no token', function (array $access, bool $blocked, bool $allowsWrite, string $reason): void {
    config(['access' => [...config('access'), ...$access]]);
    $user = User::factory()->telegram()->create(['telegram_user_id' => InitDataSigner::TELEGRAM_USER_ID]);

    if ($blocked) {
        AccessGrant::factory()->for($user)->blocked()->create();
    }

    postSignIn(signedLaunch(['user' => ['allows_write_to_pm' => $allowsWrite]]))->assertForbidden()
        ->assertExactJson(['success' => false, 'message' => 'Access denied.', 'code' => 'access_denied', 'reason' => $reason]);

    expect(PersonalAccessToken::query()->count())->toBe(0);
})->with([
    'private' => [['mode' => 'private'], false, true, 'private'],
    'invite' => [['mode' => 'invite'], false, true, 'invite'],
    'full' => [['max_seats' => 0], false, true, 'full'],
    'join' => [['require_chat' => true], false, false, 'join'],
    'blocked' => [[], true, true, 'blocked'],
    'paused' => [['paused' => true], false, true, 'paused'],
    'paused, a blocked user too' => [['paused' => true], true, true, 'paused'],
]);

it('signs in an owner in private mode and a team account during a pause', function (array $access, array $attributes): void {
    config(['access' => [...config('access'), ...$access]]);
    User::factory()->telegram()->create(['telegram_user_id' => InitDataSigner::TELEGRAM_USER_ID, ...$attributes]);

    postSignIn(signedLaunch())->assertOk()->assertJsonPath('meta.source', 'native');
})->with([
    'an owner' => [['mode' => 'private', 'owner_telegram_ids' => [InitDataSigner::TELEGRAM_USER_ID]], []],
    'a team account' => [['paused' => true], ['is_team' => true]],
]);

it('logs one line per sign-in and per refusal, with no value, token or Telegram id, and no error entry', function (): void {
    $log = captureLog();
    $value = signedLaunch();

    $token = postSignIn($value)->assertOk()->json('data.token');
    postSignIn(InitDataSigner::tamper($value, 'auth_date', '1764147000'))->assertUnauthorized()->assertJsonPath('code', 'invalid_init_data')->assertJsonMissingPath('reason');
    postSignIn(InitDataSigner::valid(now()->getTimestamp() - 7200))->assertUnauthorized()->assertJsonPath('code', 'auth_expired')->assertJsonMissingPath('reason');
    config(['access.mode' => 'private']);
    app(AccessGate::class)->forget(User::query()->sole());
    postSignIn(signedLaunch(['query_id' => 'AAHomiQueryPrivate']))->assertForbidden();

    $entries = $log();
    $lines = array_map(fn (MessageLogged $entry): array => [$entry->level, $entry->message, Arr::except($entry->context, 'request_id')], $entries);
    $userId = User::query()->sole()->id;
    expect($lines)->toBe([
        ['info', 'Telegram sign-in.', ['fingerprint' => fingerprintOf($value), 'user_id' => $userId]],
        ['notice', 'Telegram sign-in refused.', ['reason' => 'bad_signature']],
        ['notice', 'Telegram sign-in refused.', ['reason' => 'expired']],
        ['notice', 'Telegram sign-in refused.', ['reason' => 'access_private', 'fingerprint' => fingerprintOf(signedLaunch(['query_id' => 'AAHomiQueryPrivate'])), 'user_id' => $userId]],
    ]);

    $written = json_encode(array_map(fn (MessageLogged $entry): array => [$entry->message, $entry->context], $entries), JSON_UNESCAPED_SLASHES);
    $plain = explode('|', (string) $token, 2)[1];
    expect($written)->not->toContain((string) InitDataSigner::TELEGRAM_USER_ID)
        ->not->toContain((string) InitDataSigner::field($value, 'hash'))
        ->not->toContain('Dilnoza')
        ->not->toContain($plain)
        ->not->toContain(hash('sha256', $plain));
});
