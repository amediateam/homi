<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Exceptions\Sources\LegacyContractError;
use InvalidArgumentException;

/**
 * Lenient reads of the optional keys of a legacy answer (WP-42). The listing translators are strict only about the
 * keys the contract requires (`08` §1.8, the `!` keys); an optional key that is absent or `null` reads as `null` (or
 * the empty value), and one present with a value HOMI cannot use reads the same way and is noted in the answer's
 * `Coercions` — one odd field never fails a card, and never passes unseen. Pure.
 */
final class LegacyValue
{
    private function __construct() {}

    /** @param  array<array-key, mixed>  $data  a non-empty string, else `null`; another type is noted */
    public static function string(array $data, string $key, ?Coercions $seen = null): ?string
    {
        $value = $data[$key] ?? null;

        if (is_string($value)) {
            return trim($value) !== '' ? $value : null;
        }

        return self::odd($value, $key, $seen);
    }

    /** @param  array<array-key, mixed>  $data  a finite JSON number as sent (whole or not), else `null` */
    public static function number(array $data, string $key, ?Coercions $seen = null): int|float|null
    {
        $value = $data[$key] ?? null;

        return is_int($value) || (is_float($value) && is_finite($value)) ? $value : self::odd($value, $key, $seen);
    }

    /**
     * A JSON number as a whole number: a fraction is rounded and noted (an optional count or floor never fails a
     * card); anything else is `null`.
     *
     * @param  array<array-key, mixed>  $data
     */
    public static function int(array $data, string $key, ?Coercions $seen = null): ?int
    {
        $value = $data[$key] ?? null;
        $whole = self::whole($value);

        if ($value !== null && ($whole === null || (is_float($value) && (float) $whole !== $value))) {
            $seen?->note($key);
        }

        return $whole;
    }

    /**
     * A whole number ≥ 0 per `int()` (a count, a duration); a negative one is `null` and noted.
     *
     * @param  array<array-key, mixed>  $data
     */
    public static function count(array $data, string $key, ?Coercions $seen = null): ?int
    {
        $whole = self::int($data, $key, $seen);

        if ($whole !== null && $whole < 0) {
            $seen?->note($key);

            return null;
        }

        return $whole;
    }

    /** The value as a whole number: an int, or a finite float rounded; anything else `null`. Notes nothing. */
    public static function whole(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        return is_float($value) && is_finite($value) && abs($value) < PHP_INT_MAX ? (int) round($value) : null;
    }

    /** @param  array<array-key, mixed>  $data  `true` or `false`, else `null`; another type is noted */
    public static function bool(array $data, string $key, ?Coercions $seen = null): ?bool
    {
        $value = $data[$key] ?? null;

        return is_bool($value) ? $value : self::odd($value, $key, $seen);
    }

    /** @param  array<array-key, mixed>  $data  `true` only when legacy sends `true`; another type is noted */
    public static function flag(array $data, string $key, ?Coercions $seen = null): bool
    {
        return self::bool($data, $key, $seen) === true;
    }

    /**
     * The client's truthiness check of an `unknown` key (`video`, `median`, `median_reason`): JavaScript's falsy values
     * are `null`, `false`, `0`, `''`; an empty object or list is truthy there. Every type is allowed: nothing is noted.
     *
     * @param  array<array-key, mixed>  $data
     */
    public static function truthy(array $data, string $key): bool
    {
        $value = $data[$key] ?? null;

        return ! in_array($value, [null, false, 0, 0.0, ''], true) && ! (is_float($value) && is_nan($value));
    }

    /**
     * An optional list of objects, keyed by position: `[]` when the key is absent or `null`, and `[]` noted when it is
     * not a list; an item that is not an object is left out and noted (`history.2`).
     *
     * @param  array<array-key, mixed>  $data
     * @return array<int, array<array-key, mixed>>
     */
    public static function objects(array $data, string $key, ?Coercions $seen = null): array
    {
        $value = $data[$key] ?? null;

        if ($value === null) {
            return [];
        }

        if (! is_array($value) || ! array_is_list($value)) {
            $seen?->note($key);

            return [];
        }

        $objects = [];

        foreach ($value as $index => $item) {
            if (is_array($item)) {
                $objects[$index] = $item;
            } else {
                $seen?->note("{$key}.{$index}");
            }
        }

        return $objects;
    }

    /**
     * A required list (of anything): the strict `!` keys of the contract.
     *
     * @param  array<array-key, mixed>  $data
     * @return list<mixed>
     *
     * @throws LegacyContractError naming the key
     */
    public static function requiredList(array $data, string $key, string $path, string $prefix = ''): array
    {
        $value = $data[$key] ?? null;

        if (! is_array($value) || ! array_is_list($value)) {
            throw LegacyContractError::key($path, $prefix.$key, 'missing or not a list');
        }

        return $value;
    }

    /**
     * Whether a part of an answer fits its data object (`ListingFact::fromArray(...)`); one that does not is noted
     * under its place and the field the refusal names (`history.0.at`), for the caller to leave out.
     *
     * @param  callable(array<array-key, mixed>): mixed  $build
     * @param  array<array-key, mixed>  $part
     * @param  string  $place  the dotted place of the part, ending in a dot (`history.0.`)
     */
    public static function fits(callable $build, array $part, string $place, ?Coercions $seen): bool
    {
        try {
            $build($part);

            return true;
        } catch (InvalidArgumentException $invalid) {
            $seen?->note(self::field($invalid, $place));

            return false;
        }
    }

    /**
     * A data object's refusal as a contract error: its message names the field (`The field "x" must be …`, `The
     * filter "x" is …`) and never a value; `$prefix` places it in the answer (`items.3.`).
     */
    public static function refused(string $path, InvalidArgumentException $invalid, string $prefix = ''): LegacyContractError
    {
        $field = self::field($invalid, $prefix);

        return new LegacyContractError($path, $invalid->getMessage(), $field === '' ? [] : [$field]);
    }

    /** The field a data object's refusal names, placed by `$prefix`; the prefix alone (`history.0`) when it names none. */
    public static function field(InvalidArgumentException $invalid, string $prefix = ''): string
    {
        return preg_match('/"([^"]+)"/', $invalid->getMessage(), $match) === 1 ? $prefix.$match[1] : rtrim($prefix, '.');
    }

    /** `null` for an absent or `null` value; any other value is noted, then read as `null`. */
    private static function odd(mixed $value, string $key, ?Coercions $seen): null
    {
        if ($value !== null) {
            $seen?->note($key);
        }

        return null;
    }
}
