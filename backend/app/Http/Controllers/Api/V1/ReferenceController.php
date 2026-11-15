<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SourceDriver;
use App\Http\Resources\Api\V1\ReferenceResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /reference` (WP-11): public, so the no-access screen works without a session; cacheable per language.
 */
class ReferenceController extends ApiController
{
    /** How long a client or proxy may reuse the answer; the radar switch reaches clients within this time. */
    private const int MAX_AGE_SECONDS = 300;

    public function __invoke(Request $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->reference('source.reference', $context);
        $withoutBot = $resolved->driver === SourceDriver::Stub && $context->scenario === 'no_bot';

        return $this->sourced(new ReferenceResource($resolved->source->reference($context), $withoutBot), $resolved->driver)
            ->setPublic()
            ->setMaxAge(self::MAX_AGE_SECONDS)
            ->setVary('Accept-Language', false);
    }
}
