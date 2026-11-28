<?php

namespace App\Services\Personal;

use App\Exceptions\Sources\SourceNotFound;
use App\Jobs\Listings\ResolveListingRef;
use App\Models\ListingRef;
use App\Services\Listings\ListingPointer;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Database\Query\Builder as QueryBuilder;

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
 * A number below 1 is `404` without a query. A list delete never resolves through the source: it removes the caller's
 * rows under the asked number, its survivor and every number of the caller's rows merged into that survivor since
 * (`numbersOf()`), so a listing the source has withdrawn, or merged after the row was written, can still leave a list.
 */
final readonly class ListingResolver
{
    /** The merges followed at most: legacy merges into a survivor, which a later merge may merge again. */
    private const int MAX_HOPS = 8;

    public function __construct(private SourceManager $sources) {}

    /**
     * The pointer of the listing a write names; `SourceNotFound` (`404`) or `SourceUnavailable` (`503`) from step 2 —
     * named here, not as `@throws` tags, which the OpenAPI export would read as answers of the calling method.
     */
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
        return $this->survivors([$number])[$number];
    }

    /**
     * `survivor()` of each number, one query per hop for all of them (at most `MAX_HOPS`).
     *
     * @param  list<int>  $numbers
     * @return array<int, int> each number => its survivor
     */
    public function survivors(array $numbers): array
    {
        $at = [];
        $seen = [];

        foreach ($numbers as $number) {
            $at[$number] = $number;
            $seen[$number] = [$number => true];
        }

        $open = array_keys($at);

        for ($hop = 0; $hop < self::MAX_HOPS && $open !== []; $hop++) {
            $next = ListingRef::query()->whereIn('listing_number', array_values(array_unique(array_map(fn (int $number): int => $at[$number], $open))))
                ->whereNotNull('merged_into')->pluck('merged_into', 'listing_number')->all();
            $moved = [];

            foreach ($open as $number) {
                $into = $next[$at[$number]] ?? null;

                if (is_numeric($into) && ! isset($seen[$number][(int) $into])) {
                    $at[$number] = (int) $into;
                    $seen[$number][(int) $into] = true;
                    $moved[] = $number;
                }
            }

            $open = $moved;
        }

        return $at;
    }

    /**
     * The numbers the caller's own rows for the number asked may lie under, ascending and without repeats — what a
     * delete removes (`DELETE /favorites/{number}`, `DELETE /hidden/listings/{number}`, and the vote and the hidden row
     * of `DELETE /listings/{number}/reports`): the number asked, the pointer's number `resolve()` answered for it (a
     * withdrawal has one; a list delete never asks the source), the survivors `listing_refs` files for both, and every
     * number of the caller's rows in `$rows` that `listing_refs` files as merged and whose survivor is one of those
     * survivors. A row written through an alias the card source answered with its survivor lies under the pointer's
     * number although no card read filed the alias; a row written before a later merge — one hop or several — lies
     * under the number it was written for, while the lists show it as the survivor, so a delete by the survivor, the
     * number asked or any number between finds it. `$rows` are the caller's own rows of a table with a
     * `listing_number` column (its relation's base query): only the caller's merged rows are read, and their merges are
     * followed in PHP, one query per hop for all of them.
     *
     * @return list<int>
     */
    public function numbersOf(int $asked, ?ListingPointer $pointer, QueryBuilder ...$rows): array
    {
        $base = $pointer === null ? [$asked] : [$asked, $pointer->number];
        $merged = [];

        foreach ($rows as $query) {
            foreach ((clone $query)->whereIn('listing_number', ListingRef::query()->whereNotNull('merged_into')->select('listing_number'))->distinct()->pluck('listing_number') as $number) {
                if (is_numeric($number)) {
                    $merged[] = (int) $number;
                }
            }
        }

        $survivors = $this->survivors(array_values(array_unique([...$base, ...$merged])));
        $targets = [];

        foreach ($base as $number) {
            $targets[$survivors[$number]] = true;
        }

        $numbers = [...$base, ...array_keys($targets)];

        foreach ($merged as $number) {
            if (isset($targets[$survivors[$number]])) {
                $numbers[] = $number;
            }
        }

        $numbers = array_values(array_unique($numbers));
        sort($numbers);

        return $numbers;
    }

    /**
     * Makes sure `listing_refs` files the listing's author when the card source knows one (WP-44's `agent` votes,
     * counted per author key): a number filed with an author is left as it is, else the full card is read through the
     * card source, which files it on that read on the legacy driver (the stub files none). `SourceNotFound` (`404`) or
     * `SourceUnavailable` (`503`) from that read, as for `resolve()`.
     */
    public function fileAuthor(ListingPointer $pointer, SourceContext $context): void
    {
        if (ListingRef::query()->whereKey($pointer->number)->whereNotNull('author_key')->exists()) {
            return;
        }

        $this->sources->listings('source.listings.card', $context)->source->details($pointer->number, $context);
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
