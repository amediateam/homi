<?php

namespace App\Services\Listings\Contracts;

use App\Models\User;

/**
 * What the listing overlay needs from HOMI's own data (WP-42, "Overlay"): the per-user marks a legacy answer cannot
 * know under a service key, and the outcomes of HOMI's votes (DEC-48: legacy never learns about them). WP-42 binds
 * `App\Services\Listings\NullOverlayData`; WP-44 binds the real one over its tables.
 *
 * The overlay asks the methods without numbers (hidden listings, blocked keys, realtor keys) once per request's
 * context, and the methods that take numbers once per list, with the numbers of that list; an answer lists only
 * numbers among the ones asked. A card or a preview asks only for the flags and the realtor keys.
 */
interface OverlayData
{
    /**
     * @param  list<int>  $numbers
     * @return list<int> the user's favourites among `$numbers`
     */
    public function favorites(User $user, array $numbers): array;

    /**
     * @param  list<int>  $numbers
     * @return list<int> the numbers among `$numbers` the user has opened
     */
    public function viewed(User $user, array $numbers): array;

    /** @return list<int> every listing the user hid */
    public function hiddenNumbers(User $user): array;

    /** @return list<string> the author keys the user blocked */
    public function blockedAuthorKeys(User $user): array;

    /**
     * @param  list<int>  $numbers
     * @return list<int> the numbers among `$numbers` that HOMI's votes mark as rented
     */
    public function rentedByVotes(array $numbers): array;

    /** @return list<string> the author keys HOMI's votes mark as realtors */
    public function realtorAuthorKeys(): array;
}
