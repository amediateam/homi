<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\BlockedAuthorResultResource;
use App\Services\Personal\BlockedAuthorService;
use App\Services\Sources\SourceContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Blocking the author of a listing in HOMI's table (WP-44; the shapes of WP-13). The author is the key `listing_refs`
 * files for the listing (`404 not_found` when it has none — always on the stub driver, brief decision 14); the answer
 * lists the author's newest live listings HOMI knows (`BlockResult`). Both calls are idempotent. While `sources.native_stubs` is on, `NativeStubs`
 * answers the stub bodies of WP-13 instead.
 */
class BlockedAuthorController extends ApiController
{
    public function __construct(private readonly BlockedAuthorService $authors) {}

    /** `PUT /listings/{number}/blocked-author`. */
    public function update(Request $request, int $number): JsonResponse
    {
        $result = $this->authors->block($this->signedInUser($request), $number, SourceContext::fromRequest($request));

        return $this->sourced(new BlockedAuthorResultResource($result->author()), SourceDriver::Native);
    }

    /** `DELETE /listings/{number}/blocked-author`: the undo by listing. */
    public function destroy(Request $request, int $number): Response
    {
        if ($number < 1) {
            throw new SourceNotFound('Listing not found.');
        }

        $this->authors->unblockByListing($this->signedInUser($request), $number);

        return $this->noContent();
    }
}
