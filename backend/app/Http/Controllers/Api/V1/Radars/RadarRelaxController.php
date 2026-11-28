<?php

namespace App\Http\Controllers\Api\V1\Radars;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Radars\RelaxRadarRequest;
use App\Http\Resources\Api\V1\RadarPatchResource;
use App\Services\Radar\RadarService;
use App\Services\Radars\Radar;
use App\Services\Radars\RadarChange;
use App\Services\Sources\SourceContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * `POST /radars/{id}/relax` on HOMI's radars (WP-45; the shape of WP-13, BR-APP-042): widens a radar by the `code` of
 * an option it offered (`RadarService::relax()`) and answers the radar with `starter`. The radar is looked up through
 * the caller's radars and checked by `RadarPolicy` first, so a foreign id is the `404` of an unknown one before the
 * chat check, the remembered options or any source call; then `no_chat`, then a code outside the offered set is `422`
 * on `code`, then `radar_duplicate`. While `sources.native_stubs` is on, `NativeStubs` answers the stub body of WP-13.
 */
class RadarRelaxController extends ApiController
{
    public function __invoke(RelaxRadarRequest $request, string $id, RadarService $radars): JsonResponse
    {
        $user = $this->signedInUser($request);
        $radar = $user->radars()->findOrFail(strtoupper($id));
        Gate::inspect('update', $radar)->authorize();
        $context = SourceContext::fromRequest($request);
        $mutation = $radars->relax($user, $radar, $request->string('code')->toString(), $context->locale, $context->currency);

        return $this->sourced(new RadarPatchResource(new RadarChange(Radar::fromModel($mutation->radar), starter: $mutation->starter->count)), SourceDriver::Native);
    }
}
