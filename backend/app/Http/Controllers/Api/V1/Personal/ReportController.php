<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\Personal\HiddenReason;
use App\Enums\Personal\ReportReason;
use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\StoreReportRequest;
use App\Http\Resources\Api\V1\ReportResultResource;
use App\Services\Personal\HiddenService;
use App\Services\Personal\ListingResolver;
use App\Services\Personal\VoteService;
use App\Services\Sources\SourceContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The reports of a listing in HOMI's tables (WP-44, `VoteService`; the shapes of WP-13; stored and applied in HOMI
 * only, DEC-48). A repeated report with the same reason is counted once and answers the same; the detail is stored for
 * review and changes nothing. An `agent` report counts per author key, so the author is filed first
 * (`ListingResolver::fileAuthor()`). While `sources.native_stubs` is on, `NativeStubs` answers the stub bodies of
 * WP-13 instead (the scenario `agent_marked` is theirs).
 */
class ReportController extends ApiController
{
    public function __construct(
        private readonly VoteService $votes,
        private readonly ListingResolver $resolver,
        private readonly HiddenService $hidden,
    ) {}

    /**
     * `POST /listings/{number}/reports`: `hidden` says whether the listing is now hidden for the reporter;
     * `agent_marked` is `true` only for an `agent` report whose author is marked as a realtor, by this report or
     * already. Scenario `agent_marked`.
     */
    public function store(StoreReportRequest $request, int $number): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $pointer = $this->resolver->resolve($this->positive($number), $context);
        $reason = $request->reason();

        if ($reason === ReportReason::Agent) {
            $this->resolver->fileAuthor($pointer, $context);
        }

        $outcome = $this->votes->report($this->signedInUser($request), $pointer, $reason, $request->detail());

        return $this->sourced(new ReportResultResource($outcome->hidden, $outcome->agentMarked), SourceDriver::Native);
    }

    /**
     * `DELETE /listings/{number}/reports`: withdraws the caller's `rented` report on the listing and nothing else.
     * Idempotent: `204` also when there is nothing to withdraw; the listing must exist (`404`).
     */
    public function destroy(Request $request, int $number): Response
    {
        $user = $this->signedInUser($request);
        $pointer = $this->resolver->resolve($this->positive($number), SourceContext::fromRequest($request));
        $numbers = $this->resolver->numbersOf(
            $number,
            $pointer,
            $user->listingVotes()->where('reason', ReportReason::Rented->value)->toBase(),
            $user->hiddenListings()->where('reason', HiddenReason::ReportRented->value)->toBase(),
        );

        $this->votes->withdraw($user, $pointer, ReportReason::Rented, $numbers);
        $this->hidden->unhideReported($user, $numbers, HiddenReason::ReportRented);

        return $this->noContent();
    }

    private function positive(int $number): int
    {
        return $number > 0 ? $number : throw new SourceNotFound('Listing not found.');
    }
}
