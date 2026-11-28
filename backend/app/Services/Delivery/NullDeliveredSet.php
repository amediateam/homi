<?php

namespace App\Services\Delivery;

use App\Models\User;
use App\Services\Delivery\Contracts\DeliveredSet;

/** Nothing is delivered before WP-46: no radar sends to a chat yet (WP-57), so no listing has been received. */
final readonly class NullDeliveredSet implements DeliveredSet
{
    public function delivered(User $user, array $numbers): array
    {
        return [];
    }
}
