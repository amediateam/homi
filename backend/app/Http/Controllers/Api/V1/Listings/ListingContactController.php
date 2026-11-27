<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\ContactResource;
use App\Models\User;
use App\Services\Listings\ContactService;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /listings/{number}/contact` (WP-12, WP-43, API-009, DEC-52): the one method that returns the author's number,
 * called on a tap; `ContactService::disclose()` with the channel `app` counts it against the user's disclosure quota
 * and raises `ContactDisclosed`. `meta.source` is the driver of `source.listings.contact`. While
 * `sources.native_stubs` is on, `NativeStubs::contact()` answers instead (WP-40). Its errors are those of WP-12's contract
 * (`404 contact_unavailable`, `404 not_found`, `503 source_unavailable`); the service names them in prose, so the
 * committed OpenAPI document keeps its shape.
 */
class ListingContactController extends ApiController
{
    public function __invoke(Request $request, int $number, ContactService $contacts, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        $contact = $contacts->disclose($user, $number, $context, ContactService::APP);

        return $this->sourced(new ContactResource($contact), $sources->listings('source.listings.contact', $context)->driver);
    }
}
