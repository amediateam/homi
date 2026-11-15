<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\StoreReportRequest;
use App\Http\Resources\Api\V1\ReportResultResource;
use App\Services\Sources\Stub\StubListingRefs;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;

/**
 * `POST /listings/{number}/reports` on stubs (WP-13; stored and applied in HOMI only, DEC-48, WP-44). A repeat with
 * the same reason is counted once and answers the same; the detail is stored for review and changes nothing.
 */
class ReportController extends ApiController
{
    public function __invoke(StoreReportRequest $request, int $number, StubResponder $stubs, StubListingRefs $refs): JsonResponse
    {
        $context = $stubs->check($request);
        $refs->preview($number > 0 ? $number : throw new SourceNotFound('Listing not found.'), $context);

        return $this->sourced(new ReportResultResource($request->hides()), SourceDriver::Stub);
    }
}
