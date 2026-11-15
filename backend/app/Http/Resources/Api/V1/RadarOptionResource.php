<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Radars\RadarOption;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A way to widen a radar that found nothing (WP-13); `count` may be null.
 *
 * @property-read RadarOption $resource
 */
class RadarOptionResource extends JsonResource
{
    public function __construct(private readonly RadarOption $option)
    {
        parent::__construct($option);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->option->code,
            'label' => $this->option->label,
            'rate' => $this->option->rate,
            'count' => $this->option->count,
        ];
    }
}
