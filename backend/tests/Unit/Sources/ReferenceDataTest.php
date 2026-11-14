<?php

use App\Enums\Deal;
use App\Services\Sources\Data\CityData;
use App\Services\Sources\Data\CityStats;
use App\Services\Sources\Data\GeoPoint;
use App\Services\Sources\Data\NamedCode;
use App\Services\Sources\Data\ReferenceData;

/** @return array<string, mixed> */
function cityArray(array $overrides = []): array
{
    return [
        'code' => 'tashkent', 'name' => 'Ташкент', 'center' => ['lat' => 41.3111, 'lon' => 69.2797], 'zoom' => 12,
        'is_region' => false, 'has_metro' => true, 'has_median' => true,
        'districts' => [['code' => 'yunusabad', 'name' => 'Юнусабадский']],
        'zones' => [['code' => 'center', 'name' => 'Центр']],
        ...$overrides,
    ];
}

/** @return array<string, mixed> */
function referenceArray(array $overrides = []): array
{
    return [
        'rates' => ['usd_uzs' => 12800],
        'map' => ['tiles_url' => null],
        'features' => ['pets'],
        'locales' => [['code' => 'ru', 'name' => 'Русский']],
        'cities' => [cityArray()],
        'renovations' => ['rent_long' => [['code' => 'euro', 'name' => 'Евроремонт']], 'rent_daily' => [], 'sale' => []],
        'appliances' => [['code' => 'washer', 'name' => 'Стиральная машина']],
        'price_presets' => ['rent_long' => [300, 400], 'rent_daily' => [20], 'sale' => [50000]],
        ...$overrides,
    ];
}

it('reads a city with its center, flags, districts and zones', function (): void {
    $city = CityData::fromArray(cityArray());

    expect($city->center)->toEqual(new GeoPoint(41.3111, 69.2797))
        ->and($city->zoom)->toBe(12)
        ->and($city->hasMetro)->toBeTrue()
        ->and($city->districts)->toEqual([new NamedCode('yunusabad', 'Юнусабадский')]);
});

it('reads the reference data with every deal', function (): void {
    $data = ReferenceData::fromArray(referenceArray());

    expect($data->usdUzs)->toBe(12800.0)
        ->and($data->tilesUrl)->toBeNull()
        ->and($data->features)->toBe(['pets'])
        ->and($data->cities[0]->code)->toBe('tashkent')
        ->and($data->renovations[Deal::RentLong->value])->toEqual([new NamedCode('euro', 'Евроремонт')])
        ->and($data->renovations[Deal::Sale->value])->toBe([])
        ->and($data->pricePresets[Deal::RentDaily->value])->toBe([20]);
});

it('refuses reference data that misses or mistypes a field', function (array $data, string $field): void {
    expect(fn () => ReferenceData::fromArray($data))->toThrow(InvalidArgumentException::class, $field);
})->with([
    'no rates' => [array_diff_key(referenceArray(), ['rates' => true]), 'rates'],
    'a deal missing from the renovations' => [referenceArray(['renovations' => ['rent_long' => [], 'sale' => []]]), 'rent_daily'],
    'a city without a center' => [referenceArray(['cities' => [array_diff_key(cityArray(), ['center' => true])]]), 'center'],
    'a zoom that is not a number' => [referenceArray(['cities' => [cityArray(['zoom' => 'twelve'])]]), 'zoom'],
    'a price preset that is not a whole number' => [referenceArray(['price_presets' => ['rent_long' => ['300'], 'rent_daily' => [], 'sale' => []]]), 'price_presets'],
]);

it('reads city statistics whose presets and typical prices may lack a deal', function (): void {
    $stats = CityStats::fromArray([
        'code' => 'tashkent',
        'counts' => ['rent_long' => 4120, 'rent_daily' => 310, 'sale' => 2890],
        'price_presets' => ['rent_long' => [300, 400]],
        'typical_price' => ['rent_long' => 550, 'sale' => 78000],
    ]);

    expect($stats->counts)->toBe(['rent_long' => 4120, 'rent_daily' => 310, 'sale' => 2890])
        ->and($stats->pricePresets)->toBe(['rent_long' => [300, 400]])
        ->and($stats->typicalPrice)->toBe(['rent_long' => 550, 'sale' => 78000]);
});

it('refuses city statistics without all three counts or with an unknown deal', function (array $data): void {
    expect(fn () => CityStats::fromArray(['code' => 'tashkent', 'counts' => ['rent_long' => 1, 'rent_daily' => 0, 'sale' => 2], 'price_presets' => [], 'typical_price' => [], ...$data]))
        ->toThrow(InvalidArgumentException::class);
})->with([
    'a count missing' => [['counts' => ['rent_long' => 1, 'sale' => 2]]],
    'an unknown deal' => [['typical_price' => ['rent_weekly' => 10]]],
    'a negative count' => [['counts' => ['rent_long' => -1, 'rent_daily' => 0, 'sale' => 2]]],
]);
