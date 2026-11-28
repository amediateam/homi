<?php

namespace App\Services\Personal;

use App\Services\Listings\ListingOverlay;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;

/**
 * The items of a page of a personal list (WP-44, "List pages"): the card source's previews of the page's numbers, in
 * row order. `ListingSource::previews()` leaves out only a number the source answered `404` for (WP-42, DEC-110:
 * `LegacyListingSource::fetchPreviews()` and its gone cache), and fails the whole call for anything else it could not
 * give (`SourceUnavailable`, `503`; legacy's pause stays `403`) — so a number missing from the answer is left out, and
 * an item that missed its wait or deadline is never mistaken for gone (brief decision 12). The pager marks nothing gone
 * itself: legacy files its own `404`s in `listing_refs` (`rememberGone()`), while a driver that leaves a number out
 * for another reason — the stub, which knows only its catalogue, for a user a split rule or a rollback of
 * `source.listings.card` sends to it — must not make a live listing gone for everyone (review of stage A, F1). A page
 * may therefore be shorter than its rows while the cursor is still set. A merged duplicate shows as its survivor, once
 * per page. The items get HOMI's flags and realtor marks (`ListingOverlay::items()`), never an exclusion: a hidden
 * favourite stays a favourite.
 */
final readonly class PersonalListPager
{
    public function __construct(
        private SourceManager $sources,
        private ListingOverlay $overlay,
    ) {}

    /**
     * @param  list<int>  $numbers  the page's listing numbers, in row order
     * @return list<ListingSummary>
     */
    public function items(array $numbers, SourceContext $context): array
    {
        if ($numbers === []) {
            return [];
        }

        $previews = $this->sources->listings('source.listings.card', $context)->source->previews($numbers, $context);
        $items = [];

        foreach ($numbers as $number) {
            $preview = $previews[$number] ?? null;

            if ($preview !== null) {
                $items[$preview->number] ??= $preview;
            }
        }

        return $this->overlay->items(array_values($items), $context);
    }
}
