<?php

namespace App\Services\Radars;

/** A way to widen a radar that found nothing (WP-13): the `code` goes to `POST /radars/{id}/relax`. */
final readonly class RadarOption
{
    public function __construct(public string $code, public string $label, public string $rate, public ?int $count) {}
}
