<?php

namespace App\Enums;

/** How a radar sends (WP-13): each listing at once, or a digest at the user's digest hours. */
enum RadarMode: string
{
    case Instant = 'instant';
    case Digest = 'digest';
}
