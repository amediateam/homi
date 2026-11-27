<?php

namespace App\Services\Telegram;

/**
 * A prepared inline message of HOMI's bot (WP-12, API-017): its id for `WebApp.shareMessage` and when it expires (ISO
 * 8601). `ShareService` prepares it through the Bot API (WP-43).
 */
final readonly class PreparedShare
{
    public function __construct(public string $id, public string $expiresAt) {}
}
