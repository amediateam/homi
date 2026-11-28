<?php

namespace App\Events\Radar;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A radar was deleted with its hide rules (WP-45); dispatched only after the transaction commits. Ids only. WP-46 drops
 * the radar's pending items; the user's delivered set stays.
 */
final class RadarDeleted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $radarId, public readonly int $userId) {}
}
