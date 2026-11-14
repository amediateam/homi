<?php

namespace App\Services\Sources\Data;

/**
 * A city of the reference data. `isRegion` replaces the legacy rule "zoom below 11"; every city carries its own
 * districts and zones (either list may be empty).
 */
final readonly class CityData
{
    /**
     * @param  list<NamedCode>  $districts
     * @param  list<NamedCode>  $zones
     */
    public function __construct(
        public string $code,
        public string $name,
        public GeoPoint $center,
        public int $zoom,
        public bool $isRegion,
        public bool $hasMetro,
        public bool $hasMedian,
        public array $districts,
        public array $zones,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            code: Fields::string($data, 'code'),
            name: Fields::string($data, 'name'),
            center: GeoPoint::fromArray(Fields::object($data, 'center')),
            zoom: Fields::int($data, 'zoom'),
            isRegion: Fields::bool($data, 'is_region'),
            hasMetro: Fields::bool($data, 'has_metro'),
            hasMedian: Fields::bool($data, 'has_median'),
            districts: NamedCode::listFrom($data, 'districts'),
            zones: NamedCode::listFrom($data, 'zones'),
        );
    }
}
