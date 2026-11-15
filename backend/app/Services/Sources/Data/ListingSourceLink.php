<?php

namespace App\Services\Sources\Data;

/** A channel post that published the listing (`sources`, WP-12). */
final readonly class ListingSourceLink
{
    public function __construct(public string $handle, public string $url) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(ltrim(Fields::string($data, 'handle'), '@'), Fields::string($data, 'url'));
    }
}
