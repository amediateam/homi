<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\MapPoints;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `GET /listings/map` (WP-12): the pins of the filters, no paging; `label` is plain text. `total` counts
 * the listings, with or without coordinates, and `with_point` those with coordinates; the answer holds fewer points
 * than `with_point` when the source cut it by a limit (legacy release `index-CIa0Ldj2.js`).
 *
 * @property-read MapPoints $resource
 */
class MapPointsResource extends JsonResource
{
    public function __construct(private readonly MapPoints $map)
    {
        parent::__construct($map);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'points' => MapPointResource::collection($this->map->points),
            'total' => $this->map->total,
            'with_point' => $this->map->withPoint,
        ];
    }
}
