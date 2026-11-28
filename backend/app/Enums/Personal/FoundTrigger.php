<?php

namespace App\Enums\Personal;

/** What asked «Нашли жильё?» (WP-13, API-032): pausing or deleting a radar; the bot's poll adds its own (WP-53). */
enum FoundTrigger: string
{
    case Pause = 'pause';
    case Delete = 'delete';
}
