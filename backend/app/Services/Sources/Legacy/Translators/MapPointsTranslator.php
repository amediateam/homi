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
 * below the points kept, or a `total` below `with_point`, is a contract error, as is a point that is not an object or
 * has no valid `id` (`points.3.id`). A coordinate, label, tone, `priced` or `usd` of another type is read as its
 * empty value (a coordinate drops the point) and noted in the answer's `Coercions` (`points.3.tone`).
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
    public static function toData(#[\SensitiveParameter] array $answer, int $nativeFloor, ?Coercions $seen = null): MapPoints
    {
        $map = self::translate($answer, $nativeFloor, $seen);

        return new MapPoints(array_map(MapPoint::fromArray(...), $map['points']), $map['total'], $map['with_point']);
    }

    /**
     * The answer in the array shape of `data` of the stub's `GET /listings/map`, checked by the data objects.
     *
     * @param  array<array-key, mixed>  $answer
     * @param  int  $nativeFloor  the first number of HOMI's own listings (`ListingNumber::floor()`); a legacy id at or
     *                            above it would collide with one
     * @param  Coercions|null  $seen  collects the keys whose values could not be used as sent
     * @return array{points: list<array<string, mixed>>, total: int, with_point: int}
     *
     * @throws LegacyContractError
     */
    public static function translate(#[\SensitiveParameter] array $answer, int $nativeFloor, ?Coercions $seen = null): array
    {
        $sent = LegacyValue::requiredList($answer, 'points', self::PATH);
        $points = [];

        foreach ($sent as $index => $point) {
            if (! is_array($point)) {
                throw LegacyContractError::key(self::PATH, "points.{$index}", 'not an object');
            }

            $at = $seen?->at("points.{$index}.");
            $lat = LegacyValue::number($point, 'lat', $at);
            $lon = LegacyValue::number($point, 'lon', $at);

            if ($lat === null || $lon === null) {
                continue;
            }

            $tone = $point['tone'] ?? null;
            $priced = LegacyValue::bool($point, 'priced', $at);

            if ($tone !== null && ! in_array($tone, MapPoint::TONES, true)) {
                $at?->note('tone');
            }

            $entry = [
                'number' => self::number($point, $index, $nativeFloor),
                'origin' => ListingOrigin::Legacy->value,
                'lat' => $lat,
                'lon' => $lon,
                'label' => self::label($point['label'] ?? null, $at),
                'tone' => in_array($tone, MapPoint::TONES, true) ? $tone : null,
                'priced' => $priced !== false,
                'usd' => PriceParser::usdOf($point, 'usd', $at),
            ];

            try {
                MapPoint::fromArray($entry);
            } catch (InvalidArgumentException $invalid) {
                throw LegacyValue::refused(self::PATH, $invalid, "points.{$index}.");
            }

            $points[] = $entry;
        }

        $withPoint = self::optionalCount($answer, 'with_point') ?? count($sent);
        $total = self::optionalCount($answer, 'total') ?? $withPoint;

        if ($withPoint < count($points)) {
            throw LegacyContractError::key(self::PATH, 'with_point', 'below the number of points');
        }

        if ($total < $withPoint) {
            throw LegacyContractError::key(self::PATH, 'total', 'below with_point');
        }

        return ['points' => $points, 'total' => $total, 'with_point' => $withPoint];
    }

    /** @param  array<array-key, mixed>  $point */
    private static function number(#[\SensitiveParameter] array $point, int $index, int $nativeFloor): int
    {
        $id = $point['id'] ?? null;
        $id = is_string($id) && ctype_digit($id) && strlen($id) <= 18 ? (int) $id : Whole::of($id);

        if (! is_int($id) || $id < 1) {
            throw LegacyContractError::key(self::PATH, "points.{$index}.id", 'missing or not a positive whole number');
        }

        return $id < $nativeFloor ? $id : throw LegacyContractError::key(self::PATH, "points.{$index}.id", 'at or above the native number floor');
    }

    /** Plain text, as `MapPoint` keeps it: no `<` or `&`, whitespace collapsed; a label of another type is `''`, noted. */
    private static function label(mixed $label, ?Coercions $seen): string
    {
        if ($label !== null && ! is_string($label) && ! is_int($label) && ! is_float($label)) {
            $seen?->note('label');
        }

        $text = is_string($label) ? $label : (is_int($label) || is_float($label) ? (string) $label : '');

        return trim((string) preg_replace('/\s+/u', ' ', str_replace(['<', '&'], '', $text)));
    }

    /** @param  array<array-key, mixed>  $answer  `null` when absent; a whole number ≥ 0, else a contract error */
    private static function optionalCount(#[\SensitiveParameter] array $answer, string $key): ?int
    {
        $value = Whole::of($answer[$key] ?? null);

        if ($value === null) {
            return null;
        }

        return is_int($value) && $value >= 0 ? $value : throw LegacyContractError::key(self::PATH, $key, 'not a whole number ≥ 0');
    }
}
