<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\Legacy\Translators\ReferenceTranslator;

/** @return array<string, mixed> a golden legacy fixture */
function legacyMeta(string $name = 'meta.ru'): array
{
    $decoded = json_decode((string) file_get_contents(dirname(__DIR__, 4)."/resources/fixtures/legacy/{$name}.json"), true, flags: JSON_THROW_ON_ERROR);

    return is_array($decoded) ? $decoded : throw new LogicException("{$name} is not an object.");
}

/** @return array<string, mixed> a stub fixture of WP-11 */
function stubReference(string $locale): array
{
    $decoded = json_decode((string) file_get_contents(dirname(__DIR__, 4)."/resources/fixtures/v1/reference/default.{$locale}.json"), true, flags: JSON_THROW_ON_ERROR);

    return is_array($decoded) ? $decoded : throw new LogicException('Not an object.');
}

/** The message of the contract error a translation throws, with its key names. */
function referenceContractError(array $meta, string $locale = 'ru'): LegacyContractError
{
    try {
        ReferenceTranslator::translate($meta, $locale);
    } catch (LegacyContractError $error) {
        return $error;
    }

    throw new LogicException('The translation did not fail.');
}

it('translates each golden answer into exactly the stub reference data of its language', function (string $fixture, string $locale): void {
    expect(ReferenceTranslator::translate(legacyMeta($fixture), $locale))->toEqual(stubReference($locale))
        ->and(ReferenceTranslator::toData(legacyMeta($fixture), $locale))->toEqual(ReferenceData::fromArray(stubReference($locale)));
})->with([
    'ru' => ['meta.ru', 'ru'],
    'uz' => ['meta.uz_Latn', 'uz'],
    'en' => ['meta.en', 'en'],
]);

it('reads the rate, ignores the tiles and keeps only the features HOMI announces', function (): void {
    $meta = ['usd_uzs' => 12650.5, 'tiles' => 'https://tiles.invalid/{z}/{x}/{y}.png', 'new_features' => ['cards', 'pets', 'later']] + legacyMeta();

    $data = ReferenceTranslator::translate($meta, 'ru');

    expect($data['rates'])->toBe(['usd_uzs' => 12650.5])
        ->and($data['map'])->toBe(['tiles_url' => null])
        ->and($data['features'])->toBe(['pets']);
});

it('has no features when legacy announces none or only the card style (DEC-57)', function (array $features): void {
    expect(ReferenceTranslator::translate(['new_features' => $features] + legacyMeta(), 'ru')['features'])->toBe([]);
})->with([
    'none' => [[]],
    'cards only' => [['cards']],
]);

it('maps the locales back to HOMI codes and drops one HOMI does not serve', function (): void {
    $locales = ReferenceTranslator::translate(legacyMeta(), 'ru')['locales'];

    expect(array_column($locales, 'code'))->toBe(['ru', 'uz', 'en']);
});

it('turns a legacy city into a HOMI city', function (array $city, array $expected): void {
    $meta = ['cities' => [['code' => 'x', 'name' => 'X', 'center' => [41.5, 69]] + $city]] + legacyMeta();

    expect(ReferenceTranslator::translate($meta, 'ru')['cities'][0])->toMatchArray($expected);
})->with([
    'the centre as an object, zoom 12 when absent' => [[], ['center' => ['lat' => 41.5, 'lon' => 69.0], 'zoom' => 12, 'is_region' => false]],
    'zoom below 11 is a region' => [['zoom' => 10], ['zoom' => 10, 'is_region' => true]],
    'zoom 11 is a city' => [['zoom' => 11], ['is_region' => false]],
    'metro only when exactly true' => [['metro' => 1], ['has_metro' => false]],
    'metro true' => [['metro' => true], ['has_metro' => true]],
    'median unless exactly false' => [['median' => null], ['has_median' => true]],
    'median false' => [['median' => false], ['has_median' => false]],
    'no districts or zones' => [[], ['districts' => [], 'zones' => []]],
]);

it('builds Tashkent from the top-level districts and zones when legacy sends no cities', function (string $locale, string $name): void {
    $cities = ReferenceTranslator::translate(legacyMeta('meta.no_cities.ru'), $locale)['cities'];
    $stubTashkent = stubReference('ru')['cities'][0];

    expect($cities)->toHaveCount(1)
        ->and($cities[0]['name'])->toBe($name)
        ->and(array_diff_key($cities[0], ['name' => true]))->toEqual(array_diff_key($stubTashkent, ['name' => true]));
})->with([
    'ru' => ['ru', 'Ташкент'],
    'uz' => ['uz', 'Toshkent'],
    'en' => ['en', 'Tashkent'],
]);

it('treats an empty list of cities like a missing one', function (): void {
    $cities = ReferenceTranslator::translate(['cities' => []] + legacyMeta(), 'ru')['cities'];

    expect(array_column($cities, 'code'))->toBe(['tashkent']);
});

it('keeps the three deals of renovations and price presets, fills a missing one and drops the rest', function (): void {
    $meta = ['renovations' => ['sale' => [['code' => 'euro', 'name' => 'Евро']], 'owner' => [['code' => 'o', 'name' => 'O']]], 'price_presets' => ['rent_long' => [500], 'other' => [1]]] + legacyMeta();

    $data = ReferenceTranslator::translate($meta, 'ru');

    expect($data['renovations'])->toBe(['rent_long' => [], 'rent_daily' => [], 'sale' => [['code' => 'euro', 'name' => 'Евро']]])
        ->and($data['price_presets'])->toBe(['rent_long' => [500], 'rent_daily' => [], 'sale' => []]);
});

it('ignores the user part of meta and unknown keys', function (): void {
    $plain = ReferenceTranslator::translate(legacyMeta(), 'ru');
    $noisy = ReferenceTranslator::translate(['locale' => 'en', 'currency' => 'UZS', 'theme' => 'dark', 'bot_username' => 'other_bot', 'max_subscriptions' => 3, 'surprise' => ['x' => 1]] + legacyMeta(), 'ru');

    expect($noisy)->toBe($plain);
});

it('fails with a contract error that names the key and never a value', function (array $meta, string $key): void {
    $error = referenceContractError($meta);

    expect($error->keys)->toBe([$key])
        ->and($error->path)->toBe('/api/meta')
        ->and(json_encode($error->context()))->not->toContain('12800');
})->with([
    'no rate' => [array_diff_key(legacyMeta(), ['usd_uzs' => true]), 'usd_uzs'],
    'a rate of zero' => [['usd_uzs' => 0] + legacyMeta(), 'usd_uzs'],
    'a rate as text' => [['usd_uzs' => '12800'] + legacyMeta(), 'usd_uzs'],
    'no renovations' => [array_diff_key(legacyMeta(), ['renovations' => true]), 'renovations'],
    'no appliances' => [array_diff_key(legacyMeta(), ['appliances' => true]), 'appliances'],
    'no price presets' => [array_diff_key(legacyMeta(), ['price_presets' => true]), 'price_presets'],
    'neither cities nor districts' => [array_diff_key(legacyMeta(), ['cities' => true, 'districts' => true]), 'cities'],
    'a centre that is not a pair' => [['cities' => [['code' => 'x', 'name' => 'X', 'center' => [41.5]]]] + legacyMeta(), 'cities.0.center'],
    'a zoom that is not whole' => [['cities' => [['code' => 'x', 'name' => 'X', 'center' => [41.5, 69], 'zoom' => 11.5]]] + legacyMeta(), 'cities.0.zoom'],
]);

it('fails with a contract error when a field has the wrong type deeper down', function (): void {
    $meta = ['appliances' => [['code' => 'tv', 'name' => 7]]] + legacyMeta();

    expect(fn () => ReferenceTranslator::translate($meta, 'ru'))->toThrow(LegacyContractError::class);
});
