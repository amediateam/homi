<?php

namespace App\Services\Sources\Data;

/** How many listings of the filters appear (`GET /listings/flow`, WP-12): `week` in a window of `days` ≥ 1. */
final readonly class FlowEstimate
{
    /** @param  list<FlowOption>  $options  empty when there is nothing to suggest */
    public function __construct(public int $week, public int $days, public array $options)
    {
        if ($week < 0 || $days < 1) {
            throw new \InvalidArgumentException('A flow estimate needs week ≥ 0 and days ≥ 1.');
        }
    }
}
