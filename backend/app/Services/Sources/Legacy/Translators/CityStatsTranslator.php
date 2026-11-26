<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\Deal;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\CityStats;
use InvalidArgumentException;

/**
 * Legacy's `GET /api/cities` (`08` API-002) as the city statistics of `GET /cities` (WP-11): one entry per city of
 * the reference data, in its order. Pure, like `ReferenceTranslator`.
 *
 * `counts` keeps the three deals, a missing one as `0`; `presets` → `price_presets` and `typical` → `typical_price`,
 * deal keys only, `{}` when absent. A city of the reference that legacy omits gets zeros and empty objects; a city
 * legacy knows and the reference does not is dropped; unread keys (`name`, `center`) are ignored.
 */
final class CityStatsTranslator
{
    public const string PATH = '/api/cities';

    /**
     * @param  array<array-key, mixed>  $cities  the decoded legacy answer
     * @param  list<string>  $codes  the city codes of the reference data
     * @return list<CityStats>
     *
     * @throws LegacyContractError
     */
    public static function toData(array $cities, array $codes): array
    {
        return array_map(CityStats::fromArray(...), self::translate($cities, $codes));
    }

    /**
     * The answer in the array shape of the stub fixture (`resources/fixtures/v1/cities`), checked by
     * `CityStats::fromArray()`: what the legacy source caches.
     *
     * @param  array<array-key, mixed>  $cities
     * @param  list<string>  $codes
     * @return list<array<string, mixed>>
     *
     * @throws LegacyContractError
     */
    public static function translate(array $cities, array $codes): array
    {
        if (! array_is_list($cities)) {
            throw LegacyContractError::key(self::PATH, '(answer)', 'not a list');
        }

        $byCode = [];

        foreach ($cities as $index => $city) {
            $code = is_array($city) ? ($city['code'] ?? null) : null;

            if (! is_string($code)) {
                throw LegacyContractError::key(self::PATH, "{$index}.code");
            }

            $byCode[$code] = $city;
        }

        $translated = [];

        foreach ($codes as $code) {
            $city = $byCode[$code] ?? [];
            $translated[] = [
                'code' => $code,
                'counts' => self::counts($city['counts'] ?? [], $code),
                'price_presets' => self::deals($city['presets'] ?? [], $code, 'presets'),
                'typical_price' => self::deals($city['typical'] ?? [], $code, 'typical'),
            ];
        }

        try {
            array_map(CityStats::fromArray(...), $translated);
        } catch (InvalidArgumentException $invalid) {
            throw new LegacyContractError(self::PATH, $invalid->getMessage());
        }

        return $translated;
    }

    /** @return array<string, mixed> every deal, a missing one as 0 */
    private static function counts(mixed $counts, string $code): array
    {
        $object = self::object($counts, $code, 'counts');
        $values = [];

        foreach (Deal::values() as $deal) {
            $values[$deal] = $object[$deal] ?? 0;
        }

        return $values;
    }

    /** @return array<string, mixed> only the deals legacy sent */
    private static function deals(mixed $values, string $code, string $key): array
    {
        return array_intersect_key(self::object($values, $code, $key), array_flip(Deal::values()));
    }

    /** @return array<array-key, mixed> */
    private static function object(mixed $value, string $code, string $key): array
    {
        return is_array($value) ? $value : throw LegacyContractError::key(self::PATH, "{$code}.{$key}", 'not an object');
    }
}
