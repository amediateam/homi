<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\StoreEventRequest;
use App\Services\Sources\Stub\StubResponder;
use Dedoc\Scramble\Attributes\BodyParameter;
use Illuminate\Http\Response;

/**
 * `POST /events` on stubs (WP-11): validates and answers `204`. Events without a session never reach this point
 * (SEC-REQ-022); WP-47 stores them.
 */
class EventController extends ApiController
{
    // `props` is validated in StoreEventRequest::after(), which the export does not read.
    #[BodyParameter('props', required: false, type: 'array<string, mixed>')]
    public function __invoke(StoreEventRequest $request, StubResponder $stubs): Response
    {
        $stubs->check($request);

        return $this->noContent();
    }
}
