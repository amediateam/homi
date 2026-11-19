<?php

namespace App\Exceptions\Listings;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The caller opened too many listings today (legacy release `index-CIa0Ldj2.js`): `429 {"code": "rate_limited",
 * "reason": "daily"}` with `Retry-After`, the seconds until the caller may open a listing again. A `429` without a
 * `reason` is the request limiter. Until the per-user limiter exists only the stub scenario `daily_limit` of
 * `GET /listings/{number}` throws it.
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
