<?php

namespace App\Services\Sources\Data;

use App\Enums\ListingOrigin;

/**
 * A pin of `GET /listings/map` (WP-12). `label` is plain text: `<` and `&` are removed (fix of LB-APP-020); `tone` is
 * `good`, `high`, `check`, `suspicious` or null.
 */
final readonly class MapPoint
{
    public const array TONES = ['good', 'high', 'check', 'suspicious'];

    public function __construct(
        public int $number,
        public ListingOrigin $origin,
        public float $lat,
        public float $lon,
        public string $label,
        public ?string $tone,
        public bool $priced,
        public ?int $usd,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $tone = Fields::nullableString($data, 'tone');

        return new self(
            number: Fields::int($data, 'number'),
            origin: ListingOrigin::tryFrom(Fields::string($data, 'origin')) ?? throw new \InvalidArgumentException('The field "origin" must be legacy or native.'),
            lat: Fields::float($data, 'lat'),
            lon: Fields::float($data, 'lon'),
            label: self::plainText(Fields::string($data, 'label')),
            tone: in_array($tone, self::TONES, true) ? $tone : null,
            priced: Fields::bool($data, 'priced'),
            usd: Fields::nullableInt($data, 'usd'),
        );
    }

    private static function plainText(string $label): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', str_replace(['<', '&'], '', $label)));
    }
}
