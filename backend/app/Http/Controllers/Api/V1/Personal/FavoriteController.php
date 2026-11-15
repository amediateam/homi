<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\ListPersonalRequest;
use App\Http\Resources\Api\V1\FavoriteStateResource;
use App\Http\Resources\Api\V1\ListingPreviewResource;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Stub\StubListingRefs;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Favourites on stubs (WP-13; HOMI's table from WP-44). The list pages like the feed (DEC-53); `PUT` and `DELETE`
 * replace the legacy toggle, so a repeated request cannot flip the state. The stub is stateless: a write answers,
 * the list stays the fixture.
 */
class FavoriteController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubListingRefs $refs) {}

    /** `GET /favorites`: previews, newest first, each with `favorite: true`. Scenario `empty`. */
    public function index(ListPersonalRequest $request): JsonResponse
    {
        $context = $this->stubs->check($request);
        $numbers = $this->refs->numbers($context->scenario === 'empty' ? 'favorites/empty' : 'favorites/default');
        [$items, $next] = $this->refs->page($numbers, $request->cursor(), $request->limit(), $context);
        $items = array_map(fn (ListingSummary $item): ListingSummary => $item->withFlags(favorite: true), $items);

        return $this->cursorPage(ListingPreviewResource::collection($items), $next, SourceDriver::Stub);
    }

    /** `PUT /favorites/{number}`: idempotent; the listing must exist (`404`), or be checkable (`503`). */
    public function update(Request $request, int $number): JsonResponse
    {
        $context = $this->stubs->check($request);
        $this->refs->preview($this->positive($number), $context);

        return $this->sourced(new FavoriteStateResource(true), SourceDriver::Stub);
    }

    /** `DELETE /favorites/{number}`: idempotent, never `404` for a listing that was not a favourite. */
    public function destroy(Request $request, int $number): JsonResponse
    {
        $this->stubs->check($request);
        $this->positive($number);

        return $this->sourced(new FavoriteStateResource(false), SourceDriver::Stub);
    }

    private function positive(int $number): int
    {
        return $number > 0 ? $number : throw new SourceNotFound('Listing not found.');
    }
}
