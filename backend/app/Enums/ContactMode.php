<?php

namespace App\Enums;

/**
 * How a self-placed listing is reached (WP-80, DEC-75): `phone` shows the number through the counted contact method,
 * `request` hides it and takes requests, `hidden` shows neither (a legacy `gate` listing while the relay is off).
 */
enum ContactMode: string
{
    case Phone = 'phone';
    case Request = 'request';
    case Hidden = 'hidden';
}
