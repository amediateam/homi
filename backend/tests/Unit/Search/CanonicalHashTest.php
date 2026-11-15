<?php

use App\Services\Search\SearchFilters;
use Tests\Support\FilterArrays;

it('is the SHA-256 of the canonical JSON', function (): void {
    $normalised = FilterArrays::defaults([
        'districts' => ['yunusobod', 'chilonzor'], 'price_min' => 300, 'posted_days' => 3,
        'polygon' => [[41.31, 69.25], [41.3, 69.2], [41.29, 69.27]],
    ]);

    expect(SearchFilters::fromNormalised($normalised)->canonicalHash())
        ->toBe(FilterArrays::independentHash($normalised))
        ->toMatch('/^[0-9a-f]{64}$/');
});

it('ignores posted_days, key order and list order', function (array $other): void {
    $base = FilterArrays::defaults(['districts' => ['chilonzor', 'yunusobod'], 'renovation' => ['cosmetic', 'euro']]);

    expect(SearchFilters::fromNormalised($other)->canonicalHash())
        ->toBe(SearchFilters::fromNormalised($base)->canonicalHash());
})->with([
    'posted_days' => [FilterArrays::defaults(['districts' => ['chilonzor', 'yunusobod'], 'renovation' => ['cosmetic', 'euro'], 'posted_days' => 7])],
    'key order' => [array_reverse(FilterArrays::defaults(['districts' => ['chilonzor', 'yunusobod'], 'renovation' => ['cosmetic', 'euro']]), true)],
    'list order' => [FilterArrays::defaults(['districts' => ['yunusobod', 'chilonzor'], 'renovation' => ['euro', 'cosmetic']])],
]);

it('changes with any filter value', function (array $changed): void {
    expect(SearchFilters::fromNormalised(FilterArrays::defaults($changed))->canonicalHash())
        ->not->toBe(SearchFilters::fromNormalised(FilterArrays::defaults())->canonicalHash());
})->with([
    'city' => [['city' => 'andijan']],
    'price' => [['price_max' => 500]],
    'furnished false' => [['furnished' => false]],
    'pets' => [['pets' => true]],
]);
