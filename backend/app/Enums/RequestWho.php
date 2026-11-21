<?php

namespace App\Enums;

/**
 * Who asks for a flat in a request (WP-80).
 */
enum RequestWho: string
{
    case One = 'one';
    case Couple = 'couple';
    case Family = 'family';
    case Students = 'students';
    case Friends = 'friends';
}
