<?php

namespace App\Services\Personal;

use App\Enums\Personal\HiddenReason;
use App\Models\HiddenListing;
use App\Models\User;
use App\Services\Listings\ListingPointer;

/**
 * The listings a user hid (WP-44; task `KV-BE-040`, BR-API-096): for this user only, undoable. `hide()` is one
 * `insertOrIgnore` on (`user_id`, `listing_number`), so a repeat changes nothing and an existing row keeps its first
 * reason (a manual hide over a report's keeps the report's); `unhide()` deletes the row whatever its reason — the undo
 * after a `fraud` report too (BR-API-104) — and never touches a vote (Q-API-040). Radar hide rules are WP-45's.
 */
final readonly class HiddenService
{
    public function __construct(private ListingResolver $resolver) {}

    public function hide(User $user, ListingPointer $pointer, HiddenReason $reason = HiddenReason::Manual): void
    {
        HiddenListing::query()->insertOrIgnore([
            'user_id' => $user->id,
            'listing_number' => $pointer->number,
            'source_channel' => $pointer->channel,
            'source_post_id' => $pointer->postId,
            'reason' => $reason->value,
            'created_at' => now(),
        ]);
        $this->resolver->backfill($pointer);
    }

    /**
     * Shows the listing again — the number asked and the survivor `listing_refs` files for it — without asking the
     * source; a listing that was not hidden changes nothing.
     */
    public function unhide(User $user, int $number): void
    {
        $user->hiddenListings()->whereIn('listing_number', array_values(array_unique([$number, $this->resolver->survivor($number)])))->delete();
    }
}
