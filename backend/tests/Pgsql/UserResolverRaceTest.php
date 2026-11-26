<?php

use App\Enums\Locale;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Identity\TelegramInitData;
use App\Services\Identity\UserResolver;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/*
 * WP-40: the first sign-ins of one Telegram user race (a reload, two devices). Each child process resolves the same
 * verified launch in its own PostgreSQL connection. The children wait for one start time so that their lookups run
 * together, before any of them has created the user (a child that started later would find the user by the lookup and
 * take the returning path, and the race would not run): they find no user and go on to `createOrFirst` on the unique
 * `telegram_user_id`, which must leave one user with one settings row, and every child must get that user.
 */
it('makes one user when ten first contacts of one Telegram user run at once', function (): void {
    $startAt = microtime(true) + 2.0;

    $resolve = static function () use ($startAt): int {
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

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        return app(UserResolver::class)->fromInitData($launch)->id;
    };

    $ids = concurrently(array_fill(0, 10, $resolve));

    $user = User::query()->sole();
    expect(array_unique($ids))->toBe([$user->id])
        ->and($user->telegram_user_id)->toBe(279058397)
        ->and($user->first_start_param)->toBe('flat_100012')
        ->and(UserSetting::query()->sole()->user_id)->toBe($user->id)
        ->and(UserSetting::query()->sole()->locale)->toBe(Locale::Uz);
});

/**
 * A returning user's sign-in looks the user up before it writes: a failed INSERT would take a value of the id sequence
 * and make PostgreSQL log the Telegram id with its unique-violation `DETAIL` (SEC-REQ-047).
 */
it('takes no id from the users sequence when a known user returns', function (): void {
    $launch = new TelegramInitData(
        telegramUserId: 279058397,
        isPremium: false,
        hasUsername: true,
        hasPhoto: false,
        allowsWriteToPm: false,
        languageCode: 'uz',
        authDate: CarbonImmutable::now(),
        startParam: null,
        fingerprint: 'a1b2c3d4e5f6',
    );
    $sequence = DB::scalar("select pg_get_serial_sequence('users', 'id')");
    $lastValue = fn (): int => (int) DB::scalar("select last_value from {$sequence}");

    $user = app(UserResolver::class)->fromInitData($launch);
    $before = $lastValue();
    $again = app(UserResolver::class)->fromInitData($launch);

    expect($again->is($user))->toBeTrue()
        ->and($lastValue())->toBe($before);
});
