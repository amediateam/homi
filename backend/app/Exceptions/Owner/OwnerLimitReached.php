<?php

namespace App\Exceptions\Owner;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The account or the phone already has `max` listings that count (WP-80): `limit` is `account` or `phone`.
 */
final class OwnerLimitReached extends ApiException
{
    public function __construct(string $limit, int $max, string $message = 'The listing limit is reached.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'owner_limit', extra: ['limit' => $limit, 'max' => $max], previous: $previous);
    }
}
