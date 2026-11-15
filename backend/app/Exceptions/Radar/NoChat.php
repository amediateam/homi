<?php

namespace App\Exceptions\Radar;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The bot cannot write to the user (WP-13): checked before any radar write, so nothing is changed and the client's
 * single repeat after the user grants write access creates exactly one radar.
 */
final class NoChat extends ApiException
{
    public function __construct(string $message = 'The bot cannot write to you yet.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'no_chat', previous: $previous);
    }
}
