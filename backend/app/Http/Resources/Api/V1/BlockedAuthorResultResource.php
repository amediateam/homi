<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Personal\BlockedAuthor;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The answer of `PUT /listings/{number}/blocked-author` (WP-13): the entry and `listing_numbers`, the author's
 * listings HOMI knows, to hide at once; it may omit the listing asked for.
 *
 * @property-read BlockedAuthor $resource
 */
class BlockedAuthorResultResource extends JsonResource
{
    public function __construct(private readonly BlockedAuthor $author)
    {
        parent::__construct($author);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $numbers = [];

        foreach ($this->author->listingNumbers as $number) {
            $numbers[] = (int) $number;
        }

        return [
            'id' => $this->author->id,
            'kind' => $this->author->kind,
            'label' => $this->author->label,
            'count' => $this->author->count,
            'listing_numbers' => $numbers,
        ];
    }
}
