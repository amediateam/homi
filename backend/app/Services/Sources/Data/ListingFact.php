<?php

namespace App\Services\Sources\Data;

use App\Services\Listings\PhoneMasker;

/**
 * One line of the card's facts (WP-12); `key` is unique within a card. The `value` may be the author's text, so its
 * phone numbers are masked (DEC-52); the `label` is the source's own.
 */
final readonly class ListingFact
{
    public function __construct(public string $key, public string $label, public string $value) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::string($data, 'key'), Fields::string($data, 'label'), PhoneMasker::mask(Fields::string($data, 'value')));
    }
}
