<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerListing;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** An item of `GET /owner/listings` (WP-80): the listing without `phone_display` and without the true point. */
class OwnerListingItemResource extends JsonResource
{
    public function __construct(private readonly OwnerListing $listing)
    {
        parent::__construct($listing);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $listing = $this->listing;

        return [
            'id' => $listing->id,
            'number' => $listing->number,
            'status' => $listing->status,
            'withdrawn' => $listing->withdrawn,
            'held' => $listing->held,
            'hold_reason' => $listing->holdReason,
            'published_at' => $listing->publishedAt,
            'photos' => OwnerPhotoResource::collection($listing->photos),
            'form' => OwnerListingFormResource::fields($listing->form, withPoint: false),
            'stats' => $listing->stats === null ? null : new OwnerListingStatsResource($listing->stats),
            'contact_mode' => $listing->contactMode,
            'phone_set' => $listing->phoneSet,
            'phone_error' => $listing->phoneError,
            'reject_reason' => $listing->rejectReason,
            'shown_point' => $listing->shownPoint === null ? null : new ShownPointResource($listing->shownPoint),
        ];
    }
}
