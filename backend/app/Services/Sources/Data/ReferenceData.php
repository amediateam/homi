<?php

namespace App\Services\Sources\Data;

/**
 * What `ReferenceSource::reference()` answers (WP-11): the directories in the request's language. The bot names,
 * the limits and the radar switch are HOMI's configuration and are added by `ReferenceResource` for every driver.
 */
final readonly class ReferenceData
{
    /**
     * @param  list<string>  $features
     * @param  list<NamedCode>  $locales
     * @param  list<CityData>  $cities
     * @param  array<string, list<NamedCode>>  $renovations  every deal => its renovations
     * @param  list<NamedCode>  $appliances
     * @param  array<string, list<int>>  $pricePresets  every deal => whole USD
     */
    public function __construct(
        public float $usdUzs,
        public ?string $tilesUrl,
        public array $features,
        public array $locales,
        public array $cities,
        public array $renovations,
        public array $appliances,
        public array $pricePresets,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            usdUzs: Fields::float(Fields::object($data, 'rates'), 'usd_uzs'),
            tilesUrl: Fields::nullableString(Fields::object($data, 'map'), 'tiles_url'),
            features: Fields::strings($data, 'features'),
            locales: NamedCode::listFrom($data, 'locales'),
            cities: array_map(CityData::fromArray(...), Fields::objects($data, 'cities')),
            renovations: Fields::byDeal($data, 'renovations', NamedCode::listFrom(...), complete: true),
            appliances: NamedCode::listFrom($data, 'appliances'),
            pricePresets: Fields::byDeal($data, 'price_presets', fn (array $object, string $deal): array => self::presets($object, $deal), complete: true),
        );
    }

    /**
     * The same data with only the given cities; the stub scenario `single_city` uses it.
     *
     * @param  list<string>  $codes
     */
    public function withCities(array $codes): self
    {
        $cities = array_values(array_filter($this->cities, fn (CityData $city): bool => in_array($city->code, $codes, true)));

        return new self($this->usdUzs, $this->tilesUrl, $this->features, $this->locales, $cities, $this->renovations, $this->appliances, $this->pricePresets);
    }

    /**
     * @param  array<array-key, mixed>  $object
     * @return list<int>
     */
    private static function presets(array $object, string $deal): array
    {
        try {
            return Fields::ints($object, $deal);
        } catch (\InvalidArgumentException) {
            throw new \InvalidArgumentException("The field \"price_presets.{$deal}\" must be a list of whole numbers.");
        }
    }
}
