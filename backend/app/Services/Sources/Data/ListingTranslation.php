<?php

namespace App\Services\Sources\Data;

use App\Services\Listings\PhoneMasker;

/**
 * The original text of a listing in the request locale (`POST /listings/{number}/translation`, WP-12); masked (DEC-52).
 * `fromArray()` takes a source's text before it is masked (WP-43: legacy's translation), so its frames are sensitive.
 */
final readonly class ListingTranslation
{
    public function __construct(#[\SensitiveParameter] public string $text, public string $locale) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(#[\SensitiveParameter] array $data): self
    {
        return new self(PhoneMasker::mask(Fields::string($data, 'text')), Fields::string($data, 'locale'));
    }
}
