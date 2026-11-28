<?php

namespace App\Services\Sources\Data;

use App\Enums\PriceKind;

/**
 * The price of a listing (WP-12): the display parts next to the raw USD amount (`25` §4.5). `kind` is `down_payment`
 * or `business` (BR-API-156); any other value becomes null, so the client shows no label for it (Q-API-065).
 */
final readonly class PriceInfo
{
    /** @param  list<string>  $notes */
    public function __construct(
        public string $display,
        public ?string $period,
        public ?string $alt,
        public array $notes,
        public ?int $usd,
        public ?PriceKind $kind,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            display: Fields::string($data, 'display'),
            period: Fields::nullableString($data, 'period'),
            alt: Fields::nullableString($data, 'alt'),
            notes: Fields::strings($data, 'notes'),
            usd: Fields::nullableInt($data, 'usd'),
            kind: PriceKind::tryFrom((string) Fields::nullableString($data, 'kind')),
        );
    }

    /**
     * The v1 array `fromArray()` reads back (scalars only, for a cache that refuses objects).
     *
     * @return array{display: string, period: string|null, alt: string|null, notes: list<string>, usd: int|null, kind: string|null}
     */
    public function toArray(): array
    {
        return [
            'display' => $this->display,
            'period' => $this->period,
            'alt' => $this->alt,
            'notes' => $this->notes,
            'usd' => $this->usd,
            'kind' => $this->kind?->value,
        ];
    }
}
