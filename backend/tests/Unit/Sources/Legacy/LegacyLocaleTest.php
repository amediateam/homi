<?php

use App\Services\Sources\Legacy\LegacyLocale;

it('turns HOMI locales into legacy codes and back', function (string $homi, string $legacy): void {
    expect(LegacyLocale::toLegacy($homi))->toBe($legacy)
        ->and(LegacyLocale::fromLegacy($legacy))->toBe($homi);
})->with([
    'Russian' => ['ru', 'ru'],
    'Uzbek, the only code that differs (CF-006)' => ['uz', 'uz_Latn'],
    'English' => ['en', 'en'],
]);

it('sends an unknown HOMI locale as Russian and drops a legacy code HOMI does not serve', function (): void {
    expect(LegacyLocale::toLegacy('de'))->toBe('ru')
        ->and(LegacyLocale::fromLegacy('uz'))->toBeNull()
        ->and(LegacyLocale::fromLegacy('uz_Cyrl'))->toBeNull()
        ->and(LegacyLocale::legacyCodes())->toBe(['ru', 'uz_Latn', 'en']);
});
