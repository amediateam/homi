<?php

use App\Enums\Locale;
use App\Services\Identity\LocaleResolver;

it('turns a Telegram language tag into the language of HOMI', function (?string $languageCode, Locale $locale): void {
    expect(LocaleResolver::fromLanguageCode($languageCode))->toBe($locale);
})->with([
    'Uzbek' => ['uz', Locale::Uz],
    'Uzbek with a region' => ['uz-UZ', Locale::Uz],
    'Uzbek in capitals' => ['UZ', Locale::Uz],
    'English' => ['en', Locale::En],
    'British English' => ['en-GB', Locale::En],
    'Russian' => ['ru', Locale::Ru],
    'Kazakh' => ['kk', Locale::Ru],
    'German' => ['de', Locale::Ru],
    'an empty tag' => ['', Locale::Ru],
    'no tag' => [null, Locale::Ru],
]);
