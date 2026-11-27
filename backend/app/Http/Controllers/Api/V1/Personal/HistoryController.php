<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\ListPersonalRequest;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Services\Personal\HistoryService;
use App\Services\Sources\SourceContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The view history of `listing_views` (WP-44; the shapes of WP-13): paged like the feed (DEC-53), not capped. While
 * `sources.native_stubs` is on, `NativeStubs` answers the stub bodies of WP-13 instead (the scenario `empty` is
 * theirs). The method summaries are those of WP-13, so the OpenAPI document keeps its text.
 */
class HistoryController extends ApiController
{
    public function __construct(private readonly HistoryService $history) {}

    /** `GET /history`: previews by last view, newest first, each with `viewed: true`. Scenario `empty`. */
    public function index(ListPersonalRequest $request): JsonResponse
    {
        $page = $this->history->page($this->signedInUser($request), $request->cursor(), $request->limit(), SourceContext::fromRequest($request));

        return $this->cursorPage(ListingPreviewResource::collection($page->items), $page->nextCursor, SourceDriver::Native);
    }

    /** `DELETE /history`: clears the whole history; idempotent. */
    public function destroy(Request $request): Response
    {
        $this->history->clear($this->signedInUser($request));

        return $this->noContent();
    }
}
