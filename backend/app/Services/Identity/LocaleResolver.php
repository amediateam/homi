<?php

namespace App\Services\Identity;

use App\Enums\Locale;

/**
 * The one rule that turns a Telegram language tag into HOMI's language, for the Mini App's first settings and for the
 * bot (WP-40, `25` §5): `uz…` → `uz`, `en…` → `en`, anything else or none → `ru`. BR-APP-050 names only the `uz` and
 * `ru` branches for the client; the bot of `04` also answers English users in English.
 */
final class LocaleResolver
{
    public static function fromLanguageCode(?string $languageCode): Locale
    {
        $tag = strtolower(trim($languageCode ?? ''));

        return match (true) {
            str_starts_with($tag, 'uz') => Locale::Uz,
            str_starts_with($tag, 'en') => Locale::En,
            default => Locale::Ru,
        };
    }
}
