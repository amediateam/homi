<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerPlace;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** `data` of `GET /owner/place` (WP-80, DEC-79). */
class OwnerPlaceResource extends JsonResource
{
    public function __construct(private readonly OwnerPlace $place)
    {
        parent::__construct($place);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['city' => $this->place->city, 'district_code' => $this->place->districtCode];
    }
}
