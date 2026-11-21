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
    public static function floor(): int
    {
        return Config::integer('owner.native_number_floor');
    }

    public static function isNative(int $number): bool
    {
        return $number >= self::floor();
    }
}
