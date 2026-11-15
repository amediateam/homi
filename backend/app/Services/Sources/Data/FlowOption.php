<?php

namespace App\Services\Sources\Data;

use App\Services\Search\SearchFilters;

/** A suggestion of `GET /listings/flow` (WP-12): a label, a rate and the complete filters it replaces the search with. */
final readonly class FlowOption
{
    public function __construct(
        public string $code,
        public string $label,
        public string $rate,
        public ?int $count,
        public SearchFilters $filters,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            code: Fields::string($data, 'code'),
            label: Fields::string($data, 'label'),
            rate: Fields::string($data, 'rate'),
            count: Fields::nullableInt($data, 'count'),
            filters: SearchFilters::fromNormalised(Fields::object($data, 'filters')),
        );
    }
}
