<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Owner\OwnerDemandRequest;
use App\Http\Resources\Api\V1\OwnerDemandResource;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;

/** `GET /owner/demand` on stubs (WP-80, DEC-84). Scenario: `demand_few` (`count: null`, `few: true`). */
class OwnerDemandController extends ApiController
{
    public function __invoke(OwnerDemandRequest $request, StubResponder $stubs, StubOwner $owner): JsonResponse
    {
        return $this->sourced(new OwnerDemandResource($owner->demand($stubs->check($request))), SourceDriver::Stub);
    }
}
