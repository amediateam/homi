<?php

namespace App\Services\Telegram;

use App\Exceptions\TelegramException;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\HttpClientException;
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
 * The token is a secret in the request path (SEC-REQ-013): a blank or malformed `telegram.bot.token` fails closed
 * before anything is sent, outside `local` and `testing` it goes only to an `https` address, and no text that leaves
 * this class quotes it — `TelegramException` replaces any token with `bot***`, and the HTTP client's exceptions, whose
 * messages quote the address, are never chained or logged. Telescope keeps no entry of a Bot API request and Pulse
 * groups its address without the token (`TelescopeServiceProvider`, `config/pulse.php`).
 */
final readonly class TelegramClient
{
    /** The Bot API's own address when `telegram.http.base_url` is blank. */
    public const string DEFAULT_BASE_URL = 'https://api.telegram.org';

    /** A token as Telegram issues it: the bot id, a colon and the secret. */
    private const string TOKEN_FORMAT = '/^\d+:[A-Za-z0-9_-]+$/D';

    public function __construct(private Factory $http) {}

    /**
     * Calls a Bot API method and answers its `result` object.
     *
     * @param  array<string, mixed>  $params  sent as the JSON body
     * @return array<array-key, mixed> the `result` of the answer
     *
     * @throws TelegramException when the call is not configured, not answered, or answered with `ok: false`, a status
     *                           that is not `2xx`, or a `result` that is not an object
     */
    public function call(string $method, array $params): array
    {
        if (preg_match('/^[A-Za-z]+$/D', $method) !== 1) {
            throw new LogicException('A Bot API method is a word.');
        }

        $token = self::token($method);
        $base = self::baseUrl($method);

        try {
            $response = $this->http->createPendingRequest()
                ->baseUrl($base)
                ->timeout(self::seconds('telegram.http.timeout', 15))
                ->connectTimeout(self::seconds('telegram.http.connect_timeout', 5))
                ->withoutRedirecting()
                ->acceptJson()
                ->asJson()
                ->withUserAgent('homi-api')
                ->post(self::path($token, $method), $params);
        } catch (HttpClientException|GuzzleException $failure) {
            throw TelegramException::transport($method, $failure::class);
        }

        return $this->result($response, $method, $token);
    }

    /**
     * The `result` of a successful answer; anything else as a `TelegramException` with Telegram's error code (else the
     * HTTP status), its description without the token, and `parameters.retry_after` when Telegram names one.
     *
     * @return array<array-key, mixed>
     */
    private function result(Response $response, string $method, #[\SensitiveParameter] string $token): array
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
     * The configured bot token, or `TelegramException` when it is blank or not of Telegram's form.
     *
     * @throws TelegramException
     */
    private static function token(string $method): string
    {
        $token = Config::get('telegram.bot.token');

        if (! is_string($token) || preg_match(self::TOKEN_FORMAT, trim($token)) !== 1) {
            throw TelegramException::notConfigured($method, 'TELEGRAM_BOT_TOKEN is blank or malformed');
        }

        return trim($token);
    }

    /**
     * The Bot API address; outside `local` and `testing` only an `https` one, since the token travels in the path.
     *
     * @throws TelegramException
     */
    private static function baseUrl(string $method): string
    {
        $configured = Config::get('telegram.http.base_url');
        $base = rtrim(is_string($configured) && trim($configured) !== '' ? trim($configured) : self::DEFAULT_BASE_URL, '/');

        if (! str_starts_with($base, 'https://') && ! app()->environment(['local', 'testing'])) {
            throw TelegramException::notConfigured($method, 'TELEGRAM_API_BASE_URL is not https');
        }

        return $base;
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
