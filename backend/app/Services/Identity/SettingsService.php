<?php

namespace App\Services\Identity;

use App\Enums\CardStyle;
use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Events\Identity\SettingsChanged;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Sources\Data\Fields;
use Illuminate\Support\Facades\Config;

/**
 * Reads and writes a user's settings (WP-40, `25` §5) — the one writer of `user_settings`.
 *
 * A user has a row from the first contact (`UserResolver` calls `createDefaults()`); a user without one (made by a
 * factory, or the stub user) gets the defaults on the first read. Every method leaves the fresh row on the user's
 * `settings` relation, which `SourceContext::fromRequest()` reads for the currency of the request.
 *
 * `patch()` writes only the sent keys, in one `UPDATE` of their columns, so two concurrent patches of different keys
 * both survive (LB-API-049); a sent `locale` or `city` also records that the user chose it, even when it equals the
 * stored value (the first-launch picker choosing `ru`). An empty change writes nothing and announces nothing.
 */
final class SettingsService
{
    public function get(User $user): UserSettingsData
    {
        return UserSettingsData::fromModel($this->row($user));
    }

    /**
     * Stores the sent keys and dispatches `SettingsChanged` with them, after the commit of any open transaction.
     *
     * @param  array<string, mixed>  $changes  the validated body of `PATCH /settings` (`UpdateSettingsRequest`): a
     *                                         subset of `UserSettingsData::KEYS`; other keys are ignored
     */
    public function patch(User $user, array $changes): UserSettingsData
    {
        $keys = array_values(array_filter(UserSettingsData::KEYS, fn (string $key): bool => array_key_exists($key, $changes)));

        if ($keys === []) {
            return $this->get($user);
        }

        $this->row($user);
        UserSetting::query()->whereKey($user->id)->update($this->columns($changes, (new UserSetting)->freshTimestampString()));

        $settings = UserSetting::query()->useWritePdo()->findOrFail($user->id);
        $user->setRelation('settings', $settings);

        SettingsChanged::dispatch($user->id, $keys);

        return UserSettingsData::fromModel($settings);
    }

    /**
     * Creates the user's row with the defaults of `config/settings.php` and the language of the launch, not marked
     * chosen. Race-safe: a row that exists already is kept as it is and returned.
     */
    public function createDefaults(User $user, ?string $languageCode): UserSettingsData
    {
        return UserSettingsData::fromModel($this->createRow($user, $languageCode));
    }

    /** The user's row, created with the defaults for his last known language when he has none. */
    private function row(User $user): UserSetting
    {
        return $user->settings ?? $this->createRow($user, $user->language_code);
    }

    private function createRow(User $user, ?string $languageCode): UserSetting
    {
        $settings = UserSetting::query()->createOrFirst(['user_id' => $user->id], $this->defaults($languageCode));
        $user->setRelation('settings', $settings);

        return $settings;
    }

    /** @return array<string, mixed> the columns of a new row */
    private function defaults(?string $languageCode): array
    {
        $defaults = Config::array('settings.defaults');
        $quiet = $defaults['quiet_hours'] ?? null;
        $window = is_array($quiet) ? QuietWindow::fromHours((int) $quiet[0], (int) $quiet[1]) : QuietWindow::off();

        return [
            'locale' => LocaleResolver::fromLanguageCode($languageCode),
            'locale_chosen_at' => null,
            'currency' => Currency::from(Fields::string($defaults, 'currency')),
            'theme' => Theme::from(Fields::string($defaults, 'theme')),
            'city' => Fields::nullableString($defaults, 'city'),
            'city_chosen_at' => null,
            'quiet_start' => UserSettingsData::timeOf($window->from),
            'quiet_end' => UserSettingsData::timeOf($window->to),
            'digest_hours' => DigestSchedule::fromHours(Fields::ints($defaults, 'digest_hours'))->hours,
            'card_style' => CardStyle::from(Fields::string($defaults, 'card_style')),
        ];
    }

    /**
     * The columns of the sent keys, as raw values: a query-builder `UPDATE` applies no casts.
     *
     * @param  array<string, mixed>  $changes
     * @return array<string, string|null>
     */
    private function columns(array $changes, string $now): array
    {
        $columns = [];

        if (array_key_exists('locale', $changes)) {
            $columns['locale'] = Locale::from(Fields::string($changes, 'locale'))->value;
            $columns['locale_chosen_at'] = $now;
        }

        if (array_key_exists('currency', $changes)) {
            $columns['currency'] = Currency::from(Fields::string($changes, 'currency'))->value;
        }

        if (array_key_exists('theme', $changes)) {
            $columns['theme'] = Theme::from(Fields::string($changes, 'theme'))->value;
        }

        if (array_key_exists('city', $changes)) {
            $columns['city'] = Fields::string($changes, 'city');
            $columns['city_chosen_at'] = $now;
        }

        if (array_key_exists('quiet_hours', $changes)) {
            $quiet = Fields::nullableObject($changes, 'quiet_hours');
            $window = $quiet === null ? QuietWindow::off() : QuietWindow::fromHours(Fields::int($quiet, 'from'), Fields::int($quiet, 'to'));
            $columns['quiet_start'] = UserSettingsData::timeOf($window->from);
            $columns['quiet_end'] = UserSettingsData::timeOf($window->to);
        }

        if (array_key_exists('digest_hours', $changes)) {
            $columns['digest_hours'] = json_encode(DigestSchedule::fromHours(Fields::ints($changes, 'digest_hours'))->hours, JSON_THROW_ON_ERROR);
        }

        if (array_key_exists('card_style', $changes)) {
            $columns['card_style'] = CardStyle::from(Fields::string($changes, 'card_style'))->value;
        }

        return $columns;
    }
}
