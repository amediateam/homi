<?php

namespace App\Services\Sources\Data;

/** A park or a school near the listing (WP-12); `kind` is `park` or `school`, unique within a card. */
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

        return new self($kind, Fields::string($data, 'name'), Fields::float($data, 'km'), Fields::nullableString($data, 'note'));
    }
}
