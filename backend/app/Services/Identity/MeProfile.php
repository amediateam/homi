<?php

namespace App\Services\Identity;

use App\Models\User;
use Illuminate\Support\Facades\Config;

/**
 * The user object of `GET /me`, also `data.user` of a sign-in (WP-40), in the shape `MeResource` reads: the user's
 * choices from his settings, `team` from `users.is_team`, the analytics settings of the client (his own
 * `distinct_id`, the rest from `config/analytics.php`), and the owner cabinet's signals, which stay
 * `{pending: 0, has_listings: false, waitlisted: false}` until WP-84 and WP-85 give them values.
 */
final readonly class MeProfile
{
    public function __construct(private SettingsService $settings) {}

    /**
     * @return array{
     *     locale: string, locale_chosen: bool, currency: string, theme: string, city: string|null, city_chosen: bool,
     *     team: bool,
     *     analytics: array{distinct_id: string, autocapture: bool, replay: bool, replay_rate: float},
     *     owner: array{pending: int, has_listings: bool, waitlisted: bool}
     * }
     */
    public function for(User $user): array
    {
        $settings = $this->settings->get($user);

        return [
            'locale' => $settings->locale->value,
            'locale_chosen' => $settings->localeChosen,
            'currency' => $settings->currency->value,
            'theme' => $settings->theme->value,
            'city' => $settings->city,
            'city_chosen' => $settings->cityChosen,
            'team' => $user->is_team,
            'analytics' => [
                'distinct_id' => $user->analytics_distinct_id,
                'autocapture' => self::flag('analytics.client.autocapture', true),
                'replay' => self::flag('analytics.client.replay', false),
                'replay_rate' => self::rate('analytics.client.replay_rate', 0.0),
            ],
            'owner' => ['pending' => 0, 'has_listings' => false, 'waitlisted' => false],
        ];
    }

    /**
     * A switch of `config/analytics.php`, read leniently: `true`, `1`, `"1"`, `"on"`, `"yes"` and their opposites are
     * understood; a missing, empty or unreadable value is the default. `Config::boolean` would throw on `"0"` from an
     * env key, and every `GET /me` and every sign-in would answer `500`.
     */
    private static function flag(string $key, bool $default): bool
    {
        $value = Config::get($key);

        if ($value === null || $value === '') {
            return $default;
        }

        return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }

    /**
     * A share of `config/analytics.php`, read leniently: a whole number (`1`) or a numeric env string (`"0.5"`) is a
     * float, anything else is the default. `Config::float` would throw on both.
     */
    private static function rate(string $key, float $default): float
    {
        $value = Config::get($key);

        return is_int($value) || is_float($value) || (is_string($value) && is_numeric($value)) ? (float) $value : $default;
    }
}
