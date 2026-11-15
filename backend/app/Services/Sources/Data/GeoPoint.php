<?php

namespace App\Services\Sources\Data;

/** A point in WGS 84 degrees. */
final readonly class GeoPoint
{
    public function __construct(
        public float $lat,
        public float $lon,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::float($data, 'lat'), Fields::float($data, 'lon'));
    }
}
