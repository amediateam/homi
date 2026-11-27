<?php

namespace App\Services\Telegram;

use App\Exceptions\TelegramException;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Config;
use LogicException;
use Throwable;

/**
 * The one way HOMI's servers call the Telegram Bot API (WP-43, minimal; WP-50 extends this class instead of adding a
 * second client): `POST {telegram.http.base_url}/bot<token>/<method>` with a JSON body, the timeouts of
 * `telegram.http`, no redirect and one attempt — the retries of `telegram.http` are WP-50's, for its own sends; a
 * caller that must not retry (the share of WP-43) never does.
 *
 * The token is a secret in the request path (SEC-REQ-013): a blank or malformed `telegram.bot.token`, and an address
 * that is not a bare origin (`baseUrlProblem()`), fail closed before anything is sent; outside `local` and `testing`
 * the token goes only to an `https` address, and no text that leaves this class quotes it — `TelegramException`
 * replaces any token with `bot***`, and whatever the HTTP client throws while sending (its exceptions quote the
 * address) is never chained or logged: it becomes `TelegramException::transport()`, named by its class. Telescope
 * keeps no entry of a request to `host()` and Pulse groups its address without the token (`TelescopeServiceProvider`,
 * `config/pulse.php`).
 */
final readonly class TelegramClient
{
    /** The Bot API's own address when `telegram.http.base_url` is blank. */
    public const string DEFAULT_BASE_URL = 'https://api.telegram.org';

    /** A token as Telegram issues it: the bot id, a colon and the secret. */
    private const string TOKEN_FORMAT = '/^\d+:[A-Za-z0-9_-]+$/D';

    /**
     * A byte of the Bot API address outside printable ASCII (`\x21`…`\x7e`): a space, a control character, and every
     * byte of a non-ASCII character (a non-breaking space, a Cyrillic letter, a full-width dot) or of invalid UTF-8.
     * Byte-wise, without `/u`, so a value that is not UTF-8 matches instead of failing the match.
     */
    private const string NOT_PRINTABLE_ASCII = '/[^\x21-\x7e]/';

    /** The whitespace trimmed from both ends of the configured address: ASCII only (PHP's `trim()` default). */
    private const string ASCII_WHITESPACE = " \t\n\r\0\x0B";

    public function __construct(private Factory $http) {}

    /**
     * Calls a Bot API method and answers its `result` object.
     *
     * @param  array<string, mixed>  $params  sent as the JSON body: a Telegram user id and a listing's text, so it is
     *                                        `#[\SensitiveParameter]` and no stack trace shows it
     * @return array<array-key, mixed> the `result` of the answer
     *
     * @throws TelegramException when the call is not configured, not answered, or answered with `ok: false`, a status
     *                           that is not `2xx`, or a `result` that is not an object
     */
    public function call(string $method, #[\SensitiveParameter] array $params): array
    {
        if (preg_match('/^[A-Za-z]+$/D', $method) !== 1) {
            throw new LogicException('A Bot API method is a word.');
        }

        $problem = self::problem();

        if ($problem !== null) {
            throw TelegramException::notConfigured($method, $problem);
        }

        $token = self::configuredToken();

        try {
            $response = $this->http->createPendingRequest()
                ->baseUrl(self::baseUrl())
                ->timeout(self::seconds('telegram.http.timeout', 15))
                ->connectTimeout(self::seconds('telegram.http.connect_timeout', 5))
                ->withoutRedirecting()
                ->acceptJson()
                ->asJson()
                ->withUserAgent('homi-api')
                ->post(self::path($token, $method), $params);
        } catch (Throwable $failure) {
            throw TelegramException::transport($method, $failure::class);
        }

        return $this->result($response, $method, $token);
    }

    /**
     * The `result` of a successful answer; anything else as a `TelegramException` with Telegram's error code (else the
     * HTTP status), its description without the token, and `parameters.retry_after` when Telegram names one. The
     * response is `#[\SensitiveParameter]`: its effective address and transfer stats hold the token, its body may.
     *
     * @return array<array-key, mixed>
     */
    private function result(#[\SensitiveParameter] Response $response, string $method, #[\SensitiveParameter] string $token): array
    {
        try {
            $answer = json_decode($response->body(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            $answer = null;
        }

        if (! is_array($answer)) {
            throw new TelegramException($method, 'an answer that is not a Bot API object', $response->status());
        }

        if ($response->successful() && ($answer['ok'] ?? null) === true) {
            return is_array($answer['result'] ?? null) ? $answer['result'] : throw new TelegramException($method, 'a result that is not an object', $response->status());
        }

        $parameters = is_array($answer['parameters'] ?? null) ? $answer['parameters'] : [];
        $description = is_string($answer['description'] ?? null) ? $answer['description'] : 'no description';

        throw new TelegramException(
            $method,
            str_replace($token, '***', $description),
            is_int($answer['error_code'] ?? null) ? $answer['error_code'] : $response->status(),
            is_int($parameters['retry_after'] ?? null) ? $parameters['retry_after'] : null,
        );
    }

    /**
     * Why no call can be sent, or `null` when the bot token and the Bot API address are usable: the names of the env
     * values at fault, never a value. `ShareService` asks it before it reads anything for a share.
     */
    public static function problem(): ?string
    {
        if (preg_match(self::TOKEN_FORMAT, self::configuredToken()) !== 1) {
            return 'TELEGRAM_BOT_TOKEN is blank or malformed';
        }

        return self::baseUrlProblem();
    }

    /**
     * The host of the Bot API address, lower-cased as the HTTP client writes it, or `null` when the address has none
     * or has a byte outside printable ASCII (`problem()` refuses it, so no call goes there); the address is trimmed of
     * ASCII whitespace only, before that check. `TelescopeServiceProvider` keeps no request to it.
     */
    public static function host(): ?string
    {
        $base = self::configuredBaseUrl();
        $host = preg_match(self::NOT_PRINTABLE_ASCII, $base) === 0 ? parse_url($base, PHP_URL_HOST) : null;

        return is_string($host) && $host !== '' ? strtolower($host) : null;
    }

    /** The configured bot token, trimmed (`problem()` checks its form). */
    private static function configuredToken(): string
    {
        $token = Config::get('telegram.bot.token');

        return is_string($token) ? trim($token) : '';
    }

    /** The configured Bot API address, trimmed of ASCII whitespace at both ends, else Telegram's own. */
    private static function configuredBaseUrl(): string
    {
        $configured = Config::get('telegram.http.base_url');
        $configured = is_string($configured) ? trim($configured, self::ASCII_WHITESPACE) : '';

        return $configured !== '' ? $configured : self::DEFAULT_BASE_URL;
    }

    /**
     * Why the Bot API address is not usable, or `null`: it must be a bare origin — `https` (plain `http` only in
     * `local` and `testing`), a host, no user or password, no query or fragment, a port 1…65535 when one is given, no
     * path but `/`, and no backslash and no byte outside printable ASCII (`NOT_PRINTABLE_ASCII`: a space, a control
     * character, any non-ASCII character such as a non-breaking space) once ASCII whitespace is trimmed from both ends —
     * since the token travels in its path. A port over 65 535 is no address to `parse_url()` already.
     */
    private static function baseUrlProblem(): ?string
    {
        $base = self::configuredBaseUrl();
        $parts = preg_match(self::NOT_PRINTABLE_ASCII, $base) !== 0 || str_contains($base, '\\') ? false : parse_url($base);
        $scheme = is_array($parts) ? strtolower($parts['scheme'] ?? '') : '';

        if (! is_array($parts)
            || ! in_array($scheme, ['https', 'http'], true)
            || ($parts['host'] ?? '') === ''
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || (isset($parts['port']) && $parts['port'] < 1)
            || ! in_array($parts['path'] ?? '', ['', '/'], true)) {
            return 'TELEGRAM_API_BASE_URL is not a Bot API address';
        }

        if ($scheme !== 'https' && ! app()->environment(['local', 'testing'])) {
            return 'TELEGRAM_API_BASE_URL is not https';
        }

        return null;
    }

    /** The Bot API address without its trailing `/`; `problem()` has checked it. */
    private static function baseUrl(): string
    {
        return rtrim(self::configuredBaseUrl(), '/');
    }

    private static function path(#[\SensitiveParameter] string $token, string $method): string
    {
        return "bot{$token}/{$method}";
    }

    /** A positive number of seconds from the configuration, else the default (a blank env value casts to 0). */
    private static function seconds(string $key, int $default): int
    {
        $value = Config::get($key);

        return is_numeric($value) && (int) $value > 0 ? (int) $value : $default;
    }
}
