<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\ShownPoint;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** The circle seekers see (WP-80). */
class ShownPointResource extends JsonResource
{
    public function __construct(private readonly ShownPoint $point)
    {
        parent::__construct($point);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['lat' => $this->point->lat, 'lon' => $this->point->lon, 'radius_m' => $this->point->radiusM];
    }
}
