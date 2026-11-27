<?php

/*
|--------------------------------------------------------------------------
| Telegram Bot (master prompt §8, module Bot)
|--------------------------------------------------------------------------
|
| One bot per environment (dev / staging / production — ADR-0011). The token and
| the webhook secret come from the environment only and are never logged.
| Webhook flow: Telegram → hook.* vhost → verify secret → dedup (bot_id, update_id)
| → durable `telegram` queue → ProcessTelegramUpdateJob.
|
*/

return [

    'bot' => [
        'token' => env('TELEGRAM_BOT_TOKEN'),
        'username' => env('TELEGRAM_BOT_USERNAME'),
    ],

    // The Mini App's launch data (WP-40, SEC-REQ-001 … 003): `max_age` is the window in seconds in which a signed
    // `initData` is accepted (a blank or non-positive value means the default); `max_exchanges` is how many times one
    // value may be exchanged for a token inside that window.
    'initdata' => [
        'max_age' => max(0, (int) env('TELEGRAM_INITDATA_MAX_AGE')) ?: 3600,
        'max_exchanges' => 20,
    ],

    // The public name of HOMI's support account, shown by the Mini App (`GET /api/v1/reference`, WP-11).
    'support' => [
        'username' => env('TELEGRAM_SUPPORT_USERNAME'),
    ],

    'webhook' => [
        'url' => env('TELEGRAM_WEBHOOK_URL'),
        'secret' => env('TELEGRAM_WEBHOOK_SECRET'),
        'max_connections' => (int) env('TELEGRAM_WEBHOOK_MAX_CONNECTIONS', 40),
        'allowed_updates' => [
            'message',
            'edited_message',
            'callback_query',
            'my_chat_member',
            'chat_member',
        ],
        // Telegram caps updates at 1 MB; nginx enforces client_max_body_size as well.
        'max_body_bytes' => 1024 * 1024,
    ],

    'http' => [
        // A bare origin (WP-43, `TelegramClient`): `https` (plain `http` only in local and testing), a host and an
        // optional port, no user, path, query or fragment; anything else fails closed before the token is sent.
        'base_url' => env('TELEGRAM_API_BASE_URL', 'https://api.telegram.org'),
        'timeout' => (int) env('TELEGRAM_HTTP_TIMEOUT', 15),
        'connect_timeout' => (int) env('TELEGRAM_HTTP_CONNECT_TIMEOUT', 5),
        'retries' => 2,
        'max_retry_after' => 5,
    ],

    'queue' => 'telegram',

    // Processed updates are pruned after this many days (model:prune).
    'updates_retention_days' => (int) env('TELEGRAM_UPDATES_RETENTION_DAYS', 14),

];
