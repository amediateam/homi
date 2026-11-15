<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\GeoPoint;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A vertex of the filters' polygon (WP-12): `[lat, lon]`, 5 decimals.
 *
 * @property-read GeoPoint $resource
 */
class PolygonVertexResource extends JsonResource
{
    public function __construct(private readonly GeoPoint $vertex)
    {
        parent::__construct($vertex);
    }

    /** @return array{0: float, 1: float} */
    public function toArray(Request $request): array
    {
        return [$this->vertex->lat, $this->vertex->lon];
    }
}
