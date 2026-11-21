<?php

namespace App\Exceptions\Owner;

use App\Exceptions\ApiException;
use Throwable;

/**
 * One photo more than `limits.owner_photos` (WP-80).
 */
final class OwnerPhotoLimit extends ApiException
{
    public function __construct(string $message = 'The photo limit is reached.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'owner_photo_limit', previous: $previous);
    }
}
