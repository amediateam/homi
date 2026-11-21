<?php

namespace App\Services\Owner\Data;

/**
 * The demand for a flat (WP-80, DEC-84): the active radars that would match it when 5 or more; 1 … 4 answer `count:
 * null` with `few: true`; the usual price bounds, `null` without a harvested median (DEC-78).
 */
final readonly class OwnerDemand
{
    public function __construct(public ?int $count, public bool $few, public ?int $usualLowUsd, public ?int $usualHighUsd) {}
}
