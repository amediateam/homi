<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Owner\OwnerPlaceRequest;
use App\Http\Resources\Api\V1\OwnerPlaceResource;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;

/** `GET /owner/place` on stubs (WP-80, DEC-79): the city and district of a point rounded to 3 decimals; either may be `null`. */
class OwnerPlaceController extends ApiController
{
    public function __invoke(OwnerPlaceRequest $request, StubResponder $stubs, StubOwner $owner): JsonResponse
    {
        $stubs->check($request);

        return $this->sourced(new OwnerPlaceResource($owner->place($request->lat(), $request->lon())), SourceDriver::Stub);
    }
}
