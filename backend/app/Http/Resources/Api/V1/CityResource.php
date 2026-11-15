<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\CityData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A city of `GET /reference`, with its own districts and zones. */
class CityResource extends JsonResource
{
    public function __construct(private readonly CityData $city)
    {
        parent::__construct($city);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->city->code,
            'name' => $this->city->name,
            'center' => ['lat' => $this->city->center->lat, 'lon' => $this->city->center->lon],
            'zoom' => $this->city->zoom,
            'is_region' => $this->city->isRegion,
            'has_metro' => $this->city->hasMetro,
            'has_median' => $this->city->hasMedian,
            'districts' => NamedCodeResource::collection($this->city->districts),
            'zones' => NamedCodeResource::collection($this->city->zones),
        ];
    }
}
