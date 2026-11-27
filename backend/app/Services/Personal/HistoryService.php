<?php

namespace App\Services\Personal;

use App\Models\ListingView;
use App\Models\User;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Date;

/**
 * A user's view history (WP-44; task `KV-BE-039`, BR-APP-040): the rows `ViewRecorder` writes into `listing_views` on a
 * full card read (WP-42). `page()` is the only reader of the list (the bot pages through it too, WP-53); there is no
 * cap on its length (DEC-53). `clear()` deletes the user's rows, which also resets the `viewed` flag everywhere, since
 * the overlay reads it from the same rows.
 */
final readonly class HistoryService
{
    public function __construct(private PersonalListPager $pager) {}

    /**
     * One page of the history, the newest view first: `$limit` rows after the cursor in the order (`last_viewed_at`
     * desc, `id` desc) — a composite keyset, so views that share a second (the column keeps whole seconds) are cut and
     * resumed by id, on SQLite and PostgreSQL alike (brief decision 13) — their previews in row order, each `viewed:
     * true`. A listing opened again moves to the top, so a later page never repeats it. The cursor carries the last
     * row's time (Unix seconds) and id, `null` when no row is left; a foreign cursor ends the list quietly. A source
     * that cannot give the page is `SourceUnavailable` (`503`).
     */
    public function page(User $user, ?string $cursor, int $limit, SourceContext $context): ListingPage
    {
        $key = $cursor === null ? null : PersonalCursor::decode($cursor, [PersonalCursor::TIME, PersonalCursor::ROW_ID]);

        if ($cursor !== null && $key === null) {
            return new ListingPage([], null);
        }

        $query = $user->listingViews();

        if ($key !== null) {
            $at = Date::createFromTimestamp($key[0], config('app.timezone'));
            $query->where(fn (Builder $older): Builder => $older
                ->where('last_viewed_at', '<', $at)
                ->orWhere(fn (Builder $same): Builder => $same->where('last_viewed_at', '=', $at)->where('id', '<', $key[1])));
        }

        $rows = $query->orderByDesc('last_viewed_at')->orderByDesc('id')->limit($limit + 1)->get(['id', 'listing_number', 'last_viewed_at']);
        $more = $rows->count() > $limit;
        $rows = $rows->take($limit)->values();
        $last = $rows->last();
        $items = $this->pager->items(array_values($rows->map(fn (ListingView $row): int => $row->listing_number)->all()), $context);

        return new ListingPage(
            array_map(fn (ListingSummary $item): ListingSummary => $item->withFlags(viewed: true), $items),
            $more && $last !== null ? PersonalCursor::encode([$last->last_viewed_at->getTimestamp(), $last->id]) : null,
        );
    }

    /** Deletes the user's whole history; idempotent. */
    public function clear(User $user): void
    {
        $user->listingViews()->delete();
    }
}
