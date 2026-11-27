<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\ListingFiltersRequest;
use App\Http\Resources\Api\V1\MapPointsResource;
use App\Services\Listings\ListingOverlay;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/**
 * `GET /listings/map` (WP-12, API-007): every pin of the filters in one answer, without the ones HOMI's overlay leaves
 * out for the caller (WP-42); `total` and `with_point` lose them too.
 */
class ListingMapController extends ApiController
{
    public function __invoke(ListingFiltersRequest $request, SourceManager $sources, ListingOverlay $overlay): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->listings('source.listings.map', $context);
        $filters = $request->filters();

        return $this->sourced(new MapPointsResource($overlay->map($resolved->source->map($filters, $context), $filters, $context)), $resolved->driver);
    }
}
