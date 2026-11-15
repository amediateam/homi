<?php

namespace App\Services\Sources\Data;

/**
 * The answer of `POST /listings/{number}/contact` (WP-12, DEC-52), the only object with the author's number. `phone`
 * is E.164 and `phoneDisplay` its display form; both are null when the source has no raw number (Q-API-062), and
 * `callUrl` (absolute, valid for at least 10 minutes) is always set.
 */
final readonly class ListingContact
{
    public function __construct(
        public string $callUrl,
        public string $expiresAt,
        public ?string $phone,
        public ?string $phoneDisplay,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            callUrl: Fields::string($data, 'call_url'),
            expiresAt: Fields::string($data, 'expires_at'),
            phone: Fields::nullableString($data, 'phone'),
            phoneDisplay: Fields::nullableString($data, 'phone_display'),
        );
    }
}
