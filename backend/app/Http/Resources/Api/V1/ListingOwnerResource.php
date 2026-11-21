<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingOwner;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** The owner part of the full card (WP-80): always present; `listing_id` only on the caller's own listing. */
class ListingOwnerResource extends JsonResource
{
    public function __construct(private readonly ListingOwner $owner)
    {
        parent::__construct($owner);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'tier' => $this->owner->tier,
            'mine' => $this->owner->mine,
            'listing_id' => $this->owner->listingId,
            'entry' => $this->owner->entry,
            'response_minutes' => $this->owner->responseMinutes,
            'description' => $this->owner->description,
        ];
    }
}
