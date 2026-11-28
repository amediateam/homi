<?php

namespace App\Http\Controllers\Api\V1\Radars;

use App\Enums\RadarMode;
use App\Enums\RadarMutationKind;
use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Radars\ListRadarsRequest;
use App\Http\Requests\Api\V1\Radars\PatchRadarRequest;
use App\Http\Requests\Api\V1\Radars\StoreRadarRequest;
use App\Http\Requests\Api\V1\Radars\UpdateRadarRequest;
use App\Http\Resources\Api\V1\RadarMutationResource;
use App\Http\Resources\Api\V1\RadarPatchResource;
use App\Http\Resources\Api\V1\RadarResource;
use App\Models\Radar as RadarModel;
use App\Models\User;
use App\Services\Radar\FoundAskPolicy;
use App\Services\Radar\RadarCreateContext;
use App\Services\Radar\RadarHideRuleService;
use App\Services\Radar\RadarPreviews;
use App\Services\Radar\RadarService;
use App\Services\Radars\Radar;
use App\Services\Radars\RadarChange;
use App\Services\Radars\RadarMutation;
use App\Services\Sources\SourceContext;
use Dedoc\Scramble\Attributes\BodyParameter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Gate;

/**
 * HOMI's radars (WP-45; the shapes of WP-13, `meta.source = native`): every write goes through `RadarService`, which
 * holds the switch, the chat check, the per-user lock, the twin and the limit. A radar is looked up only through the
 * caller's own relation and then checked by `RadarPolicy`, so a foreign or unknown id answers the same `404 not_found`
 * with the same queries (SEC-REQ-014); the policy's verdict is thrown as it gives it (`Gate::inspect()->authorize()`),
 * not through `Gate::authorize()`, which the OpenAPI export would document as a `403` these routes never answer.
 *
 * While the switch is off (DEC-51) the four write routes never reach this controller (`EnsureRadarsEnabled`), and the
 * list answers `[]` without a query to a radar table and without a source call; `DELETE` works either way. While
 * `sources.native_stubs` is on, `NativeStubs` answers the stub bodies of WP-13 instead.
 *
 * The list's previews come from `RadarPreviews`: one source round per filter set, shared by users for two minutes,
 * `null` where one could not be computed, never a failed list.
 */
class RadarController extends ApiController
{
    public function __construct(
        private readonly RadarService $radars,
        private readonly RadarHideRuleService $hideRules,
        private readonly FoundAskPolicy $found,
        private readonly RadarPreviews $previews,
    ) {}

    /** `GET /radars`: the radars in creation order; `include=previews` adds each radar's preview. */
    public function index(ListRadarsRequest $request): JsonResponse
    {
        if (! Config::boolean('radar.creation_enabled')) {
            return $this->sourced(RadarResource::collection([]), SourceDriver::Native);
        }

        $user = $this->signedInUser($request);
        /** @var list<RadarModel> $models */
        $models = $user->radars()->orderBy('created_at')->orderBy('id')->get()->all();
        $previews = $request->wantsPreviews() ? $this->previews->forRadars($user, $models, SourceContext::fromRequest($request)) : null;
        $radars = array_map(fn (RadarModel $radar): Radar => $previews === null
            ? Radar::fromModel($radar)
            : Radar::fromModel($radar)->withPreview($previews[(string) $radar->getKey()] ?? null), $models);

        return $this->sourced(RadarResource::collection($radars), SourceDriver::Native);
    }

    /**
     * `POST /radars`: creates a radar, or answers the active radar with the same filters (`existing`, `200`) or
     * switches on a paused one (`reactivated`, `200`). The same filters ignore `posted_days` and the order of keys
     * and lists (BR-APP-012).
     */
    #[BodyParameter('filters', description: 'The filters object of WP-12; any subset of its 25 keys, normalised for a radar.', required: true, type: 'array<string, mixed>')]
    public function store(StoreRadarRequest $request): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $relaxed = $request->validated('relaxed');
        $mutation = RadarMutation::fromService($this->radars->create($this->signedInUser($request), $request->filters(), new RadarCreateContext(
            entry: $request->string('entry')->toString(),
            relaxed: is_string($relaxed) ? $relaxed : null,
            locale: $context->locale,
            currency: $context->currency,
        )));
        $result = new RadarMutationResource($mutation);

        if (in_array($mutation->kind, [RadarMutationKind::Existing, RadarMutationKind::Reactivated], true)) {
            return $this->sourced($result, SourceDriver::Native);
        }

        return $this->sourced($result, SourceDriver::Native, status: 201);
    }

    /** `PUT /radars/{id}`: replaces the filters and keeps `active`. */
    #[BodyParameter('filters', description: 'The filters object of WP-12; any subset of its 25 keys, normalised for a radar.', required: true, type: 'array<string, mixed>')]
    public function update(UpdateRadarRequest $request, string $id): JsonResponse
    {
        $user = $this->signedInUser($request);
        $radar = $this->owned($user, $id, 'update');
        $relaxed = $request->validated('relaxed');
        $context = SourceContext::fromRequest($request);
        $mutation = $this->radars->update($user, $radar, $request->filters(), is_string($relaxed) ? $relaxed : null, $context->locale, $context->currency);

        return $this->sourced(new RadarMutationResource(RadarMutation::fromService($mutation)), SourceDriver::Native);
    }

    /** `PATCH /radars/{id}`: switches on (with `starter`), pauses (with `ask_found`), changes the mode or unhides. */
    public function patch(PatchRadarRequest $request, string $id): JsonResponse
    {
        $user = $this->signedInUser($request);
        $radar = $this->owned($user, $id, 'update');
        $change = $this->change($request, $user, $radar);

        return $this->sourced(new RadarPatchResource($change), SourceDriver::Native);
    }

    /** `DELETE /radars/{id}`: works while the switch is off, so nothing can be left behind. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $this->signedInUser($request);
        $this->radars->delete($user, $this->owned($user, $id, 'delete'));

        return $this->sourced(['ask_found' => $this->found->shouldAsk($user, 'delete')], SourceDriver::Native);
    }

    /** The one change of a `PATCH` body: switch on, pause, the mode or unhide. */
    private function change(PatchRadarRequest $request, User $user, RadarModel $radar): RadarChange
    {
        if ($request->has('active') && $request->boolean('active')) {
            $resumed = $this->radars->setActive($user, $radar, true);

            return new RadarChange(Radar::fromModel($resumed->radar), starter: $resumed->starter->count);
        }

        if ($request->has('active')) {
            $paused = $this->radars->setActive($user, $radar, false);

            return new RadarChange(Radar::fromModel($paused->radar), askFound: $this->found->shouldAsk($user, 'pause'));
        }

        if ($request->has('mode')) {
            return new RadarChange(Radar::fromModel($this->radars->setMode($user, $radar, $request->enum('mode', RadarMode::class) ?? $radar->mode)));
        }

        $this->hideRules->clearAll($radar);

        return new RadarChange(Radar::fromModel($radar));
    }

    /** The caller's radar by id (a ULID in either case), checked by `RadarPolicy`; else `404 not_found`. */
    private function owned(User $user, string $id, string $ability): RadarModel
    {
        $radar = $user->radars()->findOrFail(strtoupper($id));
        Gate::inspect($ability, $radar)->authorize();

        return $radar;
    }
}
