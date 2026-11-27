<?php

use App\Http\Controllers\Pages\CallPageController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| HOMI's public pages — served on the API host
|--------------------------------------------------------------------------
| Middleware group `public-pages` (`bootstrap/app.php`): only the limiter `call-page` (30 a minute per address) — no
| session, no cookie, no CSRF, no Inertia. The call page of WP-43 opens in the external browser from the Mini App, so
| it has no Telegram launch data: its token is its only credential. nginx writes the access log of `/call/*` without
| the path (SEC-REQ-026).
*/

Route::get('/call/{token}', CallPageController::class)
    ->where('token', '[A-Za-z0-9_.\-]{1,512}')
    ->name('call.show');
