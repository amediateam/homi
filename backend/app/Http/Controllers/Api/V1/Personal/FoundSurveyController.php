<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\Personal\FoundAnswerType;
use App\Enums\Personal\FoundPlace;
use App\Enums\Personal\FoundTrigger;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Personal\StoreFoundAnswerRequest;
use App\Http\Requests\Api\V1\Personal\StoreFoundWhereRequest;
use App\Services\Personal\FoundSurveyService;
use Illuminate\Http\Response;

/**
 * The «Нашли жильё?» survey in HOMI's table (WP-44, `FoundSurveyService`; WP-13, API-032 and API-033): stores the
 * answer and answers `204`. While `sources.native_stubs` is on, `NativeStubs` answers the stub bodies of WP-13 instead.
 */
class FoundSurveyController extends ApiController
{
    public function __construct(private readonly FoundSurveyService $survey) {}

    /** `POST /surveys/found`. */
    public function store(StoreFoundAnswerRequest $request): Response
    {
        $this->survey->answer(
            $this->signedInUser($request),
            FoundAnswerType::from($request->string('answer')->toString()),
            FoundTrigger::from($request->string('trigger')->toString()),
        );

        return $this->noContent();
    }

    /** `POST /surveys/found/where`. */
    public function where(StoreFoundWhereRequest $request): Response
    {
        $this->survey->where($this->signedInUser($request), FoundPlace::from($request->string('where')->toString()));

        return $this->noContent();
    }
}
