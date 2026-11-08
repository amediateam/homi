<?php

use App\Http\Controllers\Webhooks\TelegramWebhookController;
use App\Http\Middleware\VerifyTelegramSecretToken;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Third-party webhooks — served on hook.homi.* (master prompt §8)
|--------------------------------------------------------------------------
| The hook.* nginx vhost forwards only /telegram/* (and /up); everything else is 404 at nginx.
| Middleware group `hooks`: throttle:telegram-webhook + route bindings — no session, no CSRF.
*/

Route::post('/telegram/webhook', TelegramWebhookController::class)
    ->middleware(VerifyTelegramSecretToken::class)
    ->name('hooks.telegram');
