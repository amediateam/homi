<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingSourceLink;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A channel post that published the listing (WP-12).
 *
 * @property-read ListingSourceLink $resource
 */
class ListingSourceLinkResource extends JsonResource
{
    public function __construct(private readonly ListingSourceLink $link)
    {
        parent::__construct($link);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'handle' => $this->link->handle,
            'url' => $this->link->url,
        ];
    }
}
