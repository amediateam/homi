<?php

namespace App\Exceptions\Requests;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The owner's answer is no longer possible: the undo window passed, or the request changed meanwhile (WP-80).
 */
final class RequestAnswerClosed extends ApiException
{
    public function __construct(string $message = 'This answer is no longer possible.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'request_answer_closed', previous: $previous);
    }
}
