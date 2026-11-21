<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerDemand;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** `data` of `GET /owner/demand` (WP-80, DEC-84): `count` only from 5 on; `few` for 1 … 4. */
class OwnerDemandResource extends JsonResource
{
    public function __construct(private readonly OwnerDemand $demand)
    {
        parent::__construct($demand);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'count' => $this->demand->count,
            'few' => $this->demand->few,
            'usual_low_usd' => $this->demand->usualLowUsd,
            'usual_high_usd' => $this->demand->usualHighUsd,
        ];
    }
}
