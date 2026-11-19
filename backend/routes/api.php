<?php

use App\Http\Controllers\Api\V1\Auth\TelegramAuthController;
use App\Http\Controllers\Api\V1\CardSampleController;
use App\Http\Controllers\Api\V1\CityController;
use App\Http\Controllers\Api\V1\EventController;
use App\Http\Controllers\Api\V1\Landing\LandingLiveController;
use App\Http\Controllers\Api\V1\Landing\LandingPinsController;
use App\Http\Controllers\Api\V1\Listings\ListingContactController;
use App\Http\Controllers\Api\V1\Listings\ListingController;
use App\Http\Controllers\Api\V1\Listings\ListingCountController;
use App\Http\Controllers\Api\V1\Listings\ListingFlowController;
use App\Http\Controllers\Api\V1\Listings\ListingMapController;
use App\Http\Controllers\Api\V1\Listings\ListingNewController;
use App\Http\Controllers\Api\V1\Listings\ListingShareController;
use App\Http\Controllers\Api\V1\Listings\ListingTranslationController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Controllers\Api\V1\Media\MediaController;
use App\Http\Controllers\Api\V1\Media\PresignController;
use App\Http\Controllers\Api\V1\Personal\BlockedAuthorController;
use App\Http\Controllers\Api\V1\Personal\FavoriteController;
use App\Http\Controllers\Api\V1\Personal\FoundSurveyController;
use App\Http\Controllers\Api\V1\Personal\HiddenController;
use App\Http\Controllers\Api\V1\Personal\HiddenListingController;
use App\Http\Controllers\Api\V1\Personal\HistoryController;
use App\Http\Controllers\Api\V1\Personal\ReportController;
use App\Http\Controllers\Api\V1\Radars\RadarController;
use App\Http\Controllers\Api\V1\Radars\RadarRelaxController;
use App\Http\Controllers\Api\V1\ReferenceController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Middleware\EnsureRadarsEnabled;
use App\Http\Middleware\SetRequestLocale;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 (ADR-0007, ADR-0017) — served on api.homi.*
|--------------------------------------------------------------------------
| Every route: the request locale (`Accept-Language` → ru|uz|en) and the `api` limiter, which counts per actor:
| Laravel runs `auth:sanctum` before the limiter on bearer routes (middleware priority). Bearer routes use Sanctum
| tokens (ADR-0003); abilities gate the actions. WP-40 attaches the named limiters.
*/

Route::prefix('v1')->name('api.v1.')->middleware([SetRequestLocale::class, 'throttle:api'])->group(function (): void {
    // Public (WP-11): sign-in, and what the no-access screen needs without a session.
    Route::post('auth/telegram', TelegramAuthController::class)->name('auth.telegram');
    Route::get('reference', ReferenceController::class)->name('reference.show');
    Route::get('cities', CityController::class)->name('cities.index');
    // Public landing data (WP-13).
    Route::get('landing/live', LandingLiveController::class)->name('landing.live');
    Route::get('landing/pins', LandingPinsController::class)->name('landing.pins');

    Route::middleware('auth:sanctum')->group(function (): void {
        // The Mini App session (WP-11): abilities app:read and app:write.
        Route::get('me', MeController::class)->middleware('ability:app:read')->name('me.show');
        Route::get('settings', [SettingsController::class, 'show'])->middleware('ability:app:read')->name('settings.show');
        Route::patch('settings', [SettingsController::class, 'update'])->middleware('ability:app:write')->name('settings.update');
        Route::post('settings/card-sample', CardSampleController::class)->middleware('ability:app:write')->name('settings.card-sample');
        Route::post('events', EventController::class)->middleware('ability:app:write')->name('events.store');

        // Listings (WP-12): the static paths come before `listings/{number}`.
        Route::prefix('listings')->name('listings.')->middleware('ability:app:read')->group(function (): void {
            Route::get('/', [ListingController::class, 'index'])->name('index');
            Route::get('count', ListingCountController::class)->name('count');
            Route::get('new', ListingNewController::class)->name('new');
            Route::get('flow', ListingFlowController::class)->name('flow');
            Route::get('map', ListingMapController::class)->name('map');
            Route::get('{number}', [ListingController::class, 'show'])->whereNumber('number')->name('show');
            Route::post('{number}/contact', ListingContactController::class)->whereNumber('number')->name('contact');
            Route::post('{number}/translation', ListingTranslationController::class)->whereNumber('number')->name('translation');
            Route::post('{number}/share', ListingShareController::class)->whereNumber('number')->name('share');
        });

        // Personal lists (WP-13): native, stubs until WP-44; `app:read` to list, `app:write` to change.
        Route::get('favorites', [FavoriteController::class, 'index'])->middleware('ability:app:read')->name('favorites.index');
        Route::put('favorites/{number}', [FavoriteController::class, 'update'])->whereNumber('number')->middleware('ability:app:write')->name('favorites.update');
        Route::delete('favorites/{number}', [FavoriteController::class, 'destroy'])->whereNumber('number')->middleware('ability:app:write')->name('favorites.destroy');
        Route::get('history', [HistoryController::class, 'index'])->middleware('ability:app:read')->name('history.index');
        Route::delete('history', [HistoryController::class, 'destroy'])->middleware('ability:app:write')->name('history.destroy');
        Route::put('hidden/listings/{number}', [HiddenListingController::class, 'update'])->whereNumber('number')->middleware('ability:app:write')->name('hidden.listings.update');
        Route::delete('hidden/listings/{number}', [HiddenListingController::class, 'destroy'])->whereNumber('number')->middleware('ability:app:write')->name('hidden.listings.destroy');
        Route::put('listings/{number}/blocked-author', [BlockedAuthorController::class, 'update'])->whereNumber('number')->middleware('ability:app:write')->name('listings.blocked-author.update');
        Route::delete('listings/{number}/blocked-author', [BlockedAuthorController::class, 'destroy'])->whereNumber('number')->middleware('ability:app:write')->name('listings.blocked-author.destroy');
        Route::get('hidden', [HiddenController::class, 'index'])->middleware('ability:app:read')->name('hidden.index');
        Route::delete('hidden/authors/{id}', [HiddenController::class, 'destroyAuthor'])->whereUlid('id')->middleware('ability:app:write')->name('hidden.authors.destroy');
        Route::delete('hidden', [HiddenController::class, 'destroy'])->middleware('ability:app:write')->name('hidden.destroy');
        Route::post('listings/{number}/reports', [ReportController::class, 'store'])->whereNumber('number')->middleware('ability:app:write')->name('listings.reports.store');
        Route::delete('listings/{number}/reports', [ReportController::class, 'destroy'])->whereNumber('number')->middleware('ability:app:write')->name('listings.reports.destroy');
        Route::post('surveys/found', [FoundSurveyController::class, 'store'])->middleware('ability:app:write')->name('surveys.found.store');
        Route::post('surveys/found/where', [FoundSurveyController::class, 'where'])->middleware('ability:app:write')->name('surveys.found.where');

        // Radars (WP-13): native, stubs until WP-45. The four writes sit behind the switch (DEC-51).
        Route::get('radars', [RadarController::class, 'index'])->middleware('ability:app:read')->name('radars.index');
        Route::delete('radars/{id}', [RadarController::class, 'destroy'])->whereUlid('id')->middleware('ability:app:write')->name('radars.destroy');
        Route::middleware(['ability:app:write', EnsureRadarsEnabled::class])->group(function (): void {
            Route::post('radars', [RadarController::class, 'store'])->name('radars.store');
            Route::put('radars/{id}', [RadarController::class, 'update'])->whereUlid('id')->name('radars.update');
            Route::patch('radars/{id}', [RadarController::class, 'patch'])->whereUlid('id')->name('radars.patch');
            Route::post('radars/{id}/relax', RadarRelaxController::class)->whereUlid('id')->name('radars.relax');
        });

        // Media (master prompt §7); a malformed id answers 404 without a query.
        Route::get('media/{media}', [MediaController::class, 'show'])->whereUlid('media')->name('media.show');

        Route::middleware(['ability:media:write', 'throttle:uploads'])->group(function (): void {
            Route::post('media', [MediaController::class, 'store'])->name('media.store');
            Route::post('media/presign', [PresignController::class, 'store'])->name('media.presign');
            Route::post('media/register', [PresignController::class, 'register'])->name('media.register');
            Route::delete('media/{media}', [MediaController::class, 'destroy'])->whereUlid('media')->name('media.destroy');
        });
    });
});
