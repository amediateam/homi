<?php

namespace App\Services\Listings\Contracts;

use App\Models\User;
use App\Services\Sources\Data\ContactRequestState;

/**
 * The owner cabinet's per-user part of a card (WP-42 "Overlay", added by the owner-cabinet plan): the caller's own
 * listings (WP-84, written by WP-85) and his contact requests (WP-85). Never cached with the card.
 *
 * `null` means no data source is bound yet: the overlay then leaves the source's own values (`owner.mine`,
 * `owner.listing_id`, `contact.request`, `contact.has_phone`) as they came. WP-42 binds
 * `App\Services\Listings\NullOwnerOverlayData`, which has none; WP-84 and WP-85 bind the real ones.
 */
interface OwnerOverlayData
{
    /**
     * @param  list<int>  $numbers
     * @return array<int, string>|null number => the user's owner listing id, for his own listings among `$numbers`
     */
    public function ownListings(User $user, array $numbers): ?array;

    /**
     * @param  list<int>  $numbers
     * @return array<int, ContactRequestState>|null number => the user's request, for the numbers he asked
     */
    public function contactRequests(User $user, array $numbers): ?array;
}
