<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Radars\RadarPreview;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The preview of a radar (WP-13, BR-APP-063): at most five newest items; `count` and `flow` may be null.
 *
 * @property-read RadarPreview $resource
 */
class RadarPreviewResource extends JsonResource
{
    public function __construct(private readonly RadarPreview $preview)
    {
        parent::__construct($preview);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $preview = $this->preview;

        return [
            'items' => ListingPreviewResource::collection($preview->items),
            'count' => $preview->count,
            'flow' => $preview->flowWeek === null ? null : ['week' => (int) $preview->flowWeek, 'days' => (int) $preview->flowDays],
        ];
    }
}
