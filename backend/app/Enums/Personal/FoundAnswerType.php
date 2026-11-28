<?php

namespace App\Enums\Personal;

/**
 * The answer to «Нашли жильё?» (WP-13, API-032; stored by WP-44). `homi` replaces legacy's `kvadro`.
 */
enum FoundAnswerType: string
{
    case Homi = 'homi';
    case Elsewhere = 'elsewhere';
    case Searching = 'searching';
    case Stopped = 'stopped';
}
