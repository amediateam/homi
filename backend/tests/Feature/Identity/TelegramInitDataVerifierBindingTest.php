<?php

use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Exceptions\Identity\InvalidInitDataReason;
use App\Services\Identity\TelegramInitDataVerifier;
use Illuminate\Support\Facades\Date;
use Tests\Support\EnvOverride;
use Tests\Support\InitDataSigner;

/** The verifier as the container builds it (WP-40): the bot token and the window come from `config/telegram.php`. */
it('verifies with the bot token of the configuration, which is the synthetic token of phpunit.xml here', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');

    $data = app(TelegramInitDataVerifier::class)->verify(InitDataSigner::valid(now()->getTimestamp()));

    expect(config('telegram.bot.token'))->toBe(InitDataSigner::TOKEN)
        ->and($data->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID);
});

it('refuses every value while the bot token is not configured', function (?string $token): void {
    Date::setTestNow('2026-11-26 09:00:00');
    config(['telegram.bot.token' => $token]);

    expect(fn () => app(TelegramInitDataVerifier::class)->verify(InitDataSigner::valid(now()->getTimestamp())))
        ->toThrow(fn (InvalidInitData $refusal) => expect($refusal->reason)->toBe(InvalidInitDataReason::BadSignature));
})->with(['unset' => [null], 'empty' => ['']]);

it('takes the window from the configuration of the moment', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    $raw = InitDataSigner::valid(now()->getTimestamp() - 61);

    expect(app(TelegramInitDataVerifier::class)->verify($raw)->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID);

    config(['telegram.initdata.max_age' => 60]);
    expect(fn () => app(TelegramInitDataVerifier::class)->verify($raw))->toThrow(InitDataExpired::class);
});

it('reads the window from TELEGRAM_INITDATA_MAX_AGE and falls back to an hour when it is blank or not positive', function (?string $env, int $window): void {
    $config = EnvOverride::with('TELEGRAM_INITDATA_MAX_AGE', $env, fn (): array => require config_path('telegram.php'));

    expect($config['initdata'])->toBe(['max_age' => $window, 'max_exchanges' => 20]);
})->with([
    'not set' => [null, 3600],
    'blank' => ['', 3600],
    'zero' => ['0', 3600],
    'negative' => ['-5', 3600],
    'not a number' => ['hour', 3600],
    'two minutes' => ['120', 120],
]);
