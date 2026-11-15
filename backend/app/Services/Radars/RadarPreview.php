<?php

namespace App\Services\Radars;

use App\Services\Sources\Data\ListingSummary;

/** What a radar would find now (WP-13, BR-APP-063): at most five newest items, the count and the flow. */
final readonly class RadarPreview
{
    /** @param  list<ListingSummary>  $items */
    public function __construct(
        public array $items,
        public ?int $count,
        public ?int $flowWeek,
        public ?int $flowDays,
    ) {}
}
