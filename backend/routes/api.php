<?php

use App\Http\Controllers\Api\V1\Auth\TelegramAuthController;
use App\Http\Controllers\Api\V1\CardSampleController;
use App\Http\Controllers\Api\V1\CityController;
use App\Http\Controllers\Api\V1\EventController;
use App\Http\Controllers\Api\V1\Landing\LandingLiveController;
use App\Http\Controllers\Api\V1\Landing\LandingPinsController;
use App\Http\Controllers\Api\V1\Listings\ListingContactController;
use App\Http\Controllers\Api\V1\Listings\ListingContactRequestController;
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
use App\Http\Controllers\Api\V1\Owner\OwnerContactModeController;
use App\Http\Controllers\Api\V1\Owner\OwnerDemandController;
use App\Http\Controllers\Api\V1\Owner\OwnerListingController;
use App\Http\Controllers\Api\V1\Owner\OwnerPhoneRequestController;
use App\Http\Controllers\Api\V1\Owner\OwnerPhotoController;
use App\Http\Controllers\Api\V1\Owner\OwnerPlaceController;
use App\Http\Controllers\Api\V1\Owner\OwnerPublishController;
use App\Http\Controllers\Api\V1\Owner\OwnerRequestController;
use App\Http\Controllers\Api\V1\Owner\OwnerStatusController;
use App\Http\Controllers\Api\V1\Owner\OwnerWaitlistController;
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
use App\Http\Middleware\AnswerNativeStubs;
use App\Http\Middleware\EnsureOwnerCabinetEnabled;
use App\Http\Middleware\EnsureRadarsEnabled;
use App\Http\Middleware\SetRequestLocale;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 (ADR-0007, ADR-0017) — served on api.homi.*
|--------------------------------------------------------------------------
| Every route: the request locale (`Accept-Language` → ru|uz|en) and a named limiter of its own (WP-40, values in
| `config/rate_limits.php`): per user on bearer routes, where Laravel runs `auth:sanctum` before the limiter
| (middleware priority), per client address on public ones. Bearer routes use Sanctum tokens (ADR-0003); the access
| gate (`access`, WP-40) decides before the abilities gate the actions.
| `AnswerNativeStubs` (WP-40) is sorted after all of them (`bootstrap/app.php`): with `SOURCES_NATIVE_STUBS` on it
| answers the methods of `NativeStubs` with their stub bodies, after the route's own checks have passed.
*/

Route::prefix('v1')->name('api.v1.')->middleware([SetRequestLocale::class, AnswerNativeStubs::class])->group(function (): void {
    // Public (WP-11): sign-in, and what the no-access screen needs without a session.
    // The sign-in counts per address here and per verified user inside `TelegramSignIn`.
    Route::post('auth/telegram', TelegramAuthController::class)->middleware('throttle:v1-auth')->name('auth.telegram');

    Route::middleware('throttle:v1-public')->group(function (): void {
        Route::get('reference', ReferenceController::class)->name('reference.show');
        Route::get('cities', CityController::class)->name('cities.index');
        // Public landing data (WP-13).
        Route::get('landing/live', LandingLiveController::class)->name('landing.live');
        Route::get('landing/pins', LandingPinsController::class)->name('landing.pins');
    });

    Route::middleware('auth:sanctum')->group(function (): void {
        // Events (WP-11) pass the lenient access gate (WP-40): the no-access screen still sends them, and only a block
        // or the pause refuses them.
        Route::post('events', EventController::class)->middleware(['access:lenient', 'ability:app:write', 'throttle:v1-events'])->name('events.store');

        // Every other bearer route sits behind the access gate (WP-40), the media routes too (a collector's token passes it).
        Route::middleware('access')->group(function (): void {
            // The Mini App session (WP-11): abilities app:read and app:write.
            Route::get('me', MeController::class)->middleware(['ability:app:read', 'throttle:v1-me'])->name('me.show');
            Route::get('settings', [SettingsController::class, 'show'])->middleware(['ability:app:read', 'throttle:v1-reads'])->name('settings.show');
            // The settings writes share the limiter of the radar writes (SEC-REQ-027).
            Route::patch('settings', [SettingsController::class, 'update'])->middleware(['ability:app:write', 'throttle:v1-radars'])->name('settings.update');
            Route::post('settings/card-sample', CardSampleController::class)->middleware(['ability:app:write', 'throttle:v1-radars'])->name('settings.card-sample');

            // Listings (WP-12): the static paths come before `listings/{number}`.
            Route::prefix('listings')->name('listings.')->middleware('ability:app:read')->group(function (): void {
                Route::middleware('throttle:v1-reads')->group(function (): void {
                    Route::get('/', [ListingController::class, 'index'])->name('index');
                    Route::get('count', ListingCountController::class)->name('count');
                    Route::get('new', ListingNewController::class)->name('new');
                    Route::get('flow', ListingFlowController::class)->name('flow');
                    Route::get('map', ListingMapController::class)->name('map');
                });
                // The card: the request limiter, and the daily cap on full cards (DEC-104 … DEC-107).
                Route::get('{number}', [ListingController::class, 'show'])->whereNumber('number')->middleware(['throttle:v1-listing', 'listing-opens'])->name('show');
                Route::post('{number}/contact', ListingContactController::class)->whereNumber('number')->middleware('throttle:v1-contact')->name('contact');
                // WP-43: `v1-translation` counts only the cache misses, inside `TranslationService`; the route itself is
                // read under `v1-reads`, as a translation that is cached is a read.
                Route::post('{number}/translation', ListingTranslationController::class)->whereNumber('number')->middleware('throttle:v1-reads')->name('translation');
                Route::post('{number}/share', ListingShareController::class)->whereNumber('number')->middleware('throttle:v1-share')->name('share');
            });

            // Personal lists (WP-13): native, stubs until WP-44; `app:read` to list, `app:write` to change. The lists are
            // read under `v1-reads` and changed under `v1-lists`; a report is sent under its own daily limit.
            Route::get('favorites', [FavoriteController::class, 'index'])->middleware(['ability:app:read', 'throttle:v1-reads'])->name('favorites.index');
            Route::put('favorites/{number}', [FavoriteController::class, 'update'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('favorites.update');
            Route::delete('favorites/{number}', [FavoriteController::class, 'destroy'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('favorites.destroy');
            Route::get('history', [HistoryController::class, 'index'])->middleware(['ability:app:read', 'throttle:v1-reads'])->name('history.index');
            Route::delete('history', [HistoryController::class, 'destroy'])->middleware(['ability:app:write', 'throttle:v1-lists'])->name('history.destroy');
            Route::put('hidden/listings/{number}', [HiddenListingController::class, 'update'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('hidden.listings.update');
            Route::delete('hidden/listings/{number}', [HiddenListingController::class, 'destroy'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('hidden.listings.destroy');
            Route::put('listings/{number}/blocked-author', [BlockedAuthorController::class, 'update'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('listings.blocked-author.update');
            Route::delete('listings/{number}/blocked-author', [BlockedAuthorController::class, 'destroy'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('listings.blocked-author.destroy');
            Route::get('hidden', [HiddenController::class, 'index'])->middleware(['ability:app:read', 'throttle:v1-reads'])->name('hidden.index');
            Route::delete('hidden/authors/{id}', [HiddenController::class, 'destroyAuthor'])->whereUlid('id')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('hidden.authors.destroy');
            Route::delete('hidden', [HiddenController::class, 'destroy'])->middleware(['ability:app:write', 'throttle:v1-lists'])->name('hidden.destroy');
            Route::post('listings/{number}/reports', [ReportController::class, 'store'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-reports'])->name('listings.reports.store');
            Route::delete('listings/{number}/reports', [ReportController::class, 'destroy'])->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('listings.reports.destroy');
            Route::post('surveys/found', [FoundSurveyController::class, 'store'])->middleware(['ability:app:write', 'throttle:v1-lists'])->name('surveys.found.store');
            Route::post('surveys/found/where', [FoundSurveyController::class, 'where'])->middleware(['ability:app:write', 'throttle:v1-lists'])->name('surveys.found.where');

            // Radars (WP-13): native, stubs until WP-45. The four writes sit behind the switch (DEC-51).
            Route::get('radars', [RadarController::class, 'index'])->middleware(['ability:app:read', 'throttle:v1-reads'])->name('radars.index');
            Route::delete('radars/{id}', [RadarController::class, 'destroy'])->whereUlid('id')->middleware(['ability:app:write', 'throttle:v1-radars'])->name('radars.destroy');
            Route::middleware(['ability:app:write', 'throttle:v1-radars', EnsureRadarsEnabled::class])->group(function (): void {
                Route::post('radars', [RadarController::class, 'store'])->name('radars.store');
                Route::put('radars/{id}', [RadarController::class, 'update'])->whereUlid('id')->name('radars.update');
                Route::patch('radars/{id}', [RadarController::class, 'patch'])->whereUlid('id')->name('radars.patch');
                Route::post('radars/{id}/relax', RadarRelaxController::class)->whereUlid('id')->name('radars.relax');
            });

            // The owner cabinet (WP-80): stubs until WP-84 and WP-85. The routes that change content or create or resume a
            // listing sit behind the switch (DEC-81); reads, the ways down and the answers to requests stay open. The
            // reads count under `v1-reads`, the place and demand lookups and the writes under the owner limiters only.
            Route::prefix('owner')->name('owner.')->group(function (): void {
                Route::get('listings', [OwnerListingController::class, 'index'])->middleware(['ability:app:read', 'throttle:v1-reads'])->name('listings.index');
                Route::get('listings/{id}', [OwnerListingController::class, 'show'])->whereUlid('id')->middleware(['ability:app:read', 'throttle:v1-reads'])->name('listings.show');
                Route::get('listings/{id}/requests', [OwnerRequestController::class, 'index'])->whereUlid('id')->middleware(['ability:app:read', 'throttle:v1-reads'])->name('listings.requests.index');
                Route::get('place', OwnerPlaceController::class)->middleware(['ability:app:read', 'throttle:owner-place'])->name('place');
                Route::get('demand', OwnerDemandController::class)->middleware(['ability:app:read', 'throttle:owner-demand'])->name('demand');

                Route::middleware(['ability:app:write', 'throttle:owner-writes'])->group(function (): void {
                    Route::delete('listings/{id}', [OwnerListingController::class, 'destroy'])->whereUlid('id')->name('listings.destroy');
                    Route::put('listings/{id}/status', OwnerStatusController::class)->whereUlid('id')->name('listings.status');
                    Route::post('requests/{id}/answer', [OwnerRequestController::class, 'answer'])->whereUlid('id')->name('requests.answer');
                    Route::put('waitlist', OwnerWaitlistController::class)->name('waitlist.update');

                    Route::middleware(EnsureOwnerCabinetEnabled::class)->group(function (): void {
                        Route::post('listings', [OwnerListingController::class, 'store'])->name('listings.store');
                        Route::patch('listings/{id}', [OwnerListingController::class, 'update'])->whereUlid('id')->name('listings.update');
                        Route::post('listings/{id}/photos', [OwnerPhotoController::class, 'store'])->whereUlid('id')->middleware('throttle:uploads')->name('listings.photos.store');
                        Route::delete('listings/{id}/photos/{photo}', [OwnerPhotoController::class, 'destroy'])->whereUlid('id')->whereUlid('photo')->name('listings.photos.destroy');
                        Route::put('listings/{id}/photos/order', [OwnerPhotoController::class, 'order'])->whereUlid('id')->name('listings.photos.order');
                        Route::put('listings/{id}/contact-mode', OwnerContactModeController::class)->whereUlid('id')->name('listings.contact-mode');
                        Route::post('listings/{id}/phone-request', OwnerPhoneRequestController::class)->whereUlid('id')->middleware('throttle:owner-publish')->name('listings.phone-request');
                        Route::post('listings/{id}/publish', OwnerPublishController::class)->whereUlid('id')->middleware('throttle:owner-publish')->name('listings.publish');
                    });
                });
            });

            // The seeker's request (WP-80, API-054): outside the `listings` group, whose middleware is `app:read`. Under
            // `v1-lists` until WP-85 brings the request limits of its own.
            Route::post('listings/{number}/contact-request', ListingContactRequestController::class)->whereNumber('number')->middleware(['ability:app:write', 'throttle:v1-lists'])->name('listings.contact-request.store');

            // Media (master prompt §7); a malformed id answers 404 without a query. The writes count under `uploads` only.
            Route::get('media/{media}', [MediaController::class, 'show'])->whereUlid('media')->middleware('throttle:v1-media')->name('media.show');

            Route::middleware(['ability:media:write', 'throttle:uploads'])->group(function (): void {
                Route::post('media', [MediaController::class, 'store'])->name('media.store');
                Route::post('media/presign', [PresignController::class, 'store'])->name('media.presign');
                Route::post('media/register', [PresignController::class, 'register'])->name('media.register');
                Route::delete('media/{media}', [MediaController::class, 'destroy'])->whereUlid('media')->name('media.destroy');
            });
        });
    });
});
