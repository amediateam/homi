<?php

namespace App\Services\Sources\Data;

/**
 * All pins of the filters in one answer (WP-12). `total` counts the listings, with or without coordinates, and
 * `withPoint` those with coordinates. A source may cut the answer by a limit (legacy release `index-CIa0Ldj2.js`), so
 * the points can be fewer than `withPoint`: `count($points) ≤ $withPoint ≤ $total`.
 */
final readonly class MapPoints
{
    /** @param  list<MapPoint>  $points */
    public function __construct(public array $points, public int $total, public int $withPoint)
    {
        if ($withPoint < count($points)) {
            throw new \InvalidArgumentException('The number of listings with a point must not be smaller than the number of points.');
        }

        if ($total < $withPoint) {
            throw new \InvalidArgumentException('The map total must not be smaller than the number of listings with a point.');
        }
    }
}
