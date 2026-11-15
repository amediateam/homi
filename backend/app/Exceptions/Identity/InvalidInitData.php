<?php

namespace App\Exceptions\Identity;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The Telegram launch data is malformed or its signature is wrong: `401 invalid_init_data`. The message never holds
 * the raw value. The stub sign-in of WP-11 throws it for its scenario; WP-40 throws it from the verifier and adds the
 * internal reason.
 */
final class InvalidInitData extends ApiException
{
    public function __construct(?Throwable $previous = null)
    {
        parent::__construct('The Telegram launch data is invalid.', 401, 'invalid_init_data', previous: $previous);
    }
}
