<?php

namespace App\Services\Sources\Data;

/** One line of the card's facts (WP-12); `key` is unique within a card. */
final readonly class ListingFact
{
    public function __construct(public string $key, public string $label, public string $value) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::string($data, 'key'), Fields::string($data, 'label'), Fields::string($data, 'value'));
    }
}
