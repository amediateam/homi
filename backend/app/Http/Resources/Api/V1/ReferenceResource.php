<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ReferenceData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Config;

/**
 * `GET /reference` (WP-11). The directories come from `ReferenceSource::reference()`; the bot names, the limits and
 * `radars_enabled` come from HOMI's configuration for every driver (DEC-40, DEC-51).
 */
class ReferenceResource extends JsonResource
{
    /** @param  bool  $withoutBot  the stub scenario `no_bot`: answer as if no bot were configured */
    public function __construct(private readonly ReferenceData $data, private readonly bool $withoutBot = false)
    {
        parent::__construct($data);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'bot' => [
                'username' => $this->withoutBot ? null : self::name('telegram.bot.username'),
                'support_username' => self::name('telegram.support.username'),
            ],
            'limits' => ['radars' => Config::integer('radar.max')],
            'radars_enabled' => Config::boolean('radar.creation_enabled'),
            'rates' => ['usd_uzs' => $this->data->usdUzs],
            'map' => ['tiles_url' => $this->data->tilesUrl],
            'features' => $this->data->features,
            'locales' => NamedCodeResource::collection($this->data->locales),
            'cities' => CityResource::collection($this->data->cities),
            'renovations' => [
                'rent_long' => NamedCodeResource::collection($this->data->renovations['rent_long']),
                'rent_daily' => NamedCodeResource::collection($this->data->renovations['rent_daily']),
                'sale' => NamedCodeResource::collection($this->data->renovations['sale']),
            ],
            'appliances' => NamedCodeResource::collection($this->data->appliances),
            'price_presets' => [
                'rent_long' => $this->data->pricePresets['rent_long'],
                'rent_daily' => $this->data->pricePresets['rent_daily'],
                'sale' => $this->data->pricePresets['sale'],
            ],
        ];
    }

    /** A configured account name, or null when it is not set. */
    private static function name(string $key): ?string
    {
        $name = config($key);

        return is_string($name) && $name !== '' ? $name : null;
    }
}
