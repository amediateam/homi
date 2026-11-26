<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\CityStats;
use App\Services\Sources\Legacy\Translators\CityStatsTranslator;

/** @return list<mixed> a golden legacy fixture or a stub fixture, decoded */
function decodedFixture(string $path): array
{
    $decoded = json_decode((string) file_get_contents(dirname(__DIR__, 4)."/resources/fixtures/{$path}.json"), true, flags: JSON_THROW_ON_ERROR);

    return is_array($decoded) && array_is_list($decoded) ? $decoded : throw new LogicException("{$path} is not a list.");
}

it('translates the golden answer into exactly the stub city statistics', function (): void {
    $stub = decodedFixture('v1/cities/default');
    $codes = array_column($stub, 'code');

    expect(CityStatsTranslator::translate(decodedFixture('legacy/cities'), $codes))->toEqual($stub)
        ->and(CityStatsTranslator::toData(decodedFixture('legacy/cities'), $codes))->toEqual(array_map(CityStats::fromArray(...), $stub));
});

it('answers one entry per city of the reference, in its order, and drops a city the reference does not know', function (): void {
    $cities = CityStatsTranslator::translate(decodedFixture('legacy/cities'), ['andijan', 'tashkent']);

    expect(array_column($cities, 'code'))->toBe(['andijan', 'tashkent']);
});

it('gives a city legacy omits zeros and empty objects', function (): void {
    expect(CityStatsTranslator::translate([], ['samarkand']))->toBe([
        ['code' => 'samarkand', 'counts' => ['rent_long' => 0, 'rent_daily' => 0, 'sale' => 0], 'price_presets' => [], 'typical_price' => []],
    ]);
});

it('fills a missing deal of the counts with zero and keeps only deals of the presets and typical prices', function (): void {
    $legacy = [['code' => 'x', 'counts' => ['sale' => 5], 'presets' => ['rent_long' => [300], 'owner' => [1]], 'typical' => ['sale' => 90000, 'other' => 1]]];

    expect(CityStatsTranslator::translate($legacy, ['x'])[0])->toBe([
        'code' => 'x',
        'counts' => ['rent_long' => 0, 'rent_daily' => 0, 'sale' => 5],
        'price_presets' => ['rent_long' => [300]],
        'typical_price' => ['sale' => 90000],
    ]);
});

it('fails with a contract error on a broken answer', function (array $legacy, string $key): void {
    try {
        CityStatsTranslator::translate($legacy, ['x']);
    } catch (LegacyContractError $error) {
        expect($error->path)->toBe('/api/cities')->and($error->keys)->toBe($key === '' ? [] : [$key]);

        return;
    }

    throw new LogicException('The translation did not fail.');
})->with([
    'not a list' => [['x' => ['code' => 'x']], '(answer)'],
    'a city without a code' => [[['counts' => []]], '0.code'],
    'counts that are not an object' => [[['code' => 'x', 'counts' => 5]], 'x.counts'],
    'a negative count' => [[['code' => 'x', 'counts' => ['sale' => -1]]], ''],
    'a count as text' => [[['code' => 'x', 'counts' => ['sale' => '5']]], ''],
]);
