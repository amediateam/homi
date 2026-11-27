<?php

namespace App\Services\Personal;

use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Jobs\Listings\ResolveListingRef;
use App\Models\ListingRef;
use App\Services\Listings\ListingPointer;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;

/**
 * The listing a personal write points at (WP-44, "Resolving a listing for a write"; brief decision 11): this class owns
 * "known, not gone, survivor" — `ListingRefs::pointer()` of WP-42 answers the asked number for unknown, gone and merged
 * numbers alike and is left as it is.
 *
 * 1. `listing_refs` files the number, follows its merges to the survivor (`survivor()`), and the survivor is neither
 *    gone nor merged: the pointer is that row's number, channel and post, with no source call — so a write of a listing
 *    HOMI knows works while the source is down.
 * 2. Otherwise the card source's preview of the asked number (`source.listings.card`): `404` → `404 not_found`, an
 *    unavailable source → `503 source_unavailable`, found → a pointer to the number the preview answered with (a merged
 *    duplicate answers its survivor), without channel and post unless `listing_refs` files that survivor as live, and
 *    `filed: false`. The caller writes its row and then calls `backfill()`, which queues `ResolveListingRef` — after the
 *    write, so the job finds the row (the `sync` queue of the tests runs it at once).
 *
 * A number below 1 is `404` without a query. A delete never resolves through the source: it removes the asked number
 * and its survivor (`survivor()`), so a listing the source has withdrawn can still leave a list.
 */
final readonly class ListingResolver
{
    /** The merges followed at most: legacy merges into a survivor, which a later merge may merge again. */
    private const int MAX_HOPS = 8;

    public function __construct(private SourceManager $sources) {}

    /** @throws SourceNotFound|SourceUnavailable */
    public function resolve(int $number, SourceContext $context): ListingPointer
    {
        if ($number < 1) {
            throw new SourceNotFound('Listing not found.');
        }

        $filed = $this->live($this->survivor($number));

        if ($filed !== null) {
            return $filed;
        }

        $answered = $this->sources->listings('source.listings.card', $context)->source->preview($number, $context)->number;

        return $this->live($answered) ?? new ListingPointer($answered, null, null, filed: false);
    }

    /**
     * The number `listing_refs` says `$number` survives as — its own when the row is no merged duplicate or HOMI has no
     * row; never a source call. A chain is followed up to `MAX_HOPS`, and a loop ends where it closes.
     */
    public function survivor(int $number): int
    {
        $seen = [$number => true];

        for ($hop = 0; $hop < self::MAX_HOPS; $hop++) {
            $next = ListingRef::query()->whereKey($number)->value('merged_into');

            if (! is_numeric($next) || isset($seen[(int) $next])) {
                return $number;
            }

            $number = (int) $next;
            $seen[$number] = true;
        }

        return $number;
    }

    /** After the write of an unfiled pointer: queues the back-fill of its channel and post. */
    public function backfill(ListingPointer $pointer): void
    {
        if (! $pointer->filed) {
            ResolveListingRef::dispatch($pointer->number);
        }
    }

    /** The pointer of a number `listing_refs` files as live (neither gone nor merged), else `null`. */
    private function live(int $number): ?ListingPointer
    {
        $ref = ListingRef::query()->find($number);

        if ($ref === null || $ref->gone_at !== null || $ref->merged_into !== null) {
            return null;
        }

        return new ListingPointer($number, $ref->source_channel, $ref->source_post_id);
    }
}
