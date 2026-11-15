<?php

namespace App\Http\Resources\Api\V1;

use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Services\Identity\SettingsOptions;
use App\Services\Sources\Data\Fields;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The object of `GET /settings` and `PATCH /settings` (WP-11): the six writable values and, under `options`, what may
 * be chosen. Hours are Asia/Tashkent wall-clock; `quiet_hours: null` means off.
 *
 * @property-read array<array-key, mixed> $resource
 */
class SettingsResource extends JsonResource
{
    /** @param  array<array-key, mixed>  $settings */
    public function __construct(private readonly array $settings)
    {
        parent::__construct($settings);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $options = app(SettingsOptions::class);

        return [
            'locale' => Locale::fromField($this->settings, 'locale'),
            'currency' => Currency::fromField($this->settings, 'currency'),
            'theme' => Theme::fromField($this->settings, 'theme'),
            'city' => Fields::nullableString($this->settings, 'city'),
            'quiet_hours' => $this->quietHours(),
            'digest_hours' => Fields::ints($this->settings, 'digest_hours'),
            'options' => [
                'locales' => NamedCodeResource::collection($options->locales()),
                'currencies' => NamedCodeResource::collection($options->currencies(app()->getLocale())),
                'quiet_hours' => $this->quietPresets($options),
                'digest_hours' => $this->digestPresets($options),
            ],
        ];
    }

    /** @return list<array{from: int, to: int}|null> */
    private function quietPresets(SettingsOptions $options): array
    {
        $presets = [];

        foreach ($options->quietHours() as $preset) {
            $presets[] = $preset === null ? null : ['from' => (int) $preset['from'], 'to' => (int) $preset['to']];
        }

        return $presets;
    }

    /** @return list<list<int>> */
    private function digestPresets(SettingsOptions $options): array
    {
        $presets = [];

        foreach ($options->digestHours() as $preset) {
            $hours = [];

            foreach ($preset as $hour) {
                $hours[] = (int) $hour;
            }

            $presets[] = $hours;
        }

        return $presets;
    }

    /** @return array{from: int, to: int}|null */
    private function quietHours(): ?array
    {
        if (($this->settings['quiet_hours'] ?? null) === null) {
            return null;
        }

        $window = Fields::object($this->settings, 'quiet_hours');

        return ['from' => Fields::int($window, 'from'), 'to' => Fields::int($window, 'to')];
    }
}
