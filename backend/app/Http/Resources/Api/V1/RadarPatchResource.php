<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Radars\RadarChange;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The result of `PATCH /radars/{id}` and `POST /radars/{id}/relax` (WP-13): `starter` only when the radar was switched
 * on or widened, `ask_found` only when it was paused.
 *
 * @property-read RadarChange $resource
 */
class RadarPatchResource extends JsonResource
{
    public function __construct(private readonly RadarChange $change)
    {
        parent::__construct($change);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $change = $this->change;

        return [
            'radar' => new RadarResource($change->radar),
            'starter' => $this->when($change->starter !== null, fn (): int => (int) $change->starter),
            'ask_found' => $this->when($change->askFound !== null, fn (): bool => (bool) $change->askFound),
        ];
    }
}
