<?php

namespace App\Services\Owner\Data;

use App\Services\Sources\Data\Fields;

/** A photo of an owner listing (WP-80): its ULID and absolute address; the first of a listing is the cover. */
final readonly class OwnerPhoto
{
    public function __construct(public string $id, public string $url) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::string($data, 'id'), Fields::string($data, 'url'));
    }
}
