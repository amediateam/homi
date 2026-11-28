<?php

namespace App\Services\Personal;

/**
 * The answer of a block (WP-44, `PUT /listings/{number}/blocked-author`): the entry's id, `kind` and `label` as stored
 * at block time; `count`, the source's author count when the block read a card that gives one, else the author's live
 * listings HOMI knows — never capped, so it may exceed the list; `listingNumbers`, the newest `MAX_LISTINGS` live
 * numbers (neither gone nor merged) `listing_refs` files under the author's key plus the listing asked for and its
 * survivor, ascending, so the client hides them at once (BR-API-098) — at most `MAX_LISTINGS` + 2, however many
 * listings an author has (review of stage A, F4). The overlay hides the rest of the author's listings on every read.
 */
final readonly class BlockResult
{
    /** The most live listings of the author a block answers, besides the number asked and its survivor. */
    public const int MAX_LISTINGS = 500;

    /** @param  list<int>  $listingNumbers */
    public function __construct(
        public string $id,
        public string $kind,
        public string $label,
        public int $count,
        public array $listingNumbers,
    ) {}

    /** The data object the WP-13 resource answers. */
    public function author(): BlockedAuthor
    {
        return new BlockedAuthor($this->id, $this->kind, $this->label, $this->count, $this->listingNumbers);
    }
}
