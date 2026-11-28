<?php

namespace App\Enums\Radar;

/**
 * What a write of `RadarService` did (WP-45): a new radar; an active radar of the same search already existed
 * (nothing written); a paused one of the same search was switched on; the filters changed; the radar was switched on
 * or paused. The API's `kind` of `POST /radars` and `PUT /radars/{id}` answers the first four through the enum of
 * WP-13, `App\Enums\RadarMutationKind`.
 */
enum RadarMutationKind: string
{
    case Created = 'created';
    case Existing = 'existing';
    case Reactivated = 'reactivated';
    case Updated = 'updated';
    case Resumed = 'resumed';
    case Paused = 'paused';
}
