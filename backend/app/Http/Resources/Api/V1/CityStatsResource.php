<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\CityStats;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A city of `GET /cities` (WP-11): `counts` always has the three deals; `price_presets` and `typical_price` may lack
 * a deal. Whole USD, whatever the user's currency.
 *
 * @property-read CityStats $resource
 */
class CityStatsResource extends JsonResource
{
    public function __construct(private readonly CityStats $stats)
    {
        parent::__construct($stats);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $presets = $this->stats->pricePresets;
        $typical = $this->stats->typicalPrice;

        return [
            'code' => $this->stats->code,
            'counts' => [
                'rent_long' => $this->stats->counts['rent_long'],
                'rent_daily' => $this->stats->counts['rent_daily'],
                'sale' => $this->stats->counts['sale'],
            ],
            'price_presets' => [
                'rent_long' => $this->when(isset($presets['rent_long']), fn (): array => $presets['rent_long']),
                'rent_daily' => $this->when(isset($presets['rent_daily']), fn (): array => $presets['rent_daily']),
                'sale' => $this->when(isset($presets['sale']), fn (): array => $presets['sale']),
            ],
            'typical_price' => [
                'rent_long' => $this->when(isset($typical['rent_long']), fn (): int => $typical['rent_long']),
                'rent_daily' => $this->when(isset($typical['rent_daily']), fn (): int => $typical['rent_daily']),
                'sale' => $this->when(isset($typical['sale']), fn (): int => $typical['sale']),
            ],
        ];
    }
}
