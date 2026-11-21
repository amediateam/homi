<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\OwnerRequestAction;
use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Owner\AnswerOwnerRequestRequest;
use App\Http\Requests\Api\V1\Personal\ListPersonalRequest;
use App\Http\Resources\Api\V1\OwnerRequestResource;
use App\Services\Sources\Stub\StubCursor;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;

/**
 * The requests on an owner's listing on stubs (WP-80; real from WP-85): a cursor list, newest first, and the owner's
 * answer. Works with the switch off. Scenario: `request_answer_closed` (answer).
 */
class OwnerRequestController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubOwner $owner) {}

    public function index(ListPersonalRequest $request, string $id): JsonResponse
    {
        $this->stubs->check($request);
        [$items, $next] = StubCursor::page($this->owner->requests($id), $request->cursor(), $request->limit());

        return $this->cursorPage(OwnerRequestResource::collection($items), $next, SourceDriver::Stub);
    }

    public function answer(AnswerOwnerRequestRequest $request, string $id): JsonResponse
    {
        $this->owner->request($id);
        $this->stubs->check($request, OwnerErrors::of(['request_answer_closed']));
        $action = $request->enum('action', OwnerRequestAction::class) ?? OwnerRequestAction::Give;

        return $this->sourced(new OwnerRequestResource($this->owner->answer($id, $action)), SourceDriver::Stub);
    }
}
