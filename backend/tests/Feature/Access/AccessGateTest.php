<?php

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Enums\AccessState;
use App\Enums\Identity\BotChatState;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Access\AccessGate;
use App\Services\Identity\TelegramInitData;
use App\Services\Identity\UserResolver;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Tests\Support\EnvOverride;

/** The access gate's decision (WP-40, `25` §3.4, KV-BE-009): every rule, the pause, the seats, the cache. */
const GATE_OWNER_TELEGRAM_ID = 279058397;

/**
 * A Telegram user for the gate with his grant, under the access configuration given (the rest as on the servers).
 *
 * @param  array<string, mixed>  $access  keys of `config/access.php`
 * @param  array<string, mixed>  $attributes
 */
function gatedUser(array $access = [], array $attributes = [], ?AccessGrantState $grant = null, ?AdmittedVia $via = AdmittedVia::Open): User
{
    config(['access' => [...config('access'), 'mode' => 'open', 'max_seats' => null, 'owner_telegram_ids' => [], 'require_chat' => false, 'paused' => false, ...$access]]);
    $user = User::factory()->telegram()->create($attributes);

    if ($grant !== null) {
        AccessGrant::factory()->for($user)->create(['state' => $grant, 'admitted_via' => $via]);
    }

    return $user;
}

function gateDecides(User $user): AccessState
{
    return app(AccessGate::class)->decide($user)->state;
}

it('decides by the rules in their order', function (array $access, array $attributes, ?AccessGrantState $grant, AccessState $expected): void {
    $user = gatedUser($access, $attributes, $grant);

    expect(gateDecides($user))->toBe($expected);
})->with([
    'open mode lets a new user in' => [[], [], null, AccessState::Granted],
    'private mode refuses a new user' => [['mode' => 'private'], [], null, AccessState::Private],
    'private mode lets an owner in' => [['mode' => 'private', 'owner_telegram_ids' => [GATE_OWNER_TELEGRAM_ID]], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID], null, AccessState::Granted],
    'private mode lets an admitted user in' => [['mode' => 'private'], [], AccessGrantState::Admitted, AccessState::Granted],
    'invite mode refuses a user without an invite' => [['mode' => 'invite'], [], null, AccessState::Invite],
    'invite mode lets an admitted user in' => [['mode' => 'invite'], [], AccessGrantState::Admitted, AccessState::Granted],
    'invite mode lets an owner in' => [['mode' => 'invite', 'owner_telegram_ids' => [GATE_OWNER_TELEGRAM_ID]], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID], null, AccessState::Granted],
    'an unknown mode is private' => [['mode' => 'beta'], [], null, AccessState::Private],
    'a missing mode is private' => [['mode' => null], [], null, AccessState::Private],
    'the mode is read without case and blanks' => [['mode' => ' Open '], [], null, AccessState::Granted],
    'blocked beats open mode' => [[], [], AccessGrantState::Blocked, AccessState::Blocked],
    'blocked beats the owner list' => [['mode' => 'private', 'owner_telegram_ids' => [GATE_OWNER_TELEGRAM_ID]], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID], AccessGrantState::Blocked, AccessState::Blocked],
    'blocked beats the missing chat' => [['require_chat' => true], ['bot_chat_state' => BotChatState::Never], AccessGrantState::Blocked, AccessState::Blocked],
    'blocked beats an open seat' => [['max_seats' => 5], [], AccessGrantState::Blocked, AccessState::Blocked],
    'with require_chat a user who never started the bot must join' => [['require_chat' => true], ['bot_chat_state' => BotChatState::Never], null, AccessState::Join],
    'with require_chat a user who blocked the bot must join' => [['require_chat' => true], ['bot_chat_state' => BotChatState::Blocked], AccessGrantState::Admitted, AccessState::Join],
    'with require_chat an owner without a chat must join' => [['require_chat' => true, 'owner_telegram_ids' => [GATE_OWNER_TELEGRAM_ID]], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID], null, AccessState::Join],
    'with require_chat an active chat passes' => [['require_chat' => true], ['bot_chat_state' => BotChatState::Active], null, AccessState::Granted],
    'with require_chat an active chat still needs an invite' => [['require_chat' => true, 'mode' => 'invite'], ['bot_chat_state' => BotChatState::Active], null, AccessState::Invite],
    'without require_chat a user who never started the bot passes' => [[], ['bot_chat_state' => BotChatState::Never], null, AccessState::Granted],
    'a team account has no privilege outside the pause' => [['mode' => 'private'], ['is_team' => true], null, AccessState::Private],
    'an owner id written as a string still counts' => [['mode' => 'private', 'owner_telegram_ids' => [(string) GATE_OWNER_TELEGRAM_ID]], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID], null, AccessState::Granted],
    'a user without a Telegram id is no owner' => [['mode' => 'private', 'owner_telegram_ids' => [GATE_OWNER_TELEGRAM_ID]], ['telegram_user_id' => null], null, AccessState::Private],
    'an owner list that is no list lets nobody in' => [['mode' => 'private', 'owner_telegram_ids' => (string) GATE_OWNER_TELEGRAM_ID], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID], null, AccessState::Private],
]);

it('lets everyone in without writing a row in open mode without a seat limit', function (): void {
    $user = gatedUser();

    expect(gateDecides($user))->toBe(AccessState::Granted)
        ->and(AccessGrant::query()->count())->toBe(0);
});

it('admits a user to a free seat once, through open mode', function (): void {
    $user = gatedUser(['max_seats' => 1]);

    expect(gateDecides($user))->toBe(AccessState::Granted);
    app(AccessGate::class)->forget($user);
    expect(gateDecides($user))->toBe(AccessState::Granted);

    $grant = AccessGrant::query()->sole();
    expect($grant->user_id)->toBe($user->id)
        ->and($grant->state)->toBe(AccessGrantState::Admitted)
        ->and($grant->admitted_via)->toBe(AdmittedVia::Open);
});

it('refuses a new user with full when every seat is taken, and keeps the admitted ones in', function (): void {
    $admitted = gatedUser(['max_seats' => 1], grant: AccessGrantState::Admitted, via: AdmittedVia::Invite);
    $owner = User::factory()->telegram()->create(['telegram_user_id' => GATE_OWNER_TELEGRAM_ID]);
    config(['access.owner_telegram_ids' => [GATE_OWNER_TELEGRAM_ID]]);
    $newcomer = User::factory()->telegram()->create();

    expect(gateDecides($newcomer))->toBe(AccessState::Full)
        ->and(gateDecides($admitted))->toBe(AccessState::Granted)
        ->and(gateDecides($owner))->toBe(AccessState::Granted)
        ->and(AccessGrant::query()->count())->toBe(1);
});

it('counts only admitted grants as seats', function (): void {
    gatedUser(['max_seats' => 1], grant: AccessGrantState::Blocked);
    $newcomer = User::factory()->telegram()->create();

    expect(gateDecides($newcomer))->toBe(AccessState::Granted)
        ->and(AccessGrant::query()->where('state', AccessGrantState::Admitted)->sole()->user_id)->toBe($newcomer->id);
});

it('admits nobody new with no seats', function (): void {
    expect(gateDecides(gatedUser(['max_seats' => 0])))->toBe(AccessState::Full)
        ->and(AccessGrant::query()->count())->toBe(0);
});

it('refuses everyone with paused during a pause, a blocked user and an owner too', function (?AccessGrantState $grant, array $access): void {
    $user = gatedUser(['paused' => true, ...$access], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID], $grant);

    expect(gateDecides($user))->toBe(AccessState::Paused);
})->with([
    'a new user' => [null, []],
    'an admitted user' => [AccessGrantState::Admitted, []],
    'a blocked user' => [AccessGrantState::Blocked, []],
    'an owner' => [null, ['mode' => 'private', 'owner_telegram_ids' => [GATE_OWNER_TELEGRAM_ID]]],
]);

it('lets a team account pass the pause, and still refuses it for the other reasons (DEC-106)', function (array $access, ?AccessGrantState $grant, AccessState $expected): void {
    $user = gatedUser(['paused' => true, ...$access], ['is_team' => true], $grant);

    expect(gateDecides($user))->toBe($expected);
})->with([
    'open mode' => [[], null, AccessState::Granted],
    'blocked' => [[], AccessGrantState::Blocked, AccessState::Blocked],
    'private mode' => [['mode' => 'private'], null, AccessState::Private],
]);

it('reads the pause switch leniently, so a value it cannot read leaves the service on', function (mixed $value, AccessState $expected): void {
    expect(gateDecides(gatedUser(['paused' => $value])))->toBe($expected);
})->with([
    'true' => [true, AccessState::Paused],
    '"1"' => ['1', AccessState::Paused],
    '"on"' => ['on', AccessState::Paused],
    'false' => [false, AccessState::Granted],
    '"0"' => ['0', AccessState::Granted],
    'blank' => ['', AccessState::Granted],
    'unreadable' => ['maybe', AccessState::Granted],
    'missing' => [null, AccessState::Granted],
]);

it('caches the decision for two seconds, so a change without forget() takes effect within them', function (): void {
    $this->freezeTime();
    $user = gatedUser();
    expect(gateDecides($user))->toBe(AccessState::Granted);

    AccessGrant::factory()->for($user)->blocked()->create();

    $this->travel(1)->seconds();
    expect(gateDecides($user))->toBe(AccessState::Granted);
    $this->travel(1)->seconds();
    expect(gateDecides($user))->toBe(AccessState::Blocked);
});

it('decides again at once after forget()', function (): void {
    $user = gatedUser();
    expect(gateDecides($user))->toBe(AccessState::Granted);

    AccessGrant::factory()->for($user)->blocked()->create();
    app(AccessGate::class)->forget($user);

    expect(gateDecides($user))->toBe(AccessState::Blocked);
});

it('reads the pause on every call, outside the cache', function (): void {
    $user = gatedUser();
    expect(gateDecides($user))->toBe(AccessState::Granted);

    config(['access.paused' => true]);
    expect(gateDecides($user))->toBe(AccessState::Paused);

    config(['access.paused' => false]);
    expect(gateDecides($user))->toBe(AccessState::Granted);
});

it('keys the cached decision by the internal user id, never by the Telegram id', function (): void {
    $user = gatedUser(attributes: ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID]);

    gateDecides($user);

    expect(Cache::get("access:decision:{$user->id}"))->toBe('granted')
        ->and(Cache::has('access:decision:'.GATE_OWNER_TELEGRAM_ID))->toBeFalse();
});

it('lets a user in at once when a launch shows that he started the bot, under require_chat', function (): void {
    $user = gatedUser(['require_chat' => true], ['telegram_user_id' => GATE_OWNER_TELEGRAM_ID, 'bot_chat_state' => BotChatState::Never]);
    expect(gateDecides($user))->toBe(AccessState::Join);

    $resolved = app(UserResolver::class)->fromInitData(new TelegramInitData(
        telegramUserId: GATE_OWNER_TELEGRAM_ID,
        isPremium: false,
        hasUsername: false,
        hasPhoto: false,
        allowsWriteToPm: true,
        languageCode: 'ru',
        authDate: CarbonImmutable::now(),
        startParam: null,
        fingerprint: 'a1b2c3d4e5f6',
    ));

    expect($resolved->is($user))->toBeTrue()
        ->and(gateDecides($resolved))->toBe(AccessState::Granted);
});

it('fails closed when ACCESS_MODE is not set, and reads the other keys of the environment safely', function (): void {
    $config = EnvOverride::with('ACCESS_MODE', null, fn (): array => require config_path('access.php'));

    expect($config['mode'])->toBe('private')
        ->and($config['paused'])->toBeFalse()
        ->and($config['require_chat'])->toBeFalse()
        ->and($config['max_seats'])->toBeNull()
        ->and($config['owner_telegram_ids'])->toBe([]);
});

it('reads the access keys of the environment', function (string $key, ?string $value, string $config, mixed $expected): void {
    $read = EnvOverride::with($key, $value, fn (): array => require config_path('access.php'));

    expect($read[$config])->toBe($expected);
})->with([
    'the mode' => ['ACCESS_MODE', 'open', 'mode', 'open'],
    'a seat limit' => ['ACCESS_MAX_SEATS', '200', 'max_seats', 200],
    'no seats' => ['ACCESS_MAX_SEATS', '0', 'max_seats', 0],
    'a blank seat limit' => ['ACCESS_MAX_SEATS', '', 'max_seats', null],
    'a seat limit that is no number' => ['ACCESS_MAX_SEATS', 'many', 'max_seats', null],
    'the owners' => ['ACCESS_OWNER_TELEGRAM_IDS', '279058397, 100000001,,x,0,-5', 'owner_telegram_ids', [279058397, 100000001]],
    'the pause on' => ['ACCESS_PAUSED', 'true', 'paused', true],
    'the pause as 1' => ['ACCESS_PAUSED', '1', 'paused', true],
    'the pause as 0' => ['ACCESS_PAUSED', '0', 'paused', false],
    'the pause unreadable' => ['ACCESS_PAUSED', 'maybe', 'paused', false],
]);
