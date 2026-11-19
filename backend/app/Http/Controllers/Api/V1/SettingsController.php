<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SourceDriver;
use App\Http\Requests\Api\V1\UpdateSettingsRequest;
use App\Http\Resources\Api\V1\SettingsResource;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /settings`, `PATCH /settings` on stubs (WP-11; native from WP-40). The scenario `card_rich` answers the
 * settings of a user who chose the `rich` card style.
 */
class SettingsController extends ApiController
{
    /** @var array<string, string> */
    private const array SCENARIOS = ['card_rich' => 'settings/card_rich'];

    public function show(Request $request, StubResponder $stubs): JsonResponse
    {
        return $this->sourced(new SettingsResource($stubs->fixture('settings/default', $request, self::SCENARIOS)), SourceDriver::Stub);
    }

    /** The stub validates and answers the fixture with the sent keys overlaid; nothing is stored. */
    public function update(UpdateSettingsRequest $request, StubResponder $stubs): JsonResponse
    {
        $settings = array_replace($stubs->fixture('settings/default', $request, self::SCENARIOS), $request->validated());

        return $this->sourced(new SettingsResource($settings), SourceDriver::Stub);
    }
}
