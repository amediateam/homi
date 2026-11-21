<?php

namespace App\Exceptions\Owner;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The owner cabinet is switched off (DEC-81, `config('owner.enabled')`), or the caller is not on
 * `owner.allowed_ids` when it is set (WP-84): the method would change content or create or resume a listing.
 */
final class OwnerCabinetDisabled extends ApiException
{
    public function __construct(string $message = 'The owner cabinet is not available.', ?Throwable $previous = null)
    {
        parent::__construct($message, 403, 'owner_disabled', previous: $previous);
    }
}
