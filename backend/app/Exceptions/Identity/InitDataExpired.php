<?php

namespace App\Exceptions\Identity;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The Telegram launch data is older than the window: `401 auth_expired`. The client asks to reopen the app instead of
 * signing in again in a loop (LB-APP-047).
 */
final class InitDataExpired extends ApiException
{
    public function __construct(?Throwable $previous = null)
    {
        parent::__construct('The Telegram launch data has expired; reopen the app.', 401, 'auth_expired', previous: $previous);
    }
}
