<?php

namespace App\Enums\Access;

/**
 * The state of a user's row in `access_grants` (WP-40): `admitted` (the user holds a seat) or `blocked` by an
 * operator (`access:block`), which beats every other rule of the gate.
 */
enum AccessGrantState: string
{
    case Admitted = 'admitted';
    case Blocked = 'blocked';
}
