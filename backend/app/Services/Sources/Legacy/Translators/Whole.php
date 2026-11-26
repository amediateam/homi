<?php

namespace App\Services\Sources\Legacy\Translators;

/**
 * Legacy's contract types its numbers `number` (`08` API-001, API-002), so a whole count, zoom or price may arrive as
 * `700.0`; HOMI's data objects take whole numbers. Pure.
 */
final class Whole
{
    private function __construct() {}

    /**
     * A finite float without a fraction as an int, each item of a list likewise; anything else unchanged, for the data
     * objects to accept or refuse.
     */
    public static function of(mixed $value): mixed
    {
        if (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) < PHP_INT_MAX) {
            return (int) $value;
        }

        return is_array($value) && array_is_list($value) ? array_map(self::of(...), $value) : $value;
    }
}
