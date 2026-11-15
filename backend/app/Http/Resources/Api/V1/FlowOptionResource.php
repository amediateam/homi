<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\FlowOption;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A suggestion of `GET /listings/flow` (WP-12) with the complete filters it replaces the search with.
 *
 * @property-read FlowOption $resource
 */
class FlowOptionResource extends JsonResource
{
    public function __construct(private readonly FlowOption $option)
    {
        parent::__construct($option);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->option->code,
            'label' => $this->option->label,
            'rate' => $this->option->rate,
            'count' => $this->option->count,
            'filters' => new FiltersResource($this->option->filters),
        ];
    }
}
