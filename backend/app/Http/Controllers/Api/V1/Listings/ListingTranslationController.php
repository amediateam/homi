<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\TranslationResource;
use App\Models\User;
use App\Services\Listings\TranslationService;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /listings/{number}/translation` (WP-12, WP-43, API-010): the original text in the request locale, through
 * `TranslationService` — cached per listing and locale, the per-user limit `v1-translation` counted on a miss only.
 * The originals are Russian, so `ru` answers `422 translation_not_needed`. `meta.source` is the driver of
 * `source.listings.translation`. While `sources.native_stubs` is on, `NativeStubs::translation()` answers instead
 * (WP-40). Its errors are those of WP-12's contract; the service names them in prose, so the committed OpenAPI
 * document keeps its shape.
 */
class ListingTranslationController extends ApiController
{
    public function __invoke(Request $request, int $number, TranslationService $translations, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        $translation = $translations->translate($user, $number, $context);

        return $this->sourced(new TranslationResource($translation), $sources->listings('source.listings.translation', $context)->driver);
    }
}
