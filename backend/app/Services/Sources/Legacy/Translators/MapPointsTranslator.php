<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\ListingOrigin;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\MapPoint;
use App\Services\Sources\Data\MapPoints;
use InvalidArgumentException;

/**
 * Legacy's `GET /api/map` (API-007) as `GET /listings/map` (WP-12). Pure.
 *
 * Required: `points` (a list). `id → number` (a number or a string of digits, as the contract allows), below the
 * native floor; a point without numeric `lat` and `lon` is dropped; `<` and `&` are removed from `label` (HOMI's fix of
 * LB-API-008), whose whitespace is collapsed as `MapPoint` does; a `tone` outside `MapPoint::TONES` is `null`;
 * `priced` is `false` only when legacy says so; `usd` a number or `null`. `with_point` is legacy's (since
 * `index-CIa0Ldj2.js`), else the number of points legacy sent; `total` is legacy's, else `with_point`. A `with_point`
 * below the points kept, or a `total` below `with_point`, is a contract error.
 */
final class MapPointsTranslator
{
    public const string PATH = '/api/map';

    private function __construct() {}

    /**
     * @param  array<array-key, mixed>  $answer  the decoded legacy answer
     *
     * @throws LegacyContractError
     */
    public static function toData(array $answer, int $nativeFloor): MapPoints
    {
        $map = self::translate($answer, $nativeFloor);

        return new MapPoints(array_map(MapPoint::fromArray(...), $map['points']), $map['total'], $map['with_point']);
    }

    /**
     * The answer in the array shape of `data` of the stub's `GET /listings/map`, checked by the data objects.
     *
     * @param  array<array-key, mixed>  $answer
     * @param  int  $nativeFloor  the first number of HOMI's own listings (`ListingNumber::floor()`); a legacy id at or
     *                            above it would collide with one
     * @return array{points: list<array<string, mixed>>, total: int, with_point: int}
     *
     * @throws LegacyContractError
     */
    public static function translate(array $answer, int $nativeFloor): array
    {
        $sent = LegacyValue::requiredList($answer, 'points', self::PATH);
        $points = [];

        foreach ($sent as $index => $point) {
            if (! is_array($point)) {
                throw LegacyContractError::key(self::PATH, "points.{$index}", 'not an object');
            }

            $lat = LegacyValue::number($point, 'lat');
            $lon = LegacyValue::number($point, 'lon');

            if ($lat === null || $lon === null) {
                continue;
            }

            $points[] = [
                'number' => self::number($point, $index, $nativeFloor),
                'origin' => ListingOrigin::Legacy->value,
                'lat' => $lat,
                'lon' => $lon,
                'label' => self::label($point['label'] ?? null),
                'tone' => in_array($point['tone'] ?? null, MapPoint::TONES, true) ? $point['tone'] : null,
                'priced' => ($point['priced'] ?? null) !== false,
                'usd' => PriceParser::usd($point['usd'] ?? null),
            ];
        }

        $withPoint = self::optionalCount($answer, 'with_point') ?? count($sent);
        $total = self::optionalCount($answer, 'total') ?? $withPoint;

        if ($withPoint < count($points)) {
            throw LegacyContractError::key(self::PATH, 'with_point', 'below the number of points');
        }

        if ($total < $withPoint) {
            throw LegacyContractError::key(self::PATH, 'total', 'below with_point');
        }

        try {
            array_map(MapPoint::fromArray(...), $points);
        } catch (InvalidArgumentException $invalid) {
            throw LegacyValue::refused(self::PATH, $invalid);
        }

        return ['points' => $points, 'total' => $total, 'with_point' => $withPoint];
    }

    /** @param  array<array-key, mixed>  $point */
    private static function number(array $point, int $index, int $nativeFloor): int
    {
        $id = $point['id'] ?? null;
        $id = is_string($id) && ctype_digit($id) && strlen($id) <= 18 ? (int) $id : Whole::of($id);

        if (! is_int($id) || $id < 1) {
            throw LegacyContractError::key(self::PATH, "points.{$index}.id", 'missing or not a positive whole number');
        }

        return $id < $nativeFloor ? $id : throw LegacyContractError::key(self::PATH, "points.{$index}.id", 'at or above the native number floor');
    }

    /** Plain text, as `MapPoint` keeps it: no `<` or `&`, whitespace collapsed. */
    private static function label(mixed $label): string
    {
        $text = is_string($label) ? $label : (is_int($label) || is_float($label) ? (string) $label : '');

        return trim((string) preg_replace('/\s+/u', ' ', str_replace(['<', '&'], '', $text)));
    }

    /** @param  array<array-key, mixed>  $answer  `null` when absent; a whole number ≥ 0, else a contract error */
    private static function optionalCount(array $answer, string $key): ?int
    {
        $value = Whole::of($answer[$key] ?? null);

        if ($value === null) {
            return null;
        }

        return is_int($value) && $value >= 0 ? $value : throw LegacyContractError::key(self::PATH, $key, 'not a whole number ≥ 0');
    }
}
