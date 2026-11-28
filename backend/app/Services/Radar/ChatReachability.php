<?php

namespace App\Services\Radar;

use App\Enums\Identity\BotChatState;
use App\Models\User;

/**
 * Whether HOMI's bot may write to the user (WP-45; task `KV-BE-100`, F-RADAR-008): `users.bot_chat_state` is `active`
 * (WP-40 sets it from a launch that allows writing, WP-52 from the bot's own updates). Read from the loaded user, so
 * the check costs no query; `RadarService` asks it before any lock or write while `radar.require_chat` is on.
 */
final readonly class ChatReachability
{
    public function canWrite(User $user): bool
    {
        return $user->bot_chat_state === BotChatState::Active;
    }
}
