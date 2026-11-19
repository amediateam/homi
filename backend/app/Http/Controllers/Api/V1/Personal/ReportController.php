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
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The reports of a listing on stubs (WP-13; stored and applied in HOMI only, DEC-48, WP-44). A repeated report with
 * the same reason is counted once and answers the same; the detail is stored for review and changes nothing. The
 * stub is stateless: it never marks an author by itself, and a withdrawal has nothing to remove.
 */
class ReportController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubListingRefs $refs) {}

    /**
     * `POST /listings/{number}/reports`: `hidden` says whether the listing is now hidden for the reporter;
     * `agent_marked` is `true` only for an `agent` report whose author is marked as a realtor, by this report or
     * already. Scenario `agent_marked`.
     */
    public function store(StoreReportRequest $request, int $number): JsonResponse
    {
        $context = $this->stubs->check($request);
        $this->refs->preview($this->positive($number), $context);
        $agentMarked = $request->namesAgent() && $context->scenario === 'agent_marked';

        return $this->sourced(new ReportResultResource($request->hides(), $agentMarked), SourceDriver::Stub);
    }

    /**
     * `DELETE /listings/{number}/reports`: withdraws the caller's `rented` report on the listing and nothing else.
     * Idempotent: `204` also when there is nothing to withdraw; the listing must exist (`404`).
     */
    public function destroy(Request $request, int $number): Response
    {
        $context = $this->stubs->check($request);
        $this->refs->preview($this->positive($number), $context);

        return $this->noContent();
    }

    private function positive(int $number): int
    {
        return $number > 0 ? $number : throw new SourceNotFound('Listing not found.');
    }
}
