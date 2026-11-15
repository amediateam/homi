<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\ListingFeedRequest;
use App\Http\Requests\Api\V1\Listings\ShowListingRequest;
use App\Http\Resources\Api\V1\ListingDetailsResource;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/** The feed and the card of `/listings` (WP-12, API-004 and API-008). */
class ListingController extends ApiController
{
    public function __construct(private readonly SourceManager $sources) {}

    /**
     * `GET /listings`: one page of previews; `meta.next_cursor` null ends the list. A page may hold fewer than
     * `limit` items; the client de-duplicates by `number`.
     */
    public function index(ListingFeedRequest $request): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $this->sources->listings('source.listings.feed', $context);
        $page = $resolved->source->feed($request->listingQuery(), $context);

        return $this->cursorPage(ListingPreviewResource::collection($page->items), $page->nextCursor, $resolved->driver);
    }

    /**
     * `GET /listings/{number}`: the full card, or the preview with `preview=1`. A merged duplicate answers with the
     * surviving number; an unknown or removed number is `404 not_found`. No answer carries the author's number.
     */
    public function show(ShowListingRequest $request, int $number): JsonResponse
    {
        if ($number < 1) {
            throw new SourceNotFound('Listing not found.');
        }

        $context = SourceContext::fromRequest($request);
        $resolved = $this->sources->listings('source.listings.card', $context);

        if ($request->wantsPreview()) {
            return $this->sourced(new ListingPreviewResource($resolved->source->preview($number, $context)), $resolved->driver);
        }

        return $this->sourced(new ListingDetailsResource($resolved->source->details($number, $context)), $resolved->driver);
    }
}
