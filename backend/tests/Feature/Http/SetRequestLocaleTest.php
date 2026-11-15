<?php

use App\Http\Middleware\SetRequestLocale;
use Illuminate\Support\Facades\Route;

beforeEach(function (): void {
    Route::middleware(SetRequestLocale::class)->group(function (): void {
        Route::get('api/v1/_test/locale', fn () => ['locale' => app()->getLocale()]);
        Route::get('api/v1/_test/locale-error', fn () => throw new RuntimeException('boom'));
    });
});

it('sets the application locale and Content-Language from Accept-Language', function (string $header, string $locale): void {
    $this->getJson('/api/v1/_test/locale', ['Accept-Language' => $header])
        ->assertOk()
        ->assertJsonPath('locale', $locale)
        ->assertHeader('Content-Language', $locale);
})->with([
    'Uzbek' => ['uz', 'uz'],
    'Uzbek with a hyphenated script' => ['uz-Latn', 'uz'],
    'Uzbek with an underscored script' => ['uz_Latn', 'uz'],
    'English with a region' => ['en-US,en;q=0.9', 'en'],
    'Russian' => ['ru-RU', 'ru'],
    'an unsupported language' => ['de-DE,fr;q=0.8', 'ru'],
    'an empty header' => ['', 'ru'],
]);

it('names the language of an error answer too', function (): void {
    config(['app.debug' => false]);

    $this->getJson('/api/v1/_test/locale-error', ['Accept-Language' => 'uz'])
        ->assertStatus(500)
        ->assertHeader('Content-Language', 'uz');
});
