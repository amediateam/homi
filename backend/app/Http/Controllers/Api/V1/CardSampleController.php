<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SourceDriver;
use App\Http\Resources\Api\V1\CardSampleResource;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /settings/card-sample` on stubs (intake of legacy `index-BnFvC-Ft.js`, API-036): the bot sends one sample
 * listing card in the user's saved card style. Native; the stub sends nothing and answers `sent: true`, or `false`
 * for the scenario `card_sample_unsent` (the bot could not reach the chat). WP-53 and WP-57 send the real card.
 */
class CardSampleController extends ApiController
{
    public function __invoke(Request $request, StubResponder $stubs): JsonResponse
    {
        $context = $stubs->check($request);

        return $this->sourced(new CardSampleResource($context->scenario !== 'card_sample_unsent'), SourceDriver::Stub);
    }
}
