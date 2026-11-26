<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Legacy\Translators\CityStatsTranslator;
use App\Services\Sources\Legacy\Translators\ReferenceTranslator;
use Illuminate\Support\Facades\Http;
use Tests\Support\JsonShape;

/*
 * RK-26: the golden fixtures describe what legacy answers (`resources/fixtures/legacy/README.md`). When the audit of a
 * legacy release changes a shape, the fixture changes, and a translator that no longer fits fails here.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
});

/** @return array<array-key, mixed> */
function golden(string $name): array
{
    $decoded = json_decode((string) file_get_contents(resource_path("fixtures/legacy/{$name}.json")), true, flags: JSON_THROW_ON_ERROR);

    return is_array($decoded) ? $decoded : throw new LogicException("{$name} is not JSON.");
}

/** @return array<array-key, mixed> */
function stubFixture(string $name): array
{
    $decoded = json_decode((string) file_get_contents(resource_path("fixtures/v1/{$name}.json")), true, flags: JSON_THROW_ON_ERROR);

    return is_array($decoded) ? $decoded : throw new LogicException("{$name} is not JSON.");
}

it('translates every golden meta answer into the shape of the stub reference data', function (string $fixture, string $locale): void {
    expect(JsonShape::of(ReferenceTranslator::translate(golden($fixture), $locale)))->toBe(JsonShape::of(stubFixture("reference/default.{$locale}")));
})->with([
    'ru' => ['meta.ru', 'ru'],
    'uz' => ['meta.uz_Latn', 'uz'],
    'en' => ['meta.en', 'en'],
    'without cities' => ['meta.no_cities.ru', 'ru'],
]);

it('translates the golden cities answer into the shape of the stub city statistics', function (): void {
    $stub = stubFixture('cities/default');

    expect(JsonShape::of(CityStatsTranslator::translate(golden('cities'), array_column($stub, 'code'))))->toBe(JsonShape::of($stub));
});

it('fails with a readable message when a required key disappears from a legacy answer', function (string $key): void {
    $meta = golden('meta.ru');
    unset($meta[$key]);
    $key === 'cities' && $meta = array_diff_key($meta, ['districts' => true]);

    try {
        ReferenceTranslator::translate($meta, 'ru');
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe([$key])
            ->and("{$error->path}: {$key} {$error->problem}")->toStartWith("/api/meta: {$key} missing");

        return;
    }

    throw new LogicException("Removing {$key} did not fail the translation.");
})->with(['usd_uzs', 'renovations', 'appliances', 'price_presets', 'cities']);
