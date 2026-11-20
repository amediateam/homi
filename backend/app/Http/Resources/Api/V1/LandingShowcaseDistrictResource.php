<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\LandingShowcaseDistrict;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A district count of the landing's showcase (the landing intake of `d9bbbc696337`): the landing names the district
 * from its own texts, so only the code travels.
 *
 * @property-read LandingShowcaseDistrict $resource
 */
class LandingShowcaseDistrictResource extends JsonResource
{
    public function __construct(private readonly LandingShowcaseDistrict $district)
    {
        parent::__construct($district);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'district_code' => $this->district->districtCode,
            'count' => $this->district->count,
        ];
    }
}
