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
    /**
     * The stub scenarios of the user object; sign-in answers the same user. `replay` is a profile sampled for replay
     * (`analytics.replay: true`, `replay_rate: 1`) for WP-32's analytics specs. Every profile has requests waiting for
     * none (`owner.pending: 0`), so the owner signals of WP-82 stay quiet; `owner_pending` has two, as the stub list's
     * listing `01JF…03`.
     */
    public const array SCENARIOS = [
        'first_launch' => 'me/first_launch',
        'no_city' => 'me/no_city',
        'uz' => 'me/uz',
        'en' => 'me/en',
        'owner_empty' => 'me/owner_empty',
        'owner_waitlisted' => 'me/owner_waitlisted',
        'replay' => 'me/replay',
        'owner_pending' => 'me/owner_pending',
    ];

    public function __invoke(Request $request, StubResponder $stubs): JsonResponse
    {
        return $this->sourced(new MeResource($stubs->fixture('me/default', $request, self::SCENARIOS)), SourceDriver::Stub);
    }
}
