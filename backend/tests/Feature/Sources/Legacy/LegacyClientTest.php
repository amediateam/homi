<?php

use App\Enums\AccessReason;
use App\Exceptions\AccessDenied;
use App\Exceptions\ApiException;
use App\Exceptions\Listings\DailyLimitReached;
use App\Exceptions\Sources\LegacyContractError;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Legacy\LegacyCall;
use App\Services\Sources\Legacy\LegacyClient;
use Carbon\CarbonImmutable;
use GuzzleHttp\Exception\TransferException;
use GuzzleHttp\Psr7\Response;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;

const LEGACY_TEST_KEY = 'svc-key-7f3a9c';

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config([
        'legacy.fake' => false,
        'legacy.base_url' => 'https://legacy.test',
        'legacy.service_key' => LEGACY_TEST_KEY,
    ]);
});

function legacyClient(): LegacyClient
{
    return app(LegacyClient::class);
}

/** The exception a legacy call throws. */
function legacyFailure(callable $call): ApiException
{
    try {
        $call();
    } catch (ApiException $failure) {
        return $failure;
    }

    throw new LogicException('The legacy call did not fail.');
}

/**
 * Every log line written while the callable runs, as message and context.
 *
 * @return list<array{level: string, message: string, context: array<array-key, mixed>}>
 */
function legacyLogs(callable $run): array
{
    $entries = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($entries): void {
        $entries[] = ['level' => $entry->level, 'message' => $entry->message, 'context' => $entry->context];
    });

    try {
        $run();
    } catch (ApiException) {
        // The outcome is the log here.
    }

    return array_values($entries->getArrayCopy());
}

it('sends the key in the configured header with its prefix, JSON accept and its user agent', function (): void {
    config(['legacy.auth.header' => 'Authorization', 'legacy.auth.prefix' => 'Bearer ']);
    Http::fake(['legacy.test/*' => Http::response(['ok' => true])]);

    expect(legacyClient()->get('/api/cities'))->toBe(['ok' => true]);

    Http::assertSent(fn (Request $request): bool => $request->url() === 'https://legacy.test/api/cities'
        && $request->header('Authorization') === ['Bearer '.LEGACY_TEST_KEY]
        && $request->header('Accept') === ['application/json']
        && $request->header('User-Agent') === ['homi-api']);
});

it('uses X-Service-Key without a prefix by default', function (): void {
    Http::fake(['legacy.test/*' => Http::response([])]);

    legacyClient()->get('/api/cities');

    Http::assertSent(fn (Request $request): bool => $request->header('X-Service-Key') === [LEGACY_TEST_KEY]);
});

it('never calls legacy without a key', function (): void {
    config(['legacy.service_key' => '']);
    Http::fake();

    expect(legacyFailure(fn () => legacyClient()->get('/api/cities')))->toBeInstanceOf(SourceUnavailable::class);
    Http::assertNothingSent();
});

it('asks legacy for the language of the call, with uz as uz_Latn (CF-006)', function (string $locale, string $legacy): void {
    Http::fake(['legacy.test/*' => Http::response([])]);

    legacyClient()->get('/api/meta', [], new LegacyCall($locale));

    Http::assertSent(fn (Request $request): bool => $request->header('Accept-Language') === [$legacy]);
})->with([
    'ru' => ['ru', 'ru'],
    'uz' => ['uz', 'uz_Latn'],
    'en' => ['en', 'en'],
]);

it('can send the language and the currency in the query or as a header instead', function (): void {
    config(['legacy.locale.via' => 'query', 'legacy.locale.name' => 'lang', 'legacy.currency.via' => 'header', 'legacy.currency.name' => 'X-Currency']);
    Http::fake(['legacy.test/*' => Http::response([])]);

    legacyClient()->get('/api/meta', [], new LegacyCall('uz', 'UZS'));

    Http::assertSent(fn (Request $request): bool => $request->url() === 'https://legacy.test/api/meta?lang=uz_Latn'
        && $request->header('Accept-Language') === []
        && $request->header('X-Currency') === ['UZS']);
});

it('sends no currency by default', function (): void {
    Http::fake(['legacy.test/*' => Http::response([])]);

    legacyClient()->get('/api/meta', [], new LegacyCall('ru', 'UZS'));

    Http::assertSent(fn (Request $request): bool => ! str_contains($request->url(), 'UZS') && ! in_array('UZS', array_merge(...array_values($request->headers())), true));
});

it('writes repeated query keys the legacy way, without brackets', function (): void {
    Http::fake(['legacy.test/*' => Http::response(['items' => []])]);

    legacyClient()->get('/api/feed', ['types' => ['flat', 'house'], 'q' => 'two words', 'skip' => null, 'owner' => true, 'pets' => false, 'limit' => 20]);

    Http::assertSent(fn (Request $request): bool => $request->url() === 'https://legacy.test/api/feed?types=flat&types=house&q=two+words&owner=true&pets=false&limit=20');
});

it('forwards the request id of the current request, and sends none without one', function (): void {
    Http::fake(['legacy.test/*' => Http::response([])]);

    legacyClient()->get('/api/cities');
    Log::shareContext(['request_id' => 'req-123']);
    legacyClient()->get('/api/cities');

    $sent = Http::recorded()->map(fn (array $pair): array => $pair[0]->header('X-Request-Id'))->all();
    expect($sent)->toBe([[], ['req-123']]);
});

it('tries a read once more after a timeout, then answers unavailable', function (): void {
    Http::fake(['legacy.test/*' => Http::sequence()->pushFailedConnection()->pushFailedConnection()]);

    expect(legacyFailure(fn () => legacyClient()->get('/api/cities')))->toBeInstanceOf(SourceUnavailable::class);
    Http::assertSentCount(2);
    Sleep::assertSequence([Sleep::for(200)->milliseconds()]);
});

it('succeeds when the one retry of a read answers', function (int $status): void {
    Http::fake(['legacy.test/*' => Http::sequence()->push(['detail' => 'busy'], $status)->push(['ok' => true])]);

    expect(legacyClient()->get('/api/cities'))->toBe(['ok' => true]);
    Http::assertSentCount(2);
})->with([502, 503, 504]);

it('does not retry a 404, a 422, a 500 or any POST', function (string $method, int $status): void {
    Http::fake(['legacy.test/*' => Http::response(['detail' => 'x'], $status)]);

    legacyFailure(fn () => $method === 'GET' ? legacyClient()->get('/api/listings/5') : legacyClient()->post('/api/listings/5/share'));

    Http::assertSentCount(1);
    Sleep::assertNeverSlept();
})->with([
    'GET 404' => ['GET', 404],
    'GET 422' => ['GET', 422],
    'GET 500' => ['GET', 500],
    'POST 503' => ['POST', 503],
    'POST 504' => ['POST', 504],
]);

it('sends a POST without a body bare and one with a body as JSON', function (): void {
    Http::fake(['legacy.test/*' => Http::response(['ok' => true])]);

    legacyClient()->post('/api/listings/5/share');
    legacyClient()->post('/api/listings/5/report', ['reason' => 'rented']);

    [$bare, $json] = Http::recorded()->map(fn (array $pair): Request => $pair[0])->all();
    expect($bare->method())->toBe('POST')
        ->and($bare->body())->toBe('')
        ->and($bare->header('Content-Type'))->toBe([])
        ->and($json->body())->toBe('{"reason":"rented"}')
        ->and($json->header('Content-Type'))->toBe(['application/json']);
});

it('maps every legacy outcome to a v1 error', function (callable $answer, string $class, int $status, string $code): void {
    Http::fake(['legacy.test/*' => $answer]);

    $failure = legacyFailure(fn () => legacyClient()->get('/api/listings/5'));

    expect($failure)->toBeInstanceOf($class)
        ->and($failure->status)->toBe($status)
        ->and($failure->errorCode)->toBe($code);
})->with([
    'an empty 200' => [fn () => Http::response('', 200), LegacyContractError::class, 503, 'source_unavailable'],
    'a 204' => [fn () => Http::response(null, 204), LegacyContractError::class, 503, 'source_unavailable'],
    'a 200 that is not JSON' => [fn () => Http::response('<html>', 200), LegacyContractError::class, 503, 'source_unavailable'],
    'a 200 with a JSON scalar' => [fn () => Http::response('"ok"', 200), LegacyContractError::class, 503, 'source_unavailable'],
    '404' => [fn () => Http::response(['detail' => 'Not Found'], 404), SourceNotFound::class, 404, 'not_found'],
    '422' => [fn () => Http::response(['detail' => [['type' => 'literal_error']]], 422), LegacyContractError::class, 503, 'source_unavailable'],
    'a redirect, never followed' => [fn () => Http::response('', 302, ['Location' => 'https://elsewhere.test/']), LegacyContractError::class, 503, 'source_unavailable'],
    '403 paused' => [fn () => Http::response(['detail' => 'paused'], 403), AccessDenied::class, 403, 'access_denied'],
    '401' => [fn () => Http::response(['detail' => 'Unauthorized'], 401), SourceUnavailable::class, 503, 'source_unavailable'],
    '403 with another reason' => [fn () => Http::response(['detail' => 'private'], 403), SourceUnavailable::class, 503, 'source_unavailable'],
    '429 too many today' => [fn () => Http::response(['detail' => 'too many today'], 429, ['Retry-After' => '3600']), DailyLimitReached::class, 429, 'rate_limited'],
    'another 429' => [fn () => Http::response(['detail' => 'slow down'], 429), SourceUnavailable::class, 503, 'source_unavailable'],
    '500' => [fn () => Http::response(['detail' => 'boom'], 500), SourceUnavailable::class, 503, 'source_unavailable'],
]);

it('answers the decoded JSON object or array of a 2xx', function (): void {
    Http::fake(['legacy.test/*' => Http::sequence()->push(['a' => 1])->push([1, 2], 201)]);

    expect(legacyClient()->get('/api/x'))->toBe(['a' => 1])
        ->and(legacyClient()->get('/api/y'))->toBe([1, 2]);
});

it('passes a pause of legacy on as access_denied with the reason paused (DEC-60)', function (): void {
    Http::fake(['legacy.test/*' => Http::response(['detail' => 'paused'], 403)]);

    $failure = legacyFailure(fn () => legacyClient()->get('/api/feed'));

    expect($failure)->toBeInstanceOf(AccessDenied::class)
        ->and($failure instanceof AccessDenied ? $failure->reason : null)->toBe(AccessReason::Paused);
});

it('passes the daily limit on with the seconds of Retry-After, or an hour without a readable one (DEC-59)', function (array $headers, int $seconds): void {
    $this->freezeTime();
    Http::fake(['legacy.test/*' => Http::response(['detail' => 'too many today'], 429, $headers)]);

    $failure = legacyFailure(fn () => legacyClient()->get('/api/listings/5'));

    expect($failure)->toBeInstanceOf(DailyLimitReached::class)
        ->and($failure instanceof DailyLimitReached ? $failure->retryAfter : null)->toBe($seconds);
})->with([
    'seconds' => [['Retry-After' => '5400'], 5400],
    'an HTTP date' => [fn (): array => ['Retry-After' => now()->addSeconds(90)->format(DATE_RFC7231)], 90],
    'none' => [[], 3600],
    'garbage' => [['Retry-After' => 'soon'], 3600],
    'more than a day' => [['Retry-After' => '99999999999999999999'], 86400],
]);

it('logs a refused key as critical, a pause and the daily limit as warnings, and a contract error as error', function (int $status, array $body, string $level, string $message): void {
    Http::fake(['legacy.test/*' => Http::response($body, $status)]);

    $logs = legacyLogs(fn () => legacyClient()->get('/api/listings/5'));
    $line = collect($logs)->firstWhere('message', $message);

    expect($line)->not->toBeNull()
        ->and($line['level'] ?? null)->toBe($level)
        ->and($line['context']['path'] ?? null)->toBe('/api/listings/{n}');
})->with([
    'refused key' => [401, ['detail' => 'Unauthorized'], 'critical', 'Legacy refused the service key.'],
    'pause' => [403, ['detail' => 'paused'], 'warning', 'Legacy is paused.'],
    'daily limit' => [429, ['detail' => 'too many today'], 'warning', 'Legacy answered its daily limit.'],
    'contract error' => [422, ['detail' => []], 'error', 'A legacy answer does not fit its contract.'],
]);

it('counts the daily-limit answers of the day in its warning', function (): void {
    Http::fake(['legacy.test/*' => Http::response(['detail' => 'too many today'], 429)]);

    $first = legacyLogs(fn () => legacyClient()->get('/api/listings/5'));
    $second = legacyLogs(fn () => legacyClient()->get('/api/listings/6'));

    expect(collect($first)->firstWhere('message', 'Legacy answered its daily limit.')['context']['today'] ?? null)->toBe(1)
        ->and(collect($second)->firstWhere('message', 'Legacy answered its daily limit.')['context']['today'] ?? null)->toBe(2);
});

it('never puts the key, the auth header value or a response body into a log line or an exception message', function (callable $answer): void {
    config(['legacy.auth.header' => 'Authorization', 'legacy.auth.prefix' => 'Bearer ']);
    Http::fake(['legacy.test/*' => $answer]);
    $messages = [];

    $logs = legacyLogs(function () use (&$messages): void {
        $failure = legacyFailure(fn () => legacyClient()->get('/api/listings/5'));
        $messages[] = $failure->getMessage();
        $messages[] = (string) $failure;
        $messages[] = $failure->getPrevious()?->getMessage();
    });

    $written = json_encode([$logs, $messages], JSON_THROW_ON_ERROR);
    expect($written)->not->toContain(LEGACY_TEST_KEY)
        ->not->toContain('Bearer ')
        ->not->toContain('+998901234567')
        ->and(collect($messages)->filter()->count())->toBeGreaterThan(0);
})->with([
    'a refused key' => [fn () => Http::response(['detail' => 'Unauthorized', 'echo' => '+998901234567'], 401)],
    'a server error' => [fn () => Http::response('call +998901234567', 500)],
    'a contract error' => [fn () => Http::response(['detail' => [['input' => '+998901234567']]], 422)],
    'a timeout' => [fn () => Http::failedConnection('cURL error 28 for +998901234567')],
]);

it('names its key parameters sensitive, so a stack trace never shows the key', function (): void {
    $parameters = collect((new ReflectionClass(LegacyClient::class))->getMethods())
        ->flatMap(fn (ReflectionMethod $method): array => $method->getParameters())
        ->filter(fn (ReflectionParameter $parameter): bool => $parameter->getName() === 'key');

    expect($parameters)->not->toBeEmpty()
        ->and($parameters->every(fn (ReflectionParameter $parameter): bool => $parameter->getAttributes(SensitiveParameter::class) !== []))->toBeTrue();
});

it('uses the fixtures with a placeholder key in fake mode, and sends nothing to the network', function (): void {
    config(['legacy.fake' => true, 'legacy.service_key' => '']);
    Http::fake();

    $meta = legacyClient()->get('/api/meta', [], new LegacyCall('uz'));

    expect($meta['locale'] ?? null)->toBe('uz_Latn')
        ->and(legacyFailure(fn () => legacyClient()->get('/api/unknown')))->toBeInstanceOf(SourceNotFound::class);
    Http::assertNothingSent();
    expect(Cache::get('legacy:breaker:open_until'))->toBeNull();
});

it('refuses a path that is not relative to the base URL, so the key never goes to another host', function (string $path): void {
    Http::fake();

    expect(fn () => legacyClient()->get($path))->toThrow(LogicException::class);
    Http::assertNothingSent();
})->with(['https://elsewhere.test/api/meta', '//elsewhere.test/api/meta', 'api/meta']);

it('sends the key only to an https base URL outside local and testing', function (): void {
    config(['legacy.base_url' => 'http://legacy.test']);
    Http::fake();
    $this->app->instance('env', 'staging');

    $logs = legacyLogs(fn () => legacyClient()->get('/api/cities'));

    $this->app->instance('env', 'testing');
    Http::assertNothingSent();
    expect(collect($logs)->firstWhere('message', 'The legacy base URL is not https; the service key is not sent.')['level'] ?? null)->toBe('critical');
});

it('refuses a key, a prefix or a header name a header cannot carry, before the HTTP client sees it', function (array $settings): void {
    config($settings);
    Http::fake();

    $logs = legacyLogs(fn () => legacyClient()->get('/api/cities'));

    Http::assertNothingSent();
    expect(collect($logs)->pluck('level')->all())->toBe(['critical'])
        ->and(json_encode($logs, JSON_THROW_ON_ERROR))->not->toContain('line-break');
})->with([
    'a key with a line break' => [['legacy.service_key' => "svc-key\r\nline-break"]],
    'a key ending in a line break' => [['legacy.service_key' => "svc-key-line-break\n"]],
    'a key with a space' => [['legacy.service_key' => 'svc key line-break']],
    'a prefix with a line break' => [['legacy.auth.prefix' => "Bearer\nline-break "]],
    'a header name with a space' => [['legacy.auth.header' => 'X Service Key']],
]);

it('treats any transport error of the HTTP client like a timeout', function (): void {
    Http::fake(['legacy.test/*' => fn () => throw new TransferException('transfer +998901234567', new GuzzleHttp\Psr7\Request('GET', 'https://legacy.test/api/cities'))]);

    $logs = legacyLogs(fn () => legacyClient()->get('/api/cities'));

    Http::assertSentCount(2);
    expect(collect($logs)->firstWhere('message', 'A legacy call failed in transit.'))->not->toBeNull()
        ->and(json_encode($logs, JSON_THROW_ON_ERROR))->not->toContain('+998901234567');
});

it('answers the generic 503 message, naming neither the key nor legacy', function (callable $answer): void {
    Http::fake(['legacy.test/*' => $answer]);

    expect(legacyFailure(fn () => legacyClient()->get('/api/listings/5'))->getMessage())->toBe('The data source is unavailable.');
})->with([
    'a refused key' => [fn () => Http::response([], 401)],
    'a server error' => [fn () => Http::response([], 500)],
    'a contract error' => [fn () => Http::response('', 200)],
]);

it('treats a transfer that broke after the headers as a failure in transit, never passing its body on', function (): void {
    $broken = new RequestException(new Illuminate\Http\Client\Response(new Response(500, [], '{"detail":"call +998901234567"}')));
    Http::fake(['legacy.test/*' => fn () => throw $broken]);

    $failure = null;
    $logs = legacyLogs(function () use (&$failure): void {
        $failure = legacyFailure(fn () => legacyClient()->get('/api/cities'));
    });

    expect($failure)->toBeInstanceOf(SourceUnavailable::class)
        ->and($failure?->getPrevious())->toBeNull()
        ->and(json_encode([$logs, (string) $failure], JSON_THROW_ON_ERROR))->not->toContain('+998901234567')
        ->and(Cache::get('legacy:breaker:failures'))->toBe(1);
    // A fake that throws records no request; the one pause shows the read was tried twice.
    Sleep::assertSleptTimes(1);
});

it('keeps the first failure as the outcome when the limiter has no place for the retry', function (): void {
    config(['legacy.rate.per_second' => 1]);
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-26 12:00:00.900'));
    Http::fake(['legacy.test/*' => Http::response([], 503)]);

    $logs = legacyLogs(fn () => legacyClient()->get('/api/cities'));

    Http::assertSentCount(1);
    expect(collect($logs)->pluck('message'))->toContain('Legacy answered a server error.')
        ->and(Cache::get('legacy:breaker:failures'))->toBe(1);
});

it('tells legacy:ping what the last call ended with', function (): void {
    Http::fake(['legacy.test/*' => Http::sequence()->push([], 401)->push(['ok' => true])]);
    $client = legacyClient();

    legacyFailure(fn () => $client->get('/api/cities'));
    expect($client->lastOutcome())->toBe('HTTP 401');

    $client->get('/api/cities');
    expect($client->lastOutcome())->toBe('HTTP 200');

    config(['legacy.service_key' => '']);
    legacyFailure(fn () => $client->get('/api/cities'));
    expect($client->lastOutcome())->toBe('refused before sending: no service key is configured');
});
