<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\PriceKind;
use App\Services\Sources\Data\PriceInfo;

/**
 * Legacy's pre-formatted `price` string as the parts of `price` (WP-12): the client rule of `03` §1.12 done once on
 * the server (Q-API-062). Pure.
 *
 * The string is split on « · »; in the first part the text in brackets becomes `alt` and is cut out, the text from the
 * first `/` becomes `period` (with the slash, as legacy writes it: `/мес`), the rest `display`; the other parts become
 * `notes`. A negotiable price is a `display` without a period («Договорная»). `kind` keeps `down_payment` and
 * `business` (BR-API-156); any other value is `null` (Q-API-065). `usd` is a JSON number ≥ 0, rounded to whole USD,
 * else `null`.
 */
final class PriceParser
{
    private function __construct() {}

    public static function parse(?string $price, ?string $kind, mixed $usd): ?PriceInfo
    {
        $parts = self::parts($price, $kind, $usd);

        return $parts === null ? null : PriceInfo::fromArray($parts);
    }

    /**
     * The price in the array shape of the stub fixtures, or `null` without a price string.
     *
     * @return array{display: string, period: string|null, alt: string|null, notes: list<string>, usd: int|null, kind: string|null}|null
     */
    public static function parts(?string $price, ?string $kind, mixed $usd): ?array
    {
        if ($price === null || trim($price) === '') {
            return null;
        }

        $parts = array_values(array_filter(
            array_map(trim(...), preg_split('/\s*·\s*/u', $price) ?: []),
            fn (string $part): bool => $part !== '',
        ));
        $first = (string) array_shift($parts);
        $alt = preg_match('/\(([^)]*)\)/u', $first, $bracket) === 1 ? self::clean($bracket[1]) : null;
        $first = (string) preg_replace('/\([^)]*\)/u', ' ', $first);
        $slash = mb_strpos($first, '/');

        return [
            'display' => self::clean($slash === false ? $first : mb_substr($first, 0, $slash)) ?? '',
            'period' => $slash === false ? null : self::clean(mb_substr($first, $slash)),
            'alt' => $alt,
            'notes' => array_map(fn (string $note): string => (string) self::clean($note), $parts),
            'usd' => self::usd($usd),
            'kind' => $kind !== null && PriceKind::tryFrom($kind) !== null ? $kind : null,
        ];
    }

    /**
     * The USD amount of a key per `usd()`; a value present that is not one (a string, a negative amount) is noted. A
     * fraction is rounded without a note: legacy computes USD amounts, so a fraction is a valid value there.
     *
     * @param  array<array-key, mixed>  $data
     */
    public static function usdOf(array $data, string $key, ?Coercions $seen = null): ?int
    {
        $value = $data[$key] ?? null;
        $usd = self::usd($value);

        if ($value !== null && $usd === null) {
            $seen?->note($key);
        }

        return $usd;
    }

    /** A JSON number ≥ 0 as whole USD; anything else (a string, a negative amount) is `null`. */
    public static function usd(mixed $usd): ?int
    {
        $whole = is_int($usd) || is_float($usd) ? LegacyValue::whole($usd) : null;

        return $whole !== null && $whole >= 0 ? $whole : null;
    }

    /** The text with its whitespace collapsed, or `null` when nothing is left. */
    private static function clean(string $text): ?string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', $text));

        return $text === '' ? null : $text;
    }
}
