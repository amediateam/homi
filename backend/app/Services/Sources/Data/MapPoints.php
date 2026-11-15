<?php

namespace App\Services\Sources\Data;

/** All pins of the filters in one answer (WP-12); `total` counts the listings, with or without coordinates. */
final readonly class MapPoints
{
    /** @param  list<MapPoint>  $points */
    public function __construct(public array $points, public int $total)
    {
        if ($total < count($points)) {
            throw new \InvalidArgumentException('The map total must not be smaller than the number of points.');
        }
    }
}
