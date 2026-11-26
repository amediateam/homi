<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SourceDriver;
use App\Http\Requests\Api\V1\UpdateSettingsRequest;
use App\Http\Resources\Api\V1\SettingsResource;
use App\Services\Identity\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /settings`, `PATCH /settings` (WP-11; native since WP-40): the signed-in user's settings row, read and written
 * by `SettingsService`; `PATCH` stores only the sent keys and answers the full object. The stub bodies answer from
 * `NativeStubs` while `SOURCES_NATIVE_STUBS` is on.
 */
class SettingsController extends ApiController
{
    public function show(Request $request, SettingsService $settings): JsonResponse
    {
        return $this->sourced(new SettingsResource($settings->get($this->appUser($request))->toArray()), SourceDriver::Native);
    }

    /** Stores only the sent keys and answers the full object; an empty body changes nothing */
    public function update(UpdateSettingsRequest $request, SettingsService $settings): JsonResponse
    {
        $changed = $settings->patch($this->appUser($request), $request->validated());

        return $this->sourced(new SettingsResource($changed->toArray()), SourceDriver::Native);
    }
}
