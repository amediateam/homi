<?php

namespace App\Services\Sources\Data;

/**
 * The market comparison of a card (`comparison`, WP-12): the legacy `median_*` fields without the prefix. A card
 * without a comparison has none (`null`); `value` is required.
 */
final readonly class MarketComparison
{
    public function __construct(
        public float $value,
        public ?float $own,
        public ?int $n,
        public ?string $metric,
        public ?string $scope,
        public ?int $rooms,
        public ?string $nearClass,
        public ?float $radiusKm,
        public ?string $district,
        public ?float $placeValue,
        public ?string $note,
        public ?string $updated,
        public bool $hasReason,
        public ?int $priceUsd,
        public ?float $pricePerM2,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            value: Fields::float($data, 'value'),
            own: Fields::nullableFloat($data, 'own'),
            n: Fields::nullableInt($data, 'n'),
            metric: Fields::nullableString($data, 'metric'),
            scope: Fields::nullableString($data, 'scope'),
            rooms: Fields::nullableInt($data, 'rooms'),
            nearClass: Fields::nullableString($data, 'near_class'),
            radiusKm: Fields::nullableFloat($data, 'radius_km'),
            district: Fields::nullableString($data, 'district'),
            placeValue: Fields::nullableFloat($data, 'place_value'),
            note: Fields::nullableString($data, 'note'),
            updated: Fields::nullableString($data, 'updated'),
            hasReason: Fields::bool($data, 'has_reason'),
            priceUsd: Fields::nullableInt($data, 'price_usd'),
            pricePerM2: Fields::nullableFloat($data, 'price_per_m2'),
        );
    }
}
