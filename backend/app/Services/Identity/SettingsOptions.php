<?php

namespace App\Services\Identity;

use App\Services\Sources\Data\NamedCode;
use Illuminate\Support\Facades\Config;

/**
 * The option lists of the settings (`config/settings.php`, WP-11): what `GET /settings` offers and what
 * `PATCH /settings` accepts.
 */
final class SettingsOptions
{
    /** @return list<NamedCode> */
    public function locales(): array
    {
        $names = Config::array('settings.locales');

        return array_map(fn (string $code): NamedCode => new NamedCode($code, (string) $names[$code]), array_keys($names));
    }

    /** @return list<NamedCode> currency names in `$locale` */
    public function currencies(string $locale): array
    {
        $currencies = Config::array('settings.currencies');

        return array_map(
            fn (string $code): NamedCode => new NamedCode($code, (string) data_get($currencies, "{$code}.{$locale}", $code)),
            array_keys($currencies),
        );
    }

    /** @return list<array{from: int, to: int}|null> */
    public function quietHours(): array
    {
        return array_values(array_map(
            fn (mixed $preset): ?array => is_array($preset) ? ['from' => (int) $preset[0], 'to' => (int) $preset[1]] : null,
            Config::array('settings.quiet_hours'),
        ));
    }

    /** @return list<list<int>> */
    public function digestHours(): array
    {
        return array_values(array_map(
            fn (mixed $preset): array => array_values(array_map('intval', (array) $preset)),
            Config::array('settings.digest_hours'),
        ));
    }

    /** Whether `$value` is one of the quiet-hour presets: `null` (off) or exactly `{from, to}` of one of them. */
    public function isQuietHours(mixed $value): bool
    {
        return in_array($value, $this->quietHours(), true);
    }

    /** Whether `$value` is exactly one of the digest-hour presets. */
    public function isDigestHours(mixed $value): bool
    {
        return in_array($value, $this->digestHours(), true);
    }
}
