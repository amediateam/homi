<?php

namespace App\Services\Listings;

use App\Models\User;
use App\Services\Listings\Contracts\OwnerOverlayData;

/**
 * No owner data source yet (WP-42): the owner listings arrive with WP-84 and the contact requests with WP-85. Both
 * answers are `null`, so the overlay leaves the source's own owner and request values as they came.
 */
final class NullOwnerOverlayData implements OwnerOverlayData
{
    public function ownListings(User $user, array $numbers): ?array
    {
        return null;
    }

    public function contactRequests(User $user, array $numbers): ?array
    {
        return null;
    }
}
