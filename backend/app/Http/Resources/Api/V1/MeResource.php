<?php

namespace App\Http\Resources\Api\V1;

use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Services\Sources\Data\Fields;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The object of `GET /me`, also `data.user` of a sign-in (WP-11): the user's choices and the per-user analytics
 * settings (`null` when analytics is off). The directories, the rate, the bot name and the limits are in
 * `GET /reference`. Built from a decoded fixture today; every field is read strictly.
 */
class MeResource extends JsonResource
{
    /** @param  array<array-key, mixed>  $me */
    public function __construct(private readonly array $me)
    {
        parent::__construct($me);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'locale' => Locale::from(Fields::string($this->me, 'locale')),
            'locale_chosen' => Fields::bool($this->me, 'locale_chosen'),
            'currency' => Currency::from(Fields::string($this->me, 'currency')),
            'theme' => Theme::from(Fields::string($this->me, 'theme')),
            'city' => Fields::nullableString($this->me, 'city'),
            'city_chosen' => Fields::bool($this->me, 'city_chosen'),
            'team' => Fields::bool($this->me, 'team'),
            'analytics' => $this->analytics(),
        ];
    }

    /** @return array{distinct_id: string, autocapture: bool, replay: bool, replay_rate: float}|null */
    private function analytics(): ?array
    {
        if (($this->me['analytics'] ?? null) === null) {
            return null;
        }

        $analytics = Fields::object($this->me, 'analytics');

        return [
            'distinct_id' => Fields::string($analytics, 'distinct_id'),
            'autocapture' => Fields::bool($analytics, 'autocapture'),
            'replay' => Fields::bool($analytics, 'replay'),
            'replay_rate' => Fields::float($analytics, 'replay_rate'),
        ];
    }
}
