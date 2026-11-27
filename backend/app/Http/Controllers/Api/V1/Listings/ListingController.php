<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Enums\SourceDriver;
use App\Exceptions\Listings\DailyLimitReached;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\ListingFeedRequest;
use App\Http\Requests\Api\V1\Listings\ShowListingRequest;
use App\Http\Resources\Api\V1\ListingDetailsResource;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Services\Listings\ListingOverlay;
use App\Services\Listings\ViewRecorder;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/**
 * The feed and the card of `/listings` (WP-12, API-004 and API-008). HOMI's overlay (WP-42) runs on the answer of every
 * driver: the feed leaves out what the caller hid, blocked or HOMI's votes mark, and the flags are HOMI's; a full card
 * read is recorded in the caller's view history (never a preview). Both are skipped while `sources.native_stubs` is on.
 * The overlay is taken per call, not in the constructor: the router keeps a controller, and the overlay is scoped to
 * one request (it keeps the caller's sets for the legacy feed pager of the same request).
 */
class ListingController extends ApiController
{
    /** `Retry-After` of the stub scenario `daily_limit`, in seconds. */
    private const int STUB_DAILY_RETRY_AFTER = 3600;

    public function __construct(
        private readonly SourceManager $sources,
        private readonly ViewRecorder $views,
    ) {}

    /**
     * `GET /listings`: one page of previews; `meta.next_cursor` null ends the list. A page may hold fewer than
     * `limit` items; the client de-duplicates by `number`.
     */
    public function index(ListingFeedRequest $request, ListingOverlay $overlay): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $this->sources->listings('source.listings.feed', $context);
        $query = $request->listingQuery();
        $page = $overlay->feed($resolved->source->feed($query, $context), $query->filters, $context);
        /** Scramble types the source's cursor as a plain string; `?? null` keeps the documented one nullable (WP-24). */
        $nextCursor = $page->nextCursor ?? null;

        return $this->cursorPage(ListingPreviewResource::collection($page->items), $nextCursor, $resolved->driver);
    }

    /**
     * `GET /listings/{number}`: the full card, or the preview with `preview=1`. A merged duplicate answers with the
     * surviving number; an unknown or removed number is `404 not_found`. No answer carries the author's number.
     * The full card may answer `429 rate_limited` with `reason: "daily"` and `Retry-After` when the caller reached
     * the daily limit of opened listings. Scenario `daily_limit`.
     */
    public function show(ShowListingRequest $request, int $number, ListingOverlay $overlay): JsonResponse
    {
        if ($number < 1) {
            throw new SourceNotFound('Listing not found.');
        }

        $context = SourceContext::fromRequest($request);
        $resolved = $this->sources->listings('source.listings.card', $context);

        if ($request->wantsPreview()) {
            return $this->sourced(new ListingPreviewResource($overlay->preview($resolved->source->preview($number, $context), $context)), $resolved->driver);
        }

        if ($resolved->driver === SourceDriver::Stub && $context->scenario === 'daily_limit') {
            throw new DailyLimitReached(self::STUB_DAILY_RETRY_AFTER);
        }

        $card = $overlay->card($resolved->source->details($number, $context), $context);

        if ($context->user !== null) {
            $card = $this->views->record($context->user, $card);
        }

        return $this->sourced(new ListingDetailsResource($card), $resolved->driver);
    }
}
