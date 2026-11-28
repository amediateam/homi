<?php

namespace App\Enums\Personal;

/** Where a user who found a home `elsewhere` found it (WP-13, API-033). */
enum FoundPlace: string
{
    case Telegram = 'telegram';
    case Olx = 'olx';
    case Site = 'site';
    case Agent = 'agent';
    case Friends = 'friends';
    case Street = 'street';
    case Other = 'other';
}
