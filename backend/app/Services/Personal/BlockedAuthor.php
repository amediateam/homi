<?php

namespace App\Services\Personal;

/**
 * An author the user blocked (WP-13; HOMI's table from WP-44): the entry id (ULID), `phone` or `source`, a plain-text
 * label (a phone masked to its last two digits, or `@channel`) and the number of the author's listings.
 * `listingNumbers` are the author's listings HOMI knows, answered when blocking so the client hides them at once.
 */
final readonly class BlockedAuthor
{
    /** @param  list<int>  $listingNumbers */
    public function __construct(
        public string $id,
        public string $kind,
        public string $label,
        public int $count,
        public array $listingNumbers = [],
    ) {}
}
