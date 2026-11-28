<?php

namespace App\Services\Radar;

use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\ResolvedSource;
use App\Services\Sources\SourceContext;

/**
 * How the shared part of the previews of one `GET /radars?include=previews` is asked (`RadarPreviews`): the three
 * resolved drivers (feed, count, flow), the context without a user they are asked in, and whether the shared cache is
 * read and written (`cached`: false only when a driver is `stub` and a stub scenario is set).
 */
final readonly class PreviewRound
{
    /**
     * @param  ResolvedSource<ListingSource>  $feed
     * @param  ResolvedSource<ListingSource>  $count
     * @param  ResolvedSource<ListingSource>  $flow
     */
    public function __construct(
        public ResolvedSource $feed,
        public ResolvedSource $count,
        public ResolvedSource $flow,
        public SourceContext $context,
        public bool $cached,
    ) {}
}
