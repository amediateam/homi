<?php

namespace Database\Factories;

use App\Enums\CardStyle;
use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Models\User;
use App\Models\UserSetting;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * The settings row of a user who has not chosen anything yet: the defaults of `config/settings.php` for a Russian
 * launch. `chosen()` is a user who picked his language and city.
 *
 * @extends Factory<UserSetting>
 */
class UserSettingFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'locale' => Locale::Ru,
            'locale_chosen_at' => null,
            'currency' => Currency::Usd,
            'theme' => Theme::Auto,
            'city' => null,
            'city_chosen_at' => null,
            'quiet_start' => '23:00:00',
            'quiet_end' => '08:00:00',
            'digest_hours' => [9],
            'card_style' => CardStyle::Classic,
        ];
    }

    public function chosen(Locale $locale = Locale::Ru, string $city = 'tashkent'): static
    {
        return $this->state(fn (array $attributes): array => [
            'locale' => $locale,
            'locale_chosen_at' => now(),
            'city' => $city,
            'city_chosen_at' => now(),
        ]);
    }
}
