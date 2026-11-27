<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\Deal;
use App\Enums\ListingSort;
use App\Enums\PropertyType;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\GeoPoint;
use InvalidArgumentException;

/**
 * HOMI's filters as legacy's query, and legacy's filters objects back as HOMI's (`08` §1.7). Pure.
 *
 * `toQuery()` writes the parameters in the order of `buildFilterParams` (it matters only for legacy's prefetch match):
 * every list as a repeated key (`LegacyClient::queryString()` writes them without brackets), a number when not
 * `null`, `furnished` as `true` or `false` when set, every other boolean only when `true`, `polygon` as
 * `lat,lon;lat,lon;…` with five decimals; then the feed's own `limit`, `sort` (never `new`, the default) and `cursor`.
 * `area_min` and `area_max` go to legacy for every deal (DEC-62; Q-API-082).
 *
 * `fromLegacy()` reads the filters of a flow option (and later a radar): a missing key takes the default of the
 * filters object, an old `zone` string becomes `zones` (LB-API-028), a type the deal does not offer is dropped
 * (LB-API-006) and no type left means `apartment`; a whole number sent as a float is read as the whole number. A
 * value of the wrong type is a contract error naming the key.
 */
final class FiltersTranslator
{
    /** The defaults of the filters object (`08` §1.7, BR-APP-001). */
    public const array DEFAULTS = [
        'city' => 'tashkent', 'deal' => 'rent_long', 'types' => ['apartment'], 'districts' => [],
        'rooms_min' => null, 'rooms_max' => null, 'price_min' => null, 'price_max' => null, 'zones' => [],
        'near_metro' => false, 'below_median' => false, 'owner' => 'any', 'tenant' => null, 'pets' => false,
        'pets_only' => false, 'furnished' => null, 'renovation' => [], 'floor_not_first' => false,
        'floor_not_last' => false, 'area_min' => null, 'area_max' => null, 'market' => null, 'appliances' => [],
        'posted_days' => null, 'polygon' => null,
    ];

    /** The list keys: `null` reads as `[]`. */
    private const array LISTS = ['types', 'districts', 'zones', 'renovation', 'appliances'];

    private function __construct() {}

    /**
     * @return array<string, scalar|list<scalar>> the legacy query, without the keys that are not sent
     */
    public static function toQuery(SearchFilters $filters, ?ListingSort $sort = null, ?string $cursor = null, ?int $limit = null): array
    {
        $query = [
            'city' => $filters->city,
            'deal' => $filters->deal->value,
            'owner' => $filters->owner->value,
            'types' => array_map(fn (PropertyType $type): string => $type->value, $filters->types),
            'districts' => $filters->districts,
            'renovation' => $filters->renovation,
            'appliances' => $filters->appliances,
            'rooms_min' => $filters->roomsMin,
            'rooms_max' => $filters->roomsMax,
            'price_min' => $filters->priceMin,
            'price_max' => $filters->priceMax,
            'area_min' => $filters->areaMin,
            'area_max' => $filters->areaMax,
            'posted_days' => $filters->postedDays,
            'furnished' => $filters->furnished,
            'floor_not_first' => $filters->floorNotFirst ?: null,
            'floor_not_last' => $filters->floorNotLast ?: null,
            'market' => $filters->market?->value,
            'zones' => $filters->zones,
            'near_metro' => $filters->nearMetro ?: null,
            'below_median' => $filters->belowMedian ?: null,
            'tenant' => $filters->tenant?->value,
            'pets' => $filters->pets ?: null,
            'pets_only' => $filters->petsOnly ?: null,
            'polygon' => $filters->polygon === null || $filters->polygon === [] ? null : self::polygon($filters->polygon),
            'limit' => $limit,
            'sort' => $sort === null || $sort === ListingSort::New ? null : $sort->value,
            'cursor' => $cursor,
        ];

        return array_filter($query, fn (mixed $value): bool => $value !== null && $value !== []);
    }

    /**
     * @param  array<array-key, mixed>  $filters  a legacy filters object
     * @param  string  $prefix  the dotted place of the object in the answer, for the error (`options.0.filters.`)
     *
     * @throws LegacyContractError
     */
    public static function fromLegacy(array $filters, string $path = FlowTranslator::PATH, string $prefix = ''): SearchFilters
    {
        $data = [];

        foreach (SearchFilters::KEYS as $key) {
            $value = array_key_exists($key, $filters) ? Whole::of($filters[$key]) : self::DEFAULTS[$key];
            $data[$key] = $value === null && in_array($key, self::LISTS, true) ? [] : $value;
        }

        $zone = $filters['zone'] ?? null;

        if (($data['zones'] ?? []) === [] && is_string($zone) && $zone !== '') {
            $data['zones'] = [$zone];
        }

        $data['owner'] ??= self::DEFAULTS['owner'];
        $deal = is_string($data['deal'] ?? null) ? Deal::tryFrom($data['deal']) : null;

        if ($deal === null) {
            throw LegacyContractError::key($path, "{$prefix}deal", 'not a deal');
        }

        if (is_array($data['types'] ?? null)) {
            $offered = array_map(fn (PropertyType $type): string => $type->value, PropertyType::forDeal($deal));
            $types = array_values(array_filter($data['types'], fn (mixed $type): bool => in_array($type, $offered, true)));
            $data['types'] = $types === [] ? self::DEFAULTS['types'] : $types;
        }

        try {
            return SearchFilters::fromNormalised($data);
        } catch (InvalidArgumentException $invalid) {
            throw LegacyValue::refused($path, $invalid, $prefix);
        }
    }

    /** @param  non-empty-list<GeoPoint>  $polygon */
    private static function polygon(array $polygon): string
    {
        return implode(';', array_map(
            fn (GeoPoint $vertex): string => number_format($vertex->lat, 5, '.', '').','.number_format($vertex->lon, 5, '.', ''),
            $polygon,
        ));
    }
}
