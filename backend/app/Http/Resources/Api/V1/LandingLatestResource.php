<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\LandingLatest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A listing of the landing's live strip (WP-13).
 *
 * @property-read LandingLatest $resource
 */
class LandingLatestResource extends JsonResource
{
    public function __construct(private readonly LandingLatest $latest)
    {
        parent::__construct($latest);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $item = $this->latest;

        return [
            'number' => $item->number,
            'rooms' => $item->rooms,
            'price_usd' => $item->priceUsd,
            'delta_pct' => $item->deltaPct,
            'tone' => $item->tone,
            'district' => $item->district === null ? null : ['code' => $item->district->code, 'name' => $item->district->name],
            'area' => $item->area,
            'seen_at' => $item->seenAt,
            'link' => $item->link,
        ];
    }
}
