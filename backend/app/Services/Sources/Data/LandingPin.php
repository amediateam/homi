<?php

namespace App\Services\Sources\Data;

/**
 * A pin of the landing map (WP-13, RES-011): `x` and `y` are percentages on the static map image; no phone, no text,
 * no author.
 */
final readonly class LandingPin
{
    public function __construct(
        public int $number,
        public float $x,
        public float $y,
        public int $rooms,
        public int $priceUsd,
        public ?int $deltaPct,
        public ?string $tone,
        public ?float $area,
        public int $floor,
        public int $floorsTotal,
        public ?NamedCode $district,
        public ?string $point,
        public ?string $photoUrl,
        public string $link,
        public int $ageMin,
        public ?bool $isOwner,
        public bool $inAll,
        public bool $inRooms,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $district = Fields::nullableObject($data, 'district');

        return new self(
            number: Fields::int($data, 'number'),
            x: Fields::float($data, 'x'),
            y: Fields::float($data, 'y'),
            rooms: Fields::int($data, 'rooms'),
            priceUsd: Fields::int($data, 'price_usd'),
            deltaPct: Fields::nullableInt($data, 'delta_pct'),
            tone: Fields::nullableString($data, 'tone'),
            area: Fields::nullableFloat($data, 'area'),
            floor: Fields::int($data, 'floor'),
            floorsTotal: Fields::int($data, 'floors_total'),
            district: $district === null ? null : NamedCode::fromArray($district),
            point: Fields::nullableString($data, 'point'),
            photoUrl: Fields::nullableString($data, 'photo_url'),
            link: Fields::string($data, 'link'),
            ageMin: Fields::count($data, 'age_min'),
            isOwner: Fields::nullableBool($data, 'is_owner'),
            inAll: Fields::bool($data, 'in_all'),
            inRooms: Fields::bool($data, 'in_rooms'),
        );
    }
}
