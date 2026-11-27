<?php

namespace App\Services\Sources\Data;

use App\Services\Listings\PhoneMasker;

/**
 * A park or a school near the listing (WP-12); `kind` is `park` or `school`, unique within a card. The `note` may be the
 * author's text, so its phone numbers are masked (DEC-52); the `name` comes from a directory.
 */
final readonly class ListingNearby
{
    public const array KINDS = ['park', 'school'];

    public function __construct(public string $kind, public string $name, public float $km, public ?string $note) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $kind = Fields::string($data, 'kind');

        if (! in_array($kind, self::KINDS, true)) {
            throw new \InvalidArgumentException('The field "kind" must be park or school.');
        }

        $note = Fields::nullableString($data, 'note');

        return new self($kind, Fields::string($data, 'name'), Fields::float($data, 'km'), $note === null ? null : PhoneMasker::mask($note));
    }
}
