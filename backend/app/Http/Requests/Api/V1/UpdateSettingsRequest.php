<?php

namespace App\Http\Requests\Api\V1;

use App\Enums\CardStyle;
use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Services\Identity\SettingsOptions;
use App\Services\Sources\Data\CityData;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `PATCH /settings` (WP-11): any subset of the seven writable keys; unknown keys are ignored. A city must be one of
 * `GET /reference` (same driver, same scenario); quiet and digest hours must equal one of the presets of
 * `config/settings.php`.
 */
class UpdateSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $options = app(SettingsOptions::class);

        return [
            'locale' => ['sometimes', Rule::enum(Locale::class)],
            'currency' => ['sometimes', Rule::enum(Currency::class)],
            'theme' => ['sometimes', Rule::enum(Theme::class)],
            'city' => ['sometimes', 'string', Rule::in($this->cityCodes())],
            'quiet_hours' => ['sometimes', 'nullable', 'array', function (string $attribute, mixed $value, Closure $fail) use ($options): void {
                if (! $options->isQuietHours($value)) {
                    $fail('The :attribute field must be one of the offered quiet hours.');
                }
            }],
            'quiet_hours.from' => ['required_with:quiet_hours', 'integer', 'between:0,23'],
            'quiet_hours.to' => ['required_with:quiet_hours', 'integer', 'between:0,23'],
            'digest_hours' => ['sometimes', 'array', 'list', function (string $attribute, mixed $value, Closure $fail) use ($options): void {
                if (! $options->isDigestHours($value)) {
                    $fail('The :attribute field must be one of the offered digest hours.');
                }
            }],
            'digest_hours.*' => ['integer', 'between:0,23'],
            'card_style' => ['sometimes', Rule::enum(CardStyle::class)],
        ];
    }

    /** @return list<string> */
    private function cityCodes(): array
    {
        $context = SourceContext::fromRequest($this);
        $reference = app(SourceManager::class)->reference('source.reference', $context)->source->reference($context);

        return array_map(fn (CityData $city): string => $city->code, $reference->cities);
    }
}
