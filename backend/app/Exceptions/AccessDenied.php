<?php

namespace App\Exceptions;

use App\Enums\AccessReason;
use Throwable;

/**
 * The access gate refuses the user: `403 {"code": "access_denied", "reason": …}` on sign-in and on every bearer route
 * (WP-11). A missing token ability is the different code `forbidden`.
 */
final class AccessDenied extends ApiException
{
    public function __construct(public readonly AccessReason $reason, ?Throwable $previous = null)
    {
        parent::__construct('Access denied.', 403, 'access_denied', extra: ['reason' => $reason->value], previous: $previous);
    }
}
