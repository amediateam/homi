<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\LandingPins;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `GET /landing/pins` (WP-13): for sale `bargains_week` is null and `medians` is empty.
 *
 * @property-read LandingPins $resource
 */
class LandingPinsResource extends JsonResource
{
    public function __construct(private readonly LandingPins $pins)
    {
        parent::__construct($pins);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'generated_at' => $this->pins->generatedAt,
            'bargains_week' => $this->pins->bargainsWeek,
            'pins' => LandingPinResource::collection($this->pins->pins),
            'medians' => LandingMedianResource::collection($this->pins->medians),
        ];
    }
}
