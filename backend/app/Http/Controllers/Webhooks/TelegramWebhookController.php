<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Telegram Bot API webhook (master prompt §8): verify → deduplicate (bot_id, update_id) →
 * durable `telegram` queue → ProcessTelegramUpdateJob.
 *
 * Phase 3 WIP: the endpoint answers 501 until the dedup/queue pipeline lands; the route is
 * additionally fail-closed by VerifyTelegramSecretToken.
 */
class TelegramWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        return new JsonResponse(['ok' => false, 'description' => 'Webhook processing is not enabled yet.'], 501);
    }
}
