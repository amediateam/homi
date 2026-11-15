<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\LandingMedian;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A district median of the landing (WP-13): rooms 1 … 3, whole USD.
 *
 * @property-read LandingMedian $resource
 */
class LandingMedianResource extends JsonResource
{
    public function __construct(private readonly LandingMedian $median)
    {
        parent::__construct($median);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'district_code' => $this->median->districtCode,
            'rooms' => $this->median->rooms,
            'median_usd' => $this->median->medianUsd,
            'n' => $this->median->n,
        ];
    }
}
