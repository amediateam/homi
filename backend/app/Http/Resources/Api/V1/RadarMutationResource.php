<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Radars\RadarMutation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The result of `POST /radars` and `PUT /radars/{id}` (WP-13): `options` and `relaxed` are always lists, and
 * `options` is filled only when `starter` is 0.
 *
 * @property-read RadarMutation $resource
 */
class RadarMutationResource extends JsonResource
{
    public function __construct(private readonly RadarMutation $mutation)
    {
        parent::__construct($mutation);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $mutation = $this->mutation;

        return [
            'radar' => new RadarResource($mutation->radar),
            'kind' => $mutation->kind,
            'starter' => $mutation->starter,
            'options' => RadarOptionResource::collection($mutation->options),
            'relaxed' => RadarRelaxedResource::collection($mutation->relaxed),
        ];
    }
}
