<?php

namespace App\Services\Sources\Contracts;

use App\Exceptions\Listings\ContactUnavailable;
use App\Exceptions\Listings\TranslationUnavailable;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\ListingContact;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\ListingTranslation;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\SourceContext;

/**
 * Listings: feed, counts, map, card, contact and translation (ADR-0017, WP-12). Every method throws
 * `SourceUnavailable` when the source cannot answer; the per-listing methods throw `SourceNotFound` for an unknown or
 * removed number. A merged duplicate answers with the surviving number.
 */
interface ListingSource
{
    /** @throws SourceUnavailable */
    public function feed(ListingQuery $query, SourceContext $context): ListingPage;

    /** @throws SourceUnavailable */
    public function count(SearchFilters $filters, SourceContext $context): int;

    /**
     * @param  int  $since  Unix seconds, not later than now
     * @return int the number (≥ 0) of listings of the filters that appeared after `$since`
     *
     * @throws SourceUnavailable
     */
    public function newSince(SearchFilters $filters, int $since, SourceContext $context): int;

    /** @throws SourceUnavailable */
    public function flow(SearchFilters $filters, SourceContext $context): FlowEstimate;

    /** @throws SourceUnavailable */
    public function map(SearchFilters $filters, SourceContext $context): MapPoints;

    /** @throws SourceNotFound|SourceUnavailable */
    public function details(int $number, SourceContext $context): ListingDetails;

    /** @throws SourceNotFound|SourceUnavailable */
    public function preview(int $number, SourceContext $context): ListingSummary;

    /**
     * @param  list<int>  $numbers
     * @return array<int, ListingSummary> keyed by the asked number; unknown numbers are absent. A number the source
     *                                    knows but cannot give now fails the whole call, so no item vanishes from a
     *                                    list unseen (DEC-110)
     *
     * @throws SourceUnavailable
     */
    public function previews(array $numbers, SourceContext $context): array;

    /**
     * The author's contact (WP-43, Q-API-062). With `phone` the source has the number (variant A): its `callUrl` and
     * `expiresAt` may be blank, and `ContactService` answers HOMI's own call link. Without, `callUrl` is the source's
     * call link (variant B). Called only by `ContactService::disclose()`, which counts every answer as a disclosure,
     * and by HOMI's call page, whose token was issued by one.
     *
     * @throws SourceNotFound|SourceUnavailable
     * @throws ContactUnavailable when the listing has neither a phone nor a call link
     */
    public function contact(int $number, SourceContext $context): ListingContact;

    /**
     * The original text in the context's locale.
     *
     * @throws SourceNotFound when the number is unknown or the listing has no original text
     * @throws TranslationUnavailable
     */
    public function translation(int $number, SourceContext $context): ListingTranslation;
}
