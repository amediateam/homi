<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerListings;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** `data` of `GET /owner/listings` (WP-80). */
class OwnerListingsResource extends JsonResource
{
    public function __construct(private readonly OwnerListings $listings)
    {
        parent::__construct($listings);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'items' => OwnerListingItemResource::collection($this->listings->items),
            'max' => $this->listings->max,
            'can_add' => $this->listings->canAdd,
            'past' => $this->listings->past,
        ];
    }
}
