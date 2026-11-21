<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\OwnerListingResource;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /owner/listings/{id}/publish` on stubs (WP-80; the checks are WP-84's): the listing active with its number, or
 * a refusal — locked, rejected, the missing parts, no confirmed number, the limit. A listing the realtor check holds
 * answers `200` with `held: true` (`held_check`). Scenarios: `owner_disabled`, `owner_limit`, `rejected_denied`,
 * `rejected_limit`, `held_check`, `publish_missing`, `listing_locked`.
 */
class OwnerPublishController extends ApiController
{
    public function __invoke(Request $request, string $id, StubResponder $stubs, StubOwner $owner): JsonResponse
    {
        // An unknown id answers `404` before any scenario.
        $owner->entry($id);
        $context = $stubs->check($request, OwnerErrors::of(['owner_disabled', 'owner_limit', 'rejected_denied', 'rejected_limit']));

        return $this->sourced(new OwnerListingResource($owner->publish($id, $context)), SourceDriver::Stub);
    }
}
