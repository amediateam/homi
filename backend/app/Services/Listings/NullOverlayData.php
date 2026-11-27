<?php

namespace App\Services\Listings;

use App\Models\ListingView;
use App\Models\User;
use App\Services\Listings\Contracts\OverlayData;

/**
 * The overlay data of WP-42, until WP-44 binds the tables of favourites, hidden listings, blocked authors and votes:
 * nothing is a favourite, hidden, blocked, rented or a realtor's. Only `viewed()` answers, from `listing_views`, which
 * `ViewRecorder` writes since WP-42.
 */
final class NullOverlayData implements OverlayData
{
    public function favorites(User $user, array $numbers): array
    {
        return [];
    }

    public function viewed(User $user, array $numbers): array
    {
        if ($numbers === []) {
            return [];
        }

        $viewed = [];

        foreach (ListingView::query()->where('user_id', $user->id)->whereIn('listing_number', array_values(array_unique($numbers)))->pluck('listing_number') as $number) {
            $viewed[] = (int) $number;
        }

        return $viewed;
    }

    public function hiddenNumbers(User $user): array
    {
        return [];
    }

    public function blockedAuthorKeys(User $user): array
    {
        return [];
    }

    public function rentedByVotes(array $numbers): array
    {
        return [];
    }

    public function realtorAuthorKeys(): array
    {
        return [];
    }
}
