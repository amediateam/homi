<?php

namespace App\Services\Personal;

/**
 * The answer of a block (WP-44, `PUT /listings/{number}/blocked-author`): the entry's id, `kind` and `label` as stored
 * at block time; `count`, the source's author count when the block read a card that gives one, else the author's live
 * listings HOMI knows; `listingNumbers`, every number `listing_refs` files under the author's key plus the listing
 * asked for, ascending, so the client hides them at once (BR-API-098).
 */
final readonly class BlockResult
{
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
