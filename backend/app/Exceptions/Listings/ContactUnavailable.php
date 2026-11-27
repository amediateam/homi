<?php

namespace App\Exceptions\Listings;

use App\Exceptions\ApiException;
use Throwable;

/** The listing has no phone or call link to give, or the disclosure quota refuses it (WP-12, WP-43). */
final class ContactUnavailable extends ApiException
{
    public function __construct(string $message = 'No contact is available for this listing.', ?Throwable $previous = null)
    {
        parent::__construct($message, 404, 'contact_unavailable', previous: $previous);
    }
}
