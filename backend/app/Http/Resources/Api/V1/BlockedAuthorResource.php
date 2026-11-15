<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Personal\BlockedAuthor;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A blocked author of `GET /hidden` (WP-13): `count` drives the hint "hides N listings" from 20 up (BR-APP-037).
 *
 * @property-read BlockedAuthor $resource
 */
class BlockedAuthorResource extends JsonResource
{
    public function __construct(private readonly BlockedAuthor $author)
    {
        parent::__construct($author);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->author->id,
            'kind' => $this->author->kind,
            'label' => $this->author->label,
            'count' => $this->author->count,
        ];
    }
}
