<?php

namespace App\Services\Personal;

use App\Models\Favorite;
use App\Models\User;
use App\Services\Listings\ListingPointer;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;

/**
 * A user's favourites (WP-44; task `KV-BE-038`, BR-APP-039). Writes set a target state — the Mini App's `PUT` and
 * `DELETE`, and the bot's ⭐ later (WP-53) — so a double tap or a race of two clients ends in the state asked for: `set`
 * is one `insertOrIgnore` on (`user_id`, `listing_number`), `unset` one delete. `page()` is the only reader of the list
 * (the bot's `/fav` pages through it too).
 */
final readonly class FavoriteService
{
    public function __construct(private ListingResolver $resolver, private PersonalListPager $pager) {}

    /** Saves the listing; a repeat changes nothing. Answers the state, `true`. */
    public function set(User $user, ListingPointer $pointer): bool
    {
        Favorite::query()->insertOrIgnore([
            'user_id' => $user->id,
            'listing_number' => $pointer->number,
            'source_channel' => $pointer->channel,
            'source_post_id' => $pointer->postId,
            'created_at' => now(),
        ]);
        $this->resolver->backfill($pointer);

        return true;
    }

    /**
     * Removes the listing — the number asked, the survivor `listing_refs` files for it and every number of the user's
     * favourites merged into that survivor since they were saved (`ListingResolver::numbersOf()`), as the list shows
     * them under the survivor — without asking the source, so a withdrawn listing can leave the list too; a listing
     * that was no favourite changes nothing. Answers the state, `false`.
     */
    public function unset(User $user, int $number): bool
    {
        $user->favorites()->whereIn('listing_number', $this->resolver->numbersOf($number, null, $user->favorites()->toBase()))->delete();

        return false;
    }

    /**
     * One page of the favourites, newest first: `$limit` rows after the cursor's row id (a keyset, so a favourite
     * added or removed meanwhile neither repeats nor skips another), their previews in row order (`PersonalListPager`),
     * each `favorite: true`. The cursor of the next page is the last row's, `null` when no row is left; a foreign
     * cursor ends the list quietly. A source that cannot give the page is `SourceUnavailable` (`503`).
     */
    public function page(User $user, ?string $cursor, int $limit, SourceContext $context): ListingPage
    {
        $key = $cursor === null ? null : PersonalCursor::decode($cursor, [PersonalCursor::ROW_ID]);

        if ($cursor !== null && $key === null) {
            return new ListingPage([], null);
        }

        $rows = $user->favorites()
            ->when($key !== null, fn ($query) => $query->where('id', '<', $key[0] ?? 0))
            ->orderByDesc('id')
            ->limit($limit + 1)
            ->get(['id', 'listing_number']);
        $more = $rows->count() > $limit;
        $rows = $rows->take($limit)->values();
        $last = $rows->last();
        $items = $this->pager->items(array_values($rows->map(fn (Favorite $row): int => $row->listing_number)->all()), $context);

        return new ListingPage(
            array_map(fn (ListingSummary $item): ListingSummary => $item->withFlags(favorite: true), $items),
            $more && $last !== null ? PersonalCursor::encode([$last->id]) : null,
        );
    }
}
