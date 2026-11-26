<?php

use App\Models\User;
use App\Models\UserSetting;
use App\Services\Identity\TelegramSignIn;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Support\InitDataSigner;

/*
 * WP-40: the first sign-ins of one Telegram user race (a reload while the first answer is on its way). Each child
 * process exchanges the same signed launch value in its own PostgreSQL connection, through the whole sign-in: one user
 * with one settings row must come out, with a token for each child. Both children wait for one moment two seconds
 * ahead, so that the sign-ins overlap instead of following the boots.
 */
it('makes one user when two first sign-ins of one Telegram user run at once', function (): void {
    $value = InitDataSigner::valid(time());
    $startAt = microtime(true) + 2.0;

    $ids = concurrently([
        static function () use ($value, $startAt): int {
            if ($startAt > microtime(true)) {
                time_sleep_until($startAt);
            }

            return app(TelegramSignIn::class)->exchange($value)->user->id;
        },
        static function () use ($value, $startAt): int {
            if ($startAt > microtime(true)) {
                time_sleep_until($startAt);
            }

            return app(TelegramSignIn::class)->exchange($value)->user->id;
        },
    ]);

    $user = User::query()->sole();
    expect(array_unique($ids))->toBe([$user->id])
        ->and($user->telegram_user_id)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(UserSetting::query()->sole()->user_id)->toBe($user->id)
        ->and(PersonalAccessToken::query()->where('tokenable_id', $user->id)->count())->toBe(2);
});
