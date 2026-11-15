<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\ContactResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /listings/{number}/contact` (WP-12, API-009, DEC-52): the one method that returns the author's number,
 * called on a tap. Every `200` is a disclosure: WP-43 counts it per user and WP-47 logs it.
 */
class ListingContactController extends ApiController
{
    public function __invoke(Request $request, int $number, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->listings('source.listings.contact', $context);

        return $this->sourced(new ContactResource($resolved->source->contact($number, $context)), $resolved->driver);
    }
}
