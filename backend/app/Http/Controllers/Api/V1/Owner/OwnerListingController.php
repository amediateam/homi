<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\SourceDriver;
use App\Exceptions\Owner\OwnerLimitReached;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Owner\UpdateOwnerListingRequest;
use App\Http\Resources\Api\V1\OwnerListingResource;
use App\Http\Resources\Api\V1\OwnerListingsResource;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Config;

/**
 * The owner's listings on stubs (WP-80; real from WP-84): the list, a new draft, the listing, a change of its form and
 * the delete of a draft or a rejected listing. Scenarios: `owner_empty`, `owner_returning` (list, store),
 * `owner_limit`, `owner_disabled` (store, update), `phone_set`, `phone_not_uz`, `phone_not_own`, `rejected_*`,
 * `held_check` (show), `listing_locked` (update, delete).
 */
class OwnerListingController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubOwner $owner) {}

    /** `GET /owner/listings`: every listing of the caller, drafts and history included, newest first. */
    public function index(Request $request): JsonResponse
    {
        return $this->sourced(new OwnerListingsResource($this->owner->listings($this->stubs->check($request))), SourceDriver::Stub);
    }

    /**
     * `POST /owner/listings`: the caller's untouched draft (`200`, DEV-054) whatever the limit, else `409 owner_limit`
     * at the limit, else a new draft (`201`).
     */
    public function store(Request $request): JsonResponse
    {
        $context = $this->stubs->check($request, OwnerErrors::of(['owner_disabled', 'owner_limit']));

        if ($context->scenario === 'owner_empty' || $context->scenario === 'owner_returning') {
            return $this->sourced(new OwnerListingResource($this->owner->newDraft('tashkent')), SourceDriver::Stub, status: 201);
        }

        $listings = $this->owner->listings($context);

        foreach ($listings->items as $item) {
            if ($item->id === StubOwner::UNTOUCHED_DRAFT) {
                return $this->sourced(new OwnerListingResource($item), SourceDriver::Stub);
            }
        }

        if (! $listings->canAdd) {
            throw new OwnerLimitReached('account', Config::integer('owner.limits.listings'));
        }

        return $this->sourced(new OwnerListingResource($this->owner->newDraft('tashkent')), SourceDriver::Stub, status: 201);
    }

    /** `GET /owner/listings/{id}`: also the phone poll; with the owner's writes the only answer with the true point. */
    public function show(Request $request, string $id): JsonResponse
    {
        return $this->sourced(new OwnerListingResource($this->owner->find($id, $this->stubs->check($request))), SourceDriver::Stub);
    }

    /** `PATCH /owner/listings/{id}`: the changed form keys; a published listing changes at once (DEC-80). */
    public function update(UpdateOwnerListingRequest $request, string $id): JsonResponse
    {
        $context = $this->stubs->check($request, OwnerErrors::of(['owner_disabled']));

        return $this->sourced(new OwnerListingResource($this->owner->update($id, $request->changes(), $context)), SourceDriver::Stub);
    }

    /** `DELETE /owner/listings/{id}`: a draft or a rejected listing (DEV-056); anything else is locked. */
    public function destroy(Request $request, string $id): Response
    {
        $this->owner->destroy($id, $this->stubs->check($request));

        return response()->noContent();
    }
}
