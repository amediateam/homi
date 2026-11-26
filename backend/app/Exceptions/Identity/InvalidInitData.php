<?php

namespace App\Exceptions\Identity;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The Telegram launch data is malformed or its signature is wrong: `401 invalid_init_data`. The message never holds
 * the raw value, and `reason` stays internal (the body is the same for every reason). The verifier of WP-40 throws it;
 * the stub sign-in throws it for its scenario.
 */
final class InvalidInitData extends ApiException
{
    public function __construct(public readonly InvalidInitDataReason $reason, ?Throwable $previous = null)
    {
        parent::__construct('The Telegram launch data is invalid.', 401, 'invalid_init_data', previous: $previous);
    }
}
