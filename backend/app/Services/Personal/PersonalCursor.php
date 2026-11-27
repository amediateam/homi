<?php

namespace App\Services\Personal;

use JsonException;

/**
 * The cursor of the personal lists (WP-44, "List pages"; DEC-53): `n1.` + base64url of the JSON list that is the last
 * row's sort key — `[id]` for favourites, `[last_viewed_at as Unix seconds, id]` for history. Each position has its own
 * range: a row id is a whole number from 1 to `PHP_INT_MAX` (`ROW_ID`), a time a whole number of seconds from 0 to
 * the last second of the year 9999 UTC (`TIME`), the widest that SQLite's text dates and PostgreSQL's `timestamptz`
 * both compare and that formats without an error — a larger time once answered `500` (review of stage A, F2). A
 * cursor that does not decode into a key of the list's size, each position within its range, is foreign: the list
 * ends quietly (empty `data`, `null` cursor), as the feed's does (WP-42).
 */
final class PersonalCursor
{
    /** A row id: a whole number from 1 to the largest integer, which a `bigint` holds. */
    public const array ROW_ID = [1, PHP_INT_MAX];

    /** A time in Unix seconds: from 1970 to 9999-12-31 23:59:59 UTC. */
    public const array TIME = [0, 253402300799];

    private const string PREFIX = 'n1.';

    /** @param  list<int>  $key */
    public static function encode(array $key): string
    {
        return self::PREFIX.rtrim(strtr(base64_encode(json_encode($key, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
    }

    /**
     * The key of a cursor this list gave, else `null`: one whole number per range, each within its range.
     *
     * @param  list<array{int, int}>  $ranges  the inclusive range of each position, in order
     * @return list<int>|null
     */
    public static function decode(string $cursor, array $ranges): ?array
    {
        if (! str_starts_with($cursor, self::PREFIX)) {
            return null;
        }

        $json = base64_decode(strtr(substr($cursor, strlen(self::PREFIX)), '-_', '+/'), true);

        if ($json === false) {
            return null;
        }

        try {
            $key = json_decode($json, true, 2, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        if (! is_array($key) || ! array_is_list($key) || count($key) !== count($ranges)) {
            return null;
        }

        foreach ($key as $i => $part) {
            [$min, $max] = $ranges[$i];

            if (! is_int($part) || $part < $min || $part > $max) {
                return null;
            }
        }

        return $key;
    }
}
