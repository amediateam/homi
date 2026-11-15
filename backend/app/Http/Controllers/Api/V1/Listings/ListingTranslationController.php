<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Exceptions\Listings\TranslationNotNeeded;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\TranslationResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /listings/{number}/translation` (WP-12, API-010): the original text in the request locale. The originals
 * are Russian, so `ru` answers `422 translation_not_needed`.
 */
class ListingTranslationController extends ApiController
{
    public function __invoke(Request $request, int $number, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);

        if ($context->locale === 'ru') {
            throw new TranslationNotNeeded;
        }

        $resolved = $sources->listings('source.listings.translation', $context);

        return $this->sourced(new TranslationResource($resolved->source->translation($number, $context)), $resolved->driver);
    }
}
