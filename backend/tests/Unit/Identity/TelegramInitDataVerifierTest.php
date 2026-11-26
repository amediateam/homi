<?php

use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Exceptions\Identity\InvalidInitDataReason;
use App\Services\Identity\TelegramInitData;
use App\Services\Identity\TelegramInitDataVerifier;
use Carbon\CarbonImmutable;
use Tests\Support\InitDataSigner;

/** 2026-11-26 09:00:00 UTC, the frozen clock of these tests and the `auth_date` of the Python fixture. */
const INIT_DATA_NOW = 1795683600;

function initDataVerifier(string $token = InitDataSigner::TOKEN, int $maxAge = 3600): TelegramInitDataVerifier
{
    return new TelegramInitDataVerifier($token, $maxAge);
}

/** The reason the verifier gives for refusing the value; fails the test when the value is accepted. */
function initDataRefusal(string $raw, ?TelegramInitDataVerifier $verifier = null): InvalidInitDataReason
{
    try {
        ($verifier ?? initDataVerifier())->verify($raw);
    } catch (InvalidInitData $refusal) {
        return $refusal->reason;
    }

    throw new RuntimeException('The verifier accepted the value.');
}

/** @param  array<string, mixed>  $user  merged into the default user */
function initDataWithUser(array $user): string
{
    return InitDataSigner::valid(INIT_DATA_NOW, ['user' => $user]);
}

beforeEach(fn () => CarbonImmutable::setTestNow(CarbonImmutable::createFromTimestampUTC(INIT_DATA_NOW)));

afterEach(fn () => CarbonImmutable::setTestNow());

it('accepts a value signed with the bot token and keeps only what HOMI needs of it', function (): void {
    $raw = InitDataSigner::valid(INIT_DATA_NOW, ['start_param' => 'flat_100012']);

    $data = initDataVerifier()->verify($raw);

    expect($data)->toEqual(new TelegramInitData(
        telegramUserId: InitDataSigner::TELEGRAM_USER_ID,
        isPremium: true,
        hasUsername: true,
        hasPhoto: true,
        allowsWriteToPm: true,
        languageCode: 'ru',
        authDate: CarbonImmutable::createFromTimestampUTC(INIT_DATA_NOW),
        startParam: 'flat_100012',
        fingerprint: substr(hash('sha256', (string) InitDataSigner::field($raw, 'hash')), 0, 12),
    ));
    expect(var_export($data, true))->not->toContain('Dilnoza')
        ->not->toContain('Karimova')
        ->not->toContain('dilnoza_k')
        ->not->toContain('userpic');
});

it('reads the flags Telegram leaves out as false', function (): void {
    $data = initDataVerifier()->verify(initDataWithUser([
        'is_premium' => null, 'allows_write_to_pm' => null, 'username' => null, 'photo_url' => null, 'language_code' => null,
    ]));

    expect($data->isPremium)->toBeFalse()
        ->and($data->allowsWriteToPm)->toBeFalse()
        ->and($data->hasUsername)->toBeFalse()
        ->and($data->hasPhoto)->toBeFalse()
        ->and($data->languageCode)->toBeNull()
        ->and($data->startParam)->toBeNull();
});

it('takes a flag as set only when Telegram sends true and a name as present only when it is not empty', function (): void {
    $data = initDataVerifier()->verify(initDataWithUser([
        'is_premium' => 'true', 'allows_write_to_pm' => 1, 'username' => '', 'photo_url' => '',
    ]));

    expect($data->isPremium)->toBeFalse()
        ->and($data->allowsWriteToPm)->toBeFalse()
        ->and($data->hasUsername)->toBeFalse()
        ->and($data->hasPhoto)->toBeFalse();
});

it('ignores the order of the fields and empty pairs', function (): void {
    $pairs = explode('&', InitDataSigner::valid(INIT_DATA_NOW));

    expect(initDataVerifier()->verify(implode('&', array_reverse($pairs)))->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(initDataVerifier()->verify('&'.implode('&&', $pairs).'&')->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID);
});

it('refuses a value with one field changed after signing', function (string $key, Closure $change): void {
    $raw = InitDataSigner::valid(INIT_DATA_NOW);

    $forged = InitDataSigner::tamper($raw, $key, $change((string) InitDataSigner::field($raw, $key)));

    expect(initDataRefusal($forged))->toBe(InvalidInitDataReason::BadSignature);
})->with([
    'query_id' => ['query_id', fn (string $value): string => $value.'x'],
    'user' => ['user', fn (string $value): string => str_replace('Dilnoza', 'Dilnozа', $value)],
    'user id' => ['user', fn (string $value): string => str_replace((string) InitDataSigner::TELEGRAM_USER_ID, '279058398', $value)],
    'auth_date' => ['auth_date', fn (string $value): string => (string) ((int) $value - 1)],
    'signature' => ['signature', fn (string $value): string => strrev($value)],
    'hash' => ['hash', fn (string $value): string => ($value[0] === 'a' ? 'b' : 'a').substr($value, 1)],
]);

it('refuses a value with a field added after signing', function (): void {
    $forged = InitDataSigner::valid(INIT_DATA_NOW).'&start_param=flat_100012';

    expect(initDataRefusal($forged))->toBe(InvalidInitDataReason::BadSignature);
});

it('refuses a missing, short or malformed hash before checking the signature', function (Closure $hash): void {
    $raw = InitDataSigner::valid(INIT_DATA_NOW);
    $value = (string) InitDataSigner::field($raw, 'hash');
    $withoutHash = (string) preg_replace('/&hash=[^&]*/', '', $raw);

    $changed = $hash($value);

    expect(initDataRefusal($changed === null ? $withoutHash : $withoutHash.'&hash='.$changed))->toBe(InvalidInitDataReason::MissingHash);
})->with([
    'missing' => [fn (string $value): ?string => null],
    'empty' => [fn (string $value): string => ''],
    'short' => [fn (string $value): string => substr($value, 0, 63)],
    'long' => [fn (string $value): string => $value.'0'],
    'upper case' => [fn (string $value): string => strtoupper($value)],
    'not hex' => [fn (string $value): string => str_repeat('g', 64)],
    'with a line feed' => [fn (string $value): string => $value.'%0A'],
]);

it('refuses a repeated key', function (string $extra): void {
    expect(initDataRefusal(InitDataSigner::valid(INIT_DATA_NOW).$extra))->toBe(InvalidInitDataReason::DuplicateKey);
})->with([
    'auth_date' => ['&auth_date='.INIT_DATA_NOW],
    'hash' => ['&hash='.str_repeat('0', 64)],
    'an encoded key' => ['&%75ser=%7B%7D'],
]);

it('refuses a signed user that is not a JSON object with a positive integer id', function (?string $user): void {
    $fields = InitDataSigner::fields(INIT_DATA_NOW, ['user' => null]);

    $raw = InitDataSigner::sign($user === null ? $fields : [...$fields, 'user' => $user]);

    expect(initDataRefusal($raw))->toBe(InvalidInitDataReason::BadUser);
})->with([
    'missing' => [null],
    'not JSON' => ['Dilnoza'],
    'cut JSON' => ['{"id":279058397,'],
    'a string id' => ['{"id":"279058397"}'],
    'a float id' => ['{"id":279058397.5}'],
    'a zero id' => ['{"id":0}'],
    'a negative id' => ['{"id":-279058397}'],
    'no id' => ['{"first_name":"Dilnoza"}'],
    'an empty object' => ['{}'],
    'a list' => ['[279058397]'],
    'a number' => ['279058397'],
]);

it('refuses a value over 4 096 bytes before reading it', function (): void {
    expect(initDataRefusal(str_repeat('a', TelegramInitDataVerifier::MAX_BYTES + 1)))->toBe(InvalidInitDataReason::TooLarge)
        ->and(initDataRefusal(str_repeat('a', TelegramInitDataVerifier::MAX_BYTES)))->toBe(InvalidInitDataReason::MissingHash);
});

it('refuses an empty value', function (): void {
    expect(initDataRefusal(''))->toBe(InvalidInitDataReason::MissingHash);
});

it('refuses a value signed with another bot token', function (): void {
    $raw = InitDataSigner::sign(InitDataSigner::fields(INIT_DATA_NOW), '987654321:another-bot-token');

    expect(initDataRefusal($raw))->toBe(InvalidInitDataReason::BadSignature);
});

it('refuses every value while no bot token is configured', function (string $configured, string $signedWith): void {
    $raw = InitDataSigner::sign(InitDataSigner::fields(INIT_DATA_NOW), $signedWith);

    expect(initDataRefusal($raw, initDataVerifier($configured)))->toBe(InvalidInitDataReason::BadSignature);
})->with([
    'empty, value signed with the test token' => ['', InitDataSigner::TOKEN],
    'empty, value signed with an empty token' => ['', ''],
    'blank, value signed with the same blank' => ['   ', '   '],
]);

it('accepts a value inside its window and only up to a minute ahead of the clock', function (int $offset): void {
    $raw = InitDataSigner::valid(INIT_DATA_NOW + $offset);

    expect(initDataVerifier()->verify($raw)->authDate->getTimestamp())->toBe(INIT_DATA_NOW + $offset);
})->with([
    'window − 1 s' => [-3599],
    'exactly the window' => [-3600],
    'now' => [0],
    '60 s ahead' => [60],
]);

it('tells an old value apart from one from the future', function (): void {
    expect(fn () => initDataVerifier()->verify(InitDataSigner::valid(INIT_DATA_NOW - 3601)))->toThrow(InitDataExpired::class)
        ->and(initDataRefusal(InitDataSigner::valid(INIT_DATA_NOW + 61)))->toBe(InvalidInitDataReason::FutureAuthDate);
});

it('takes the window from the constructor or from the call', function (): void {
    $raw = InitDataSigner::valid(INIT_DATA_NOW - 61);

    expect(initDataVerifier(maxAge: 61)->verify($raw)->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(initDataVerifier()->verify($raw, 61)->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(fn () => initDataVerifier(maxAge: 60)->verify($raw))->toThrow(InitDataExpired::class)
        ->and(fn () => initDataVerifier()->verify($raw, 60))->toThrow(InitDataExpired::class)
        ->and(fn () => (new TelegramInitDataVerifier(InitDataSigner::TOKEN))->verify(InitDataSigner::valid(INIT_DATA_NOW - 3601)))->toThrow(InitDataExpired::class);
});

it('refuses a signed value without a numeric auth_date', function (?string $authDate): void {
    $raw = InitDataSigner::sign(InitDataSigner::fields(INIT_DATA_NOW, ['auth_date' => $authDate]));

    expect(initDataRefusal($raw))->toBe(InvalidInitDataReason::BadAuthDate);
})->with([
    'missing' => [null],
    'empty' => [''],
    'not a number' => ['yesterday'],
    'negative' => ['-1'],
    'a fraction' => ['1795683600.5'],
    'thirteen digits' => ['1795683600000'],
    'with a line feed' => [INIT_DATA_NOW."\n"],
]);

it('keeps the signature field inside the data-check-string', function (): void {
    $fields = InitDataSigner::fields(INIT_DATA_NOW);
    $signature = (string) $fields['signature'];
    unset($fields['signature']);

    $signedWithout = InitDataSigner::sign($fields).'&signature='.rawurlencode($signature);

    expect(initDataVerifier()->verify(InitDataSigner::valid(INIT_DATA_NOW))->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(initDataRefusal($signedWithout))->toBe(InvalidInitDataReason::BadSignature)
        ->and(initDataVerifier()->verify(InitDataSigner::sign($fields))->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID);
});

it('decodes a space written as + or %20 and a plus written as %2B', function (): void {
    $raw = initDataWithUser(['first_name' => 'Anna Maria', 'last_name' => 'C++ Dev']);

    expect($raw)->toContain('Anna%20Maria')->toContain('C%2B%2B%20Dev')
        ->and(initDataVerifier()->verify($raw)->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(initDataVerifier()->verify(str_replace('%20', '+', $raw))->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(initDataRefusal(str_replace('%2B', '+', $raw)))->toBe(InvalidInitDataReason::BadSignature);
});

it('accepts Unicode names and keeps none of them', function (): void {
    $data = initDataVerifier()->verify(initDataWithUser(['first_name' => 'Ойбек Ўткир', 'last_name' => '李 🏠', 'username' => 'oybek']));

    expect($data->telegramUserId)->toBe(InitDataSigner::TELEGRAM_USER_ID)
        ->and(var_export($data, true))->not->toContain('Ойбек')->not->toContain('李')->not->toContain('oybek');
});

it('refuses a value with the tma prefix of an Authorization header', function (): void {
    expect(initDataRefusal('tma '.InitDataSigner::valid(INIT_DATA_NOW)))->toBe(InvalidInitDataReason::BadSignature);
});

it('keeps a language tag only when it is one', function (?string $sent, ?string $kept): void {
    expect(initDataVerifier()->verify(initDataWithUser(['language_code' => $sent]))->languageCode)->toBe($kept);
})->with([
    'ru' => ['ru', 'ru'],
    'uz' => ['uz', 'uz'],
    'pt-br' => ['pt-br', 'pt-br'],
    'en-US' => ['en-US', 'en-US'],
    'missing' => [null, null],
    'one letter' => ['r', null],
    'a digit' => ['r1', null],
    'two subtags' => ['sr-Latn-RS', null],
    'nine characters' => ['abc-defgh', null],
    'a trailing line feed' => ["ru\n", null],
    'empty' => ['', null],
]);

it('keeps a start parameter only in the alphabet of Telegram links', function (string $sent, ?string $kept): void {
    $raw = InitDataSigner::valid(INIT_DATA_NOW, ['start_param' => $sent]);

    expect(initDataVerifier()->verify($raw)->startParam)->toBe($kept);
})->with([
    'a listing link' => ['flat_100012', 'flat_100012'],
    'with a dash' => ['ref-Ab9', 'ref-Ab9'],
    'sixty-four characters' => [str_repeat('a', 64), str_repeat('a', 64)],
    'sixty-five characters' => [str_repeat('a', 65), null],
    'a space' => ['flat 100012', null],
    'a trailing line feed' => ["flat_100012\n", null],
    'empty' => ['', null],
]);

it('names a value by a fingerprint of its hash that reveals nothing else', function (): void {
    $raw = InitDataSigner::valid(INIT_DATA_NOW);
    $hash = (string) InitDataSigner::field($raw, 'hash');

    $fingerprint = initDataVerifier()->verify($raw)->fingerprint;

    expect($fingerprint)->toMatch('/^[0-9a-f]{12}$/')
        ->toBe(initDataVerifier()->verify($raw)->fingerprint)
        ->not->toBe(substr($hash, 0, 12))
        ->not->toBe(initDataVerifier()->verify(InitDataSigner::valid(INIT_DATA_NOW - 1))->fingerprint);
});

it('puts no part of the value into the message of any refusal', function (string $raw): void {
    $messages = [];

    try {
        initDataVerifier()->verify($raw);
    } catch (Throwable $refusal) {
        for ($error = $refusal; $error !== null; $error = $error->getPrevious()) {
            $messages[] = $error->getMessage();
        }
    }

    expect($messages)->not->toBeEmpty();
    foreach ($messages as $message) {
        expect($message)->not->toContain('Dilnoza')
            ->not->toContain('AAHdF6IQ')
            ->not->toContain((string) INIT_DATA_NOW)
            ->not->toContain((string) InitDataSigner::TELEGRAM_USER_ID)
            ->not->toContain('hash=');
    }
})->with([
    'forged' => [InitDataSigner::tamper(InitDataSigner::valid(INIT_DATA_NOW), 'query_id', 'AAHdF6IQforged')],
    'expired' => [InitDataSigner::valid(INIT_DATA_NOW - 7200)],
    'future' => [InitDataSigner::valid(INIT_DATA_NOW + 7200)],
    'bad user' => [InitDataSigner::sign([...InitDataSigner::fields(INIT_DATA_NOW), 'user' => '{"id":"Dilnoza"'])],
    'duplicate key' => [InitDataSigner::valid(INIT_DATA_NOW).'&query_id=AAHdF6IQ'],
    'too large' => [InitDataSigner::valid(INIT_DATA_NOW).'&pad='.str_repeat('a', 4096)],
]);

it('puts no part of the value into the stack trace of any refusal', function (string $raw): void {
    $ignoreArgs = ini_set('zend.exception_ignore_args', '0');
    $frames = [];

    try {
        initDataVerifier()->verify($raw);
    } catch (Throwable $refusal) {
        for ($error = $refusal; $error !== null; $error = $error->getPrevious()) {
            $frames = [...$frames, ...array_filter(
                $error->getTrace(),
                fn (array $frame): bool => ($frame['class'] ?? null) === TelegramInitDataVerifier::class,
            )];
        }
    } finally {
        ini_set('zend.exception_ignore_args', (string) $ignoreArgs);
    }

    expect($frames)->not->toBeEmpty();
    foreach ($frames as $frame) {
        expect($frame)->toHaveKey('args');
        foreach ($frame['args'] ?? [] as $argument) {
            expect($argument === null || is_int($argument) || $argument instanceof SensitiveParameterValue)
                ->toBeTrue("{$frame['function']}() keeps a ".get_debug_type($argument).' argument in the trace');
        }
    }
})->with([
    'forged' => [InitDataSigner::tamper(InitDataSigner::valid(INIT_DATA_NOW), 'query_id', 'AAHdF6IQforged')],
    'missing hash' => [str_replace('&hash=', '&hush=', InitDataSigner::valid(INIT_DATA_NOW))],
    'expired' => [InitDataSigner::valid(INIT_DATA_NOW - 7200)],
    'future' => [InitDataSigner::valid(INIT_DATA_NOW + 7200)],
    'bad user' => [InitDataSigner::sign([...InitDataSigner::fields(INIT_DATA_NOW), 'user' => '{"id":"Dilnoza"'])],
    'bad auth date' => [InitDataSigner::valid(INIT_DATA_NOW, ['auth_date' => 'yesterday'])],
    'duplicate key' => [InitDataSigner::valid(INIT_DATA_NOW).'&query_id=AAHdF6IQ'],
    'too large' => [InitDataSigner::valid(INIT_DATA_NOW).'&pad='.str_repeat('a', 4096)],
]);

it('verifies the launch value that Python signed on its own', function (): void {
    $raw = trim((string) file_get_contents(dirname(__DIR__, 2).'/Fixtures/Telegram/initdata/valid.txt'));

    $data = initDataVerifier()->verify($raw);

    expect($data->telegramUserId)->toBe(279058397)
        ->and($data->languageCode)->toBe('uz')
        ->and($data->startParam)->toBe('flat_100012')
        ->and($data->isPremium)->toBeTrue()
        ->and($data->hasPhoto)->toBeTrue()
        ->and($data->authDate->getTimestamp())->toBe(INIT_DATA_NOW)
        ->and(initDataRefusal(str_replace('query_id=AAHd', 'query_id=AAHe', $raw)))->toBe(InvalidInitDataReason::BadSignature);
});
