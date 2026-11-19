<?php

namespace App\Services\Search;

use App\Enums\Deal;
use App\Enums\ListingSort;
use App\Enums\Market;
use App\Enums\OwnerFilter;
use App\Enums\PropertyType;
use App\Enums\Tenant;
use App\Services\Sources\Data\CityData;
use App\Services\Sources\Data\NamedCode;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use BackedEnum;
use Illuminate\Support\Facades\Config;

/**
 * The one way from user input to `SearchFilters` (WP-12, SEC-REQ-017): the query of the listing methods, a radar body,
 * a bot draft. Every value is either rejected with its field (`FilterRejected`) or normalised:
 *
 * 1. unknown keys are ignored; `city` and `deal` are required; enums are closed; codes are those of the reference
 *    data (`source.reference`); numbers, lists and the polygon are bounded by `config('filters.limits')`;
 * 2. combinations that cannot exist are normalised (DEV-004 off): types and renovations of another deal and zones of
 *    a city without zones are dropped (no type left → `apartment`); keys of another deal are stripped (`tenant`,
 *    `pets`, `pets_only` exist only for long rent, `market` only for sale, `appliances` only for rent, BR-API-029;
 *    `area_*` applies to every deal since legacy release `index-CIa0Ldj2.js`); one geography mode is kept (polygon,
 *    else zones, else districts); `pets_only` wins over `pets`;
 * 3. `min > max` is swapped (DEV-025 off).
 *
 * Accepts query strings (`'true'`, `'3'`, `lat,lon;…`) as well as JSON values (`true`, `3`, `[[lat, lon], …]`).
 */
final class SearchFiltersNormaliser
{
    private ?ReferenceData $reference = null;

    public function __construct(private readonly SourceManager $sources) {}

    /**
     * @param  array<array-key, mixed>  $raw
     * @param  bool  $forRadar  the filters of a radar: `posted_days` is dropped when `filters.radar_without_posted_days` is on (DEV-005)
     *
     * @throws FilterRejected
     */
    public function normalise(array $raw, bool $forRadar = false): SearchFilters
    {
        $city = $this->city($raw);
        $deal = $this->enum($raw, 'deal', Deal::class) ?? throw new FilterRejected('deal', 'The deal filter is required.');
        $reference = $this->reference();

        $types = $this->types($raw, $deal);
        $districts = $this->codes($raw, 'districts', self::codesOf($city->districts));
        $zones = $this->codes($raw, 'zones', $this->allZones());
        $zones = $this->keep('zones', $zones, self::codesOf($city->zones));
        $polygon = $this->polygon($raw);
        [$districts, $zones] = $this->oneGeography($polygon, $zones, $districts);
        $renovation = $this->codes($raw, 'renovation', $this->allRenovations());
        $renovation = $this->keep('renovation', $renovation, self::codesOf($reference->renovations[$deal->value]));
        $appliances = $this->codes($raw, 'appliances', self::codesOf($reference->appliances));

        [$roomsMin, $roomsMax] = $this->range($raw, 'rooms');
        [$priceMin, $priceMax] = $this->range($raw, 'price');
        [$areaMin, $areaMax] = $this->range($raw, 'area');
        $postedDays = $this->int($raw, 'posted_days');

        if ($postedDays !== null && ! in_array($postedDays, self::limit('posted_days'), true)) {
            throw new FilterRejected('posted_days', 'The posted_days filter must be 1, 3 or 7.');
        }

        $tenant = $this->enum($raw, 'tenant', Tenant::class);
        $market = $this->enum($raw, 'market', Market::class);
        $pets = $this->flag($raw, 'pets');
        $petsOnly = $this->flag($raw, 'pets_only');

        if ($pets && $petsOnly) {
            $this->combination('pets', 'The pets and pets_only filters exclude each other.');
            $pets = false;
        }

        $longRent = $deal === Deal::RentLong;
        $sale = $deal === Deal::Sale;

        return SearchFilters::fromNormalised([
            'city' => $city->code,
            'deal' => $deal->value,
            'types' => array_map(fn (PropertyType $type): string => $type->value, $types),
            'districts' => $districts,
            'rooms_min' => $roomsMin,
            'rooms_max' => $roomsMax,
            'price_min' => $priceMin,
            'price_max' => $priceMax,
            'zones' => $zones,
            'near_metro' => $this->flag($raw, 'near_metro'),
            'below_median' => $this->flag($raw, 'below_median'),
            'owner' => ($this->enum($raw, 'owner', OwnerFilter::class) ?? OwnerFilter::Any)->value,
            'tenant' => $this->onlyFor($longRent, 'tenant', $tenant)?->value,
            'pets' => $this->onlyFor($longRent, 'pets', $pets) ?? false,
            'pets_only' => $this->onlyFor($longRent, 'pets_only', $petsOnly) ?? false,
            'furnished' => $this->bool($raw, 'furnished'),
            'renovation' => $renovation,
            'floor_not_first' => $this->flag($raw, 'floor_not_first'),
            'floor_not_last' => $this->flag($raw, 'floor_not_last'),
            'area_min' => $areaMin,
            'area_max' => $areaMax,
            'market' => $this->onlyFor($sale, 'market', $market)?->value,
            'appliances' => $this->onlyFor(! $sale, 'appliances', $appliances === [] ? null : $appliances) ?? [],
            'posted_days' => $forRadar && Config::boolean('filters.radar_without_posted_days') ? null : $postedDays,
            'polygon' => $polygon,
        ]);
    }

    /**
     * The sort of the feed, or `new` when the filters do not offer it (BR-APP-023): `deal` needs an apartment-only
     * search that is not daily rent in a city with a market median, `center` a city with zones, `ppm` a sale.
     */
    public function sortFor(SearchFilters $filters, ListingSort $sort): ListingSort
    {
        $city = $this->cityByCode($filters->city);

        $offered = match ($sort) {
            ListingSort::New, ListingSort::Cheap, ListingSort::Expensive => true,
            ListingSort::Deal => $filters->deal !== Deal::RentDaily && $filters->types === [PropertyType::Apartment] && $city?->hasMedian === true,
            ListingSort::Center => $city !== null && $city->zones !== [],
            ListingSort::Ppm => $filters->deal === Deal::Sale,
        };

        return $offered ? $sort : ListingSort::New;
    }

    /** @param  array<array-key, mixed>  $raw */
    private function city(array $raw): CityData
    {
        $code = $this->string($raw, 'city') ?? throw new FilterRejected('city', 'The city filter is required.');

        return $this->cityByCode($code) ?? throw new FilterRejected('city', 'The city filter must be a city of the reference data.');
    }

    private function cityByCode(string $code): ?CityData
    {
        foreach ($this->reference()->cities as $city) {
            if ($city->code === $code) {
                return $city;
            }
        }

        return null;
    }

    /**
     * @param  array<array-key, mixed>  $raw
     * @return list<PropertyType>
     */
    private function types(array $raw, Deal $deal): array
    {
        $asked = [];

        foreach ($this->strings($raw, 'types') as $value) {
            $asked[] = PropertyType::tryFrom($value) ?? throw new FilterRejected('types', 'The types filter has an unknown type.');
        }

        $offered = array_values(array_filter(PropertyType::forDeal($deal), fn (PropertyType $type): bool => in_array($type, $asked, true)));

        if (count($offered) < count(array_unique(array_map(fn (PropertyType $type): string => $type->value, $asked)))) {
            $this->combination('types', 'The types filter has a type the deal does not offer.');
        }

        return $offered === [] ? [PropertyType::Apartment] : $offered;
    }

    /**
     * The asked codes, each one of `$known`, in the order of `$known` and without repeats.
     *
     * @param  array<array-key, mixed>  $raw
     * @param  list<string>  $known
     * @return list<string>
     */
    private function codes(array $raw, string $key, array $known): array
    {
        $asked = $this->strings($raw, $key);

        foreach ($asked as $code) {
            if (! in_array($code, $known, true)) {
                throw new FilterRejected($key, "The {$key} filter has an unknown code.");
            }
        }

        return array_values(array_filter($known, fn (string $code): bool => in_array($code, $asked, true)));
    }

    /**
     * The codes that apply here; dropping one is an impossible combination.
     *
     * @param  list<string>  $codes
     * @param  list<string>  $applicable
     * @return list<string>
     */
    private function keep(string $key, array $codes, array $applicable): array
    {
        $kept = array_values(array_intersect($codes, $applicable));

        if (count($kept) < count($codes)) {
            $this->combination($key, "The {$key} filter has a code that does not apply to the city or the deal.");
        }

        return $kept;
    }

    /**
     * @param  list<array{0: float, 1: float}>|null  $polygon
     * @param  list<string>  $zones
     * @param  list<string>  $districts
     * @return array{0: list<string>, 1: list<string>} districts, zones
     */
    private function oneGeography(?array $polygon, array $zones, array $districts): array
    {
        if ($polygon !== null && ($zones !== [] || $districts !== [])) {
            $this->combination($zones !== [] ? 'zones' : 'districts', 'Only one geography mode applies: polygon, zones or districts.');

            return [[], []];
        }

        if ($zones !== [] && $districts !== []) {
            $this->combination('districts', 'Only one geography mode applies: polygon, zones or districts.');

            return [[], $zones];
        }

        return [$districts, $zones];
    }

    /**
     * @param  array<array-key, mixed>  $raw
     * @return array{0: int|null, 1: int|null}
     */
    private function range(array $raw, string $name): array
    {
        [$lowest, $highest] = self::limit($name);
        $min = $this->int($raw, "{$name}_min");
        $max = $this->int($raw, "{$name}_max");

        foreach (["{$name}_min" => $min, "{$name}_max" => $max] as $key => $value) {
            if ($value !== null && ($value < $lowest || $value > $highest)) {
                throw new FilterRejected($key, "The {$key} filter must be between {$lowest} and {$highest}.");
            }
        }

        if ($min !== null && $max !== null && $min > $max) {
            if (Config::boolean('filters.inverted_range')) {
                throw new FilterRejected("{$name}_min", "The {$name}_min filter must not exceed {$name}_max.");
            }

            return [$max, $min];
        }

        return [$min, $max];
    }

    /**
     * A value that applies only to some deals; elsewhere it is stripped, or rejected under `strict_combinations`.
     *
     * @template T
     *
     * @param  T  $value
     * @return T|null
     */
    private function onlyFor(bool $applies, string $key, mixed $value): mixed
    {
        if ($applies || $value === null || $value === false) {
            return $value;
        }

        $this->combination($key, "The {$key} filter does not apply to the deal.");

        return null;
    }

    private function combination(string $key, string $message): void
    {
        if (Config::boolean('filters.strict_combinations')) {
            throw new FilterRejected($key, $message);
        }
    }

    /**
     * @param  array<array-key, mixed>  $raw
     * @return list<array{0: float, 1: float}>|null
     */
    private function polygon(array $raw): ?array
    {
        $value = $raw['polygon'] ?? null;

        if ($value === null || $value === '') {
            return null;
        }

        $vertices = match (true) {
            is_string($value) && strlen($value) <= Config::integer('filters.limits.polygon_length') => explode(';', $value),
            is_array($value) && array_is_list($value) && count($value) <= self::limit('polygon_vertices')[1] + 1 => $value,
            default => throw self::badPolygon(),
        };

        $points = array_map($this->vertex(...), $vertices);

        if (count($points) > 1 && $points[0] === $points[count($points) - 1]) {
            array_pop($points);
        }

        [$fewest, $most] = self::limit('polygon_vertices');

        if (count($points) < $fewest || count($points) > $most) {
            throw new FilterRejected('polygon', "The polygon filter must have {$fewest} to {$most} vertices.");
        }

        return $points;
    }

    /** @return array{0: float, 1: float} */
    private function vertex(mixed $vertex): array
    {
        $parts = is_string($vertex) ? explode(',', $vertex) : $vertex;

        if (! is_array($parts) || ! array_is_list($parts) || count($parts) !== 2) {
            throw self::badPolygon();
        }

        $decimals = Config::integer('filters.limits.polygon_decimals');
        [$lat, $lon] = array_map(function (mixed $part) use ($decimals): float {
            $number = match (true) {
                is_int($part), is_float($part) => (float) $part,
                is_string($part) && preg_match('/^-?\d{1,3}(\.\d{1,12})?$/', trim($part)) === 1 => (float) trim($part),
                default => throw self::badPolygon(),
            };

            return is_finite($number) ? round($number, $decimals) : throw self::badPolygon();
        }, $parts);

        if (abs($lat) > 90 || abs($lon) > 180) {
            throw self::badPolygon();
        }

        return [$lat, $lon];
    }

    private static function badPolygon(): FilterRejected
    {
        return new FilterRejected('polygon', 'The polygon filter must be lat,lon pairs separated by semicolons.');
    }

    /** @param  array<array-key, mixed>  $raw */
    private function string(array $raw, string $key): ?string
    {
        $value = $raw[$key] ?? null;

        if ($value === null || $value === '') {
            return null;
        }

        if (! is_string($value) || strlen($value) > Config::integer('filters.limits.code_length')) {
            throw new FilterRejected($key, "The {$key} filter must be a short string.");
        }

        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $raw
     * @return list<string>
     */
    private function strings(array $raw, string $key): array
    {
        $value = $raw[$key] ?? [];

        if (! is_array($value) || ! array_is_list($value) || count($value) > Config::integer('filters.limits.list_items')) {
            throw new FilterRejected($key, "The {$key} filter must be a list of at most ".Config::integer('filters.limits.list_items').' values.');
        }

        foreach ($value as $item) {
            if (! is_string($item) || strlen($item) > Config::integer('filters.limits.code_length')) {
                throw new FilterRejected($key, "The {$key} filter must be a list of codes.");
            }
        }

        /** @var list<string> $value */
        return $value;
    }

    /**
     * @template T of BackedEnum
     *
     * @param  array<array-key, mixed>  $raw
     * @param  class-string<T>  $enum
     * @return T|null
     */
    private function enum(array $raw, string $key, string $enum): ?BackedEnum
    {
        $value = $this->string($raw, $key);

        return $value === null ? null : ($enum::tryFrom($value) ?? throw new FilterRejected($key, "The {$key} filter has an unknown value."));
    }

    /** @param  array<array-key, mixed>  $raw */
    private function int(array $raw, string $key): ?int
    {
        $value = $raw[$key] ?? null;

        return match (true) {
            $value === null, $value === '' => null,
            is_int($value) => $value,
            is_string($value) && preg_match('/^-?\d{1,16}$/', $value) === 1 => (int) $value,
            default => throw new FilterRejected($key, "The {$key} filter must be a whole number."),
        };
    }

    /**
     * A three-state filter: absent, `true` or `false` (`furnished`).
     *
     * @param  array<array-key, mixed>  $raw
     */
    private function bool(array $raw, string $key): ?bool
    {
        return match ($raw[$key] ?? null) {
            null, '' => null,
            true, 'true' => true,
            false, 'false' => false,
            default => throw new FilterRejected($key, "The {$key} filter must be true or false."),
        };
    }

    /**
     * A filter applied only when `true`.
     *
     * @param  array<array-key, mixed>  $raw
     */
    private function flag(array $raw, string $key): bool
    {
        return $this->bool($raw, $key) ?? false;
    }

    /** @return list<int> */
    private static function limit(string $name): array
    {
        /** @var list<int> */
        return Config::array("filters.limits.{$name}");
    }

    private function reference(): ReferenceData
    {
        $context = SourceContext::system();

        return $this->reference ??= $this->sources->reference('source.reference', $context)->source->reference($context);
    }

    /** @return list<string> */
    private function allZones(): array
    {
        $codes = [];

        foreach ($this->reference()->cities as $city) {
            $codes = [...$codes, ...self::codesOf($city->zones)];
        }

        return array_values(array_unique($codes));
    }

    /** @return list<string> */
    private function allRenovations(): array
    {
        $codes = [];

        foreach ($this->reference()->renovations as $renovations) {
            $codes = [...$codes, ...self::codesOf($renovations)];
        }

        return array_values(array_unique($codes));
    }

    /**
     * @param  list<NamedCode>  $names
     * @return list<string>
     */
    private static function codesOf(array $names): array
    {
        return array_map(fn (NamedCode $name): string => $name->code, $names);
    }
}
