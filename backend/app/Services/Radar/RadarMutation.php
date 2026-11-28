<?php

namespace App\Services\Radar;

use App\Enums\Radar\RadarMutationKind;
use App\Models\Radar;
use App\Services\Radars\RadarOption;

/**
 * The result of a write of `RadarService` (WP-45): the radar as stored, what happened, the listings sent at once, the
 * ways to widen the radar (only when the starter is empty) and the `relaxed` hints. `options` and `relaxed` are always
 * lists (LB-API-014). Not the data object `App\Services\Radars\RadarMutation` the API answers.
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
        public Starter $starter,
        public array $options = [],
        public array $relaxed = [],
    ) {}
}
