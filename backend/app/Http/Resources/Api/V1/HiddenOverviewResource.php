<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Personal\HiddenOverview;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `GET /hidden` (WP-13): the hidden listings, newest first, and the blocked authors; both lists always
 * present.
 *
 * @property-read HiddenOverview $resource
 */
class HiddenOverviewResource extends JsonResource
{
    public function __construct(private readonly HiddenOverview $hidden)
    {
        parent::__construct($hidden);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'listings' => ListingPreviewResource::collection($this->hidden->listings),
            'authors' => BlockedAuthorResource::collection($this->hidden->authors),
        ];
    }
}
