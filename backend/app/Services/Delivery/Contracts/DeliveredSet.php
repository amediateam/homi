<?php

namespace App\Services\Delivery\Contracts;

use App\Models\User;

/**
 * The listings a user has already received in the chat from any of his radars (WP-45 asks it, WP-46 keeps it): a
 * radar's starter never sends one again (API-020, BR-BOT-049). `App\Services\Delivery\NullDeliveredSet` is bound until
 * WP-46 binds the ledger.
 */
interface DeliveredSet
{
    /**
     * @param  list<int>  $numbers
     * @return list<int> the numbers among `$numbers` the user has received
     */
    public function delivered(User $user, array $numbers): array;
}
