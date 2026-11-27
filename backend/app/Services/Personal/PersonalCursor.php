<?php

namespace App\Services\Personal;

use JsonException;

/**
 * The cursor of the personal lists (WP-44, "List pages"; DEC-53): `n1.` + base64url of the JSON list that is the last
 * row's sort key — `[id]` for favourites, `[last_viewed_at as Unix seconds, id]` for history. A cursor that does not
 * decode into a key of the list's size, with whole numbers of 0 or more, is foreign: the list ends quietly (empty
 * `data`, `null` cursor), as the feed's does (WP-42).
 */
final class PersonalCursor
{
    private const string PREFIX = 'n1.';

    /** @param  list<int>  $key */
    public static function encode(array $key): string
    {
        return self::PREFIX.rtrim(strtr(base64_encode(json_encode($key, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
    }

    /**
     * The key of a cursor this list gave, else `null`.
     *
     * @return list<int>|null
     */
    public static function decode(string $cursor, int $size): ?array
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

        if (! is_array($key) || ! array_is_list($key) || count($key) !== $size) {
            return null;
        }

        foreach ($key as $part) {
            if (! is_int($part) || $part < 0) {
                return null;
            }
        }

        return $key;
    }
}
