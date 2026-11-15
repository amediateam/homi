<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\ListingFiltersRequest;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/** `GET /listings/count` (WP-12, API-005): how many listings the filters find; the same set as the feed. */
class ListingCountController extends ApiController
{
    public function __invoke(ListingFiltersRequest $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->listings('source.listings.count', $context);
        $count = $resolved->source->count($request->filters(), $context);

        return $this->sourced(['count' => $count], $resolved->driver);
    }
}
