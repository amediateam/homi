<?php

namespace App\Services\Sources\Data;

use App\Services\Listings\PhoneMasker;

/** The original text of a listing in the request locale (`POST /listings/{number}/translation`, WP-12); masked (DEC-52). */
final readonly class ListingTranslation
{
    public function __construct(public string $text, public string $locale) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(PhoneMasker::mask(Fields::string($data, 'text')), Fields::string($data, 'locale'));
    }
}
