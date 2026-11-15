<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\LandingPin;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A pin of the landing map (WP-13): `x` and `y` are percentages on the static map image.
 *
 * @property-read LandingPin $resource
 */
class LandingPinResource extends JsonResource
{
    public function __construct(private readonly LandingPin $pin)
    {
        parent::__construct($pin);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $pin = $this->pin;

        return [
            'number' => $pin->number,
            'x' => $pin->x,
            'y' => $pin->y,
            'rooms' => $pin->rooms,
            'price_usd' => $pin->priceUsd,
            'delta_pct' => $pin->deltaPct,
            'tone' => $pin->tone,
            'area' => $pin->area,
            'floor' => $pin->floor,
            'floors_total' => $pin->floorsTotal,
            'district' => $pin->district === null ? null : ['code' => $pin->district->code, 'name' => $pin->district->name],
            'point' => $pin->point,
            'photo_url' => $pin->photoUrl,
            'link' => $pin->link,
            'age_min' => $pin->ageMin,
            'is_owner' => $pin->isOwner,
            'in_all' => $pin->inAll,
            'in_rooms' => $pin->inRooms,
        ];
    }
}
