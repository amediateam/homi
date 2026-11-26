<?php

namespace App\Services\Identity;

use App\Enums\Identity\BotChatState;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Turns a verified Telegram launch into a HOMI user (WP-40). The first contact creates the user — race-safe through
 * `createOrFirst` on the unique `telegram_user_id`, so two concurrent first sign-ins make one user — with its launch
 * facts and `first_start_param`, and its settings row with the defaults for the launch's language; every later
 * contact updates the flags, the language and `last_seen_at` in one save.
 *
 * `allows_write_to_pm` only raises `bot_chat_state` from `never` to `active`: a launch without it never downgrades the
 * state, and a launch with it never undoes a `blocked` that the bot saw in its own chat-member updates (WP-52), which
 * alone maintain that state. A launch without a language tag keeps the last one known. Nothing of the user's name,
 * username or photo is stored (SEC-REQ-004).
 */
final class UserResolver
{
    public function __construct(private readonly SettingsService $settings) {}

    public function fromInitData(TelegramInitData $data): User
    {
        $now = CarbonImmutable::now();

        $user = User::unguarded(fn (): User => User::query()->createOrFirst(
            ['telegram_user_id' => $data->telegramUserId],
            [
                ...$this->launchFacts($data, $now),
                'language_code' => $data->languageCode,
                'bot_chat_state' => $data->allowsWriteToPm ? BotChatState::Active : BotChatState::Never,
                'first_start_param' => $data->startParam,
            ],
        ));

        if ($user->wasRecentlyCreated) {
            $this->firstContact($user, $data);

            return $user;
        }

        $user->forceFill([
            ...$this->launchFacts($data, $now),
            'language_code' => $data->languageCode ?? $user->language_code,
        ]);

        if ($data->allowsWriteToPm && $user->bot_chat_state === BotChatState::Never) {
            $user->bot_chat_state = BotChatState::Active;
        }

        $user->save();

        return $user;
    }

    /** @return array{is_premium: bool, has_username: bool, has_photo: bool, last_seen_at: CarbonImmutable} */
    private function launchFacts(TelegramInitData $data, CarbonImmutable $now): array
    {
        return [
            'is_premium' => $data->isPremium,
            'has_username' => $data->hasUsername,
            'has_photo' => $data->hasPhoto,
            'last_seen_at' => $now,
        ];
    }

    /** The first contact creates the user's settings row with the defaults for the launch's language. */
    private function firstContact(User $user, TelegramInitData $data): void
    {
        $this->settings->createDefaults($user, $data->languageCode);
    }
}
