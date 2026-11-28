<?php

namespace App\Events\Radar;

use App\Enums\Radar\RadarMutationKind;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A radar was written (WP-45): created, switched back on as a twin (`reactivated`), given new filters, switched on or
 * paused. Dispatched only after the transaction commits, and never for a write that changed nothing (`existing`, an
 * unchanged search, a radar already in the asked state) or for a mode change. It carries ids, the kind and the starter's
 * listing numbers only — no filters, no author key (SEC-REQ-047). WP-46's matcher and the bot (the starter list, WP-54)
 * listen.
 */
final class RadarSaved implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /** @param  list<int>  $starterNumbers */
    public function __construct(
        public readonly string $radarId,
        public readonly int $userId,
        public readonly RadarMutationKind $kind,
        public readonly array $starterNumbers,
    ) {}
}
