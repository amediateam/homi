<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\StoreFoundAnswerRequest;
use App\Http\Requests\Api\V1\Personal\StoreFoundWhereRequest;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\Response;

/** The «Нашли жильё?» survey on stubs (WP-13, API-032 and API-033; stored by WP-44): validates and answers `204`. */
class FoundSurveyController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs) {}

    /** `POST /surveys/found`. */
    public function store(StoreFoundAnswerRequest $request): Response
    {
        $this->stubs->check($request);

        return $this->noContent();
    }

    /** `POST /surveys/found/where`. */
    public function where(StoreFoundWhereRequest $request): Response
    {
        $this->stubs->check($request);

        return $this->noContent();
    }
}
