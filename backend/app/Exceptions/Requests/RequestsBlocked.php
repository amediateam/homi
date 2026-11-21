<?php

namespace App\Exceptions\Requests;

use App\Exceptions\ApiException;
use Throwable;

/**
 * Requests of this user are closed (WP-80, WP-85; legacy `blocked` and `harvest` alike).
 */
final class RequestsBlocked extends ApiException
{
    public function __construct(string $message = 'Requests are closed for this account.', ?Throwable $previous = null)
    {
        parent::__construct($message, 403, 'requests_blocked', previous: $previous);
    }
}
