<?php

namespace App\Http\Controllers\Api\V1\Landing;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\LandingLiveResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET /landing/live` (WP-13, RES-010): public and cacheable; names follow `Accept-Language`. */
class LandingLiveController extends ApiController
{
    private const int MAX_AGE_SECONDS = 300;

    public function __invoke(Request $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->landing('source.landing.live', $context);

        return $this->sourced(new LandingLiveResource($resolved->source->live($context)), $resolved->driver)
            ->setPublic()
            ->setMaxAge(self::MAX_AGE_SECONDS)
            ->setVary('Accept-Language', false);
    }
}
