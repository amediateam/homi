<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\NamedCode;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Config;

/**
 * `GET /reference` (WP-11). The directories come from `ReferenceSource::reference()`; the bot names, the limits,
 * `radars_enabled`, `owner_enabled` and the cabinet's renovations (`renovations.owner`, localised by the request's
 * locale) come from HOMI's configuration for every driver (DEC-40, DEC-51, DEC-81; WP-80).
 *
 * @property-read ReferenceData $resource
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
            'limits' => [
                'radars' => Config::integer('radar.max'),
                'owner_listings' => Config::integer('owner.limits.listings'),
                'owner_photos' => Config::integer('owner.limits.photos'),
                'requests' => [
                    'day' => Config::integer('owner.limits.requests.day'),
                    'week' => Config::integer('owner.limits.requests.week'),
                    'pause_minutes' => Config::integer('owner.limits.requests.pause_minutes'),
                ],
            ],
            'radars_enabled' => Config::boolean('radar.creation_enabled'),
            'owner_enabled' => Config::boolean('owner.enabled'),
            'rates' => ['usd_uzs' => $this->data->usdUzs],
            'map' => ['tiles_url' => $this->data->tilesUrl],
            'features' => $this->data->features,
            'locales' => NamedCodeResource::collection($this->data->locales),
            'cities' => CityResource::collection($this->data->cities),
            'renovations' => [
                'rent_long' => NamedCodeResource::collection($this->data->renovations['rent_long']),
                'rent_daily' => NamedCodeResource::collection($this->data->renovations['rent_daily']),
                'sale' => NamedCodeResource::collection($this->data->renovations['sale']),
                'owner' => NamedCodeResource::collection(self::ownerRenovations($request)),
            ],
            'appliances' => NamedCodeResource::collection($this->data->appliances),
            'price_presets' => [
                'rent_long' => $this->data->pricePresets['rent_long'],
                'rent_daily' => $this->data->pricePresets['rent_daily'],
                'sale' => $this->data->pricePresets['sale'],
            ],
        ];
    }

    /**
     * The cabinet's renovation codes with the name in the request's locale (WP-80), from `config/owner.php`.
     *
     * @return list<NamedCode>
     */
    private static function ownerRenovations(Request $request): array
    {
        $locale = SourceContext::fromRequest($request)->locale;
        $items = [];

        foreach (Config::array('owner.renovations') as $renovation) {
            $names = is_array($renovation) && is_array($renovation['name'] ?? null) ? $renovation['name'] : [];
            $name = $names[$locale] ?? $names['ru'] ?? '';
            $items[] = NamedCode::fromArray(['code' => (string) ($renovation['code'] ?? ''), 'name' => (string) $name]);
        }

        return $items;
    }

    /** A configured account name, or null when it is not set. */
    private static function name(string $key): ?string
    {
        $name = config($key);

        return is_string($name) && $name !== '' ? $name : null;
    }
}
