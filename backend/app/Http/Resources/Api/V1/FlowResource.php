<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\FlowEstimate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `GET /listings/flow` (WP-12): `week` listings in `days` ≥ 1 days; `options` is always a list, each with
 * the complete filters it replaces the search with.
 *
 * @property-read FlowEstimate $resource
 */
class FlowResource extends JsonResource
{
    public function __construct(private readonly FlowEstimate $flow)
    {
        parent::__construct($flow);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'week' => $this->flow->week,
            'days' => $this->flow->days,
            'options' => FlowOptionResource::collection($this->flow->options),
        ];
    }
}
