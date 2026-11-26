<?php

namespace App\Services\Identity;

use App\Enums\CardStyle;
use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Models\UserSetting;
use UnexpectedValueException;

/**
 * A user's settings as `SettingsService` reads them (WP-40). `localeChosen` and `cityChosen` are derived from the
 * stored choice times, never sent by the client (legacy rule of API-025, fix of LB-API-018).
 */
final readonly class UserSettingsData
{
    /** The writable keys of `PATCH /settings`, in the order of the contract. */
    public const array KEYS = ['locale', 'currency', 'theme', 'city', 'quiet_hours', 'digest_hours', 'card_style'];

    public function __construct(
        public Locale $locale,
        public bool $localeChosen,
        public Currency $currency,
        public Theme $theme,
        public ?string $city,
        public bool $cityChosen,
        public QuietWindow $quietHours,
        public DigestSchedule $digestHours,
        public CardStyle $cardStyle,
    ) {}

    public static function fromModel(UserSetting $settings): self
    {
        return new self(
            locale: $settings->locale,
            localeChosen: $settings->locale_chosen_at !== null,
            currency: $settings->currency,
            theme: $settings->theme,
            city: $settings->city,
            cityChosen: $settings->city_chosen_at !== null,
            quietHours: QuietWindow::fromHours(self::hourOf($settings->quiet_start), self::hourOf($settings->quiet_end)),
            digestHours: DigestSchedule::fromHours($settings->digest_hours),
            cardStyle: $settings->card_style,
        );
    }

    /** The value of a `time` column for a whole hour (`23:00:00`); null stays null. */
    public static function timeOf(?int $hour): ?string
    {
        return $hour === null ? null : sprintf('%02d:00:00', $hour);
    }

    /**
     * The settings object of `GET|PATCH /settings` without its options, as `SettingsResource` reads it.
     *
     * @return array{locale: string, currency: string, theme: string, city: string|null, quiet_hours: array{from: int, to: int}|null, digest_hours: list<int>, card_style: string}
     */
    public function toArray(): array
    {
        return [
            'locale' => $this->locale->value,
            'currency' => $this->currency->value,
            'theme' => $this->theme->value,
            'city' => $this->city,
            'quiet_hours' => $this->quietHours->toArray(),
            'digest_hours' => $this->digestHours->hours,
            'card_style' => $this->cardStyle->value,
        ];
    }

    /** The whole hour of a `time` column (`HH:MM:SS` on PostgreSQL, as written on SQLite). */
    private static function hourOf(?string $time): ?int
    {
        if ($time === null) {
            return null;
        }

        if (preg_match('/^([01]\d|2[0-3]):00(:00)?$/', $time, $match) !== 1) {
            throw new UnexpectedValueException("The stored quiet hour \"{$time}\" is not a whole hour.");
        }

        return (int) $match[1];
    }
}
