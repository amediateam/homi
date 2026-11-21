<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Owner\UpdateContactModeRequest;
use App\Http\Resources\Api\V1\OwnerListingResource;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;

/** `PUT /owner/listings/{id}/contact-mode` on stubs (WP-80): `request` (legacy `gate`) or `phone` (legacy `open`). */
class OwnerContactModeController extends ApiController
{
    public function __invoke(UpdateContactModeRequest $request, string $id, StubResponder $stubs, StubOwner $owner): JsonResponse
    {
        $context = $stubs->check($request, OwnerErrors::of(['owner_disabled']));

        return $this->sourced(new OwnerListingResource($owner->contactMode($id, $request->string('mode')->toString(), $context)), SourceDriver::Stub);
    }
}
