<?php

namespace App\Services\Listings;

/**
 * What a personal table stores beside a listing number (`25` §5, Q-API-063; WP-44): the channel and post it was
 * published under, both `null` when HOMI has not seen its card. `filed` says whether `listing_refs` knew the number
 * when it was resolved (`App\Services\Personal\ListingResolver`); a pointer the source gave instead has neither channel
 * nor post yet, and `ResolveListingRef` back-fills them after the write.
 */
final readonly class ListingPointer
{
    public function __construct(public int $number, public ?string $channel, public ?int $postId, public bool $filed = true) {}
}
