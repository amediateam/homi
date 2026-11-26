<?php

namespace App\Services\Sources\Legacy;

/**
 * The only place that knows legacy's locale codes (`25` §4.5, CF-006): HOMI's `uz` is legacy's `uz_Latn`; `ru` and
 * `en` are the same on both sides. Pure, so the unit suite tests it without the application.
 */
final class LegacyLocale
{
    /** @var array<string, string> HOMI code => legacy code */
    private const array TO_LEGACY = ['ru' => 'ru', 'uz' => 'uz_Latn', 'en' => 'en'];

    /** Legacy's code of a HOMI locale; an unknown locale is sent as `ru`, the API's fallback. */
    public static function toLegacy(string $locale): string
    {
        return self::TO_LEGACY[$locale] ?? 'ru';
    }

    /** HOMI's code of a legacy locale, or `null` for a code HOMI does not serve (it is dropped). */
    public static function fromLegacy(string $code): ?string
    {
        $found = array_search($code, self::TO_LEGACY, true);

        return is_string($found) ? $found : null;
    }

    /** @return list<string> the legacy codes, in HOMI's order */
    public static function legacyCodes(): array
    {
        return array_values(self::TO_LEGACY);
    }
}
