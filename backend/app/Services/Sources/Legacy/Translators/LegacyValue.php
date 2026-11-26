<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Exceptions\Sources\LegacyContractError;
use InvalidArgumentException;

/**
 * Lenient reads of the optional keys of a legacy answer (WP-42). The listing translators are strict only about the
 * keys the contract requires (`08` §1.8, the `!` keys); an optional key that is absent or of another type reads as
 * `null`, so one odd field never fails a card. Pure.
 */
final class LegacyValue
{
    private function __construct() {}

    /** @param  array<array-key, mixed>  $data  a non-empty string, else `null` */
    public static function string(array $data, string $key): ?string
    {
        $value = $data[$key] ?? null;

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    /** @param  array<array-key, mixed>  $data  a finite JSON number as sent (whole or not), else `null` */
    public static function number(array $data, string $key): int|float|null
    {
        $value = $data[$key] ?? null;

        return is_int($value) || (is_float($value) && is_finite($value)) ? $value : null;
    }

    /**
     * A JSON number as a whole number: a fraction is rounded (an optional count, floor or USD amount never fails a
     * card); anything else is `null`.
     *
     * @param  array<array-key, mixed>  $data
     */
    public static function int(array $data, string $key): ?int
    {
        return self::whole($data[$key] ?? null);
    }

    /** The value as a whole number per `int()`. */
    public static function whole(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        return is_float($value) && is_finite($value) && abs($value) < PHP_INT_MAX ? (int) round($value) : null;
    }

    /** @param  array<array-key, mixed>  $data  `true` or `false`, else `null` */
    public static function bool(array $data, string $key): ?bool
    {
        $value = $data[$key] ?? null;

        return is_bool($value) ? $value : null;
    }

    /**
     * The client's truthiness check of an `unknown` key (`video`, `median`, `median_reason`): JavaScript's falsy values
     * are `null`, `false`, `0`, `''`; an empty object or list is truthy there.
     *
     * @param  array<array-key, mixed>  $data
     */
    public static function truthy(array $data, string $key): bool
    {
        $value = $data[$key] ?? null;

        return ! in_array($value, [null, false, 0, 0.0, ''], true) && ! (is_float($value) && is_nan($value));
    }

    /**
     * A list of objects; `[]` when the key is absent or `null`.
     *
     * @param  array<array-key, mixed>  $data
     * @return list<array<array-key, mixed>>
     *
     * @throws LegacyContractError naming the key when it is not a list of objects
     */
    public static function objects(array $data, string $key, string $path, string $prefix = ''): array
    {
        $value = $data[$key] ?? null;

        if ($value === null) {
            return [];
        }

        if (! is_array($value) || ! array_is_list($value)) {
            throw LegacyContractError::key($path, $prefix.$key, 'not a list');
        }

        foreach ($value as $index => $item) {
            if (! is_array($item)) {
                throw LegacyContractError::key($path, "{$prefix}{$key}.{$index}", 'not an object');
            }
        }

        /** @var list<array<array-key, mixed>> $value */
        return $value;
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
     * A data object's refusal as a contract error: its message names the field (`The field "x" must be …`, `The
     * filter "x" is …`) and never a value.
     */
    public static function refused(string $path, InvalidArgumentException $invalid, string $prefix = ''): LegacyContractError
    {
        $keys = preg_match('/"([^"]+)"/', $invalid->getMessage(), $match) === 1 ? [$prefix.$match[1]] : [];

        return new LegacyContractError($path, $invalid->getMessage(), $keys);
    }
}
