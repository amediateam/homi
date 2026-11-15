<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\ListingFiltersRequest;
use App\Http\Resources\Api\V1\MapPointsResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/** `GET /listings/map` (WP-12, API-007): every pin of the filters in one answer. */
class ListingMapController extends ApiController
{
    public function __invoke(ListingFiltersRequest $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->listings('source.listings.map', $context);

        return $this->sourced(new MapPointsResource($resolved->source->map($request->filters(), $context)), $resolved->driver);
    }
}
