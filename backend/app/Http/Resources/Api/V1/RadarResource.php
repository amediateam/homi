<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Radars\Radar;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A radar (WP-13): `filters` always has the 25 keys; `preview` is present only when asked for
 * (`include=previews`) and is null when it could not be computed.
 *
 * @property-read Radar $resource
 */
class RadarResource extends JsonResource
{
    public function __construct(private readonly Radar $radar)
    {
        parent::__construct($radar);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $radar = $this->radar;

        return [
            'id' => $radar->id,
            'active' => $radar->active,
            'mode' => $radar->mode,
            'hidden' => $radar->hidden,
            'created_at' => $radar->createdAt,
            'filters' => new FiltersResource($radar->filters),
            'preview' => $this->when($radar->previewAsked, fn (): ?RadarPreviewResource => $radar->preview === null ? null : new RadarPreviewResource($radar->preview)),
        ];
    }
}
