<?php

namespace App\Exceptions\Owner;

use App\Exceptions\ApiException;
use Throwable;

/**
 * Publish without a confirmed number (WP-80).
 */
final class OwnerPhoneRequired extends ApiException
{
    public function __construct(string $message = 'A confirmed phone number is required.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'owner_phone_required', previous: $previous);
    }
}
