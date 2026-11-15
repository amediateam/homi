<?php

namespace App\Enums;

/** The colour theme a user chose; `auto` follows Telegram. */
enum Theme: string
{
    case Auto = 'auto';
    case Light = 'light';
    case Dark = 'dark';
}
