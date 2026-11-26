<?php

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Legacy\LegacyReferenceSource;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config([
        'telegram.bot.username' => 'homi_stub_bot',
        'telegram.support.username' => 'homi_stub_support',
        'radar.max' => 10,
        'radar.creation_enabled' => false,
    ]);
});

/** @return array<array-key, mixed> a golden legacy fixture, decoded */
function goldenLegacy(string $name): array
{
    $decoded = json_decode((string) file_get_contents(resource_path("fixtures/legacy/{$name}.json")), true, flags: JSON_THROW_ON_ERROR);

    return is_array($decoded) ? $decoded : throw new LogicException("{$name} is not JSON.");
}

/**
 * Legacy over the network double instead of the fixture server: answers the meta of the language asked for and the
 * cities, or the given status for everything.
 */
function legacyOverHttp(?int $failWith = null): void
{
    config(['legacy.fake' => false, 'legacy.base_url' => 'https://legacy.test', 'legacy.service_key' => 'reference-key']);
    $GLOBALS['legacyFailWith'] = $failWith;
    $GLOBALS['legacyCities'] = goldenLegacy('cities');
    Http::fake(['legacy.test/*' => function (Request $request) {
        if ($GLOBALS['legacyFailWith'] !== null) {
            return Http::response(['detail' => $GLOBALS['legacyFailWith'] === 403 ? 'paused' : 'down'], $GLOBALS['legacyFailWith']);
        }

        return str_contains($request->url(), '/api/meta')
            ? Http::response(goldenLegacy('meta.'.($request->header('Accept-Language')[0] ?? 'ru')))
            : Http::response($GLOBALS['legacyCities']);
    }]);
}

function legacyReference(): LegacyReferenceSource
{
    return app(LegacyReferenceSource::class);
}

/** @return list<string> the warnings logged while the callable runs */
function warningsOf(callable $run): array
{
    $warnings = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($warnings): void {
        if ($entry->level === 'warning') {
            $warnings[] = $entry->message;
        }
    });
    $run();

    return array_values($warnings->getArrayCopy());
}

it('answers GET /reference with the legacy driver in the stub shape and values, in every language', function (string $header): void {
    $stub = $this->getJson('/api/v1/reference', ['Accept-Language' => $header])->assertOk()->json();
    Feature::globally()->activate('source.reference', ['everyone' => 'legacy']);

    $legacy = $this->getJson('/api/v1/reference', ['Accept-Language' => $header])->assertOk()->assertJsonPath('meta.source', 'legacy')->json();

    JsonShape::assertSame(ContractShapes::REFERENCE, JsonShape::of($legacy));
    expect($legacy['data'])->toEqual($stub['data']);
})->with(['ru', 'uz', 'en']);

it('answers GET /cities with the legacy driver in the stub shape and values', function (): void {
    $stub = $this->getJson('/api/v1/cities')->assertOk()->json();
    Feature::globally()->activate('source.cities', ['everyone' => 'legacy']);

    $legacy = $this->getJson('/api/v1/cities')->assertOk()->assertJsonPath('meta.source', 'legacy')->json();

    expect(JsonShape::of($legacy))->toBe(JsonShape::of($stub))
        ->and($legacy['data'])->toEqual($stub['data']);
});

it('asks legacy in uz_Latn for a request in uz and answers in uz again (CF-006)', function (): void {
    legacyOverHttp();
    Feature::globally()->activate('source.reference', ['everyone' => 'legacy']);

    $this->getJson('/api/v1/reference', ['Accept-Language' => 'uz'])
        ->assertOk()
        ->assertHeader('Content-Language', 'uz')
        ->assertJsonPath('data.cities.0.name', 'Toshkent')
        ->assertJsonPath('data.locales.1.code', 'uz');

    Http::assertSent(fn (Request $request): bool => $request->header('Accept-Language') === ['uz_Latn']);
});

it('keeps the bot names, the radar limit and the radar switch of HOMI, whatever legacy says (DEC-51)', function (): void {
    Feature::globally()->activate('source.reference', ['everyone' => 'legacy']);

    $this->getJson('/api/v1/reference')
        ->assertOk()
        ->assertJsonPath('data.bot', ['username' => 'homi_stub_bot', 'support_username' => 'homi_stub_support'])
        ->assertJsonPath('data.limits.radars', 10)
        ->assertJsonPath('data.radars_enabled', false);
});

it('sends no second request within ten minutes, and one per language', function (): void {
    legacyOverHttp();
    $ru = SourceContext::system('ru');

    legacyReference()->reference($ru);
    legacyReference()->reference($ru);
    Http::assertSentCount(1);

    legacyReference()->reference(SourceContext::system('uz'));
    Http::assertSentCount(2);

    $this->travel(11)->minutes();
    legacyReference()->reference($ru);
    Http::assertSentCount(3);
});

it('serves the last good answer for up to a day while legacy fails, with a warning', function (int $status): void {
    legacyOverHttp();
    $fresh = legacyReference()->reference(SourceContext::system());
    $cities = legacyReference()->cities(SourceContext::system());

    $this->travel(23)->hours();
    $GLOBALS['legacyFailWith'] = $status;
    $warnings = warningsOf(function () use (&$served, &$servedCities): void {
        $served = legacyReference()->reference(SourceContext::system());
        $servedCities = legacyReference()->cities(SourceContext::system());
    });

    expect($served)->toEqual($fresh)
        ->and($servedCities)->toEqual($cities)
        ->and($warnings)->toContain('Serving the last good legacy answer.');
})->with([
    'a server error' => [500],
    'a pause' => [403],
    'a refused key' => [401],
]);

it('answers 503 source_unavailable on the route when legacy fails and there is no last good answer', function (int $status): void {
    legacyOverHttp($status);
    Feature::globally()->activate('source.reference', ['everyone' => 'legacy']);
    Feature::globally()->activate('source.cities', ['everyone' => 'legacy']);

    $this->getJson('/api/v1/reference')->assertStatus(503)->assertJsonPath('code', 'source_unavailable')->assertJsonMissingPath('reason');
    $this->getJson('/api/v1/cities')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
})->with([
    'a server error' => [500],
    'a pause, which is no outcome of these public methods' => [403],
    'a missing route' => [404],
]);

it('forgets the last good answer after a day', function (): void {
    legacyOverHttp();
    legacyReference()->reference(SourceContext::system());

    $this->travel(25)->hours();
    $GLOBALS['legacyFailWith'] = 500;

    expect(fn () => legacyReference()->reference(SourceContext::system()))->toThrow(SourceUnavailable::class);
});

it('answers one city entry per reference city, zeros for a city legacy omits', function (): void {
    legacyOverHttp();
    $GLOBALS['legacyCities'] = [['code' => 'tashkent', 'counts' => ['rent_long' => 9, 'rent_daily' => 1, 'sale' => 2], 'presets' => [], 'typical' => []]];

    $cities = legacyReference()->cities(SourceContext::system());

    expect(array_map(fn ($city): string => $city->code, $cities))->toBe(['tashkent', 'tashkent_region', 'andijan'])
        ->and($cities[0]->counts)->toBe(['rent_long' => 9, 'rent_daily' => 1, 'sale' => 2])
        ->and($cities[2]->counts)->toBe(['rent_long' => 0, 'rent_daily' => 0, 'sale' => 0]);
});

it('logs a translation that does not fit the contract once, at error, with key names only', function (): void {
    config(['legacy.fake' => false, 'legacy.base_url' => 'https://legacy.test', 'legacy.service_key' => 'reference-key']);
    Http::fake(['legacy.test/*' => Http::response(['usd_uzs' => -1] + goldenLegacy('meta.ru'))]);
    $errors = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($errors): void {
        if ($entry->level === 'error') {
            $errors[] = $entry->context;
        }
    });

    expect(fn () => legacyReference()->reference(SourceContext::system()))->toThrow(SourceUnavailable::class);
    expect($errors->getArrayCopy())->toBe([['path' => '/api/meta', 'problem' => 'missing, not a number or not above zero', 'keys' => ['usd_uzs']]]);
});

it('does not ask legacy again for a minute after a failed refresh, with or without a last good copy', function (bool $withLastGood): void {
    legacyOverHttp();

    if ($withLastGood) {
        legacyReference()->reference(SourceContext::system());
        $this->travel(11)->minutes();
    }

    $GLOBALS['legacyFailWith'] = 500;
    $before = Http::recorded()->count();
    $attempt = function (): void {
        try {
            legacyReference()->reference(SourceContext::system());
        } catch (SourceUnavailable) {
            // Without a last good copy the failure is the answer.
        }
    };

    $attempt();
    $afterFirst = Http::recorded()->count();
    $attempt();
    $attempt();
    expect(Http::recorded()->count())->toBe($afterFirst)
        ->and($afterFirst)->toBeGreaterThan($before);

    $this->travel(61)->seconds();
    $attempt();
    expect(Http::recorded()->count())->toBeGreaterThan($afterFirst);
})->with(['with a last good copy' => true, 'without one' => false]);

it('lets one process refresh a key while the others serve the last good copy', function (): void {
    legacyOverHttp();
    legacyReference()->reference(SourceContext::system());
    $this->travel(11)->minutes();
    $refreshing = Cache::lock('legacy:v1:reference:ru:refresh', 30);
    expect($refreshing->get())->toBeTrue();

    legacyReference()->reference(SourceContext::system());

    Http::assertSentCount(1);
    $refreshing->release();
    legacyReference()->reference(SourceContext::system());
    Http::assertSentCount(2);
});

it('asks legacy for the directories in USD whatever the caller’s currency', function (): void {
    legacyOverHttp();
    config(['legacy.currency.via' => 'header', 'legacy.currency.name' => 'X-Currency']);

    legacyReference()->reference(new SourceContext('ru', 'UZS'));

    Http::assertSent(fn (Request $request): bool => $request->header('X-Currency') === ['USD']);
});

it('answers 503 at once instead of calling legacy while another process makes the first refresh', function (): void {
    legacyOverHttp();
    $refreshing = Cache::lock('legacy:v1:reference:ru:refresh', 30);
    expect($refreshing->get())->toBeTrue();

    expect(fn () => legacyReference()->reference(SourceContext::system()))->toThrow(SourceUnavailable::class);
    Http::assertNothingSent();

    $refreshing->release();
    legacyReference()->reference(SourceContext::system());
    Http::assertSentCount(1);
});

it('does not mark the cities down while another process makes the first refresh of the reference data', function (): void {
    legacyOverHttp();
    $refreshing = Cache::lock('legacy:v1:reference:ru:refresh', 30);
    expect($refreshing->get())->toBeTrue();

    expect(fn () => legacyReference()->cities(SourceContext::system()))->toThrow(SourceUnavailable::class);
    Http::assertNothingSent();

    $refreshing->release();
    expect(legacyReference()->cities(SourceContext::system()))->toHaveCount(3);
});
