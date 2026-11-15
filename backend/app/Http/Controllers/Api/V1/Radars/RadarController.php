<?php

namespace App\Http\Controllers\Api\V1\Radars;

use App\Enums\RadarMode;
use App\Enums\RadarMutationKind;
use App\Enums\SourceDriver;
use App\Exceptions\Radar\NoChat;
use App\Exceptions\Radar\RadarDuplicate;
use App\Exceptions\Radar\RadarLimit;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Radars\ListRadarsRequest;
use App\Http\Requests\Api\V1\Radars\PatchRadarRequest;
use App\Http\Requests\Api\V1\Radars\StoreRadarRequest;
use App\Http\Requests\Api\V1\Radars\UpdateRadarRequest;
use App\Http\Resources\Api\V1\RadarMutationResource;
use App\Http\Resources\Api\V1\RadarPatchResource;
use App\Http\Resources\Api\V1\RadarResource;
use App\Services\Radars\RadarChange;
use App\Services\Sources\Stub\StubRadars;
use App\Services\Sources\Stub\StubResponder;
use Closure;
use Dedoc\Scramble\Attributes\BodyParameter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Throwable;

/**
 * Radars on stubs (WP-13; native from WP-45). While the switch is off (DEC-51) the write routes never reach this
 * controller (`EnsureRadarsEnabled`), and the list answers `[]` without reading a fixture or a scenario; `DELETE`
 * works either way. Scenarios: `empty` (list); `no_chat`, `radar_limit`, `radar_duplicate` (writes); `existing`,
 * `starter`, `few` (create); `ask_found` (pause and delete).
 */
class RadarController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubRadars $radars) {}

    /** `GET /radars`: the radars in creation order; `include=previews` adds each radar's preview. */
    public function index(ListRadarsRequest $request): JsonResponse
    {
        if (! Config::boolean('radar.creation_enabled')) {
            return $this->sourced(RadarResource::collection([]), SourceDriver::Stub);
        }

        $context = $this->stubs->check($request);
        $radars = $context->scenario === 'empty' ? [] : $this->radars->list($context, $request->wantsPreviews());

        return $this->sourced(RadarResource::collection($radars), SourceDriver::Stub);
    }

    /**
     * `POST /radars`: creates a radar, or answers the active radar with the same filters (`existing`, `200`) or
     * switches on a paused one (`reactivated`, `200`). The same filters ignore `posted_days` and the order of keys
     * and lists (BR-APP-012).
     */
    #[BodyParameter('filters', description: 'The filters object of WP-12; any subset of its 25 keys, normalised for a radar.', required: true, type: 'array<string, mixed>')]
    public function store(StoreRadarRequest $request): JsonResponse
    {
        $context = $this->stubs->check($request, self::errors(['no_chat', 'radar_limit']));
        $mutation = $this->radars->mutation(match ($context->scenario) {
            'existing' => 'radars/existing',
            'starter' => 'radars/starter',
            'few' => 'radars/few',
            default => 'radars/created',
        }, $request->filters());
        $result = new RadarMutationResource($mutation);

        if (in_array($mutation->kind, [RadarMutationKind::Existing, RadarMutationKind::Reactivated], true)) {
            return $this->sourced($result, SourceDriver::Stub);
        }

        return $this->sourced($result, SourceDriver::Stub, status: 201);
    }

    /** `PUT /radars/{id}`: replaces the filters and keeps `active`. */
    #[BodyParameter('filters', description: 'The filters object of WP-12; any subset of its 25 keys, normalised for a radar.', required: true, type: 'array<string, mixed>')]
    public function update(UpdateRadarRequest $request, string $id): JsonResponse
    {
        $radar = $this->radars->find($id);
        $this->stubs->check($request, self::errors(['no_chat', 'radar_duplicate']));

        return $this->sourced(new RadarMutationResource($this->radars->mutation('radars/updated', $request->filters(), $radar)), SourceDriver::Stub);
    }

    /** `PATCH /radars/{id}`: switches on (with `starter`), pauses (with `ask_found`), changes the mode or unhides. */
    public function patch(PatchRadarRequest $request, string $id): JsonResponse
    {
        $radar = $this->radars->find($id);
        $active = $request->has('active') ? $request->boolean('active') : null;
        $context = $this->stubs->check($request, $active === true ? self::errors(['no_chat', 'radar_limit']) : []);

        $change = match (true) {
            $active === true => new RadarChange($radar->with(active: true), starter: $this->radars->starter('radars/patched')),
            $active === false => new RadarChange($radar->with(active: false), askFound: $context->scenario === 'ask_found'),
            $request->has('mode') => new RadarChange($radar->with(mode: $request->enum('mode', RadarMode::class))),
            default => new RadarChange($radar->with(hidden: 0)),
        };

        return $this->sourced(new RadarPatchResource($change), SourceDriver::Stub);
    }

    /** `DELETE /radars/{id}`: works while the switch is off, so nothing can be left behind. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->radars->find($id);
        $context = $this->stubs->check($request);

        return $this->sourced(['ask_found' => $context->scenario === 'ask_found'], SourceDriver::Stub);
    }

    /**
     * The scenario errors of a write.
     *
     * @param  list<string>  $codes
     * @return array<string, Closure(): Throwable>
     */
    public static function errors(array $codes): array
    {
        $errors = [
            'no_chat' => fn (): NoChat => new NoChat,
            'radar_limit' => fn (): RadarLimit => new RadarLimit(Config::integer('radar.max')),
            'radar_duplicate' => fn (): RadarDuplicate => new RadarDuplicate,
        ];

        return array_intersect_key($errors, array_flip($codes));
    }
}
