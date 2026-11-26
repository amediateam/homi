<?php

use App\Enums\Identity\BotChatState;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Identity\TelegramInitData;
use App\Services\Identity\UserResolver;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Str;

/** A verified launch of Telegram user 279058397 (WP-40). */
function telegramLaunch(array $overrides = []): TelegramInitData
{
    return new TelegramInitData(...[
        'telegramUserId' => 279058397,
        'isPremium' => false,
        'hasUsername' => true,
        'hasPhoto' => false,
        'allowsWriteToPm' => false,
        'languageCode' => 'uz',
        'authDate' => CarbonImmutable::now(),
        'startParam' => null,
        'fingerprint' => 'a1b2c3d4e5f6',
        ...$overrides,
    ]);
}

function resolveTelegramUser(array $overrides = []): User
{
    return app(UserResolver::class)->fromInitData(telegramLaunch($overrides));
}

it('creates a user without any name data on the first contact', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');

    $user = resolveTelegramUser(['isPremium' => true, 'startParam' => 'flat_100012']);

    $row = User::query()->sole();
    expect($user->wasRecentlyCreated)->toBeTrue()
        ->and($row->is($user))->toBeTrue()
        ->and($row->name)->toBeNull()
        ->and($row->email)->toBeNull()
        ->and($row->password)->toBeNull()
        ->and($row->telegram_user_id)->toBe(279058397)
        ->and($row->is_premium)->toBeTrue()
        ->and($row->has_username)->toBeTrue()
        ->and($row->has_photo)->toBeFalse()
        ->and($row->language_code)->toBe('uz')
        ->and($row->bot_chat_state)->toBe(BotChatState::Never)
        ->and($row->is_team)->toBeFalse()
        ->and($row->first_start_param)->toBe('flat_100012')
        ->and($row->last_seen_at?->toIso8601String())->toBe('2026-11-26T09:00:00+00:00')
        ->and(Str::isUuid($row->analytics_distinct_id))->toBeTrue();
});

it('finds the same user on the next contact and updates what the launch says', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    $first = resolveTelegramUser(['startParam' => 'flat_100012']);
    $distinctId = $first->analytics_distinct_id;

    Date::setTestNow('2026-11-27 18:30:00');
    $second = resolveTelegramUser(['isPremium' => true, 'hasUsername' => false, 'hasPhoto' => true, 'languageCode' => 'en', 'startParam' => 'ref_other']);

    $row = User::query()->sole();
    expect($second->wasRecentlyCreated)->toBeFalse()
        ->and($second->is($first))->toBeTrue()
        ->and($row->telegram_user_id)->toBe(279058397)
        ->and($row->is_premium)->toBeTrue()
        ->and($row->has_username)->toBeFalse()
        ->and($row->has_photo)->toBeTrue()
        ->and($row->language_code)->toBe('en')
        ->and($row->first_start_param)->toBe('flat_100012')
        ->and($row->analytics_distinct_id)->toBe($distinctId)
        ->and($row->last_seen_at?->toIso8601String())->toBe('2026-11-27T18:30:00+00:00');
});

it('creates the settings row with the defaults for the language of the first launch', function (?string $languageCode, Locale $locale): void {
    $user = resolveTelegramUser(['languageCode' => $languageCode]);

    $settings = UserSetting::query()->sole();
    expect($settings->user_id)->toBe($user->id)
        ->and($settings->locale)->toBe($locale)
        ->and($settings->locale_chosen_at)->toBeNull()
        ->and($settings->city)->toBeNull()
        ->and($settings->city_chosen_at)->toBeNull()
        ->and($user->settings?->is($settings))->toBeTrue();
})->with([
    'Uzbek' => ['uz', Locale::Uz],
    'English' => ['en-GB', Locale::En],
    'Kazakh' => ['kk', Locale::Ru],
    'none' => [null, Locale::Ru],
]);

it('leaves the settings alone on a later contact in another language', function (): void {
    $user = resolveTelegramUser(['languageCode' => 'uz']);
    UserSetting::query()->whereKey($user->id)->update(['theme' => 'dark']);

    resolveTelegramUser(['languageCode' => 'en']);

    $settings = UserSetting::query()->sole();
    expect($settings->locale)->toBe(Locale::Uz)
        ->and($settings->theme)->toBe(Theme::Dark);
});

it('keeps the last language known when a launch sends none', function (): void {
    resolveTelegramUser(['languageCode' => 'uz']);

    resolveTelegramUser(['languageCode' => null]);

    expect(User::query()->sole()->language_code)->toBe('uz');
});

it('stores no language when the first launch sends none', function (): void {
    resolveTelegramUser(['languageCode' => null]);

    expect(User::query()->sole()->language_code)->toBeNull();
});

it('marks the bot chat active when the launch allows writing, and never downgrades it', function (): void {
    resolveTelegramUser(['allowsWriteToPm' => true]);
    expect(User::query()->sole()->bot_chat_state)->toBe(BotChatState::Active);

    resolveTelegramUser(['allowsWriteToPm' => false]);
    expect(User::query()->sole()->bot_chat_state)->toBe(BotChatState::Active);
});

it('marks a chat that never started active on a later launch that allows writing', function (): void {
    $user = resolveTelegramUser();
    expect($user->bot_chat_state)->toBe(BotChatState::Never);

    resolveTelegramUser(['allowsWriteToPm' => true]);

    expect($user->fresh()?->bot_chat_state)->toBe(BotChatState::Active);
});

it('leaves a chat the bot saw blocked blocked, whatever the launch allows (decision 15)', function (bool $allowsWriteToPm): void {
    $user = resolveTelegramUser();
    $user->forceFill(['bot_chat_state' => BotChatState::Blocked])->save();

    resolveTelegramUser(['allowsWriteToPm' => $allowsWriteToPm]);

    expect($user->fresh()?->bot_chat_state)->toBe(BotChatState::Blocked);
})->with(['a launch that allows writing' => true, 'a launch that does not' => false]);

it('keeps two Telegram users apart', function (): void {
    $first = resolveTelegramUser();
    $second = resolveTelegramUser(['telegramUserId' => 279058398]);

    expect($second->is($first))->toBeFalse()
        ->and(User::query()->count())->toBe(2)
        ->and($second->analytics_distinct_id)->not->toBe($first->analytics_distinct_id);
});

it('leaves the other users alone', function (): void {
    $other = User::factory()->create();

    resolveTelegramUser(['isPremium' => true]);

    expect($other->fresh()?->is_premium)->toBeFalse()
        ->and($other->fresh()?->telegram_user_id)->toBeNull()
        ->and(User::query()->count())->toBe(2);
});

it('gives every new user a random analytics id and keeps one that is given', function (): void {
    $factoryUser = User::factory()->create();
    $telegramUser = User::factory()->telegram()->create();
    $given = User::factory()->create(['analytics_distinct_id' => '5f0c2b1e-7a36-4c59-9d4e-2f1a6b7c8d90']);

    expect(Str::isUuid($factoryUser->analytics_distinct_id, 4))->toBeTrue()
        ->and(Str::isUuid($telegramUser->analytics_distinct_id, 4))->toBeTrue()
        ->and($factoryUser->analytics_distinct_id)->not->toBe($telegramUser->analytics_distinct_id)
        ->and($given->analytics_distinct_id)->toBe('5f0c2b1e-7a36-4c59-9d4e-2f1a6b7c8d90');
});

it('makes a Telegram user without a name, email or password in the factory', function (): void {
    $users = User::factory()->telegram()->count(3)->create();

    expect($users->pluck('telegram_user_id')->unique())->toHaveCount(3)
        ->and($users->pluck('name')->filter())->toBeEmpty()
        ->and($users->pluck('email')->filter())->toBeEmpty()
        ->and($users->pluck('password')->filter())->toBeEmpty()
        ->and($users->first()?->language_code)->toBe('ru');
});
