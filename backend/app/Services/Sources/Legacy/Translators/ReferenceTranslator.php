<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\Deal;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\Legacy\LegacyLocale;
use InvalidArgumentException;

/**
 * Legacy's `GET /api/meta` (`08` API-001) as the directories of `GET /reference` (WP-11). Pure: the unit suite tests
 * it without the application, so it reads no configuration and writes no log; whoever catches its
 * `LegacyContractError` logs it.
 *
 * - `usd_uzs` → `rates.usd_uzs` (a number > 0); `tiles` is ignored: `map.tiles_url` stays `null` until HOMI hosts tiles.
 * - `new_features` → `features`, only the codes HOMI announces (`pets`); legacy's `cards` is dropped (DEC-57).
 * - `locales` → the same with HOMI's codes (`uz_Latn` → `uz`); a code HOMI does not serve is dropped.
 * - `cities[]`: `center` `[lat, lon]` → an object, `zoom` 12 when absent, `is_region` = zoom below 11, `has_metro` =
 *   `metro === true`, `has_median` = `median !== false`, `districts` and `zones` `[]` when absent. Without cities,
 *   one city `tashkent` from the top-level `districts` and `zones` (the legacy client's rule).
 * - `renovations` and `price_presets` keep the three deals, a missing or `null` one as `[]`; any other key (legacy's
 *   `owner`) is dropped — the cabinet's renovations are HOMI's configuration (WP-80). A whole number sent as a float
 *   (a zoom, a price preset) is read as the whole number. `appliances` is one list, as in v1.
 * - Ignored: the user part (`locale`, `currency`, `theme`, `city`, `analytics`, `*_chosen`), `bot_username`,
 *   `max_subscriptions`. Required: `usd_uzs`, `renovations`, `appliances`, `price_presets`, and `cities` or
 *   `districts`; extra keys are ignored.
 */
final class ReferenceTranslator
{
    public const string PATH = '/api/meta';

    /** The feature codes HOMI announces with a «Новое» pill. */
    public const array ANNOUNCED_FEATURES = ['pets'];

    /** Tashkent when legacy sends no cities: its name per locale and the stub's centre (WP-11). */
    private const array TASHKENT = [
        'code' => 'tashkent',
        'name' => ['ru' => 'Ташкент', 'uz' => 'Toshkent', 'en' => 'Tashkent'],
        'center' => ['lat' => 41.3111, 'lon' => 69.2797],
    ];

    private const int DEFAULT_ZOOM = 12;

    /** Below this zoom a city is a region (legacy's rule, API-001). */
    private const int REGION_BELOW_ZOOM = 11;

    /**
     * @param  array<array-key, mixed>  $meta  the decoded legacy answer
     *
     * @throws LegacyContractError
     */
    public static function toData(array $meta, string $locale): ReferenceData
    {
        return ReferenceData::fromArray(self::translate($meta, $locale));
    }

    /**
     * The answer in the array shape of the stub fixture (`resources/fixtures/v1/reference`), checked by
     * `ReferenceData::fromArray()`: what the legacy source caches.
     *
     * @param  array<array-key, mixed>  $meta
     * @return array<string, mixed>
     *
     * @throws LegacyContractError
     */
    public static function translate(array $meta, string $locale): array
    {
        $data = [
            'rates' => ['usd_uzs' => self::rate($meta)],
            'map' => ['tiles_url' => null],
            'features' => self::features($meta),
            'locales' => self::locales($meta),
            'cities' => self::cities($meta, $locale),
            'renovations' => self::byDeal($meta, 'renovations'),
            'appliances' => self::list($meta, 'appliances'),
            'price_presets' => self::byDeal($meta, 'price_presets'),
        ];

        try {
            ReferenceData::fromArray($data);
        } catch (InvalidArgumentException $invalid) {
            throw new LegacyContractError(self::PATH, $invalid->getMessage());
        }

        return $data;
    }

    /**
     * The rate as legacy sent it (whole or not); `ReferenceData` reads it as a float.
     *
     * @param  array<array-key, mixed>  $meta
     */
    private static function rate(array $meta): int|float
    {
        $rate = $meta['usd_uzs'] ?? null;

        if ((! is_int($rate) && ! is_float($rate)) || $rate <= 0) {
            throw LegacyContractError::key(self::PATH, 'usd_uzs', 'missing, not a number or not above zero');
        }

        return $rate;
    }

    /**
     * @param  array<array-key, mixed>  $meta
     * @return list<string>
     */
    private static function features(array $meta): array
    {
        $features = $meta['new_features'] ?? [];

        if (! is_array($features)) {
            throw LegacyContractError::key(self::PATH, 'new_features', 'not a list');
        }

        $announced = [];

        foreach (self::ANNOUNCED_FEATURES as $code) {
            if (in_array($code, $features, true)) {
                $announced[] = $code;
            }
        }

        return $announced;
    }

    /**
     * @param  array<array-key, mixed>  $meta
     * @return list<array<array-key, mixed>>
     */
    private static function locales(array $meta): array
    {
        $locales = [];

        foreach (self::list($meta, 'locales', required: false) as $index => $locale) {
            $code = $locale['code'] ?? null;
            $homi = is_string($code) ? LegacyLocale::fromLegacy($code) : throw LegacyContractError::key(self::PATH, "locales.{$index}.code");

            if ($homi !== null) {
                $locales[] = ['code' => $homi] + $locale;
            }
        }

        return $locales;
    }

    /**
     * @param  array<array-key, mixed>  $meta
     * @return list<array<string, mixed>>
     */
    private static function cities(array $meta, string $locale): array
    {
        $cities = self::list($meta, 'cities', required: false);

        if ($cities === []) {
            if (! array_key_exists('districts', $meta)) {
                throw LegacyContractError::key(self::PATH, 'cities', 'missing together with the top-level districts');
            }

            return [[
                'code' => self::TASHKENT['code'],
                'name' => self::TASHKENT['name'][$locale] ?? self::TASHKENT['name']['ru'],
                'center' => self::TASHKENT['center'],
                'zoom' => self::DEFAULT_ZOOM,
                'is_region' => false,
                'has_metro' => true,
                'has_median' => true,
                'districts' => self::list($meta, 'districts'),
                'zones' => self::list($meta, 'zones', required: false),
            ]];
        }

        $translated = [];

        foreach ($cities as $index => $city) {
            $zoom = Whole::of($city['zoom'] ?? self::DEFAULT_ZOOM);

            if (! is_int($zoom)) {
                throw LegacyContractError::key(self::PATH, "cities.{$index}.zoom", 'not a whole number');
            }

            $translated[] = [
                'code' => $city['code'] ?? null,
                'name' => $city['name'] ?? null,
                'center' => self::center($city, $index),
                'zoom' => $zoom,
                'is_region' => $zoom < self::REGION_BELOW_ZOOM,
                'has_metro' => ($city['metro'] ?? null) === true,
                'has_median' => ($city['median'] ?? null) !== false,
                'districts' => self::list($city, 'districts', required: false, prefix: "cities.{$index}."),
                'zones' => self::list($city, 'zones', required: false, prefix: "cities.{$index}."),
            ];
        }

        return $translated;
    }

    /**
     * @param  array<array-key, mixed>  $city
     * @return array{lat: float, lon: float}
     */
    private static function center(array $city, int $index): array
    {
        $center = $city['center'] ?? null;

        if (! is_array($center) || ! array_is_list($center) || count($center) !== 2) {
            throw LegacyContractError::key(self::PATH, "cities.{$index}.center", 'not a [lat, lon] pair');
        }

        [$lat, $lon] = $center;

        if ((! is_int($lat) && ! is_float($lat)) || (! is_int($lon) && ! is_float($lon))) {
            throw LegacyContractError::key(self::PATH, "cities.{$index}.center", 'not a [lat, lon] pair of numbers');
        }

        return ['lat' => (float) $lat, 'lon' => (float) $lon];
    }

    /**
     * A per-deal object with exactly the three deals: a missing deal is `[]`, any other key is dropped.
     *
     * @param  array<array-key, mixed>  $meta
     * @return array<string, mixed>
     */
    private static function byDeal(array $meta, string $key): array
    {
        $object = $meta[$key] ?? null;

        if (! is_array($object)) {
            throw LegacyContractError::key(self::PATH, $key);
        }

        $values = [];

        foreach (Deal::values() as $deal) {
            $values[$deal] = Whole::of($object[$deal] ?? []);
        }

        return $values;
    }

    /**
     * A list of objects; `[]` when it may be absent and is absent or `null`.
     *
     * @param  array<array-key, mixed>  $data
     * @return list<array<array-key, mixed>>
     */
    private static function list(#[\SensitiveParameter] array $data, string $key, bool $required = true, string $prefix = ''): array
    {
        if (! $required && ($data[$key] ?? null) === null) {
            return [];
        }

        $value = $data[$key] ?? null;

        if (! is_array($value) || ! array_is_list($value)) {
            throw LegacyContractError::key(self::PATH, $prefix.$key, $required ? 'missing or not a list' : 'not a list');
        }

        foreach ($value as $index => $item) {
            if (! is_array($item)) {
                throw LegacyContractError::key(self::PATH, "{$prefix}{$key}.{$index}", 'not an object');
            }
        }

        /** @var list<array<array-key, mixed>> $value */
        return $value;
    }
}
