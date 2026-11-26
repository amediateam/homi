<?php

namespace App\Services\Access;

use Illuminate\Support\Facades\Config;

/**
 * Reads the counts of `config/rate_limits.php` (WP-40) leniently: a positive whole number (an integer or a string of
 * digits) is used; anything else — missing, blank, zero, negative, not a number — is the default of `DEFAULTS`, so a
 * mistyped server setting never turns a request into a `500` and never locks everyone out with a limit of 0.
 */
final class RateLimits
{
    /**
     * The starting values of SEC-REQ-027 (and DEC-104 for the daily cap), by key of `config/rate_limits.php` in dot
     * notation. The config file holds the same values; a test keeps them equal.
     *
     * @var array<string, positive-int>
     */
    public const array DEFAULTS = [
        'auth.per_address' => 10,
        'auth.per_user' => 5,
        'public.per_minute' => 60,
        'me.per_minute' => 30,
        'reads.per_minute' => 300,
        'listing.per_minute' => 120,
        'listing_opens_per_day' => 100,
        'contact.per_hour' => 30,
        'translation.per_hour' => 30,
        'share.per_hour' => 20,
        'lists.per_minute' => 60,
        'reports.per_day' => 30,
        'radars.per_minute' => 30,
        'events.per_minute' => 60,
        'media.per_minute' => 120,
    ];

    /**
     * The configured count of `rate_limits.<key>`, or its default when the value cannot be read.
     *
     * @param  key-of<self::DEFAULTS>  $key
     * @return positive-int
     */
    public static function value(string $key): int
    {
        $value = Config::get('rate_limits.'.$key);

        if (is_string($value) && ctype_digit(trim($value))) {
            $value = (int) trim($value);
        }

        return is_int($value) && $value > 0 ? $value : self::DEFAULTS[$key];
    }
}
