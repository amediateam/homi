<?php

namespace App\Enums;

/**
 * The owner tier of a card (WP-80, fix of LB-APP-075): `self` placed by its owner (in HOMI or in legacy), `verified` a verified
 * owner, `claimed` a post that says it is the owner's but is not verified.
 */
enum OwnerTier: string
{
    case Self = 'self';
    case Verified = 'verified';
    case Claimed = 'claimed';
}
