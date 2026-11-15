<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingFact;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A fact line of the card (WP-12); `key` is unique within a card.
 *
 * @property-read ListingFact $resource
 */
class ListingFactResource extends JsonResource
{
    public function __construct(private readonly ListingFact $fact)
    {
        parent::__construct($fact);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'key' => $this->fact->key,
            'label' => $this->fact->label,
            'value' => $this->fact->value,
        ];
    }
}
