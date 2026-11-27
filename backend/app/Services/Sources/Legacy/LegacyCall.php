<?php

namespace App\Services\Sources\Legacy;

use App\Services\Sources\SourceContext;

/**
 * How one legacy call is made (WP-41): the language and currency it asks for, in HOMI's codes, and whether a
 * background caller makes it. A background call (the radar matcher, cache warmers) uses only its share of the
 * outbound limiter and never waits for it. An optional call (WP-43: the translation, a feature the client can do
 * without) is refused while the breaker is open or waiting for its probe, is never the probe, and tells the breaker
 * nothing: its timeouts and server errors are not failures, and its success does not close the breaker
 * (`LegacyBreaker::admitOptional()`).
 */
final readonly class LegacyCall
{
    public function __construct(
        public string $locale = 'ru',
        public string $currency = 'USD',
        public bool $background = false,
        public bool $optional = false,
    ) {}

    /** A user's call in the language and currency of the request's context. */
    public static function for(SourceContext $context): self
    {
        return new self($context->locale, $context->currency);
    }
}
