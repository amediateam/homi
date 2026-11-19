<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A listing preview (WP-12): an item of every listing list and the `preview=1` card. Raw values next to the display
 * strings; nested objects are null when the source does not know them. No phone number (DEC-52).
 *
 * @property-read ListingSummary $resource
 */
class ListingPreviewResource extends JsonResource
{
    public function __construct(private readonly ListingSummary $summary)
    {
        parent::__construct($summary);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $listing = $this->summary;
        $price = $listing->price;
        $notes = [];

        foreach ($price === null ? [] : $price->notes as $note) {
            $notes[] = $note;
        }

        $preview = [];

        foreach ($listing->photosPreview as $photo) {
            $preview[] = $photo;
        }

        return [
            'number' => $listing->number,
            'deal' => $listing->deal,
            'type' => $listing->type,
            'title' => $listing->title,
            'price' => $price === null ? null : [
                'display' => $price->display,
                'period' => $price->period,
                'alt' => $price->alt,
                'notes' => $notes,
                'usd' => $price->usd,
                'kind' => $price->kind,
            ],
            'rooms' => $listing->rooms,
            'area_total' => $listing->areaTotal,
            /** `0` is the ground-level (semi-basement) floor and a negative number a basement; only `null` means unknown. */
            'floor' => $listing->floor,
            'floors_total' => $listing->floorsTotal,
            'district' => $listing->districtName === null ? null : ['code' => $listing->districtCode, 'name' => (string) $listing->districtName],
            'place' => $listing->place,
            'landmark' => $listing->landmark,
            'metro' => $listing->metroName === null ? null : ['name' => (string) $listing->metroName, 'km' => $listing->metroKm],
            'center_km' => $listing->centerKm,
            'location' => $listing->location === null ? null : ['lat' => $listing->location->lat, 'lon' => $listing->location->lon],
            'photos' => ['preview' => $preview, 'count' => $listing->photosCount, 'cover' => $listing->photosCover],
            'has_video' => $listing->hasVideo,
            'pets_ok' => $listing->petsOk,
            'is_owner' => $listing->isOwner,
            'owner_verified' => $listing->ownerVerified,
            'posted' => ['label' => $listing->postedLabel, 'when' => $listing->postedWhen, 'at' => $listing->postedAt],
            'status_text' => $listing->statusText,
            'market' => ['label' => $listing->marketLabel, 'median_delta' => $listing->medianDelta, 'tone' => $listing->marketTone],
            'favorite' => $listing->favorite,
            'viewed' => $listing->viewed,
            'source_ref' => $listing->sourceRef === null ? null : ['channel' => $listing->sourceRef->channel, 'post_id' => $listing->sourceRef->postId],
        ];
    }
}
