<?php

namespace App\Enums;

/**
 * The status of an owner listing (WP-80).
 */
enum OwnerListingStatus: string
{
    case Draft = 'draft';
    case Active = 'active';
    case Paused = 'paused';
    case Rented = 'rented';
    case Removed = 'removed';
    case Rejected = 'rejected';
}
