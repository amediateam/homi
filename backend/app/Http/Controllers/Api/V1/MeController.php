<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SourceDriver;
use App\Http\Resources\Api\V1\MeResource;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET /me` on stubs (WP-11; native from WP-40). */
class MeController extends ApiController
{
    /** The stub scenarios of the user object; sign-in answers the same user. */
    public const array SCENARIOS = [
        'first_launch' => 'me/first_launch',
        'no_city' => 'me/no_city',
        'uz' => 'me/uz',
    ];

    public function __invoke(Request $request, StubResponder $stubs): JsonResponse
    {
        return $this->sourced(new MeResource($stubs->fixture('me/default', $request, self::SCENARIOS)), SourceDriver::Stub);
    }
}
