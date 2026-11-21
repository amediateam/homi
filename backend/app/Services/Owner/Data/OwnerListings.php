<?php

namespace App\Services\Owner\Data;

/**
 * `GET /owner/listings` (WP-80): every listing of the caller, newest first; `max` the limit, `canAdd` whether one more
 * can count, `past` the listings that left the feed for good («С возвращением!», BR-APP-095).
 */
final readonly class OwnerListings
{
    /** @param  list<OwnerListing>  $items */
    public function __construct(public array $items, public int $max, public bool $canAdd, public int $past) {}
}
