<?php

use App\Http\Controllers\Api\V1\CityController;
use App\Http\Controllers\Api\V1\Media\MediaController;
use App\Http\Controllers\Api\V1\Media\PresignController;
use App\Http\Controllers\Api\V1\ReferenceController;
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
    // Public (WP-11): the no-access screen needs them without a session.
    Route::get('reference', ReferenceController::class)->name('reference.show');
    Route::get('cities', CityController::class)->name('cities.index');

    Route::middleware('auth:sanctum')->group(function (): void {
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
