<?php

namespace App\Services\Sources\Data;

/**
 * The landing map of one deal (WP-13, `GET /landing/pins`, RES-011): the pins, the bargains of the week and the
 * district medians; for sale `bargainsWeek` is null and `medians` empty.
 */
final readonly class LandingPins
{
    /**
     * @param  list<LandingPin>  $pins
     * @param  list<LandingMedian>  $medians
     */
    public function __construct(public string $generatedAt, public ?int $bargainsWeek, public array $pins, public array $medians) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            generatedAt: Fields::string($data, 'generated_at'),
            bargainsWeek: Fields::nullableInt($data, 'bargains_week'),
            pins: array_map(LandingPin::fromArray(...), Fields::objects($data, 'pins')),
            medians: array_map(LandingMedian::fromArray(...), Fields::objects($data, 'medians')),
        );
    }
}
