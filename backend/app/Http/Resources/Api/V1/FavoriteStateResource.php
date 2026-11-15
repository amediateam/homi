<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The answer of `PUT` and `DELETE /favorites/{number}` (WP-13): the state of the heart after the call, which the
 * client takes as the truth (BR-APP-039).
 *
 * @property-read bool $resource
 */
class FavoriteStateResource extends JsonResource
{
    public function __construct(private readonly bool $favorite)
    {
        parent::__construct($favorite);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['favorite' => $this->favorite];
    }
}
