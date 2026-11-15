<?php

namespace App\Exceptions\Listings;

use App\Exceptions\ApiException;
use Throwable;

/** The translation service cannot answer (WP-12; the real translation is WP-43). */
final class TranslationUnavailable extends ApiException
{
    public function __construct(string $message = 'The translation is unavailable.', ?Throwable $previous = null)
    {
        parent::__construct($message, 503, 'translation_unavailable', previous: $previous);
    }
}
