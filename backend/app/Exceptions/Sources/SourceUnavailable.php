<?php

namespace App\Exceptions\Sources;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The source of a method cannot answer: the driver is not bound, stubs are off, or the source failed (`25` §4.1).
 * The client shows the legacy "could not load" state.
 */
final class SourceUnavailable extends ApiException
{
    public function __construct(string $message = 'The data source is unavailable.', ?Throwable $previous = null)
    {
        parent::__construct($message, 503, 'source_unavailable', previous: $previous);
    }
}
