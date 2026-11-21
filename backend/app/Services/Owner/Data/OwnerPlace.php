<?php

namespace App\Services\Owner\Data;

/** The city and district of a point (WP-80, DEC-79): either `null` outside HOMI's boundaries. */
final readonly class OwnerPlace
{
    public function __construct(public ?string $city, public ?string $districtCode) {}
}
