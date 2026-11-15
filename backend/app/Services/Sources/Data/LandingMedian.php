<?php

namespace App\Services\Sources\Data;

/** A district median of the landing (WP-13, RES-011): rooms 1 … 3, whole USD. */
final readonly class LandingMedian
{
    public function __construct(public string $districtCode, public int $rooms, public int $medianUsd, public int $n) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::string($data, 'district_code'), Fields::int($data, 'rooms'), Fields::int($data, 'median_usd'), Fields::count($data, 'n'));
    }
}
