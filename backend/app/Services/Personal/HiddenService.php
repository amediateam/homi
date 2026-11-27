<?php

namespace App\Services\Personal;

use App\Enums\Personal\HiddenReason;
use App\Models\BlockedAuthor as BlockedAuthorEntry;
use App\Models\HiddenListing;
use App\Models\User;
use App\Services\Listings\ListingPointer;
use App\Services\Listings\ListingRefs;
use App\Services\Sources\SourceContext;
use Illuminate\Support\Facades\DB;

/**
 * The listings a user hid (WP-44; task `KV-BE-040`, BR-API-096): for this user only, undoable. `hide()` is one
 * `insertOrIgnore` on (`user_id`, `listing_number`), so a repeat changes nothing and an existing row keeps its first
 * reason (a manual hide over a report's keeps the report's); `unhide()` deletes the row whatever its reason — the undo
 * after a `fraud` report too (BR-API-104) — and never touches a vote (Q-API-040). `overview()` and `clear()` serve
 * «Скрытое» (task `KV-BE-042`) with the blocked authors. Radar hide rules are WP-45's and are not read or written here.
 */
final readonly class HiddenService
{
    /** The hidden listings `GET /hidden` answers at most, newest first. */
    public const int OVERVIEW_LISTINGS = 200;

    public function __construct(private ListingResolver $resolver, private PersonalListPager $pager, private ListingRefs $refs) {}

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

    /**
     * «Скрытое»: the hidden listings of every reason, newest first, at most `OVERVIEW_LISTINGS`, as previews in row order
     * (a number the source no longer knows is left out and marked gone, `PersonalListPager`; a source that cannot give
     * them is `SourceUnavailable`, `503`), and every blocked author, newest first, with the live listings `listing_refs`
     * files under its key (`0` once none is left) — three reads, however long the lists.
     */
    public function overview(User $user, SourceContext $context): HiddenOverview
    {
        $numbers = $user->hiddenListings()->orderByDesc('id')->limit(self::OVERVIEW_LISTINGS)->pluck('listing_number');
        $entries = $user->blockedAuthors()->orderByDesc('created_at')->orderByDesc('id')->get(['id', 'author_key', 'kind', 'label']);
        $counts = $this->refs->liveCountsOfAuthors(array_values($entries->map(fn (BlockedAuthorEntry $entry): string => $entry->author_key)->all()));

        return new HiddenOverview(
            $this->pager->items(array_values(array_map(intval(...), $numbers->all())), $context),
            array_values($entries->map(fn (BlockedAuthorEntry $entry): BlockedAuthor => new BlockedAuthor($entry->id, $entry->kind, $entry->label, $counts[$entry->author_key] ?? 0))->all()),
        );
    }

    /** Clears the caller's hidden listings and blocked authors in one transaction; idempotent. */
    public function clear(User $user): void
    {
        DB::transaction(function () use ($user): void {
            $user->hiddenListings()->delete();
            $user->blockedAuthors()->delete();
        });
    }
}
