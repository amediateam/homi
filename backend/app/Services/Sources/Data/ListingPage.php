<?php

namespace App\Services\Sources\Data;

/**
 * One page of the feed (WP-12): at most `limit` previews, maybe fewer; `nextCursor` null ends the list (BR-APP-024).
 */
final readonly class ListingPage
{
    /** @param  list<ListingSummary>  $items */
    public function __construct(public array $items, public ?string $nextCursor) {}
}
