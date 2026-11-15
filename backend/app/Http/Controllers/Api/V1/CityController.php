<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\Api\V1\CityStatsResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET /cities` (WP-11): public; listing counts, price presets and typical prices per city. */
class CityController extends ApiController
{
    public function __invoke(Request $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->reference('source.cities', $context);

        return $this->sourced(CityStatsResource::collection($resolved->source->cities($context)), $resolved->driver);
    }
}
