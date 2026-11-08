<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Compares `X-Telegram-Bot-Api-Secret-Token` with telegram.webhook.secret (hash_equals, fail-closed).
 *
 * Phase 3 WIP: rejects every request until the comparison is implemented with its tests, so the
 * webhook route can never be reached unverified.
 */
class VerifyTelegramSecretToken
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        abort(403, 'Webhook verification is not enabled yet.');
    }
}
