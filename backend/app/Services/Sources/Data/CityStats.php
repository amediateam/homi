<?php

namespace App\Services\Sources\Data;

/**
 * What `ReferenceSource::cities()` answers per city (WP-11): listing counts of all three deals, and price presets and
 * typical prices in whole USD for the deals that have them.
 */
final readonly class CityStats
{
    /**
     * @param  array<string, int>  $counts  every deal => listings
     * @param  array<string, list<int>>  $pricePresets  some deals => whole USD
     * @param  array<string, int>  $typicalPrice  some deals => whole USD
     */
    public function __construct(
        public string $code,
        public array $counts,
        public array $pricePresets,
        public array $typicalPrice,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            code: Fields::string($data, 'code'),
            counts: Fields::byDeal($data, 'counts', Fields::count(...), complete: true),
            pricePresets: Fields::byDeal($data, 'price_presets', Fields::ints(...), complete: false),
            typicalPrice: Fields::byDeal($data, 'typical_price', Fields::count(...), complete: false),
        );
    }
}
