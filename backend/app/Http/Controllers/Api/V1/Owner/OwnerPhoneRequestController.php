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
 * `POST /owner/listings/{id}/phone-request` on stubs (WP-80): opens the ten-minute phone window of WP-84 and answers the
 * listing; the client then asks Telegram for the contact and polls the listing (BR-API-170).
 */
class OwnerPhoneRequestController extends ApiController
{
    public function __invoke(Request $request, string $id, StubResponder $stubs, StubOwner $owner): JsonResponse
    {
        // An unknown id answers `404` before any scenario.
        $owner->entry($id);
        $context = $stubs->check($request, OwnerErrors::of(['owner_disabled']));

        return $this->sourced(new OwnerListingResource($owner->find($id, $context)), SourceDriver::Stub);
    }
}
