<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingOffer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A short offer of the author (WP-12); the text is masked.
 *
 * @property-read ListingOffer $resource
 */
class ListingOfferResource extends JsonResource
{
    public function __construct(private readonly ListingOffer $offer)
    {
        parent::__construct($offer);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'text' => $this->offer->text,
            'url' => $this->offer->url,
        ];
    }
}
