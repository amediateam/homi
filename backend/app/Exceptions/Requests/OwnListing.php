<?php

namespace App\Exceptions\Requests;

use App\Exceptions\ApiException;
use Throwable;

/**
 * A request on the caller's own listing (WP-80).
 */
final class OwnListing extends ApiException
{
    public function __construct(string $message = 'This is your own listing.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'own_listing', previous: $previous);
    }
}
