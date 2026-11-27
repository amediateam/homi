<?php

namespace App\Services\Listings;

use Illuminate\Support\Facades\Config;

/**
 * HOMI's own listing numbers (WP-80, "Native numbers"): every number at or above `owner.native_number_floor` is a
 * native listing, every number below it a legacy one. Legacy numbers were 47 265 – 49 829 on 2026-11-08 and the stub
 * catalogue uses six digits, so a fixed floor never collides; routing by range needs no lookup.
 */
final class ListingNumber
{
    /**
     * A listing number in a route's path: 1 to 18 digits without a leading zero, so it always fits the `int` the
     * controllers take and the `bigint` of the tables; any other path matches no route and answers `404 not_found`
     * (review of WP-44 stage A, F3).
     */
    public const string ROUTE_PATTERN = '[1-9][0-9]{0,17}';

    public static function floor(): int
    {
        return Config::integer('owner.native_number_floor');
    }

    public static function isNative(int $number): bool
    {
        return $number >= self::floor();
    }
}
