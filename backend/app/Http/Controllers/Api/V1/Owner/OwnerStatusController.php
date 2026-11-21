<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\OwnerListingStatus;
use App\Enums\SourceDriver;
use App\Exceptions\Owner\OwnerCabinetDisabled;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Owner\UpdateOwnerStatusRequest;
use App\Http\Resources\Api\V1\OwnerListingResource;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Config;

/**
 * `PUT /owner/listings/{id}/status` on stubs (WP-80): `active` ↔ `paused`, `active` or `paused` → `rented` or
 * `removed`. With the switch off (DEC-81) `active` — a resume puts a listing back into the feed — answers `403
 * owner_disabled` after validation and before the lookup; the ways down stay open. Scenarios: `owner_disabled` (for
 * `active`), `listing_locked`.
 */
class OwnerStatusController extends ApiController
{
    public function __invoke(UpdateOwnerStatusRequest $request, string $id, StubResponder $stubs, StubOwner $owner): JsonResponse
    {
        $status = $request->enum('status', OwnerListingStatus::class) ?? OwnerListingStatus::Active;

        if ($status === OwnerListingStatus::Active && ! Config::boolean('owner.enabled')) {
            throw new OwnerCabinetDisabled;
        }

        $context = $stubs->check($request, $status === OwnerListingStatus::Active ? OwnerErrors::of(['owner_disabled']) : []);

        return $this->sourced(new OwnerListingResource($owner->status($id, $status, $context)), SourceDriver::Stub);
    }
}
