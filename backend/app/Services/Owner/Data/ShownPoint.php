<?php

namespace App\Services\Owner\Data;

use App\Services\Sources\Data\Fields;

/** The circle seekers see instead of an owner's true point (WP-80, SEC-REQ-052). */
final readonly class ShownPoint
{
    public function __construct(public float $lat, public float $lon, public int $radiusM) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::float($data, 'lat'), Fields::float($data, 'lon'), Fields::int($data, 'radius_m'));
    }
}
