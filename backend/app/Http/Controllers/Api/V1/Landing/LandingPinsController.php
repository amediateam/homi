<?php

namespace App\Http\Controllers\Api\V1\Landing;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Landing\LandingPinsRequest;
use App\Http\Resources\Api\V1\LandingPinsResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;

/** `GET /landing/pins` (WP-13, RES-011): public and cacheable; names follow `Accept-Language`. */
class LandingPinsController extends ApiController
{
    private const int MAX_AGE_SECONDS = 300;

    public function __invoke(LandingPinsRequest $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->landing('source.landing.pins', $context);

        return $this->sourced(new LandingPinsResource($resolved->source->pins($request->deal(), $context)), $resolved->driver)
            ->setPublic()
            ->setMaxAge(self::MAX_AGE_SECONDS)
            ->setVary('Accept-Language', false);
    }
}
