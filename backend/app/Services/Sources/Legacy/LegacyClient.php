<?php

namespace App\Services\Sources\Legacy;

use App\Enums\AccessReason;
use App\Exceptions\AccessDenied;
use App\Exceptions\Listings\DailyLimitReached;
use App\Exceptions\Sources\LegacyContractError;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Throwable;

/**
 * The one way HOMI's servers call the legacy API (WP-41, `25` §4.5). Each call, in order: a configured service key
 * (else `SourceUnavailable`, never an anonymous call), the circuit breaker (`LegacyBreaker`), a place in the
 * outbound limiter (`LegacyLimiter`), the request, one retry of a read that failed in transit, and the mapping of
 * legacy's outcome to a v1 error:
 *
 * | Legacy outcome                          | Result                                                            |
 * | --------------------------------------- | ----------------------------------------------------------------- |
 * | `2xx` with a JSON object or array       | the decoded value                                                 |
 * | `2xx` empty or not JSON, `422`, others  | `LegacyContractError` (`503 source_unavailable`)                  |
 * | `404`                                   | `SourceNotFound` (`404 not_found`)                                |
 * | `403` with `detail` `paused`            | `AccessDenied` with the reason `paused`; not a breaker failure    |
 * | `401`, `403`                            | `SourceUnavailable`, a `critical` log line, a breaker failure     |
 * | `429` with `detail` `too many today`    | `DailyLimitReached` (DEC-59); the breaker stays closed            |
 * | `429`                                   | `SourceUnavailable`; the breaker opens for `Retry-After`          |
 * | `5xx`, timeout, connection error        | `SourceUnavailable`, a breaker failure (after the retry of a read)|
 *
 * The key never reaches a log, an exception message or a Telescope entry (`TelescopeServiceProvider` hides the
 * configured header): log lines carry the method, the path template and the status, never a header, a value or a
 * body, and no exception of the HTTP client is chained, because its message quotes the response body. With
 * `legacy.fake` on, the requests go to `LegacyFakeServer` instead of the network.
 */
final class LegacyClient
{
    /** The key sent to the fixtures when `legacy.fake` is on and no key is configured. */
    public const string FAKE_KEY = 'fake-service-key';

    /** The wait of a daily limit that came without a readable `Retry-After`. */
    private const int DAILY_RETRY_AFTER_SECONDS = 3600;

    /** Statuses after which a read is tried once more. */
    private const array RETRY_STATUSES = [502, 503, 504];

    public function __construct(
        private readonly Factory $http,
        private readonly LegacyFakeServer $fake,
        private readonly LegacyLimiter $limiter,
        private readonly LegacyBreaker $breaker,
        private readonly Repository $cache,
    ) {}

    /**
     * @param  array<string, scalar|list<scalar>|null>  $query  repeated keys for lists (`types=a&types=b`, `08` §1.3)
     * @return array<array-key, mixed> the decoded JSON
     *
     * @throws SourceUnavailable|SourceNotFound|AccessDenied|DailyLimitReached
     */
    public function get(string $path, array $query = [], ?LegacyCall $call = null): array
    {
        return $this->call('GET', $path, $query, [], $call ?? new LegacyCall);
    }

    /**
     * Never retried. Without a body, no body and no `Content-Type` are sent, as the legacy client does.
     *
     * @param  array<string, mixed>  $body
     * @return array<array-key, mixed> the decoded JSON
     *
     * @throws SourceUnavailable|SourceNotFound|AccessDenied|DailyLimitReached
     */
    public function post(string $path, array $body = [], ?LegacyCall $call = null): array
    {
        return $this->call('POST', $path, [], $body, $call ?? new LegacyCall);
    }

    /**
     * @param  array<string, scalar|list<scalar>|null>  $query
     * @param  array<string, mixed>  $body
     * @return array<array-key, mixed>
     */
    private function call(string $method, string $path, array $query, array $body, LegacyCall $call): array
    {
        $key = $this->key();
        $probe = $this->breaker->admit();
        $attempts = $method === 'GET' ? 1 + max(0, Config::integer('legacy.retry.times')) : 1;

        try {
            for ($attempt = 1; ; $attempt++) {
                $this->limiter->acquire($call->background);
                $response = $this->send($method, $path, $query, $body, $call, $key);

                if ($attempt >= $attempts || ! $this->retryable($response)) {
                    break;
                }

                Sleep::for(Config::integer('legacy.retry.sleep_ms'))->milliseconds();
            }
        } catch (SourceUnavailable $limited) {
            // The limiter refused before an outcome: the probe is given back for another call.
            $probe?->release();

            throw $limited;
        }

        return $this->settle($response, $method, $path, $probe);
    }

    /**
     * The configured key, the placeholder in fake mode, or `SourceUnavailable`.
     *
     * @throws SourceUnavailable
     */
    private function key(): string
    {
        $key = Config::string('legacy.service_key');

        if ($key !== '') {
            return $key;
        }

        if (Config::boolean('legacy.fake')) {
            return self::FAKE_KEY;
        }

        throw new SourceUnavailable('No legacy service key is configured.');
    }

    /**
     * One request: the answer, or the class name of the transport failure (a timeout or a connection error).
     *
     * @param  array<string, scalar|list<scalar>|null>  $query
     * @param  array<string, mixed>  $body
     */
    private function send(string $method, string $path, array $query, array $body, LegacyCall $call, #[\SensitiveParameter] string $key): Response|string
    {
        [$headers, $query] = $this->selectors($call, $query);
        $url = $path.($query === [] ? '' : '?'.self::queryString($query));
        $request = $this->request($key)->withHeaders($headers);

        try {
            if ($method === 'POST' && $body !== []) {
                return $request->post($url, $body);
            }

            return $request->send($method, $url);
        } catch (ConnectionException $failure) {
            return $failure::class;
        }
    }

    private function request(#[\SensitiveParameter] string $key): PendingRequest
    {
        $factory = Config::boolean('legacy.fake') ? $this->fake->factory() : $this->http;
        $headers = [Config::string('legacy.auth.header') => Config::string('legacy.auth.prefix').$key];
        $requestId = Log::sharedContext()['request_id'] ?? null;

        if (is_string($requestId) && $requestId !== '') {
            $headers['X-Request-Id'] = $requestId;
        }

        return $factory->baseUrl(Config::string('legacy.base_url'))
            ->timeout(Config::integer('legacy.timeout'))
            ->connectTimeout(Config::integer('legacy.connect_timeout'))
            ->withoutRedirecting()
            ->accept('application/json')
            ->withUserAgent('homi-api')
            ->withHeaders($headers);
    }

    /**
     * The language and the currency of the call, as headers or query values per `legacy.locale` and
     * `legacy.currency`.
     *
     * @param  array<string, scalar|list<scalar>|null>  $query
     * @return array{array<string, string>, array<string, scalar|list<scalar>|null>}
     */
    private function selectors(LegacyCall $call, array $query): array
    {
        $headers = [];

        foreach (['locale' => LegacyLocale::toLegacy($call->locale), 'currency' => $call->currency] as $selector => $value) {
            $name = Config::string("legacy.{$selector}.name");

            match (Config::string("legacy.{$selector}.via")) {
                'header' => $headers[$name] = $value,
                'query' => $query[$name] = $value,
                default => null,
            };
        }

        return [$headers, $query];
    }

    /**
     * The query string the legacy way (`URLSearchParams`, `08` §1.3): a list repeats its key without brackets, a
     * space is `+`, `null` is left out and a boolean is `true` or `false`.
     *
     * @param  array<string, scalar|list<scalar>|null>  $query
     */
    public static function queryString(array $query): string
    {
        $pairs = [];

        foreach ($query as $name => $value) {
            foreach (is_array($value) ? $value : [$value] as $item) {
                if ($item === null) {
                    continue;
                }

                $text = is_bool($item) ? ($item ? 'true' : 'false') : (string) $item;
                $pairs[] = urlencode((string) $name).'='.urlencode($text);
            }
        }

        return implode('&', $pairs);
    }

    private function retryable(Response|string $response): bool
    {
        return is_string($response) || in_array($response->status(), self::RETRY_STATUSES, true);
    }

    /**
     * The outcome of the last attempt as a value or an exception; tells the breaker what happened.
     *
     * @return array<array-key, mixed>
     */
    private function settle(Response|string $response, string $method, string $path, ?Lock $probe): array
    {
        $where = ['method' => $method, 'path' => self::template($path)];

        if (is_string($response)) {
            $this->breaker->failed($probe);
            Log::warning('A legacy call failed in transit.', $where + ['failure' => class_basename($response)]);

            throw new SourceUnavailable('The legacy API did not answer.');
        }

        $status = $response->status();
        $where['status'] = $status;
        $decoded = self::decode($response);
        $detail = is_array($decoded) && is_string($decoded['detail'] ?? null) ? $decoded['detail'] : null;

        if ($status >= 200 && $status < 300) {
            $this->breaker->succeeded($probe);

            if ($decoded === null) {
                throw $this->contractError($path, $where, 'a 2xx answer that is empty or not a JSON object or array');
            }

            return $decoded;
        }

        if ($status === 404) {
            $this->breaker->succeeded($probe);

            throw new SourceNotFound;
        }

        if ($status === 403 && $detail === 'paused') {
            $this->breaker->succeeded($probe);
            Log::warning('Legacy is paused.', $where);

            throw new AccessDenied(AccessReason::Paused);
        }

        if ($status === 401 || $status === 403) {
            $this->breaker->failed($probe);
            Log::critical('Legacy refused the service key.', $where);

            throw new SourceUnavailable('The legacy API refused the service key.');
        }

        if ($status === 429 && $detail === 'too many today') {
            $this->breaker->succeeded($probe);
            Log::warning('Legacy answered its daily limit.', $where + ['today' => $this->countDailyLimit()]);

            throw new DailyLimitReached(self::retryAfter($response) ?? self::DAILY_RETRY_AFTER_SECONDS);
        }

        if ($status === 429) {
            $this->breaker->throttled(self::retryAfter($response) ?? Config::integer('legacy.breaker.open_for'), $probe);
            Log::warning('Legacy asked HOMI to slow down.', $where);

            throw new SourceUnavailable('The legacy API is limiting HOMI.');
        }

        if ($status >= 500) {
            $this->breaker->failed($probe);
            Log::warning('Legacy answered a server error.', $where);

            throw new SourceUnavailable('The legacy API failed.');
        }

        $this->breaker->succeeded($probe);

        throw $this->contractError($path, $where, $status === 422 ? 'a 422 to a request HOMI validated' : "an unexpected {$status}");
    }

    /** @return array<array-key, mixed>|null the body as a JSON object or array, else `null` */
    private static function decode(Response $response): ?array
    {
        $body = $response->body();

        if (trim($body) === '') {
            return null;
        }

        try {
            $decoded = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return null;
        }

        return is_array($decoded) ? $decoded : null;
    }

    /** @param  array<string, string|int>  $where */
    private function contractError(string $path, array $where, string $problem): LegacyContractError
    {
        $error = new LegacyContractError(self::template($path), $problem);
        Log::error('A legacy answer does not fit its contract.', $where + $error->context());

        return $error;
    }

    /** How many daily-limit answers legacy gave today (RK-25: a cap counted per service key hits every user at once). */
    private function countDailyLimit(): int
    {
        $key = 'legacy:daily_limit:'.now()->format('Y-m-d');
        $this->cache->add($key, 0, 2 * 86_400);

        return (int) $this->cache->increment($key);
    }

    /** `Retry-After` in seconds: a whole number, or an HTTP date as the seconds until it; else `null`. */
    public static function retryAfter(Response $response): ?int
    {
        $value = trim($response->header('Retry-After'));

        if ($value === '') {
            return null;
        }

        if (ctype_digit($value)) {
            return (int) $value;
        }

        try {
            $at = CarbonImmutable::createFromFormat(DATE_RFC7231, $value);
        } catch (Throwable) {
            return null;
        }

        // Rounded up: a retry never comes before the time legacy named.
        return $at instanceof CarbonImmutable ? max(0, (int) ceil(now()->diffInSeconds($at, false))) : null;
    }

    /** The path with its numbers replaced (`/api/listings/{n}`), for log lines. */
    public static function template(string $path): string
    {
        return (string) preg_replace('/\d+/', '{n}', $path);
    }
}
