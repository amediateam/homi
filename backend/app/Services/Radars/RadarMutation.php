<?php

namespace App\Services\Radars;

use App\Enums\RadarMutationKind;

/**
 * The result of `POST /radars` and `PUT /radars/{id}` (WP-13): the radar, what happened (`created`, `existing`,
 * `reactivated`, `updated`), how many matching listings went to the chat now, ways to widen it (only when `starter`
 * is 0) and the texts of the relaxed rules.
 */
final readonly class RadarMutation
{
    /**
     * @param  list<RadarOption>  $options
     * @param  list<string>  $relaxed
     */
    public function __construct(
        public Radar $radar,
        public RadarMutationKind $kind,
        public int $starter,
        public array $options,
        public array $relaxed,
    ) {}
}
