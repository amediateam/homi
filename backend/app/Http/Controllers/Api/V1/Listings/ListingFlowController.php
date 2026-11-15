<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\ListingFiltersRequest;
use App\Http\Resources\Api\V1\FlowResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/** `GET /listings/flow` (WP-12, API-006): how fast listings of the filters appear, with wider suggestions. */
class ListingFlowController extends ApiController
{
    public function __invoke(ListingFiltersRequest $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->listings('source.listings.flow', $context);

        return $this->sourced(new FlowResource($resolved->source->flow($request->filters(), $context)), $resolved->driver);
    }
}
