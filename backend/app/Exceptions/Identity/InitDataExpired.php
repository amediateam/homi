<?php

namespace App\Exceptions\Identity;

use App\Exceptions\ApiException;
use Illuminate\Contracts\Debug\ShouldntReport;
use Throwable;

/**
 * The Telegram launch data is older than the window: `401 auth_expired`. The client asks to reopen the app instead of
 * signing in again in a loop (LB-APP-047). An expected refusal, never reported; the sign-in logs it in its own line.
 */
final class InitDataExpired extends ApiException implements ShouldntReport
{
    public function __construct(?Throwable $previous = null)
    {
        parent::__construct('The Telegram launch data has expired; reopen the app.', 401, 'auth_expired', previous: $previous);
    }
}
