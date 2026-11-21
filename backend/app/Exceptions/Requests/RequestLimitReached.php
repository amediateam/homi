<?php

namespace App\Exceptions\Requests;

use App\Exceptions\ApiException;
use Throwable;

/**
 * A seeker's request limit (WP-80, WP-85): `reason` is `requests_fast` (the pause after several requests in a row),
 * `requests_day` or `requests_week`; `Retry-After` in seconds.
 */
final class RequestLimitReached extends ApiException
{
    public function __construct(string $reason, int $retryAfter, string $message = 'Too many requests.', ?Throwable $previous = null)
    {
        parent::__construct($message, 429, 'rate_limited', headers: ['Retry-After' => (string) $retryAfter], extra: ['reason' => $reason], previous: $previous);
    }
}
