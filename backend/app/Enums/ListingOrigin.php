<?php

namespace App\Enums;

/**
 * Who placed a listing (WP-80): `legacy`, harvested or placed in legacy; `native`, placed by its owner in HOMI.
 */
enum ListingOrigin: string
{
    case Legacy = 'legacy';
    case Native = 'native';
}
