<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\HiddenOverviewResource;
use App\Services\Personal\HiddenOverview;
use App\Services\Sources\Stub\StubListingRefs;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The hidden list on stubs (WP-13; HOMI's tables from WP-44): `hidden/default.json`, scenario `empty`. A foreign or
 * unknown entry id answers like a missing one, `404 not_found` (SEC-REQ-014).
 */
class HiddenController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubListingRefs $refs) {}

    /** `GET /hidden`: hidden listings, newest first, and blocked authors. */
    public function index(Request $request): JsonResponse
    {
        $context = $this->stubs->check($request);
        $fixture = $context->scenario === 'empty' ? 'hidden/empty' : 'hidden/default';
        $overview = new HiddenOverview(
            $this->refs->previews($this->refs->numbers($fixture, 'listings'), $context),
            $this->refs->blockedAuthors($fixture),
        );

        return $this->sourced(new HiddenOverviewResource($overview), SourceDriver::Stub);
    }

    /** `DELETE /hidden/authors/{id}`: removes one blocked author by entry id. */
    public function destroyAuthor(Request $request, string $id): Response
    {
        $this->stubs->check($request);

        foreach ($this->refs->blockedAuthors('hidden/default') as $author) {
            if ($author->id === strtoupper($id)) {
                return $this->noContent();
            }
        }

        throw new SourceNotFound('Blocked author not found.');
    }

    /** `DELETE /hidden`: clears hidden listings and blocked authors of the caller. */
    public function destroy(Request $request): Response
    {
        $this->stubs->check($request);

        return $this->noContent();
    }
}
