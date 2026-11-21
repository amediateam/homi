<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Http\Controllers\Api\V1\ApiController;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** `PUT /owner/waitlist` on stubs (WP-80): idempotent, `204`; `GET /me` says `owner.waitlisted` (no Wave 1 screen calls it). */
class OwnerWaitlistController extends ApiController
{
    public function __invoke(Request $request, StubResponder $stubs): Response
    {
        $stubs->check($request);

        return response()->noContent();
    }
}
