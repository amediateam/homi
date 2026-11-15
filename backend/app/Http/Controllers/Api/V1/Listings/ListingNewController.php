<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\ListingNewRequest;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/**
 * `GET /listings/new` (WP-12, API-035): the listings of the filters that appeared after `since`, for the return
 * banner. `count` is always an integer ≥ 0 (fix of LB-API-055); a `since` later than now answers 0 without asking the
 * source. Not overlaid: hidden listings and blocked authors are counted (`25` §4.5).
 */
class ListingNewController extends ApiController
{
    public function __invoke(ListingNewRequest $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->listings('source.listings.new', $context);
        $since = $request->since();
        $count = $since > now()->getTimestamp() ? 0 : max(0, $resolved->source->newSince($request->filters(), $since, $context));

        return $this->sourced(['count' => $count], $resolved->driver);
    }
}
