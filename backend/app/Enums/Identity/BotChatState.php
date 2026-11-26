<?php

namespace App\Enums\Identity;

/**
 * Whether HOMI's bot may write to the user (`users.bot_chat_state`, WP-40): `never` until the user lets it, `active`
 * once a launch says `allows_write_to_pm` (a later launch without it never downgrades), `blocked` when the bot learns
 * that the user blocked it (WP-52).
 */
enum BotChatState: string
{
    case Never = 'never';
    case Active = 'active';
    case Blocked = 'blocked';
}
