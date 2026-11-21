<?php

namespace App\Exceptions\Owner;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The listing is rejected (WP-80): `reason` is `denied` (the operators' deny list) or `limit` (the phone's limit at
 * the confirmation).
 */
final class OwnerRejected extends ApiException
{
    public function __construct(string $reason, string $message = 'The listing is rejected.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'owner_rejected', extra: ['reason' => $reason], previous: $previous);
    }
}
