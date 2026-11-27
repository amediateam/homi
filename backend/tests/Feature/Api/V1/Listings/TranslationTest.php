<?php

use App\Models\User;
use App\Services\Listings\TranslationService;
use App\Services\Sources\Legacy\LegacyFakeServer;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Sleep;
use Illuminate\Testing\TestResponse;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\Watchers\RequestWatcher;
use Symfony\Component\HttpFoundation\Response;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-43: `POST /listings/{number}/translation` for real on the legacy driver — legacy's `POST
 * /api/listings/{id}/translate` with the language per `legacy.translation.via`, the cache per listing and locale, the
 * per-user limit of misses, the error mapping, and the promise that no translated text reaches a log line.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    Date::setTestNow('2026-11-27 09:00:00');
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    $this->user = User::factory()->telegram()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/** The translation through the legacy driver, on `LegacyListingsHttp` (an override answers before the fixtures). */
function onLegacyTranslation(?Closure $override = null): void
{
    LegacyListingsHttp::fake($override);
    Feature::globally()->activate('source.listings.translation', ['everyone' => 'legacy']);
}

function translationOf(int $number, string $locale): TestResponse
{
    return test()->postJson("/api/v1/listings/{$number}/translation", [], ['Accept-Language' => $locale]);
}

/** An override answering every translate call of legacy with the text. */
function translatesAs(string $text): Closure
{
    return fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/translate') ? Factory::response(['text' => $text]) : null;
}

/** The fixture texts, masked as HOMI answers them. */
const MASKED_TRANSLATIONS = [
    'uz' => 'Ijaraga 2 xonali kvartira, 54 m². Toza, shinam. Qoʻngʻiroq qiling: +998 ** *** ** 67',
    'en' => 'A 2-room flat for rent, 54 m². Clean and cosy. Call: +998 ** *** ** 67',
];

/** The digit forms of the synthetic number of the translate fixtures (+998001234567). */
const TRANSLATED_PHONE_FORMS = ['+998001234567', '001234567', '1234567'];

it('translates into uz and en through legacy, naming the language with the locale selector of every call', function (string $locale, string $code): void {
    onLegacyTranslation();

    translationOf(100001, $locale)->assertOk()
        ->assertExactJson(['success' => true, 'data' => ['text' => MASKED_TRANSLATIONS[$locale], 'locale' => $locale], 'meta' => ['source' => 'legacy']]);

    $sent = LegacyListingsHttp::sent('/api/listings/100001/translate');
    expect($sent)->toHaveCount(1)
        ->and($sent[0]->method())->toBe('POST')
        ->and($sent[0]->header('Accept-Language'))->toBe([$code])
        ->and($sent[0]->body())->toBe('')
        ->and(LegacyListingsHttp::query($sent[0]))->toBe('');
})->with([['uz', 'uz_Latn'], ['en', 'en']]);

it('names the language in the query or the JSON body when legacy.translation.via says so', function (string $via, string $name, string $query, string $body): void {
    config(['legacy.translation.via' => $via, 'legacy.translation.name' => $name]);
    onLegacyTranslation();

    translationOf(100001, 'uz')->assertOk()->assertJsonPath('data.text', MASKED_TRANSLATIONS['uz']);

    $sent = LegacyListingsHttp::sent('/api/listings/100001/translate')[0];
    expect(LegacyListingsHttp::query($sent))->toBe($query)
        ->and($sent->body())->toBe($body);
})->with([
    'query' => ['query', 'lang', 'lang=uz_Latn', ''],
    'body' => ['body', 'lang', '', '{"lang":"uz_Latn"}'],
    'body under another name' => ['body', 'target', '', '{"target":"uz_Latn"}'],
]);

it('serves a second request from the cache, without legacy and without using the limit, per listing and locale', function (): void {
    onLegacyTranslation();

    translationOf(100001, 'uz')->assertOk();
    translationOf(100001, 'uz')->assertOk()->assertJsonPath('data.text', MASKED_TRANSLATIONS['uz']);
    expect(LegacyListingsHttp::sent('/api/listings/100001/translate'))->toHaveCount(1)
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(1);

    translationOf(100001, 'en')->assertOk()->assertJsonPath('data.text', MASKED_TRANSLATIONS['en']);
    translationOf(100001, 'uz')->assertOk();
    expect(LegacyListingsHttp::sent('/api/listings/100001/translate'))->toHaveCount(2);

    // The entry lives `legacy.cache.translation` seconds (a day).
    $this->travel(86_401)->seconds();
    translationOf(100001, 'uz')->assertOk();
    expect(LegacyListingsHttp::sent('/api/listings/100001/translate'))->toHaveCount(3);
});

it('answers ru with 422 translation_not_needed without asking legacy or counting a miss', function (): void {
    onLegacyTranslation();

    translationOf(100001, 'ru')->assertStatus(422)->assertJsonPath('code', 'translation_not_needed');
    expect(Http::recorded())->toHaveCount(0)
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(0);
});

it('answers legacy\'s 404 with 404 not_found and leaves the card unmarked', function (int $number): void {
    onLegacyTranslation();

    translationOf($number, 'uz')->assertNotFound()->assertJsonPath('code', 'not_found');
    expect(LegacyListingsHttp::sent("/api/listings/{$number}/translate"))->toHaveCount(1)
        ->and(Cache::has("legacy:v1:listings:gone:{$number}"))->toBeFalse()
        ->and(Cache::has("legacy:translation:{$number}:uz"))->toBeFalse();
})->with([
    'a listing without an original text' => [100024],
    'a listing legacy does not know' => [424242],
]);

it('answers 404 for a native number without asking legacy', function (): void {
    onLegacyTranslation();

    translationOf(10000001, 'uz')->assertNotFound()->assertJsonPath('code', 'not_found');
    expect(Http::recorded())->toHaveCount(0);
});

it('answers 503 translation_unavailable when legacy cannot translate, caches nothing and asks again next time', function (Closure $answer): void {
    $failing = true;
    onLegacyTranslation(function (Request $request) use (&$failing, $answer): ?PromiseInterface {
        return $failing && str_ends_with(LegacyListingsHttp::path($request), '/translate') ? $answer($request) : null;
    });

    translationOf(100001, 'uz')->assertStatus(503)->assertJsonPath('code', 'translation_unavailable');
    expect(LegacyListingsHttp::sent('/api/listings/100001/translate'))->toHaveCount(1)
        ->and(Cache::has('legacy:translation:100001:uz'))->toBeFalse();

    $failing = false;
    translationOf(100001, 'uz')->assertOk()->assertJsonPath('data.text', MASKED_TRANSLATIONS['uz']);
})->with([
    'a timeout, not retried' => [fn (Request $request): PromiseInterface => (Http::failedConnection())($request)],
    'a server error, not retried' => [fn (): PromiseInterface => Factory::response(['detail' => 'x'], 503)],
    'an empty text' => [fn (): PromiseInterface => Factory::response(['text' => '  '])],
    'a text that is not one' => [fn (): PromiseInterface => Factory::response(['text' => ['a']])],
    'no text' => [fn (): PromiseInterface => Factory::response(['detail' => 'ok'])],
    'a 422' => [fn (): PromiseInterface => Factory::response(['detail' => 'invalid_locale'], 422)],
    'legacy\'s daily limit' => [fn (): PromiseInterface => Factory::response(['detail' => 'too many today'], 429)],
]);

it('takes 15 s at most for legacy\'s answer', function (): void {
    $timeouts = new ArrayObject;
    onLegacyTranslation(function (Request $request, array $options) use ($timeouts): ?PromiseInterface {
        $timeouts[] = $options['timeout'] ?? null;

        return null;
    });

    translationOf(100001, 'uz')->assertOk();
    expect($timeouts->getArrayCopy())->toBe([15]);
});

it('answers unsupported with 503 translation_unavailable without asking legacy', function (): void {
    config(['legacy.translation.via' => 'unsupported']);
    onLegacyTranslation();

    translationOf(100001, 'uz')->assertStatus(503)->assertJsonPath('code', 'translation_unavailable');
    expect(Http::recorded())->toHaveCount(0);
});

it('passes legacy\'s pause on as 403 paused', function (): void {
    onLegacyTranslation(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/translate') ? Factory::response(['detail' => 'paused'], 403) : null);

    translationOf(100001, 'uz')->assertForbidden()->assertJsonPath('code', 'access_denied')->assertJsonPath('reason', 'paused');
});

it('limits the misses of a user to 30 an hour: the 31st answers 429 without a reason, hits keep working', function (): void {
    onLegacyTranslation(translatesAs('A text.'));

    foreach (range(1, 30) as $number) {
        translationOf($number, 'uz')->assertOk();
    }

    $limited = translationOf(31, 'uz')->assertTooManyRequests()
        ->assertExactJson(['success' => false, 'message' => 'Too Many Attempts.', 'code' => 'rate_limited']);
    expect((int) $limited->headers->get('Retry-After'))->toBeGreaterThan(0)->toBeLessThanOrEqual(3600)
        ->and(LegacyListingsHttp::sent('/api/listings/31/translate'))->toBe([]);

    translationOf(1, 'uz')->assertOk()->assertJsonPath('data.text', 'A text.');
    translationOf(30, 'uz')->assertOk();

    // Another user has his own count.
    $this->app['auth']->forgetGuards();
    Sanctum::actingAs(User::factory()->telegram()->create(), ['app:read', 'app:write']);
    translationOf(31, 'uz')->assertOk();

    $this->app['auth']->forgetGuards();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
    $this->travel(3601)->seconds();
    translationOf(32, 'uz')->assertOk();
});

it('counts a miss that failed', function (): void {
    config(['rate_limits.translation.per_hour' => 1]);
    onLegacyTranslation(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/translate') ? Factory::response(['detail' => 'x'], 500) : null);

    translationOf(100001, 'uz')->assertStatus(503);
    translationOf(100001, 'uz')->assertTooManyRequests();
    expect(LegacyListingsHttp::sent('/api/listings/100001/translate'))->toHaveCount(1);
});

it('keeps the translated text out of every log line, and the cache holds it masked', function (): void {
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = $entry->message.' '.json_encode($entry->context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    });
    $answers = [
        Factory::response(['text' => ['Qoʻngʻiroq qiling: +998001234567']]),
        Factory::response(['text' => 'Qoʻngʻiroq qiling: +998001234567', 'detail' => 'Qoʻngʻiroq'], 500),
        Factory::response('Qoʻngʻiroq qiling: +998001234567', 422),
    ];
    onLegacyTranslation(function (Request $request) use (&$answers): ?PromiseInterface {
        return str_ends_with(LegacyListingsHttp::path($request), '/translate') ? array_shift($answers) : null;
    });

    foreach (range(1, 3) as $attempt) {
        translationOf(100001, 'uz')->assertStatus(503);
    }

    translationOf(100001, 'uz')->assertOk();
    translationOf(100001, 'en')->assertOk();

    $written = implode("\n", $lines->getArrayCopy());
    expect($lines->count())->toBeGreaterThan(0)
        ->and($written)->toContain('/api/listings/{n}/translate')
        ->not->toContain('Qoʻngʻiroq')
        ->not->toContain('Ijaraga')
        ->not->toContain('Clean and cosy');
    foreach (TRANSLATED_PHONE_FORMS as $digits) {
        expect($written)->not->toContain($digits)
            ->and(json_encode(Cache::get('legacy:translation:100001:uz'), JSON_UNESCAPED_UNICODE))->not->toContain($digits);
    }
    expect(Cache::get('legacy:translation:100001:uz'))->toBe(['text' => MASKED_TRANSLATIONS['uz'], 'locale' => 'uz']);
});

it('keeps no translated text in Telescope: neither the answer\'s data.text nor the cache entry', function (): void {
    onLegacyTranslation();
    $response = translationOf(100001, 'uz')->assertOk();
    $kept = (fn (Response $answer): mixed => $this->response($answer))->call(new RequestWatcher([]), $response->baseResponse);
    $keeps = fn (IncomingEntry $entry): bool => collect(Telescope::$filterUsing)->every(fn (callable $filter): bool => $filter($entry));
    config(['telescope.record_all' => true]);

    expect(Telescope::$hiddenResponseParameters)->toContain('data.text')
        ->and($kept['data']['text'])->toBe('********')
        ->and(json_encode($kept, JSON_UNESCAPED_UNICODE))->not->toContain('Ijaraga')
        ->and($keeps(IncomingEntry::make(['type' => 'set', 'key' => 'legacy:translation:100001:uz', 'value' => MASKED_TRANSLATIONS['uz']])->type(EntryType::CACHE)))->toBeFalse()
        ->and($keeps(IncomingEntry::make(['type' => 'hit', 'key' => 'stub:translation:100001:en', 'value' => 'x'])->type(EntryType::CACHE)))->toBeFalse()
        ->and($keeps(IncomingEntry::make(['type' => 'set', 'key' => 'legacy:v1:listings:count:ru:abc', 'value' => 3])->type(EntryType::CACHE)))->toBeTrue();
});

it('answers every legacy listing that has an original text from the fake server, in uz_Latn and en only', function (): void {
    $server = app(LegacyFakeServer::class);
    $ask = fn (int $number, string $language): int => $server->factory()->withHeaders(['X-Service-Key' => 'k', 'Accept-Language' => $language])->post("https://legacy.invalid/api/listings/{$number}/translate")->status();

    expect($ask(100001, 'uz_Latn'))->toBe(200)
        ->and($ask(100005, 'en'))->toBe(200)
        ->and($ask(100001, 'ru'))->toBe(422)
        ->and($ask(100024, 'en'))->toBe(404)
        ->and($ask(999999, 'en'))->toBe(404);
});
