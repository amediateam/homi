<?php

use App\Enums\ListingSort;
use App\Services\Search\FilterRejected;
use App\Services\Search\SearchFiltersNormaliser;
use Tests\Support\FilterArrays;

/** The normaliser over the stub reference data (WP-11 fixtures: Tashkent with districts and zones, the region, Andijan). */
function normaliser(): SearchFiltersNormaliser
{
    return app(SearchFiltersNormaliser::class);
}

it('applies the defaults of BR-APP-001 to a request with only city and deal', function (): void {
    expect(normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long'])->toArray())
        ->toBe(FilterArrays::defaults());
});

it('keeps the types a deal offers and drops the others', function (string $deal, string $type, bool $kept): void {
    $types = normaliser()->normalise(['city' => 'tashkent', 'deal' => $deal, 'types' => [$type, 'apartment']])->toArray()['types'];

    expect(in_array($type, $types, true))->toBe($kept);
})->with([
    ['rent_long', 'house', true], ['rent_long', 'room', true], ['rent_long', 'commercial', true], ['rent_long', 'land', false],
    ['rent_daily', 'house', true], ['rent_daily', 'room', true], ['rent_daily', 'commercial', false], ['rent_daily', 'land', false],
    ['sale', 'house', true], ['sale', 'room', false], ['sale', 'commercial', true], ['sale', 'land', true],
]);

it('falls back to apartment when no type is left for the deal', function (): void {
    expect(normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_daily', 'types' => ['land', 'commercial']])->toArray()['types'])
        ->toBe(['apartment']);
});

it('strips the keys that do not apply to the deal (BR-API-029)', function (string $deal, string $key, mixed $value, mixed $stripped): void {
    expect(normaliser()->normalise(['city' => 'tashkent', 'deal' => $deal, $key => $value])->toArray()[$key])->toBe($stripped);
})->with([
    'tenant on daily rent' => ['rent_daily', 'tenant', 'family', null],
    'tenant on sale' => ['sale', 'tenant', 'men', null],
    'pets on daily rent' => ['rent_daily', 'pets', 'true', false],
    'pets_only on sale' => ['sale', 'pets_only', 'true', false],
    'market on long rent' => ['rent_long', 'market', 'new', null],
    'appliances on sale' => ['sale', 'appliances', ['washer'], []],
]);

it('keeps the keys that apply to the deal', function (string $deal, string $key, mixed $value, mixed $kept): void {
    expect(normaliser()->normalise(['city' => 'tashkent', 'deal' => $deal, $key => $value])->toArray()[$key])->toBe($kept);
})->with([
    'tenant on long rent' => ['rent_long', 'tenant', 'family', 'family'],
    'pets on long rent' => ['rent_long', 'pets', 'true', true],
    'area on sale' => ['sale', 'area_min', '40', 40],
    'area on long rent' => ['rent_long', 'area_min', '40', 40],
    'area on daily rent' => ['rent_daily', 'area_max', '90', 90],
    'market on sale' => ['sale', 'market', 'secondary', 'secondary'],
    'appliances on daily rent' => ['rent_daily', 'appliances', ['fridge', 'washer'], ['washer', 'fridge']],
    'furnished false' => ['rent_long', 'furnished', 'false', false],
    'posted days' => ['rent_long', 'posted_days', '3', 3],
]);

it('keeps one geography mode: polygon, else zones, else districts (BR-APP-008)', function (): void {
    $polygon = '41.3,69.2;41.31,69.25;41.29,69.27';
    $all = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', 'polygon' => $polygon, 'zones' => ['center'], 'districts' => ['yunusobod']])->toArray();
    $noPolygon = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', 'zones' => ['center'], 'districts' => ['yunusobod']])->toArray();

    expect([$all['zones'], $all['districts']])->toBe([[], []])
        ->and($all['polygon'])->toHaveCount(3)
        ->and([$noPolygon['zones'], $noPolygon['districts'], $noPolygon['polygon']])->toBe([['center'], [], null]);
});

it('keeps pets_only when both pet filters arrive', function (): void {
    $filters = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', 'pets' => 'true', 'pets_only' => 'true'])->toArray();

    expect([$filters['pets'], $filters['pets_only']])->toBe([false, true]);
});

it('swaps inverted ranges (DEV-025 off)', function (string $min, string $max): void {
    $filters = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'sale', $min => '9', $max => '3'])->toArray();

    expect([$filters[$min], $filters[$max]])->toBe([3, 9]);
})->with([['rooms_min', 'rooms_max'], ['price_min', 'price_max'], ['area_min', 'area_max']]);

it('orders codes as the reference data does and removes repeats', function (): void {
    $filters = normaliser()->normalise([
        'city' => 'tashkent', 'deal' => 'rent_long', 'zones' => ['near_center', 'center', 'center'],
        'types' => ['room', 'apartment', 'room'], 'renovation' => ['none', 'euro'],
    ])->toArray();

    expect($filters['zones'])->toBe(['center', 'near_center'])
        ->and($filters['types'])->toBe(['apartment', 'room'])
        ->and($filters['renovation'])->toBe(['euro', 'none']);
});

it('drops a zone of a city without zones and a renovation of another deal', function (): void {
    $region = normaliser()->normalise(['city' => 'andijan', 'deal' => 'rent_long', 'zones' => ['center']])->toArray();
    $sale = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'sale', 'renovation' => ['none', 'shell']])->toArray();

    expect($region['zones'])->toBe([])->and($sale['renovation'])->toBe(['shell']);
});

it('reads the districts of the region city', function (): void {
    expect(normaliser()->normalise(['city' => 'tashkent_region', 'deal' => 'rent_long', 'districts' => ['chirchiq']])->toArray()['districts'])
        ->toBe(['chirchiq']);
});

it('reads a polygon as text or as vertices, rounds it to 5 decimals and opens it', function (mixed $polygon): void {
    expect(normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', 'polygon' => $polygon])->toArray()['polygon'])
        ->toBe([[41.3, 69.2], [41.31, 69.25001], [41.29, 69.27]]);
})->with([
    'text' => ['41.3,69.2;41.31,69.250006;41.29,69.27'],
    'closed text' => ['41.3,69.2;41.31,69.250006;41.29,69.27;41.3,69.2'],
    'vertices' => [[[41.3, 69.2], [41.31, 69.250006], [41.29, 69.27]]],
]);

it('rejects input it cannot normalise, naming the field (Q-API-007 probe set)', function (array $raw, string $field): void {
    try {
        normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', ...$raw]);
        $this->fail('No FilterRejected.');
    } catch (FilterRejected $e) {
        expect($e->field)->toBe($field);
    }
})->with([
    'missing city' => [['city' => null], 'city'],
    'unknown city' => [['city' => "' OR 1=1--"], 'city'],
    'long city' => [['city' => str_repeat('a', 10000)], 'city'],
    'city as list' => [['city' => ['tashkent']], 'city'],
    'missing deal' => [['deal' => null], 'deal'],
    'unknown deal' => [['deal' => 'x'], 'deal'],
    'unknown owner' => [['owner' => 'realtors'], 'owner'],
    'unknown type' => [['types' => ['castle']], 'types'],
    'types as text' => [['types' => 'apartment'], 'types'],
    'unknown district' => [['districts' => ['atlantis']], 'districts'],
    'district of another city' => [['districts' => ['chirchiq']], 'districts'],
    'long district' => [['districts' => [str_repeat('d', 10000)]], 'districts'],
    'unknown zone' => [['zones' => ['suburb']], 'zones'],
    'negative rooms' => [['rooms_min' => '-1'], 'rooms_min'],
    'rooms above 10' => [['rooms_max' => '11'], 'rooms_max'],
    'fractional rooms' => [['rooms_min' => '1.5'], 'rooms_min'],
    'rooms as words' => [['rooms_min' => 'abc'], 'rooms_min'],
    'zero price' => [['price_min' => '0'], 'price_min'],
    'NaN price' => [['price_max' => 'NaN'], 'price_max'],
    'zero area' => [['deal' => 'sale', 'area_min' => '0'], 'area_min'],
    'huge area' => [['deal' => 'sale', 'area_max' => '10001'], 'area_max'],
    'posted days 2' => [['posted_days' => '2'], 'posted_days'],
    'boolean yes' => [['near_metro' => 'yes'], 'near_metro'],
    'furnished 1' => [['furnished' => '1'], 'furnished'],
    'unknown renovation' => [['renovation' => ['gold']], 'renovation'],
    'unknown appliance' => [['appliances' => ['robot']], 'appliances'],
    'unknown tenant' => [['tenant' => 'students'], 'tenant'],
    'unknown market' => [['deal' => 'sale', 'market' => 'old'], 'market'],
    'two vertices' => [['polygon' => '41.3,69.2;41.31,69.25'], 'polygon'],
    '41 vertices' => [['polygon' => implode(';', array_map(fn (int $i): string => '41.'.(100 + $i).',69.'.(100 + $i), range(1, 41)))], 'polygon'],
    'NaN vertex' => [['polygon' => '41.3,NaN;41.31,69.25;41.29,69.27'], 'polygon'],
    'latitude out of range' => [['polygon' => '91,69.2;41.31,69.25;41.29,69.27'], 'polygon'],
    'long polygon' => [['polygon' => str_repeat('1', 10000)], 'polygon'],
    'too many districts' => [['districts' => array_fill(0, 101, 'yunusobod')], 'districts'],
]);

it('ignores unknown keys', function (): void {
    expect(normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', 'zone' => 'center', 'foo' => ['bar']])->toArray())
        ->toBe(FilterArrays::defaults());
});

it('accepts JSON booleans and numbers, as radar bodies send them', function (): void {
    $filters = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', 'near_metro' => true, 'furnished' => false, 'rooms_min' => 2, 'price_max' => 800])->toArray();

    expect([$filters['near_metro'], $filters['furnished'], $filters['rooms_min'], $filters['price_max']])->toBe([true, false, 2, 800]);
});

it('normalises what it returned to the same filters', function (): void {
    $once = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'sale', 'types' => ['land', 'house'], 'districts' => ['mirobod'], 'area_min' => '30', 'polygon' => null]);

    expect(normaliser()->normalise($once->toArray())->toArray())->toBe($once->toArray());
});

describe('switches', function (): void {
    it('rejects impossible combinations with strict_combinations (DEV-004)', function (array $raw, string $field): void {
        config(['filters.strict_combinations' => true]);

        expect(fn () => normaliser()->normalise(['city' => 'tashkent', ...$raw]))->toThrow(FilterRejected::class);

        try {
            normaliser()->normalise(['city' => 'tashkent', ...$raw]);
        } catch (FilterRejected $e) {
            expect($e->field)->toBe($field);
        }
    })->with([
        'type of another deal' => [['deal' => 'sale', 'types' => ['room']], 'types'],
        'tenant on sale' => [['deal' => 'sale', 'tenant' => 'family'], 'tenant'],
        'market on long rent' => [['deal' => 'rent_long', 'market' => 'new'], 'market'],
        'two geography modes' => [['deal' => 'rent_long', 'zones' => ['center'], 'districts' => ['mirobod']], 'districts'],
        'both pet filters' => [['deal' => 'rent_long', 'pets' => 'true', 'pets_only' => 'true'], 'pets'],
    ]);

    it('accepts an area on a rent deal with strict_combinations', function (string $deal): void {
        config(['filters.strict_combinations' => true]);

        expect(normaliser()->normalise(['city' => 'tashkent', 'deal' => $deal, 'area_min' => '40', 'area_max' => '90'])->toArray())
            ->toMatchArray(['area_min' => 40, 'area_max' => 90]);
    })->with(['rent_long', 'rent_daily']);

    it('rejects inverted ranges with inverted_range (DEV-025)', function (): void {
        config(['filters.inverted_range' => true]);

        expect(fn () => normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', 'price_min' => '900', 'price_max' => '300']))
            ->toThrow(FilterRejected::class);
    });

    it('drops posted_days of a radar only with radar_without_posted_days (DEV-005)', function (): void {
        $raw = ['city' => 'tashkent', 'deal' => 'rent_long', 'posted_days' => '7'];

        expect(normaliser()->normalise($raw, forRadar: true)->postedDays)->toBe(7);

        config(['filters.radar_without_posted_days' => true]);

        expect(normaliser()->normalise($raw, forRadar: true)->postedDays)->toBeNull()
            ->and(normaliser()->normalise($raw)->postedDays)->toBe(7);
    });
});

it('falls back to the new sort when the filters do not offer the asked one (BR-APP-023)', function (array $raw, ListingSort $asked, ListingSort $effective): void {
    $filters = normaliser()->normalise(['city' => 'tashkent', 'deal' => 'rent_long', ...$raw]);

    expect(normaliser()->sortFor($filters, $asked))->toBe($effective);
})->with([
    'cheap always' => [[], ListingSort::Cheap, ListingSort::Cheap],
    'deal for apartments' => [[], ListingSort::Deal, ListingSort::Deal],
    'deal not for houses' => [['types' => ['apartment', 'house']], ListingSort::Deal, ListingSort::New],
    'deal not for daily rent' => [['deal' => 'rent_daily'], ListingSort::Deal, ListingSort::New],
    'deal not without a median' => [['city' => 'andijan'], ListingSort::Deal, ListingSort::New],
    'center with zones' => [[], ListingSort::Center, ListingSort::Center],
    'center not without zones' => [['city' => 'andijan'], ListingSort::Center, ListingSort::New],
    'ppm for sale' => [['deal' => 'sale'], ListingSort::Ppm, ListingSort::Ppm],
    'ppm not for rent' => [[], ListingSort::Ppm, ListingSort::New],
]);
