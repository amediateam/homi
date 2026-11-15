<?php

namespace App\Services\Sources\Data;

use App\Services\Listings\PhoneMasker;

/** A short offer of the author («Торг», «Без комиссии»), WP-12; the text is masked (DEC-52). */
final readonly class ListingOffer
{
    public function __construct(public string $text, public ?string $url) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(PhoneMasker::mask(Fields::string($data, 'text')), Fields::nullableString($data, 'url'));
    }
}
