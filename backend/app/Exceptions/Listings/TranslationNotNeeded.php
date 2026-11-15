<?php

namespace App\Exceptions\Listings;

use App\Exceptions\ApiException;
use Throwable;

/** The request locale is the language of the originals (`ru`), so there is nothing to translate (WP-12). */
final class TranslationNotNeeded extends ApiException
{
    public function __construct(string $message = 'The original text is already in this language.', ?Throwable $previous = null)
    {
        parent::__construct($message, 422, 'translation_not_needed', previous: $previous);
    }
}
