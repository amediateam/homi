<?php

namespace App\Services\Sources\Data;

use App\Enums\Deal;
use InvalidArgumentException;

/**
 * Strict reads of decoded JSON for the `fromArray()` constructors of the data objects. A fixture or a legacy answer
 * that misses or mistypes a field fails loudly with the field name, instead of reaching a client half-filled.
 */
final class Fields
{
    /** @param  array<array-key, mixed>  $data */
    public static function string(array $data, string $key): string
    {
        $value = $data[$key] ?? null;

        return is_string($value) ? $value : throw self::invalid($key, 'a string');
    }

    /** @param  array<array-key, mixed>  $data */
    public static function nullableString(array $data, string $key): ?string
    {
        if (! array_key_exists($key, $data)) {
            throw self::invalid($key, 'a string or null');
        }

        $value = $data[$key];

        return $value === null || is_string($value) ? $value : throw self::invalid($key, 'a string or null');
    }

    /** @param  array<array-key, mixed>  $data */
    public static function int(array $data, string $key): int
    {
        $value = $data[$key] ?? null;

        return is_int($value) ? $value : throw self::invalid($key, 'a whole number');
    }

    /** @param  array<array-key, mixed>  $data */
    public static function count(array $data, string $key): int
    {
        $value = self::int($data, $key);

        return $value >= 0 ? $value : throw self::invalid($key, 'a whole number ≥ 0');
    }

    /** @param  array<array-key, mixed>  $data */
    public static function float(array $data, string $key): float
    {
        $value = $data[$key] ?? null;

        return is_int($value) || is_float($value) ? (float) $value : throw self::invalid($key, 'a number');
    }

    /** @param  array<array-key, mixed>  $data */
    public static function bool(array $data, string $key): bool
    {
        $value = $data[$key] ?? null;

        return is_bool($value) ? $value : throw self::invalid($key, 'true or false');
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return array<array-key, mixed>
     */
    public static function object(array $data, string $key): array
    {
        $value = $data[$key] ?? null;

        return is_array($value) ? $value : throw self::invalid($key, 'an object');
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<array<array-key, mixed>>
     */
    public static function objects(array $data, string $key): array
    {
        $value = $data[$key] ?? null;

        if (! is_array($value) || ! array_is_list($value)) {
            throw self::invalid($key, 'a list');
        }

        foreach ($value as $item) {
            if (! is_array($item)) {
                throw self::invalid($key, 'a list of objects');
            }
        }

        /** @var list<array<array-key, mixed>> $value */
        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<string>
     */
    public static function strings(array $data, string $key): array
    {
        $value = $data[$key] ?? null;

        if (! is_array($value) || ! array_is_list($value) || array_filter($value, fn (mixed $item): bool => ! is_string($item)) !== []) {
            throw self::invalid($key, 'a list of strings');
        }

        /** @var list<string> $value */
        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<int>
     */
    public static function ints(array $data, string $key): array
    {
        $value = $data[$key] ?? null;

        if (! is_array($value) || ! array_is_list($value) || array_filter($value, fn (mixed $item): bool => ! is_int($item)) !== []) {
            throw self::invalid($key, 'a list of whole numbers');
        }

        /** @var list<int> $value */
        return $value;
    }

    /** @param  array<array-key, mixed>  $data */
    public static function nullableInt(array $data, string $key): ?int
    {
        return self::present($data, $key, 'a whole number or null') === null ? null : self::int($data, $key);
    }

    /** @param  array<array-key, mixed>  $data */
    public static function nullableFloat(array $data, string $key): ?float
    {
        return self::present($data, $key, 'a number or null') === null ? null : self::float($data, $key);
    }

    /** @param  array<array-key, mixed>  $data */
    public static function nullableBool(array $data, string $key): ?bool
    {
        return self::present($data, $key, 'true, false or null') === null ? null : self::bool($data, $key);
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return array<array-key, mixed>|null
     */
    public static function nullableObject(array $data, string $key): ?array
    {
        return self::present($data, $key, 'an object or null') === null ? null : self::object($data, $key);
    }

    /**
     * The value of a key that must exist, even when it is null.
     *
     * @param  array<array-key, mixed>  $data
     */
    private static function present(array $data, string $key, string $expected): mixed
    {
        return array_key_exists($key, $data) ? $data[$key] : throw self::invalid($key, $expected);
    }

    /**
     * A per-deal object. With `$complete` every deal must be present; otherwise a deal may be missing, but no key may
     * be other than a deal.
     *
     * @template T
     *
     * @param  array<array-key, mixed>  $data
     * @param  callable(array<array-key, mixed>, string): T  $read  reads one deal's value from the object
     * @return array<string, T>
     */
    public static function byDeal(array $data, string $key, callable $read, bool $complete): array
    {
        $object = self::object($data, $key);
        $unknown = array_diff(array_map('strval', array_keys($object)), Deal::values());

        if ($unknown !== []) {
            throw self::invalid($key, 'an object keyed by rent_long, rent_daily and sale, not '.implode(', ', $unknown));
        }

        $values = [];

        foreach (Deal::values() as $deal) {
            if (array_key_exists($deal, $object)) {
                $values[$deal] = $read($object, $deal);
            } elseif ($complete) {
                throw self::invalid("{$key}.{$deal}", 'present');
            }
        }

        return $values;
    }

    private static function invalid(string $key, string $expected): InvalidArgumentException
    {
        return new InvalidArgumentException("The field \"{$key}\" must be {$expected}.");
    }
}
