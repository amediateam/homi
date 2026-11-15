<?php

namespace App\Services\Personal;

use App\Services\Sources\Data\ListingSummary;

/** What the user hid (WP-13, `GET /hidden`): listings newest first, and blocked authors. */
final readonly class HiddenOverview
{
    /**
     * @param  list<ListingSummary>  $listings
     * @param  list<BlockedAuthor>  $authors
     */
    public function __construct(public array $listings, public array $authors) {}
}
