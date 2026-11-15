<?php

namespace App\Services\Search;

use App\Enums\ListingSort;

/**
 * One page request of the feed (WP-12, `GET /listings`): the filters, the effective sort (`SearchFiltersNormaliser::
 * sortFor()`), the opaque cursor of the previous page (`null` for the first) and the page size (1 … 50).
 */
final readonly class ListingQuery
{
    public function __construct(
        public SearchFilters $filters,
        public ListingSort $sort = ListingSort::New,
        public ?string $cursor = null,
        public int $limit = 20,
    ) {}
}
