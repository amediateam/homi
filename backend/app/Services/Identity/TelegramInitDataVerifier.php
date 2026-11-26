<?php

namespace App\Services\Identity;

use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Exceptions\Identity\InvalidInitDataReason;
use Carbon\CarbonImmutable;
use JsonException;

/**
 * Verifies the `initData` of a Mini App launch with the bot token of this environment (WP-40, SEC-REQ-001, DEC-40),
 * as https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app describes it:
 *
 * 1. a value over 4 096 bytes is refused before it is parsed;
 * 2. the value is split on `&` and each pair on its first `=`; key and value are URL-decoded, an empty pair is
 *    skipped and a repeated key refuses the value;
 * 3. `hash` must be 64 lowercase hex digits;
 * 4. the data-check-string is every other pair — `signature` included — sorted by key, as `key=value` lines joined by
 *    `\n`; the secret is the HMAC-SHA-256 of the bot token keyed with `WebAppData`, and `hash` must equal the hex
 *    HMAC-SHA-256 of the data-check-string keyed with the secret (an empty bot token refuses every value);
 * 5. only a signed value is decoded further: `user` must be a JSON object with a positive integer `id`;
 * 6. `auth_date` must be a Unix time no older than the window and at most 60 seconds ahead of the clock.
 *
 * Every refusal is an `InvalidInitData` with its internal reason, or `InitDataExpired` for an old value; neither
 * message contains the value, and every parameter that holds the value or a part of it is a `SensitiveParameter`, so
 * a stack trace shows none of it (SEC-REQ-047). The clock is `CarbonImmutable::now()`.
 */
final readonly class TelegramInitDataVerifier
{
    public const int MAX_BYTES = 4096;

    public const int MAX_FUTURE_SECONDS = 60;

    private const string HASH_PATTERN = '/^[0-9a-f]{64}$/D';

    private const string AUTH_DATE_PATTERN = '/^\d{1,12}$/D';

    private const string START_PARAM_PATTERN = '/^[A-Za-z0-9_-]{1,64}$/D';

    private const string LANGUAGE_CODE_PATTERN = '/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})?$/D';

    private const int LANGUAGE_CODE_MAX_LENGTH = 8;

    /**
     * @param  string  $botToken  the token of this environment's HOMI bot; empty fails every value (fail closed)
     * @param  int  $maxAgeSeconds  the window in which a value is accepted (SEC-REQ-002)
     */
    public function __construct(
        private string $botToken,
        private int $maxAgeSeconds = 3600,
    ) {}

    /**
     * @param  int|null  $maxAgeSeconds  a window for this call instead of the configured one
     *
     * @throws InvalidInitData
     * @throws InitDataExpired
     */
    public function verify(#[\SensitiveParameter] string $raw, ?int $maxAgeSeconds = null): TelegramInitData
    {
        if (strlen($raw) > self::MAX_BYTES) {
            throw new InvalidInitData(InvalidInitDataReason::TooLarge);
        }

        $fields = $this->parse($raw);
        $hash = $fields['hash'] ?? null;

        if ($hash === null || preg_match(self::HASH_PATTERN, $hash) !== 1) {
            throw new InvalidInitData(InvalidInitDataReason::MissingHash);
        }

        unset($fields['hash']);

        if (! $this->signedByBot($fields, $hash)) {
            throw new InvalidInitData(InvalidInitDataReason::BadSignature);
        }

        [$telegramUserId, $user] = $this->user($fields['user'] ?? null);
        $authDate = $this->authDate($fields['auth_date'] ?? null, $maxAgeSeconds ?? $this->maxAgeSeconds);

        return new TelegramInitData(
            telegramUserId: $telegramUserId,
            isPremium: ($user['is_premium'] ?? null) === true,
            hasUsername: is_string($user['username'] ?? null) && $user['username'] !== '',
            hasPhoto: is_string($user['photo_url'] ?? null) && $user['photo_url'] !== '',
            allowsWriteToPm: ($user['allows_write_to_pm'] ?? null) === true,
            languageCode: $this->languageCode($user['language_code'] ?? null),
            authDate: $authDate,
            startParam: $this->matching($fields['start_param'] ?? null, self::START_PARAM_PATTERN),
            fingerprint: substr(hash('sha256', $hash), 0, 12),
        );
    }

    /**
     * @return array<string, string> the decoded pairs in the order they came
     *
     * @throws InvalidInitData for a repeated key
     */
    private function parse(#[\SensitiveParameter] string $raw): array
    {
        $fields = [];

        foreach (explode('&', $raw) as $pair) {
            if ($pair === '') {
                continue;
            }

            [$key, $value] = array_pad(explode('=', $pair, 2), 2, '');
            $key = urldecode($key);

            if (array_key_exists($key, $fields)) {
                throw new InvalidInitData(InvalidInitDataReason::DuplicateKey);
            }

            $fields[$key] = urldecode($value);
        }

        return $fields;
    }

    /** @param  array<string, string>  $fields  every pair but `hash` */
    private function signedByBot(#[\SensitiveParameter] array $fields, #[\SensitiveParameter] string $hash): bool
    {
        if (trim($this->botToken) === '') {
            return false;
        }

        ksort($fields, SORT_STRING);
        $lines = [];

        foreach ($fields as $key => $value) {
            $lines[] = $key.'='.$value;
        }

        $secret = hash_hmac('sha256', $this->botToken, 'WebAppData', true);

        return hash_equals(hash_hmac('sha256', implode("\n", $lines), $secret), $hash);
    }

    /**
     * @return array{int, array<array-key, mixed>} the Telegram user id and the decoded user object
     *
     * @throws InvalidInitData
     */
    private function user(#[\SensitiveParameter] ?string $json): array
    {
        if ($json === null) {
            throw new InvalidInitData(InvalidInitDataReason::BadUser);
        }

        try {
            $user = json_decode($json, true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidInitData(InvalidInitDataReason::BadUser);
        }

        $id = is_array($user) && ! array_is_list($user) ? ($user['id'] ?? null) : null;

        if (! is_array($user) || ! is_int($id) || $id <= 0) {
            throw new InvalidInitData(InvalidInitDataReason::BadUser);
        }

        return [$id, $user];
    }

    /**
     * @throws InvalidInitData
     * @throws InitDataExpired
     */
    private function authDate(#[\SensitiveParameter] ?string $value, int $maxAgeSeconds): CarbonImmutable
    {
        if ($value === null || preg_match(self::AUTH_DATE_PATTERN, $value) !== 1) {
            throw new InvalidInitData(InvalidInitDataReason::BadAuthDate);
        }

        $authDate = (int) $value;
        $now = CarbonImmutable::now()->getTimestamp();

        if ($authDate - $now > self::MAX_FUTURE_SECONDS) {
            throw new InvalidInitData(InvalidInitDataReason::FutureAuthDate);
        }

        if ($now - $authDate > $maxAgeSeconds) {
            throw new InitDataExpired;
        }

        return CarbonImmutable::createFromTimestampUTC($authDate);
    }

    /** The IETF tag of the user's language, or null when Telegram sent none or a value that is not one. */
    private function languageCode(mixed $value): ?string
    {
        $code = $this->matching($value, self::LANGUAGE_CODE_PATTERN);

        return $code !== null && strlen($code) <= self::LANGUAGE_CODE_MAX_LENGTH ? $code : null;
    }

    private function matching(mixed $value, string $pattern): ?string
    {
        return is_string($value) && preg_match($pattern, $value) === 1 ? $value : null;
    }
}
