<?php

namespace App\Services\Sources\Data;

/**
 * The landing's live numbers (WP-13, `GET /landing/live`, RES-010): listings today and this week, the newest
 * listings and the counts of the sheet.
 */
final readonly class LandingLive
{
    /** @param  list<LandingLatest>  $latest */
    public function __construct(
        public string $now,
        public string $generatedAt,
        public int $day,
        public int $week,
        public array $latest,
        public int $allCount,
        public float $allPerDay,
        public int $demoCount,
        public float $demoPerDay,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $sheet = Fields::object($data, 'sheet');
        $all = Fields::object($sheet, 'all');
        $demo = Fields::object($sheet, 'demo');

        return new self(
            now: Fields::string($data, 'now'),
            generatedAt: Fields::string($data, 'generated_at'),
            day: Fields::count($data, 'day'),
            week: Fields::count($data, 'week'),
            latest: array_map(LandingLatest::fromArray(...), Fields::objects($data, 'latest')),
            allCount: Fields::count($all, 'count'),
            allPerDay: Fields::float($all, 'per_day'),
            demoCount: Fields::count($demo, 'count'),
            demoPerDay: Fields::float($demo, 'per_day'),
        );
    }
}
