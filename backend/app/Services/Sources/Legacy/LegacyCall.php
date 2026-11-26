<?php

namespace App\Services\Sources\Legacy;

use App\Services\Sources\SourceContext;

/**
 * How one legacy call is made (WP-41): the language and currency it asks for, in HOMI's codes, and whether a
 * background caller makes it. A background call (the radar matcher, cache warmers) uses only its share of the
 * outbound limiter and never waits for it.
 */
final readonly class LegacyCall
{
    public function __construct(
        public string $locale = 'ru',
        public string $currency = 'USD',
        public bool $background = false,
    ) {}

    /** A user's call in the language and currency of the request's context. */
    public static function for(SourceContext $context): self
    {
        return new self($context->locale, $context->currency);
    }
}
