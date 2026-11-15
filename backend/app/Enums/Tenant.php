<?php

namespace App\Enums;

/** Who the long rent is for (`tenant` filter, BR-API-029). */
enum Tenant: string
{
    case Family = 'family';
    case Men = 'men';
    case Women = 'women';
}
