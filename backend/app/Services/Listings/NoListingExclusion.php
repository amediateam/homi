<?php

namespace App\Services\Listings;

use App\Services\Listings\Contracts\ListingExclusion;
use App\Services\Search\SearchFilters;
use App\Services\Sources\SourceContext;

/** Excludes nothing: the binding of `ListingExclusion` until the overlay of WP-42 stage C replaces it. */
final class NoListingExclusion implements ListingExclusion
{
    public function excluded(array $items, SearchFilters $filters, SourceContext $context): array
    {
        return [];
    }
}
