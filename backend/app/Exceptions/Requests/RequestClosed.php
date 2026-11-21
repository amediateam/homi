<?php

namespace App\Exceptions\Requests;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The listing takes no requests from the caller, or none more today (WP-80, WP-85).
 */
final class RequestClosed extends ApiException
{
    public function __construct(string $message = 'This listing takes no requests now.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'request_closed', previous: $previous);
    }
}
