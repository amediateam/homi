<?php

namespace App\Enums;

/** New building or secondary market (`market` filter of a sale, BR-API-029). */
enum Market: string
{
    case New = 'new';
    case Secondary = 'secondary';
}
