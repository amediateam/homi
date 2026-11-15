<?php

namespace App\Services\Radars;

/**
 * The result of `PATCH /radars/{id}` and `POST /radars/{id}/relax` (WP-13): the radar, `starter` when it was switched
 * on or widened, `askFound` when it was paused (the «Нашли жильё?» survey, BR-APP-048).
 */
final readonly class RadarChange
{
    public function __construct(public Radar $radar, public ?int $starter = null, public ?bool $askFound = null) {}
}
