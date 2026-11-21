<?php

namespace App\Exceptions\Requests;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The listing shows its number now (`phone` mode): the client reads the card again (WP-80).
 */
final class ContactOpen extends ApiException
{
    public function __construct(string $message = 'The listing shows its number now.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'contact_open', previous: $previous);
    }
}
