<?php

namespace Tests\Support;

use PHPUnit\Framework\Assert;

/**
 * The structure of a decoded JSON answer, for the contract tests of WP-11 … WP-13, WP-42 and WP-48: the stub and the
 * legacy driver of a method must answer in the same shape.
 *
 * - an object: its keys, each with the shape of its value;
 * - a list: `['*' => <union of the element shapes>]`; an empty list (or empty object) is `[]`;
 * - a leaf: its type name, `string`, `int`, `float`, `bool` or `null`; different leaf types join as `int|null`.
 *
 * `assertSame()` treats `null` as compatible with any type and an empty list as compatible with any list.
 */
final class JsonShape
{
    public static function of(mixed $data): mixed
    {
        if (! is_array($data)) {
            return self::type($data);
        }

        if ($data === []) {
            return [];
        }

        if (array_is_list($data)) {
            return ['*' => array_reduce($data, fn (mixed $shape, mixed $item): mixed => $shape === null ? self::of($item) : self::union($shape, self::of($item)))];
        }

        return array_map(self::of(...), $data);
    }

    public static function assertSame(mixed $expected, mixed $actual): void
    {
        $difference = self::difference($expected, $actual, '');

        if ($difference !== null) {
            Assert::fail("The JSON shape differs {$difference}.");
        }

        Assert::assertNull($difference);
    }

    private static function type(mixed $value): string
    {
        return match (true) {
            is_string($value) => 'string',
            is_int($value) => 'int',
            is_float($value) => 'float',
            is_bool($value) => 'bool',
            $value === null => 'null',
            default => get_debug_type($value),
        };
    }

    private static function union(mixed $a, mixed $b): mixed
    {
        if ($a === $b) {
            return $a;
        }

        if (is_string($a) && is_string($b)) {
            $types = array_unique([...explode('|', $a), ...explode('|', $b)]);
            sort($types);

            return implode('|', $types);
        }

        if ($a === 'null' || $a === []) {
            return $b;
        }

        if ($b === 'null' || $b === []) {
            return $a;
        }

        if (is_array($a) && is_array($b) && self::isList($a) === self::isList($b)) {
            $union = [];

            foreach ([...array_keys($a), ...array_keys($b)] as $key) {
                $union[$key] = array_key_exists($key, $a) && array_key_exists($key, $b) ? self::union($a[$key], $b[$key]) : ($a[$key] ?? $b[$key]);
            }

            return $union;
        }

        return 'mixed';
    }

    private static function difference(mixed $expected, mixed $actual, string $path): ?string
    {
        $at = $path === '' ? '(root)' : $path;

        if ($expected === 'null' || $actual === 'null') {
            return null;
        }

        if (is_string($expected) && is_string($actual)) {
            $unexpected = array_diff(explode('|', $actual), explode('|', $expected), ['null']);

            return $unexpected === [] ? null : "at {$at}: expected {$expected}, got {$actual}";
        }

        if (! is_array($expected) || ! is_array($actual)) {
            return "at {$at}: expected ".self::describe($expected).', got '.self::describe($actual);
        }

        if ($expected === [] || self::isList($expected)) {
            if ($actual === []) {
                return null;
            }

            if (! self::isList($actual)) {
                return "at {$at}: expected a list, got an object";
            }

            return $expected === [] ? null : self::difference($expected['*'], $actual['*'], "{$path}.*");
        }

        if ($actual !== [] && self::isList($actual)) {
            return "at {$at}: expected an object, got a list";
        }

        foreach ($expected as $key => $shape) {
            $child = $path === '' ? (string) $key : "{$path}.{$key}";

            if (! array_key_exists($key, $actual)) {
                return "at {$child}: missing";
            }

            $difference = self::difference($shape, $actual[$key], $child);

            if ($difference !== null) {
                return $difference;
            }
        }

        foreach (array_keys(array_diff_key($actual, $expected)) as $key) {
            return 'at '.($path === '' ? (string) $key : "{$path}.{$key}").': not expected';
        }

        return null;
    }

    /** @param  array<array-key, mixed>  $shape */
    private static function isList(array $shape): bool
    {
        return array_keys($shape) === ['*'];
    }

    private static function describe(mixed $shape): string
    {
        return match (true) {
            is_string($shape) => $shape,
            $shape === [] => 'an empty list',
            is_array($shape) && self::isList($shape) => 'a list',
            default => 'an object',
        };
    }
}
