<?php

namespace App\Http\Controllers\Api\V1\Listings;

use App\Enums\ContactRequestStatus;
use App\Enums\SourceDriver;
use App\Exceptions\Radar\NoChat;
use App\Exceptions\Requests\ContactOpen;
use App\Exceptions\Requests\OwnListing;
use App\Exceptions\Requests\RequestClosed;
use App\Exceptions\Requests\RequestLimitReached;
use App\Exceptions\Requests\RequestsBlocked;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Listings\StoreContactRequestRequest;
use App\Http\Resources\Api\V1\ContactRequestResultResource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\StubListingSource;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;

/**
 * `POST /listings/{number}/contact-request` on stubs (WP-80, API-054; native numbers go to WP-85's service, a legacy
 * `gate` listing to WP-87's relay, by `ListingNumber::isNative()`). `201 {status: pending}` for a new request, `200`
 * with the current status for a repeat. Errors are checked before anything is created. Without a scenario the stub
 * answers by number (WP-80, "Scenarios"); `init_data` is checked only by its rules of form.
 */
class ListingContactRequestController extends ApiController
{
    /** The stub's answer by number: a new request, the status of an existing one, or the refusal. */
    private const array BY_NUMBER = [
        10000001 => 'created',
        10000005 => 'created',
        10000002 => 'pending',
        10000003 => 'given',
        10000004 => 'declined',
        10000006 => 'closed',
        10000007 => 'open',
        10000008 => 'own',
    ];

    public function __invoke(StoreContactRequestRequest $request, int $number, StubResponder $stubs, StubListingSource $listings): JsonResponse
    {
        // An unknown number is `404 not_found`, before any scenario or other answer.
        $listings->preview($number, SourceContext::fromRequest($request));

        $context = $stubs->check($request, [
            'no_chat' => fn (): NoChat => new NoChat,
            'request_limit_fast' => fn (): RequestLimitReached => new RequestLimitReached('requests_fast', 600),
            'request_limit_day' => fn (): RequestLimitReached => new RequestLimitReached('requests_day', 3600),
            'request_limit_week' => fn (): RequestLimitReached => new RequestLimitReached('requests_week', 86400),
            'requests_blocked' => fn (): RequestsBlocked => new RequestsBlocked,
            'request_closed' => fn (): RequestClosed => new RequestClosed,
            'own_listing' => fn (): OwnListing => new OwnListing,
            'contact_open' => fn (): ContactOpen => new ContactOpen,
        ]);

        $answer = $context->scenario === 'relay_on' && $number === StubListingSource::GATE ? 'created' : (self::BY_NUMBER[$number] ?? 'closed');

        return match ($answer) {
            'created' => $this->sourced(new ContactRequestResultResource(ContactRequestStatus::Pending), SourceDriver::Stub, status: 201),
            'pending' => $this->sourced(new ContactRequestResultResource(ContactRequestStatus::Pending), SourceDriver::Stub),
            'given' => $this->sourced(new ContactRequestResultResource(ContactRequestStatus::Given), SourceDriver::Stub),
            'declined' => $this->sourced(new ContactRequestResultResource(ContactRequestStatus::Declined), SourceDriver::Stub),
            'open' => throw new ContactOpen,
            'own' => throw new OwnListing,
            default => throw new RequestClosed,
        };
    }
}
