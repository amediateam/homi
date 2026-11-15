<?php

namespace App\Services\Sources\Data;

/** A listing of the landing's live strip (WP-13, RES-010): no phone, no text, no author. */
final readonly class LandingLatest
{
    public function __construct(
        public int $number,
        public int $rooms,
        public int $priceUsd,
        public ?int $deltaPct,
        public ?string $tone,
        public ?NamedCode $district,
        public ?float $area,
        public string $seenAt,
        public string $link,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $district = Fields::nullableObject($data, 'district');

        return new self(
            number: Fields::int($data, 'number'),
            rooms: Fields::int($data, 'rooms'),
            priceUsd: Fields::int($data, 'price_usd'),
            deltaPct: Fields::nullableInt($data, 'delta_pct'),
            tone: Fields::nullableString($data, 'tone'),
            district: $district === null ? null : NamedCode::fromArray($district),
            area: Fields::nullableFloat($data, 'area'),
            seenAt: Fields::string($data, 'seen_at'),
            link: Fields::string($data, 'link'),
        );
    }
}
