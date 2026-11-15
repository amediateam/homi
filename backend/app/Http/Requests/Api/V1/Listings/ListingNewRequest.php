<?php

namespace App\Http\Requests\Api\V1\Listings;

/**
 * `GET /listings/new` (WP-12, API-035): the filter parameters plus `since`, the user's previous visit with these
 * filters in Unix seconds (0 … 4 294 967 295). No `sort`, `cursor` or `limit`.
 */
class ListingNewRequest extends ListingFiltersRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'since' => ['required', 'integer', 'between:0,4294967295'],
        ];
    }

    public function since(): int
    {
        return $this->integer('since');
    }
}
