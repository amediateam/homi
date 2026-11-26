<?php

namespace Tests\Support;

/**
 * Builds Telegram launch values (`initData`) signed as Telegram signs them, for the verifier and the sign-in tests
 * (WP-40). The default token is the synthetic `TELEGRAM_BOT_TOKEN` of `phpunit.xml`, which is no bot's token, so a
 * value built here is accepted only by a test environment. An independent value built by Python lives in
 * `tests/Fixtures/Telegram/initdata` (`make.py`).
 */
final class InitDataSigner
{
    /** The `TELEGRAM_BOT_TOKEN` of `phpunit.xml`. */
    public const string TOKEN = '123456789:TEST-homi-synthetic-token';

    public const int TELEGRAM_USER_ID = 279058397;

    /**
     * Signs the fields in their order and appends `hash`. A `user` array is written as JSON the way Telegram writes it
     * (Unicode and slashes unescaped); every value is percent-encoded with `rawurlencode`.
     *
     * @param  array<string, mixed>  $fields
     */
    public static function sign(array $fields, ?string $token = null): string
    {
        $values = self::values($fields);
        $values['hash'] = self::hash($values, $token ?? self::TOKEN);

        return self::encode($values);
    }

    /**
     * The fields of an ordinary launch at the given Unix time, with `$overrides` merged in (a `user` override is merged
     * into the user; a null removes the field).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function fields(int $authDate, array $overrides = []): array
    {
        $user = [
            'id' => self::TELEGRAM_USER_ID,
            'first_name' => 'Dilnoza',
            'last_name' => 'Karimova',
            'username' => 'dilnoza_k',
            'language_code' => 'ru',
            'is_premium' => true,
            'allows_write_to_pm' => true,
            'photo_url' => 'https://t.me/i/userpic/320/dilnoza.svg',
        ];

        if (is_array($overrides['user'] ?? null)) {
            $user = array_filter([...$user, ...$overrides['user']], fn (mixed $value): bool => $value !== null);
            unset($overrides['user']);
        }

        $fields = [
            'query_id' => 'AAHdF6IQAAAAAN0XohDhrOrc',
            'user' => $user,
            'auth_date' => (string) $authDate,
            'signature' => 'Wq3-8Rk1Q0cJ9fF4n2Lh7xYb6Vd5Tg0sZe1Mu8Ai3Ko4Pj2Nc7Bw9Rx5Sy6Dq0Ef1Gh2Ij3Kl4Mn5Op6Qr7StA',
        ];

        return array_filter([...$fields, ...$overrides], fn (mixed $value): bool => $value !== null);
    }

    /**
     * An ordinary signed launch at the given Unix time.
     *
     * @param  array<string, mixed>  $overrides  see `fields()`
     */
    public static function valid(int $authDate, array $overrides = []): string
    {
        return self::sign(self::fields($authDate, $overrides));
    }

    /**
     * The signed value with one field replaced and the signature left as it was: what a forger sends.
     */
    public static function tamper(string $raw, string $key, string $value): string
    {
        $pairs = [];

        foreach (explode('&', $raw) as $pair) {
            [$name, $encoded] = explode('=', $pair, 2);
            $pairs[] = urldecode($name) === $key ? $name.'='.rawurlencode($value) : $pair;
        }

        return implode('&', $pairs);
    }

    /**
     * The decoded value of one field of a launch value.
     */
    public static function field(string $raw, string $key): ?string
    {
        foreach (explode('&', $raw) as $pair) {
            [$name, $encoded] = explode('=', $pair, 2);

            if (urldecode($name) === $key) {
                return urldecode($encoded);
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $fields
     * @return array<string, string>
     */
    private static function values(array $fields): array
    {
        $values = [];

        foreach ($fields as $key => $value) {
            $values[$key] = match (true) {
                is_array($value) => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                is_bool($value) => $value ? 'true' : 'false',
                is_scalar($value) => (string) $value,
                default => '',
            };
        }

        return $values;
    }

    /** @param  array<string, string>  $values */
    private static function hash(array $values, string $token): string
    {
        ksort($values, SORT_STRING);
        $lines = [];

        foreach ($values as $key => $value) {
            $lines[] = $key.'='.$value;
        }

        return hash_hmac('sha256', implode("\n", $lines), hash_hmac('sha256', $token, 'WebAppData', true));
    }

    /** @param  array<string, string>  $values */
    private static function encode(array $values): string
    {
        $pairs = [];

        foreach ($values as $key => $value) {
            $pairs[] = rawurlencode($key).'='.rawurlencode($value);
        }

        return implode('&', $pairs);
    }
}
