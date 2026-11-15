<?php

namespace App\Http\Controllers\Api\V1\Radars;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Radars\RelaxRadarRequest;
use App\Http\Resources\Api\V1\RadarPatchResource;
use App\Services\Radars\RadarChange;
use App\Services\Sources\Stub\StubRadars;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * `POST /radars/{id}/relax` on stubs (WP-13, BR-APP-042): widens a radar by the `code` of an offered option and
 * answers the radar with `starter`. An unknown code is `422`; scenarios `no_chat`, `radar_duplicate`.
 */
class RadarRelaxController extends ApiController
{
    public function __invoke(RelaxRadarRequest $request, string $id, StubResponder $stubs, StubRadars $radars): JsonResponse
    {
        $radar = $radars->find($id);

        if (! in_array($request->string('code')->toString(), $radars->optionCodes(), true)) {
            throw ValidationException::withMessages(['code' => 'The code is not an option of this radar.']);
        }

        $stubs->check($request, RadarController::errors(['no_chat', 'radar_duplicate']));

        return $this->sourced(new RadarPatchResource(new RadarChange($radar, starter: $radars->starter('radars/relaxed'))), SourceDriver::Stub);
    }
}
