<?php

use App\Enums\ListingSort;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Legacy\LegacyClient;
use App\Services\Sources\Legacy\Translators\FiltersTranslator;
use App\Services\Sources\Legacy\Translators\FlowTranslator;
use Tests\Support\FilterArrays;

/** The query of the default filters: what every query below starts with. */
const LEGACY_DEFAULT_QUERY = ['city' => 'tashkent', 'deal' => 'rent_long', 'owner' => 'any', 'types' => ['apartment']];

/** @param  array<string, mixed>  $overrides */
function legacyFilters(array $overrides = []): SearchFilters
{
    return SearchFilters::fromNormalised(FilterArrays::defaults($overrides));
}

it('sends the default filters as city, deal, owner and types only', function (): void {
    expect(FiltersTranslator::toQuery(legacyFilters()))->toBe(LEGACY_DEFAULT_QUERY);
});

it('sends each of the 25 keys of the filters object the legacy way (08 §1.7)', function (array $overrides, array $query): void {
    expect(FiltersTranslator::toQuery(legacyFilters($overrides)))->toBe([...LEGACY_DEFAULT_QUERY, ...$query]);
})->with([
    'city' => [['city' => 'andijan'], ['city' => 'andijan']],
    'deal' => [['deal' => 'sale'], ['deal' => 'sale']],
    'types' => [['types' => ['apartment', 'house']], ['types' => ['apartment', 'house']]],
    'districts' => [['districts' => ['yunusobod', 'chilonzor']], ['districts' => ['yunusobod', 'chilonzor']]],
    'rooms_min' => [['rooms_min' => 2], ['rooms_min' => 2]],
    'rooms_max' => [['rooms_max' => 0], ['rooms_max' => 0]],
    'price_min' => [['price_min' => 300], ['price_min' => 300]],
    'price_max' => [['price_max' => 600], ['price_max' => 600]],
    'zones' => [['zones' => ['center', 'near_center']], ['zones' => ['center', 'near_center']]],
    'near_metro' => [['near_metro' => true], ['near_metro' => true]],
    'below_median' => [['below_median' => true], ['below_median' => true]],
    'owner' => [['owner' => 'owners'], ['owner' => 'owners']],
    'tenant' => [['tenant' => 'family'], ['tenant' => 'family']],
    'pets' => [['pets' => true], ['pets' => true]],
    'pets_only' => [['pets_only' => true], ['pets_only' => true]],
    'furnished true' => [['furnished' => true], ['furnished' => true]],
    'furnished false is sent' => [['furnished' => false], ['furnished' => false]],
    'renovation' => [['renovation' => ['euro']], ['renovation' => ['euro']]],
    'floor_not_first' => [['floor_not_first' => true], ['floor_not_first' => true]],
    'floor_not_last' => [['floor_not_last' => true], ['floor_not_last' => true]],
    'area_min for rent (DEC-62)' => [['area_min' => 40], ['area_min' => 40]],
    'area_max for rent (DEC-62)' => [['area_max' => 90], ['area_max' => 90]],
    'market' => [['deal' => 'sale', 'market' => 'new'], ['deal' => 'sale', 'market' => 'new']],
    'appliances' => [['appliances' => ['washer', 'fridge']], ['appliances' => ['washer', 'fridge']]],
    'posted_days' => [['posted_days' => 3], ['posted_days' => 3]],
    'polygon' => [['polygon' => [[41.3, 69.2], [41.31234567, 69.25], [41.29, 69.3]]], ['polygon' => '41.30000,69.20000;41.31235,69.25000;41.29000,69.30000']],
]);

it('leaves out every boolean that is false and every empty list or null number', function (): void {
    $query = FiltersTranslator::toQuery(legacyFilters(['near_metro' => false, 'pets' => false, 'districts' => [], 'rooms_min' => null, 'furnished' => null]));

    expect($query)->not->toHaveKeys(['near_metro', 'pets', 'districts', 'rooms_min', 'furnished', 'polygon', 'limit', 'sort', 'cursor']);
});

it('writes every key in the order of buildFilterParams and the lists as repeated keys without brackets', function (): void {
    $filters = legacyFilters([
        'types' => ['apartment', 'room'], 'districts' => ['yunusobod'], 'renovation' => ['euro'], 'appliances' => ['washer'],
        'rooms_min' => 1, 'rooms_max' => 3, 'price_min' => 200, 'price_max' => 700, 'area_min' => 30, 'area_max' => 80,
        'posted_days' => 7, 'furnished' => false, 'floor_not_first' => true, 'floor_not_last' => true, 'zones' => ['center'],
        'near_metro' => true, 'below_median' => true, 'tenant' => 'women', 'pets' => true, 'pets_only' => true,
    ]);

    expect(LegacyClient::queryString(FiltersTranslator::toQuery($filters, ListingSort::Cheap, 'abc', 20)))->toBe(
        'city=tashkent&deal=rent_long&owner=any&types=apartment&types=room&districts=yunusobod&renovation=euro'
        .'&appliances=washer&rooms_min=1&rooms_max=3&price_min=200&price_max=700&area_min=30&area_max=80&posted_days=7'
        .'&furnished=false&floor_not_first=true&floor_not_last=true&zones=center&near_metro=true&below_median=true'
        .'&tenant=women&pets=true&pets_only=true&limit=20&sort=cheap&cursor=abc'
    );
});

it('adds the feed\'s limit, a sort other than new and the cursor at the end', function (?ListingSort $sort, ?string $cursor, array $tail): void {
    expect(array_slice(FiltersTranslator::toQuery(legacyFilters(), $sort, $cursor, 20), 4))->toBe($tail);
})->with([
    'new is never sent' => [ListingSort::New, null, ['limit' => 20]],
    'no sort' => [null, null, ['limit' => 20]],
    'cheap with a cursor' => [ListingSort::Cheap, 'opaque', ['limit' => 20, 'sort' => 'cheap', 'cursor' => 'opaque']],
    'ppm' => [ListingSort::Ppm, null, ['limit' => 20, 'sort' => 'ppm']],
]);

it('reads a complete legacy filters object back as it is', function (): void {
    $filters = FilterArrays::defaults(['districts' => ['yunusobod'], 'price_max' => 700, 'furnished' => false, 'polygon' => [[41.3, 69.2], [41.31, 69.25], [41.29, 69.3]]]);

    expect(FiltersTranslator::fromLegacy($filters)->toArray())->toBe($filters);
});

it('fills every missing key of a legacy filters object with its default', function (string $key): void {
    $filters = FilterArrays::defaults();
    unset($filters[$key]);

    expect(FiltersTranslator::fromLegacy($filters)->toArray())->toBe(FilterArrays::defaults());
})->with(FilterArrays::KEYS);

it('maps the old zone string into zones (LB-API-028)', function (): void {
    $legacy = FilterArrays::defaults(['zone' => 'center']);
    unset($legacy['zones']);

    expect(FiltersTranslator::fromLegacy($legacy)->zones)->toBe(['center'])
        ->and(FiltersTranslator::fromLegacy([...$legacy, 'zones' => ['near_center']])->zones)->toBe(['near_center']);
});

it('drops the types the deal does not offer (LB-API-006), apartments when none is left', function (string $deal, array $types, array $kept): void {
    $filters = FiltersTranslator::fromLegacy(FilterArrays::defaults(['deal' => $deal, 'types' => $types]))->toArray();

    expect($filters['types'])->toBe($kept);
})->with([
    'land is not rented' => ['rent_long', ['apartment', 'land'], ['apartment']],
    'commercial is not rented daily' => ['rent_daily', ['house', 'commercial'], ['house']],
    'a room is not sold' => ['sale', ['room'], ['apartment']],
    'an unknown type' => ['sale', ['castle', 'land'], ['land']],
]);

it('reads whole numbers sent as floats and null lists as empty', function (): void {
    $filters = FiltersTranslator::fromLegacy([...FilterArrays::defaults(), 'price_max' => 700.0, 'rooms_min' => 2.0, 'districts' => null, 'owner' => null]);

    expect($filters->priceMax)->toBe(700)
        ->and($filters->roomsMin)->toBe(2)
        ->and($filters->districts)->toBe([])
        ->and($filters->owner->value)->toBe('any');
});

it('refuses a value of the wrong type with a contract error naming the key', function (string $key, mixed $value): void {
    try {
        FiltersTranslator::fromLegacy(FilterArrays::defaults([$key => $value]), FlowTranslator::PATH, 'options.0.filters.');
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe(["options.0.filters.{$key}"])
            ->and($error->path)->toBe(FlowTranslator::PATH);

        return;
    }

    throw new LogicException("{$key} was accepted.");
})->with([
    'deal' => ['deal', 'rent'],
    'tenant' => ['tenant', 'students'],
    'price_max' => ['price_max', '700'],
    'near_metro' => ['near_metro', 'yes'],
    'polygon' => ['polygon', '41.3,69.2;41.31,69.25;41.29,69.3'],
]);
