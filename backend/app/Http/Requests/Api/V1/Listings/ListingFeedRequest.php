<?php

namespace App\Http\Requests\Api\V1\Listings;

use App\Enums\ListingSort;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFiltersNormaliser;
use Illuminate\Validation\Rule;

/**
 * `GET /listings` (WP-12): the filter parameters plus `sort` (default `new`; an order the filters do not offer falls
 * back to `new`, BR-APP-023), `cursor` (opaque, from `meta.next_cursor`) and `limit` (1 … 50, default 20).
 */
class ListingFeedRequest extends ListingFiltersRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'sort' => ['nullable', Rule::enum(ListingSort::class)],
            'cursor' => ['nullable', 'string', 'max:512'],
            'limit' => ['nullable', 'integer', 'between:1,50'],
        ];
    }

    public function listingQuery(): ListingQuery
    {
        $filters = $this->filters();
        $sort = ListingSort::tryFrom($this->string('sort', ListingSort::New->value)->toString()) ?? ListingSort::New;

        return new ListingQuery(
            filters: $filters,
            sort: app(SearchFiltersNormaliser::class)->sortFor($filters, $sort),
            cursor: $this->filled('cursor') ? $this->string('cursor')->toString() : null,
            limit: $this->integer('limit', 20),
        );
    }
}
