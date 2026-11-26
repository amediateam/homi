<?php

use App\Models\User;
use App\Services\Identity\TelegramInitData;
use App\Services\Identity\UserResolver;
use Carbon\CarbonImmutable;

/*
 * WP-40: the first sign-ins of one Telegram user race (a reload, two devices). Each child process resolves the same
 * verified launch in its own PostgreSQL connection; `createOrFirst` on the unique `telegram_user_id` must leave one
 * user, and every child must get that user.
 */
it('makes one user when ten first contacts of one Telegram user run at once', function (): void {
    $resolve = static function (): int {
        $launch = new TelegramInitData(
            telegramUserId: 279058397,
            isPremium: false,
            hasUsername: true,
            hasPhoto: false,
            allowsWriteToPm: true,
            languageCode: 'uz',
            authDate: CarbonImmutable::now(),
            startParam: 'flat_100012',
            fingerprint: 'a1b2c3d4e5f6',
        );

        return app(UserResolver::class)->fromInitData($launch)->id;
    };

    $ids = concurrently(array_fill(0, 10, $resolve));

    $user = User::query()->sole();
    expect(array_unique($ids))->toBe([$user->id])
        ->and($user->telegram_user_id)->toBe(279058397)
        ->and($user->first_start_param)->toBe('flat_100012');
});
