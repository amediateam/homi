<?php

namespace App\Services\Listings\Contracts;

use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;

/**
 * Which listings of a list the caller must not see (WP-42 "Overlay", steps 1 and 4): the seam through which the
 * legacy feed pager tops a page up after HOMI's own exclusions. One call per legacy page, so an implementation reads
 * HOMI's data once per page.
 *
 * This package binds `NoListingExclusion` (nothing is excluded); stage C binds `ListingOverlay` — hidden listings,
 * blocked authors, listings rented by HOMI's votes, and, when `$filters->owner` asks for owners or no agents, the
 * listings of authors HOMI's votes mark as realtors.
 */
interface ListingExclusion
{
    /**
     * @param  list<ListingSummary>  $items  the translated items of one legacy page, in legacy's order
     * @return list<int> the numbers among `$items` to leave out of the caller's list
     */
    public function excluded(array $items, SearchFilters $filters, SourceContext $context): array;
}
