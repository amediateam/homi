<?php

namespace App\Enums\Access;

/**
 * How a user was admitted (`access_grants.admitted_via`, WP-40): a seat of `open` mode, an invite (WP-52), the owner
 * list, or an operator. Null on a grant blocked before any admission.
 */
enum AdmittedVia: string
{
    case Open = 'open';
    case Invite = 'invite';
    case Owner = 'owner';
    case Operator = 'operator';
}
