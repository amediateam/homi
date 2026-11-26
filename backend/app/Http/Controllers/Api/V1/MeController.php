<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SourceDriver;
use App\Http\Resources\Api\V1\MeResource;
use App\Services\Identity\MeProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /me` (WP-11; native since WP-40): the signed-in user's choices, built by `MeProfile`. Its stub body answers
 * from `NativeStubs` while `SOURCES_NATIVE_STUBS` is on.
 */
class MeController extends ApiController
{
    public function __invoke(Request $request, MeProfile $profile): JsonResponse
    {
        return $this->sourced(new MeResource($profile->for($this->appUser($request))), SourceDriver::Native);
    }
}
