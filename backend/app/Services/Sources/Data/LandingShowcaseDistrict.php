<?php

namespace App\Services\Sources\Data;

/**
 * A district count of the landing's showcase «Квартиры прямо сейчас» (the landing intake of `d9bbbc696337`, RES-010
 * `showcase`): the listings of one deal in one district of Tashkent.
 */
final readonly class LandingShowcaseDistrict
{
    public function __construct(public string $districtCode, public int $count) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::string($data, 'district_code'), Fields::count($data, 'count'));
    }
}
