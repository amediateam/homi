<?php

namespace App\Services\Sources\Data;

use App\Enums\OwnerTier;
use App\Services\Listings\PhoneMasker;

/**
 * The owner part of the full card (WP-80, "Listing items and the card"): the tier that replaces the string match of
 * labels (fix of LB-APP-075), the caller's own listing (`mine`, `listingId` only then), the invitation to place one
 * (`entry`, DEC-94), the owner's usual answer time and his own text, masked (DEC-52).
 */
final readonly class ListingOwner
{
    public function __construct(
        public ?OwnerTier $tier,
        public bool $mine,
        public ?string $listingId,
        public bool $entry,
        public ?int $responseMinutes,
        public ?string $description,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $tier = Fields::nullableString($data, 'tier');
        $mine = Fields::bool($data, 'mine');
        $description = Fields::nullableString($data, 'description');

        return new self(
            tier: $tier === null ? null : (OwnerTier::tryFrom($tier) ?? throw new \InvalidArgumentException('The field "tier" must be an owner tier or null.')),
            mine: $mine,
            listingId: $mine ? Fields::nullableString($data, 'listing_id') : null,
            entry: array_key_exists('entry', $data) && Fields::bool($data, 'entry'),
            responseMinutes: Fields::nullableInt($data, 'response_minutes'),
            description: $description === null ? null : PhoneMasker::mask($description),
        );
    }

    /** The same owner part with the invitation of DEC-94 decided by the source. */
    public function withEntry(bool $entry): self
    {
        return clone ($this, ['entry' => $entry]);
    }
}
