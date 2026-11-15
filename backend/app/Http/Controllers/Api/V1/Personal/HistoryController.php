<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\ListPersonalRequest;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Stub\StubListingRefs;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** The viewing history on stubs (WP-13; HOMI's table from WP-44): paged like the feed (DEC-53), not capped. */
class HistoryController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubListingRefs $refs) {}

    /** `GET /history`: previews by last view, newest first, each with `viewed: true`. Scenario `empty`. */
    public function index(ListPersonalRequest $request): JsonResponse
    {
        $context = $this->stubs->check($request);
        $numbers = $this->refs->numbers($context->scenario === 'empty' ? 'history/empty' : 'history/default');
        [$items, $next] = $this->refs->page($numbers, $request->cursor(), $request->limit(), $context);
        $items = array_map(fn (ListingSummary $item): ListingSummary => $item->withFlags(viewed: true), $items);

        return $this->cursorPage(ListingPreviewResource::collection($items), $next, SourceDriver::Stub);
    }

    /** `DELETE /history`: clears the whole history; idempotent. */
    public function destroy(Request $request): Response
    {
        $this->stubs->check($request);

        return $this->noContent();
    }
}
