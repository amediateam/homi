<?php

namespace App\Exceptions\Listings;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The caller opened too many listings in 24 hours (legacy release `index-CIa0Ldj2.js`): `429 {"code": "rate_limited",
 * "reason": "daily"}` with `Retry-After`, the seconds until the caller may open a listing again. A `429` without a
 * `reason` is a request limiter. Thrown by the daily cap `CountListingOpens` (WP-40) and by the stub scenario
 * `daily_limit` of `GET /listings/{number}`.
 */
final class DailyLimitReached extends ApiException
{
    public const string REASON = 'daily';

    public function __construct(public readonly int $retryAfter, ?Throwable $previous = null)
    {
        parent::__construct(
            'The daily limit of opened listings is reached.',
            429,
            'rate_limited',
            headers: ['Retry-After' => (string) $retryAfter],
            extra: ['reason' => self::REASON],
            previous: $previous,
        );
    }
}
