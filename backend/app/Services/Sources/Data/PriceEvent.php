<?php

namespace App\Services\Sources\Data;

use App\Services\Listings\PhoneMasker;

/**
 * One publication or price change of a listing (`price_history`, WP-12). `price_usd` and `change_pct` are always
 * present and may be null; the author-written `text` is masked (DEC-52).
 */
final readonly class PriceEvent
{
    public function __construct(
        public string $at,
        public string $channel,
        public ?string $url,
        public ?string $text,
        public ?string $kind,
        public ?int $priceUsd,
        public ?float $changePct,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $text = Fields::nullableString($data, 'text');

        return new self(
            at: Fields::string($data, 'at'),
            channel: ltrim(Fields::string($data, 'channel'), '@'),
            url: Fields::nullableString($data, 'url'),
            text: $text === null ? null : PhoneMasker::mask($text),
            kind: Fields::nullableString($data, 'kind'),
            priceUsd: Fields::nullableInt($data, 'price_usd'),
            changePct: Fields::nullableFloat($data, 'change_pct'),
        );
    }
}
