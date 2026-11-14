<?php

namespace App\Exceptions\Sources;

use App\Exceptions\ApiException;
use Throwable;

/** The source does not know the requested item, for example a listing number. */
final class SourceNotFound extends ApiException
{
    public function __construct(string $message = 'Resource not found.', ?Throwable $previous = null)
    {
        parent::__construct($message, 404, 'not_found', previous: $previous);
    }
}
