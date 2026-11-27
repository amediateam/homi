<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\Legacy\Translators\Coercions;
use App\Services\Sources\Legacy\Translators\MapPointsTranslator;
use Tests\Support\LegacyFixtures;

/** @param  array<string, mixed>  $overrides */
function legacyPoint(array $overrides = []): array
{
    return ['id' => 100001, 'lat' => 41.36512, 'lon' => 69.28431, 'label' => '$600', 'tone' => 'good', 'priced' => true, 'usd' => 600, ...$overrides];
}

/** @param  list<array<string, mixed>>  $points */
function translatedMap(array $points, array $extra = []): array
{
    return MapPointsTranslator::translate(['points' => $points, ...$extra], LegacyFixtures::NATIVE_FLOOR);
}

it('translates a point: id to number, origin legacy, the rest as sent', function (): void {
    expect(translatedMap([legacyPoint()])['points'][0])->toBe([
        'number' => 100001, 'origin' => 'legacy', 'lat' => 41.36512, 'lon' => 69.28431, 'label' => '$600', 'tone' => 'good', 'priced' => true, 'usd' => 600,
    ]);
});

it('reads an id sent as a string of digits (API-007 types it number|string)', function (): void {
    expect(translatedMap([legacyPoint(['id' => '100001'])])['points'][0]['number'])->toBe(100001);
});

it('drops a point without numeric coordinates', function (array $point): void {
    expect(translatedMap([legacyPoint(), legacyPoint($point)])['points'])->toHaveCount(1);
})->with([
    'no lat' => [['lat' => null]],
    'no lon' => [['lon' => null]],
    'a string' => [['lat' => '41.3']],
    'missing' => [['id' => 100002, 'lat' => null, 'lon' => null]],
]);

it('removes < and & from a label (LB-API-008)', function (string $label, string $plain): void {
    expect(translatedMap([legacyPoint(['label' => $label])])['points'][0]['label'])->toBe($plain);
})->with([
    ['<b>$600</b>', 'b>$600/b>'],
    ['$600 & торг', '$600 торг'],
    ['<script>alert(1)</script>', 'script>alert(1)/script>'],
    ['  $600  ', '$600'],
]);

it('keeps the four tones, priced unless false, and a numeric usd', function (array $point, string $key, mixed $read): void {
    expect(translatedMap([legacyPoint($point)])['points'][0][$key])->toBe($read);
})->with([
    'high' => [['tone' => 'high'], 'tone', 'high'],
    'an unknown tone' => [['tone' => 'same'], 'tone', null],
    'no tone' => [['tone' => null], 'tone', null],
    'priced absent' => [['priced' => null], 'priced', true],
    'negotiable' => [['priced' => false], 'priced', false],
    'usd absent' => [['usd' => null], 'usd', null],
    'usd as a string' => [['usd' => '600'], 'usd', null],
    'label absent' => [['label' => null], 'label', ''],
    'label a number' => [['label' => 600], 'label', '600'],
]);

it('keeps legacy\'s with_point, and without it counts the points legacy sent', function (): void {
    $golden = LegacyFixtures::golden('map');
    $cut = translatedMap([legacyPoint(), legacyPoint(['id' => 100002])], ['total' => 61, 'with_point' => 40]);
    $without = $golden;
    unset($without['with_point'], $without['total']);

    expect([$cut['total'], $cut['with_point']])->toBe([61, 40])
        ->and(MapPointsTranslator::translate($without, LegacyFixtures::NATIVE_FLOOR)['with_point'])->toBe(count($golden['points']))
        ->and(MapPointsTranslator::translate($without, LegacyFixtures::NATIVE_FLOOR)['total'])->toBe(count($golden['points']))
        ->and(translatedMap([legacyPoint(), legacyPoint(['id' => 100002, 'lat' => null])])['with_point'])->toBe(2)
        ->and(MapPointsTranslator::toData($golden, LegacyFixtures::NATIVE_FLOOR))->toBeInstanceOf(MapPoints::class);
});

it('refuses an answer that does not fit, naming the key', function (array $answer, string $key): void {
    try {
        MapPointsTranslator::translate($answer, LegacyFixtures::NATIVE_FLOOR);
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe([$key])
            ->and($error->path)->toBe('/api/map');

        return;
    }

    throw new LogicException("{$key} was accepted.");
})->with([
    'no points' => [[], 'points'],
    'points not a list' => [['points' => ['a' => 1]], 'points'],
    'a point not an object' => [['points' => [1]], 'points.0'],
    'an id missing' => [['points' => [legacyPoint(['id' => null])]], 'points.0.id'],
    'an id not a number' => [['points' => [legacyPoint(['id' => 'abc'])]], 'points.0.id'],
    'an id at the native floor' => [['points' => [legacyPoint(['id' => LegacyFixtures::NATIVE_FLOOR])]], 'points.0.id'],
    'with_point below the points' => [['points' => [legacyPoint(), legacyPoint()], 'with_point' => 1], 'with_point'],
    'total below with_point' => [['points' => [legacyPoint()], 'with_point' => 5, 'total' => 3], 'total'],
    'total negative' => [['points' => [], 'total' => -1], 'total'],
]);

it('notes the point values it could not use as sent, by their place, and nothing for the golden map', function (): void {
    $seen = Coercions::collect();
    $map = MapPointsTranslator::translate(['points' => [
        legacyPoint(),
        legacyPoint(['id' => 100002, 'tone' => 'cheap', 'label' => ['$600'], 'priced' => 'no', 'usd' => '600']),
        legacyPoint(['id' => 100003, 'lat' => '41.3']),
    ]], LegacyFixtures::NATIVE_FLOOR, $seen);

    expect($map['points'][1])->toMatchArray(['tone' => null, 'label' => '', 'priced' => true, 'usd' => null])
        ->and(count($map['points']))->toBe(2)
        ->and($seen->keys())->toBe(['points.1.priced', 'points.1.tone', 'points.1.label', 'points.1.usd', 'points.2.lat']);

    $golden = Coercions::collect();
    MapPointsTranslator::translate(LegacyFixtures::golden('map'), LegacyFixtures::NATIVE_FLOOR, $golden);
    expect($golden->keys())->toBe([]);
});
