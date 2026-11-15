<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Enums\SourceDriver;
use App\Exceptions\Listings\ShareFailed;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\PreparedShareResource;
use App\Services\Listings\PreparedShare;
use App\Services\Sources\SourceManager;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /listings/{number}/share` (WP-12, API-017): prepares an inline message of HOMI's bot for
 * `WebApp.shareMessage`. Native, without a source feature: until WP-43 the stub answers (`meta.source = stub`). The
 * listing must exist (the card source answers `404`); scenario `share_failed` answers `502`.
 */
class ListingShareController extends ApiController
{
    public function __invoke(Request $request, int $number, StubResponder $stub, SourceManager $sources): JsonResponse
    {
        $context = $stub->check($request, ['share_failed' => fn (): ShareFailed => new ShareFailed]);
        $listing = $sources->listings('source.listings.card', $context)->source->preview($number, $context);
        $share = new PreparedShare("stub-prepared-{$listing->number}", now()->addHour()->toIso8601String());

        return $this->sourced(new PreparedShareResource($share), SourceDriver::Stub);
    }
}
