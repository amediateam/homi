<?php

namespace App\Services\Sources\Stub;

/**
 * The cursor of the stub lists (WP-12, WP-13): `s1.<offset>`. A cursor that does not decode, or has another prefix
 * (a legacy cursor after a flag switch), ends the list quietly: an empty page and a null cursor, as the legacy driver
 * does (WP-42).
 */
final class StubCursor
{
    /** The offset of a cursor; 0 for the first page, null for a cursor this list did not give. */
    public static function offset(?string $cursor): ?int
    {
        if ($cursor === null) {
            return 0;
        }

        return preg_match('/^s1\.(\d{1,6})$/', $cursor, $match) === 1 ? (int) $match[1] : null;
    }

    /**
     * One page of a list and the cursor of the next one.
     *
     * @template T
     *
     * @param  list<T>  $items
     * @return array{0: list<T>, 1: string|null}
     */
    public static function page(array $items, ?string $cursor, int $limit): array
    {
        $offset = self::offset($cursor);

        if ($offset === null) {
            return [[], null];
        }

        $next = $offset + $limit;

        return [array_slice($items, $offset, $limit), $next < count($items) ? "s1.{$next}" : null];
    }
}
