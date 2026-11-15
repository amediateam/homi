<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingNearby;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A park or a school near the listing (WP-12).
 *
 * @property-read ListingNearby $resource
 */
class ListingNearbyResource extends JsonResource
{
    public function __construct(private readonly ListingNearby $place)
    {
        parent::__construct($place);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'kind' => $this->place->kind,
            'name' => $this->place->name,
            'km' => $this->place->km,
            'note' => $this->place->note,
        ];
    }
}
