<?php

use App\Http\Controllers\Api\V1\Media\MediaController;
use App\Http\Controllers\Api\V1\Media\PresignController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 (ADR-0007) — served on api.homi.*
|--------------------------------------------------------------------------
| Authentication: Sanctum bearer tokens (ADR-0003); abilities gate write access. Every route is
| throttled per actor by the `api` limiter; write groups add their own.
*/

Route::prefix('v1')->name('api.v1.')->middleware(['auth:sanctum', 'throttle:api'])->group(function (): void {
    // Media (master prompt §7); a malformed id answers 404 without a query.
    Route::get('media/{media}', [MediaController::class, 'show'])->whereUlid('media')->name('media.show');

    Route::middleware(['ability:media:write', 'throttle:uploads'])->group(function (): void {
        Route::post('media', [MediaController::class, 'store'])->name('media.store');
        Route::post('media/presign', [PresignController::class, 'store'])->name('media.presign');
        Route::post('media/register', [PresignController::class, 'register'])->name('media.register');
        Route::delete('media/{media}', [MediaController::class, 'destroy'])->whereUlid('media')->name('media.destroy');
    });
});
