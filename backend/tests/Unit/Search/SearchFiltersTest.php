<?php

use App\Enums\Deal;
use App\Enums\PropertyType;
use App\Services\Search\SearchFilters;
use Tests\Support\FilterArrays;

it('has exactly the 25 keys in the documented order', function (): void {
    expect(array_keys(SearchFilters::fromNormalised(FilterArrays::defaults())->toArray()))->toBe(FilterArrays::KEYS);
});

it('gives back the normalised array it was built from', function (): void {
    $normalised = FilterArrays::defaults([
        'deal' => 'sale', 'types' => ['apartment', 'land'], 'districts' => ['yunusobod'], 'rooms_min' => 2,
        'price_max' => 90000, 'owner' => 'owners', 'furnished' => false, 'renovation' => ['euro'],
        'area_min' => 40, 'market' => 'secondary', 'posted_days' => 7,
        'polygon' => [[41.3, 69.2], [41.31, 69.25], [41.29, 69.27]],
    ]);

    $filters = SearchFilters::fromNormalised($normalised);

    expect($filters->toArray())->toBe($normalised)
        ->and($filters->deal)->toBe(Deal::Sale)
        ->and($filters->types)->toBe([PropertyType::Apartment, PropertyType::Land]);
});

it('keeps every list a list and every unset value null', function (): void {
    $array = SearchFilters::fromNormalised(FilterArrays::defaults())->toArray();

    foreach (['types', 'districts', 'zones', 'renovation', 'appliances'] as $list) {
        expect($array[$list])->toBeArray()->toBeList();
    }

    expect($array['polygon'])->toBeNull()->and($array['furnished'])->toBeNull();
});

it('refuses an array that misses or mistypes a key', function (array $normalised, string $field): void {
    expect(fn () => SearchFilters::fromNormalised($normalised))->toThrow(InvalidArgumentException::class, $field);
})->with([
    'missing key' => [array_diff_key(FilterArrays::defaults(), ['owner' => true]), 'owner'],
    'unknown deal' => [FilterArrays::defaults(['deal' => 'barter']), 'deal'],
    'unknown type' => [FilterArrays::defaults(['types' => ['castle']]), 'types'],
    'string count' => [FilterArrays::defaults(['rooms_min' => '2']), 'rooms_min'],
    'polygon vertex' => [FilterArrays::defaults(['polygon' => [[41.3]]]), 'polygon'],
    'boolean as string' => [FilterArrays::defaults(['pets' => 'true']), 'pets'],
]);
