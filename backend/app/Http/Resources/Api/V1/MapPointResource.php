<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\MapPoint;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A pin of `GET /listings/map` (WP-12); `label` is plain text.
 *
 * @property-read MapPoint $resource
 */
class MapPointResource extends JsonResource
{
    public function __construct(private readonly MapPoint $point)
    {
        parent::__construct($point);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'number' => $this->point->number,
            'lat' => $this->point->lat,
            'lon' => $this->point->lon,
            'label' => $this->point->label,
            'tone' => $this->point->tone,
            'priced' => $this->point->priced,
            'usd' => $this->point->usd,
        ];
    }
}
