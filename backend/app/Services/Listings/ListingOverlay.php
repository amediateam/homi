<?php

namespace App\Services\Listings;

use App\Enums\ContactMode;
use App\Enums\ContactRequestStatus;
use App\Enums\OwnerFilter;
use App\Models\User;
use App\Services\Listings\Contracts\ListingExclusion;
use App\Services\Listings\Contracts\OverlayData;
use App\Services\Listings\Contracts\OwnerOverlayData;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\MapPoint;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceContext;
use Illuminate\Support\Facades\Config;

/**
 * HOMI's per-user part of a listing answer (WP-42, "Overlay"; `25` §4.5, DEC-42, DEC-48), applied by the listing
 * controllers to the answer of every driver, and by the legacy feed pager through `ListingExclusion` before it tops a
 * page up:
 *
 * 1. Excluded numbers of the caller = the listings he hid ∪ the listings `listing_refs` files under an author key he
 *    blocked ∪ the listings of the list HOMI's votes mark as rented.
 * 2. Feed and map leave the excluded out; the card (and its `preview=1` form) is still answered, with the flags only.
 * 3. `favorite` and `viewed` come from HOMI's data on every item of the feed and on the card.
 * 4. An item whose author key HOMI's votes mark as a realtor's gets `is_owner: false` (the card `owner.tier: null`
 *    as well), and is left out where the filters ask for `owners` or `no_agents`.
 * 5. Count, the new-since count and flow are not overlaid. A map answer loses `total` and `with_point` by the points
 *    it leaves out.
 *
 * Without a user (a system context) only the vote part of step 1 and step 4 run. The card also gets the owner
 * cabinet's part: `owner.mine` and `owner.listing_id`, `contact.request` (and, for a `request`-mode listing,
 * `contact.has_phone` only with a `given` request) from `OwnerOverlayData`, left as the source gave them while that
 * has no data source (WP-84, WP-85); then `owner.entry` (DEC-94): true while the cabinet is on, for an owner's listing
 * that is not the caller's own. While `sources.native_stubs` is on (WP-40) nothing is overlaid, so the end-to-end
 * suite keeps the fixed flags of the fixtures (`25` §4.4).
 *
 * HOMI's data is read once per list: the marks of a page, a map answer or a card are one set of reads.
 */
final readonly class ListingOverlay implements ListingExclusion
{
    public function __construct(
        private OverlayData $data,
        private OwnerOverlayData $owners,
        private ListingRefs $refs,
        private SourceConfig $config,
    ) {}

    public function excluded(array $items, SearchFilters $filters, SourceContext $context): array
    {
        if ($items === [] || $this->config->nativeStubs()) {
            return [];
        }

        $numbers = array_map(fn (ListingSummary $item): int => $item->number, $items);
        $marks = $this->marks($numbers, $context->user, false);

        return array_values(array_filter($numbers, fn (int $number): bool => self::isExcluded($marks, $number, $filters)));
    }

    /** A feed page without the excluded items, with HOMI's flags and marks on the others; the cursor unchanged. */
    public function feed(ListingPage $page, SearchFilters $filters, SourceContext $context): ListingPage
    {
        if ($page->items === [] || $this->config->nativeStubs()) {
            return $page;
        }

        $marks = $this->marks(array_map(fn (ListingSummary $item): int => $item->number, $page->items), $context->user, true);
        $items = [];

        foreach ($page->items as $item) {
            if (! self::isExcluded($marks, $item->number, $filters)) {
                $items[] = self::marked($item, $marks);
            }
        }

        return new ListingPage($items, $page->nextCursor);
    }

    /** A map answer without the excluded points; `total` and `with_point` lose the points left out. */
    public function map(MapPoints $map, SearchFilters $filters, SourceContext $context): MapPoints
    {
        if ($map->points === [] || $this->config->nativeStubs()) {
            return $map;
        }

        $marks = $this->marks(array_map(fn (MapPoint $point): int => $point->number, $map->points), $context->user, false);
        $kept = array_values(array_filter($map->points, fn (MapPoint $point): bool => ! self::isExcluded($marks, $point->number, $filters)));
        $removed = count($map->points) - count($kept);

        return $removed === 0 ? $map : new MapPoints($kept, $map->total - $removed, $map->withPoint - $removed);
    }

    /** The `preview=1` card: HOMI's flags and marks, never left out. */
    public function preview(ListingSummary $preview, SourceContext $context): ListingSummary
    {
        if ($this->config->nativeStubs()) {
            return $preview;
        }

        return self::marked($preview, $this->marks([$preview->number], $context->user, true));
    }

    /** The full card: HOMI's flags and marks (never left out), the caller's owner part and the invitation of DEC-94. */
    public function card(ListingDetails $card, SourceContext $context): ListingDetails
    {
        if ($this->config->nativeStubs()) {
            return $card;
        }

        $number = $card->preview->number;
        $marks = $this->marks([$number], $context->user, true);
        $card = $card->withPreview(self::marked($card->preview, $marks));

        if (isset($marks['realtor'][$number])) {
            $card = $card->withOwner($card->owner->withoutTier());
        }

        $card = $this->owned($card, $context->user);

        return $card->withOwnerEntry(Config::boolean('owner.enabled') && $card->preview->isOwner === true && ! $card->owner->mine);
    }

    /**
     * The caller's own listing and request on the card, where `OwnerOverlayData` has a source for them.
     */
    private function owned(ListingDetails $card, ?User $user): ListingDetails
    {
        if ($user === null) {
            return $card;
        }

        $number = $card->preview->number;
        $own = $this->owners->ownListings($user, [$number]);

        if ($own !== null) {
            $card = $card->withOwner($card->owner->withMine($own[$number] ?? null));
        }

        $requests = $this->owners->contactRequests($user, [$number]);

        if ($requests !== null) {
            $request = $requests[$number] ?? null;
            $hasPhone = $card->contactMode === ContactMode::Request ? $request?->status === ContactRequestStatus::Given : $card->hasPhone;
            $card = $card->withContactRequest($request, $hasPhone);
        }

        return $card;
    }

    /**
     * HOMI's marks of the numbers of one list: what the caller must not see (step 1), the realtors' (step 4) and,
     * with `$flags`, the caller's favourites and opened listings (step 3).
     *
     * @param  list<int>  $numbers
     * @return array{excluded: array<int, true>, realtor: array<int, true>, favorite: array<int, true>, viewed: array<int, true>}
     */
    private function marks(array $numbers, ?User $user, bool $flags): array
    {
        $asked = array_fill_keys($numbers, true);
        $excluded = [];
        $realtor = [];

        if ($user !== null) {
            $excluded = array_intersect_key(array_fill_keys($this->data->hiddenNumbers($user), true), $asked);
        }

        $excluded += array_intersect_key(array_fill_keys($this->data->rentedByVotes($numbers), true), $asked);
        $blocked = $user === null ? [] : array_fill_keys($this->data->blockedAuthorKeys($user), true);
        $realtors = array_fill_keys($this->data->realtorAuthorKeys(), true);

        if ($blocked !== [] || $realtors !== []) {
            foreach ($this->refs->authorKeysOf($numbers) as $number => $key) {
                if (isset($blocked[$key])) {
                    $excluded[$number] = true;
                }

                if (isset($realtors[$key])) {
                    $realtor[$number] = true;
                }
            }
        }

        $favorite = [];
        $viewed = [];

        if ($flags && $user !== null) {
            $favorite = array_intersect_key(array_fill_keys($this->data->favorites($user, $numbers), true), $asked);
            $viewed = array_intersect_key(array_fill_keys($this->data->viewed($user, $numbers), true), $asked);
        }

        return ['excluded' => $excluded, 'realtor' => $realtor, 'favorite' => $favorite, 'viewed' => $viewed];
    }

    /** @param  array{excluded: array<int, true>, realtor: array<int, true>, favorite: array<int, true>, viewed: array<int, true>}  $marks */
    private static function isExcluded(array $marks, int $number, SearchFilters $filters): bool
    {
        return isset($marks['excluded'][$number])
            || (isset($marks['realtor'][$number]) && in_array($filters->owner, [OwnerFilter::Owners, OwnerFilter::NoAgents], true));
    }

    /** @param  array{excluded: array<int, true>, realtor: array<int, true>, favorite: array<int, true>, viewed: array<int, true>}  $marks */
    private static function marked(ListingSummary $item, array $marks): ListingSummary
    {
        $item = $item->withFlags(favorite: isset($marks['favorite'][$item->number]), viewed: isset($marks['viewed'][$item->number]));

        return isset($marks['realtor'][$item->number]) ? $item->asRealtors() : $item;
    }
}
