<?php

namespace App\Exceptions\Listings;

use App\Exceptions\ApiException;
use Throwable;

/** The listing has no phone to give, or the disclosure limit is reached (WP-12; the quota arrives with WP-43). */
final class ContactUnavailable extends ApiException
{
    public function __construct(string $message = 'No contact is available for this listing.', ?Throwable $previous = null)
    {
        parent::__construct($message, 404, 'contact_unavailable', previous: $previous);
    }
}
