<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\ListPersonalRequest;
use App\Http\Resources\Api\V1\FavoriteStateResource;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Services\Personal\FavoriteService;
use App\Services\Personal\ListingResolver;
use App\Services\Sources\SourceContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Favourites in HOMI's table (WP-44; the shapes of WP-13). The list pages like the feed (DEC-53); `PUT` and `DELETE`
 * replace the legacy toggle, so a repeated request cannot flip the state. While `sources.native_stubs` is on,
 * `NativeStubs` answers the stub bodies of WP-13 instead (the scenario `empty` is theirs). The method summaries are
 * those of WP-13, so the OpenAPI document keeps its text.
 */
class FavoriteController extends ApiController
{
    public function __construct(private readonly FavoriteService $favorites, private readonly ListingResolver $resolver) {}

    /** `GET /favorites`: previews, newest first, each with `favorite: true`. Scenario `empty`. */
    public function index(ListPersonalRequest $request): JsonResponse
    {
        $page = $this->favorites->page($this->signedInUser($request), $request->cursor(), $request->limit(), SourceContext::fromRequest($request));

        return $this->cursorPage(ListingPreviewResource::collection($page->items), $page->nextCursor, SourceDriver::Native);
    }

    /** `PUT /favorites/{number}`: idempotent; the listing must exist (`404`), or be checkable (`503`). */
    public function update(Request $request, int $number): JsonResponse
    {
        $pointer = $this->resolver->resolve($number, SourceContext::fromRequest($request));

        return $this->sourced(new FavoriteStateResource($this->favorites->set($this->signedInUser($request), $pointer)), SourceDriver::Native);
    }

    /** `DELETE /favorites/{number}`: idempotent, never `404` for a listing that was not a favourite. */
    public function destroy(Request $request, int $number): JsonResponse
    {
        if ($number < 1) {
            throw new SourceNotFound('Listing not found.');
        }

        return $this->sourced(new FavoriteStateResource($this->favorites->unset($this->signedInUser($request), $number)), SourceDriver::Native);
    }
}
