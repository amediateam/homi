<?php

namespace App\Services\Listings;

/**
 * What a personal table stores beside a listing number (`25` §5, Q-API-063; WP-44): the channel and post it was
 * published under, both `null` when HOMI has not seen its card.
 */
final readonly class ListingPointer
{
    public function __construct(public int $number, public ?string $channel, public ?int $postId) {}
}
