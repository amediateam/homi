<?php

namespace App\Services\Search;

use App\Enums\Deal;
use App\Enums\Market;
use App\Enums\OwnerFilter;
use App\Enums\PropertyType;
use App\Enums\Tenant;
use App\Services\Sources\Data\Fields;
use App\Services\Sources\Data\GeoPoint;
use InvalidArgumentException;

/**
 * One search: the 25 keys of the filters object (WP-12, `08` §1.7). The feed, the counts, the map and the radars use
 * the same value; `SearchFiltersNormaliser` is the only way from user input to it, `fromNormalised()` the way back
 * from an already normalised array (a stored radar, a flow option).
 *
 * Codes (city, districts, zones, renovation, appliances) are the codes of the reference data; prices are whole USD.
 */
final readonly class SearchFilters
{
    /** The keys of `toArray()`, in the documented order. */
    public const array KEYS = [
        'city', 'deal', 'types', 'districts', 'rooms_min', 'rooms_max', 'price_min', 'price_max', 'zones',
        'near_metro', 'below_median', 'owner', 'tenant', 'pets', 'pets_only', 'furnished', 'renovation',
        'floor_not_first', 'floor_not_last', 'area_min', 'area_max', 'market', 'appliances', 'posted_days', 'polygon',
    ];

    /**
     * @param  list<PropertyType>  $types
     * @param  list<string>  $districts
     * @param  list<string>  $zones
     * @param  list<string>  $renovation
     * @param  list<string>  $appliances
     * @param  list<GeoPoint>|null  $polygon  open, 3 … 40 vertices
     */
    private function __construct(
        public string $city,
        public Deal $deal,
        public array $types,
        public array $districts,
        public ?int $roomsMin,
        public ?int $roomsMax,
        public ?int $priceMin,
        public ?int $priceMax,
        public array $zones,
        public bool $nearMetro,
        public bool $belowMedian,
        public OwnerFilter $owner,
        public ?Tenant $tenant,
        public bool $pets,
        public bool $petsOnly,
        public ?bool $furnished,
        public array $renovation,
        public bool $floorNotFirst,
        public bool $floorNotLast,
        public ?int $areaMin,
        public ?int $areaMax,
        public ?Market $market,
        public array $appliances,
        public ?int $postedDays,
        public ?array $polygon,
    ) {}

    /**
     * An array in the form of `toArray()`, trusted to be normalised; only its types are checked.
     *
     * @param  array<array-key, mixed>  $data
     *
     * @throws InvalidArgumentException naming the first missing or mistyped key
     */
    public static function fromNormalised(array $data): self
    {
        return new self(
            city: Fields::string($data, 'city'),
            deal: self::enum(Deal::class, $data, 'deal'),
            types: array_map(fn (string $type): PropertyType => PropertyType::tryFrom($type) ?? throw self::invalid('types'), Fields::strings($data, 'types')),
            districts: Fields::strings($data, 'districts'),
            roomsMin: self::nullableInt($data, 'rooms_min'),
            roomsMax: self::nullableInt($data, 'rooms_max'),
            priceMin: self::nullableInt($data, 'price_min'),
            priceMax: self::nullableInt($data, 'price_max'),
            zones: Fields::strings($data, 'zones'),
            nearMetro: Fields::bool($data, 'near_metro'),
            belowMedian: Fields::bool($data, 'below_median'),
            owner: self::enum(OwnerFilter::class, $data, 'owner'),
            tenant: self::nullableEnum(Tenant::class, $data, 'tenant'),
            pets: Fields::bool($data, 'pets'),
            petsOnly: Fields::bool($data, 'pets_only'),
            furnished: self::nullableBool($data, 'furnished'),
            renovation: Fields::strings($data, 'renovation'),
            floorNotFirst: Fields::bool($data, 'floor_not_first'),
            floorNotLast: Fields::bool($data, 'floor_not_last'),
            areaMin: self::nullableInt($data, 'area_min'),
            areaMax: self::nullableInt($data, 'area_max'),
            market: self::nullableEnum(Market::class, $data, 'market'),
            appliances: Fields::strings($data, 'appliances'),
            postedDays: self::nullableInt($data, 'posted_days'),
            polygon: self::polygon($data),
        );
    }

    /**
     * The filters object: every key present, lists never null, `polygon` as `[[lat, lon], …]` or null.
     *
     * @return array{city: string, deal: string, types: list<string>, districts: list<string>, rooms_min: int|null, rooms_max: int|null, price_min: int|null, price_max: int|null, zones: list<string>, near_metro: bool, below_median: bool, owner: string, tenant: string|null, pets: bool, pets_only: bool, furnished: bool|null, renovation: list<string>, floor_not_first: bool, floor_not_last: bool, area_min: int|null, area_max: int|null, market: string|null, appliances: list<string>, posted_days: int|null, polygon: list<array{0: float, 1: float}>|null}
     */
    public function toArray(): array
    {
        return [
            'city' => $this->city,
            'deal' => $this->deal->value,
            'types' => array_map(fn (PropertyType $type): string => $type->value, $this->types),
            'districts' => $this->districts,
            'rooms_min' => $this->roomsMin,
            'rooms_max' => $this->roomsMax,
            'price_min' => $this->priceMin,
            'price_max' => $this->priceMax,
            'zones' => $this->zones,
            'near_metro' => $this->nearMetro,
            'below_median' => $this->belowMedian,
            'owner' => $this->owner->value,
            'tenant' => $this->tenant?->value,
            'pets' => $this->pets,
            'pets_only' => $this->petsOnly,
            'furnished' => $this->furnished,
            'renovation' => $this->renovation,
            'floor_not_first' => $this->floorNotFirst,
            'floor_not_last' => $this->floorNotLast,
            'area_min' => $this->areaMin,
            'area_max' => $this->areaMax,
            'market' => $this->market?->value,
            'appliances' => $this->appliances,
            'posted_days' => $this->postedDays,
            'polygon' => $this->polygon === null ? null : array_map(fn (GeoPoint $vertex): array => [$vertex->lat, $vertex->lon], $this->polygon),
        ];
    }

    /**
     * Identifies "the same search" for radar de-duplication and caches (BR-API-092, BR-APP-012): SHA-256 in hex of
     * the JSON of `toArray()` without `posted_days`, keys sorted, every list sorted (strings by byte order, polygon
     * vertices by latitude, then longitude), encoded with `JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`.
     */
    public function canonicalHash(): string
    {
        $canonical = $this->toArray();
        unset($canonical['posted_days']);
        ksort($canonical);

        foreach ($canonical as $key => $value) {
            if (is_array($value)) {
                usort($value, fn (string|array $a, string|array $b): int => is_string($a) && is_string($b)
                    ? strcmp($a, $b)
                    : (array) $a <=> (array) $b);
                $canonical[$key] = $value;
            }
        }

        return hash('sha256', json_encode($canonical, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    /**
     * @template T of \BackedEnum
     *
     * @param  class-string<T>  $enum
     * @param  array<array-key, mixed>  $data
     * @return T
     */
    private static function enum(string $enum, array $data, string $key): \BackedEnum
    {
        return $enum::tryFrom(Fields::string($data, $key)) ?? throw self::invalid($key);
    }

    /**
     * @template T of \BackedEnum
     *
     * @param  class-string<T>  $enum
     * @param  array<array-key, mixed>  $data
     * @return T|null
     */
    private static function nullableEnum(string $enum, array $data, string $key): ?\BackedEnum
    {
        $value = Fields::nullableString($data, $key);

        return $value === null ? null : ($enum::tryFrom($value) ?? throw self::invalid($key));
    }

    /** @param  array<array-key, mixed>  $data */
    private static function nullableInt(array $data, string $key): ?int
    {
        if (! array_key_exists($key, $data)) {
            throw self::invalid($key);
        }

        return $data[$key] === null ? null : Fields::int($data, $key);
    }

    /** @param  array<array-key, mixed>  $data */
    private static function nullableBool(array $data, string $key): ?bool
    {
        if (! array_key_exists($key, $data)) {
            throw self::invalid($key);
        }

        return $data[$key] === null ? null : Fields::bool($data, $key);
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<GeoPoint>|null
     */
    private static function polygon(array $data): ?array
    {
        if (! array_key_exists('polygon', $data)) {
            throw self::invalid('polygon');
        }

        if ($data['polygon'] === null) {
            return null;
        }

        $vertices = [];

        foreach (Fields::objects($data, 'polygon') as $vertex) {
            if (! array_is_list($vertex) || count($vertex) !== 2 || ! is_numeric($vertex[0]) || ! is_numeric($vertex[1]) || is_string($vertex[0]) || is_string($vertex[1])) {
                throw self::invalid('polygon');
            }

            $vertices[] = new GeoPoint((float) $vertex[0], (float) $vertex[1]);
        }

        return $vertices;
    }

    private static function invalid(string $key): InvalidArgumentException
    {
        return new InvalidArgumentException("The filter \"{$key}\" is missing or not normalised.");
    }
}
