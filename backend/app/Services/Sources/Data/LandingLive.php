<?php

namespace App\Services\Sources\Data;

/**
 * The landing's live numbers (WP-13, `GET /landing/live`, RES-010): listings today and this week, the newest
 * listings, the counts of the sheet and, since the landing intake of `d9bbbc696337`, the district counts of the
 * showcase per deal (an empty list: the showcase shows its districts without numbers).
 */
final readonly class LandingLive
{
    /**
     * @param  list<LandingLatest>  $latest
     * @param  list<LandingShowcaseDistrict>  $showcaseRent
     * @param  list<LandingShowcaseDistrict>  $showcaseSale
     */
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
        public array $showcaseRent,
        public array $showcaseSale,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $sheet = Fields::object($data, 'sheet');
        $all = Fields::object($sheet, 'all');
        $demo = Fields::object($sheet, 'demo');
        $showcase = Fields::object($data, 'showcase');

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
            showcaseRent: array_map(LandingShowcaseDistrict::fromArray(...), Fields::objects($showcase, 'rent')),
            showcaseSale: array_map(LandingShowcaseDistrict::fromArray(...), Fields::objects($showcase, 'sale')),
        );
    }
}
