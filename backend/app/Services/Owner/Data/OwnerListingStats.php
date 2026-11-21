<?php

namespace App\Services\Owner\Data;

use App\Services\Sources\Data\Fields;

/**
 * The counters of a published owner listing (WP-80): requests by state, opens, favourites, days listed, opens per
 * day (oldest first, the last is today in Asia/Tashkent) and the price against the median, both `null` without one.
 */
final readonly class OwnerListingStats
{
    /** @param  list<int>  $daily */
    public function __construct(
        public int $pending,
        public int $requests,
        public int $given,
        public int $sent,
        public int $opened,
        public int $favorites,
        public ?int $daysListed,
        public array $daily,
        public ?float $priceDelta,
        public ?string $priceTone,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            pending: Fields::count($data, 'pending'),
            requests: Fields::count($data, 'requests'),
            given: Fields::count($data, 'given'),
            sent: Fields::count($data, 'sent'),
            opened: Fields::count($data, 'opened'),
            favorites: Fields::count($data, 'favorites'),
            daysListed: Fields::nullableInt($data, 'days_listed'),
            daily: Fields::ints($data, 'daily'),
            priceDelta: Fields::nullableFloat($data, 'price_delta'),
            priceTone: Fields::nullableString($data, 'price_tone'),
        );
    }
}
