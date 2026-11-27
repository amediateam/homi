<?php

namespace App\Services\Listings;

use Carbon\CarbonImmutable;

/**
 * What a correctly signed call token says (WP-43): the listing, the user it was issued to, the language of its pages
 * and its expiry (Unix seconds). It holds no phone number. `expired()` allows `SKEW_SECONDS` of clock skew between
 * the servers, so a link of 600 s opens until 660 s after it was issued.
 */
final readonly class CallLinkClaims
{
    public const int SKEW_SECONDS = 60;

    public function __construct(
        public int $number,
        public int $userId,
        public string $locale,
        public int $expiresAt,
    ) {}

    public function expired(): bool
    {
        return CarbonImmutable::now()->getTimestamp() > $this->expiresAt + self::SKEW_SECONDS;
    }
}
