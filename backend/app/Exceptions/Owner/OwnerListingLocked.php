<?php

namespace App\Exceptions\Owner;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The listing cannot be changed in its state: held, withdrawn, let or removed (WP-80).
 */
final class OwnerListingLocked extends ApiException
{
    public function __construct(string $message = 'The listing cannot be changed now.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'owner_listing_locked', previous: $previous);
    }
}
