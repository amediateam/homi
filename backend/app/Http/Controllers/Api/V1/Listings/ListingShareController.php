<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\PreparedShareResource;
use App\Models\User;
use App\Services\Sources\SourceContext;
use App\Services\Telegram\ShareService;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /listings/{number}/share` (WP-12, WP-43, API-017): a prepared inline message of HOMI's bot for
 * `WebApp.shareMessage`, through `ShareService` — reused per user, listing and locale within its lifetime. Native,
 * without a source feature: `meta.source = native`. The listing must exist (the card source answers `404`); any Bot
 * API failure is `502 share_failed`, and the client falls back to its `t.me` link. While `sources.native_stubs` is on,
 * `NativeStubs::share()` answers instead (WP-40).
 */
class ListingShareController extends ApiController
{
    public function __invoke(Request $request, int $number, ShareService $shares): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        return $this->sourced(new PreparedShareResource($shares->prepare($user, $number, SourceContext::fromRequest($request))), SourceDriver::Native);
    }
}
