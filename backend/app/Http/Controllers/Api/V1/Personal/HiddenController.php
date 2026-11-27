<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\HiddenOverviewResource;
use App\Services\Personal\BlockedAuthorService;
use App\Services\Personal\HiddenService;
use App\Services\Sources\SourceContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * «Скрытое» in HOMI's tables (WP-44; the shapes of WP-13). A blocked author is removed by its entry id, looked up only
 * through the caller's own relation and then checked by `BlockedAuthorPolicy`, so a foreign or unknown id answers the
 * same `404 not_found` with the same queries (SEC-REQ-014). The policy's verdict is thrown as it gives it
 * (`Gate::inspect()->authorize()`: a refusal is `404`), not through `Gate::authorize()`, which the OpenAPI export would
 * document as a `403` this route never answers. While `sources.native_stubs` is on, `NativeStubs` answers the stub
 * bodies of WP-13 instead (`hidden/default.json`, the scenario `empty`).
 */
class HiddenController extends ApiController
{
    public function __construct(private readonly HiddenService $hidden, private readonly BlockedAuthorService $authors) {}

    /** `GET /hidden`: hidden listings, newest first, and blocked authors. */
    public function index(Request $request): JsonResponse
    {
        $overview = $this->hidden->overview($this->signedInUser($request), SourceContext::fromRequest($request));

        return $this->sourced(new HiddenOverviewResource($overview), SourceDriver::Native);
    }

    /** `DELETE /hidden/authors/{id}`: removes one blocked author by entry id. */
    public function destroyAuthor(Request $request, string $id): Response
    {
        $entry = $this->signedInUser($request)->blockedAuthors()->findOrFail(strtoupper($id));
        Gate::inspect('delete', $entry)->authorize();
        $this->authors->removeEntry($entry);

        return $this->noContent();
    }

    /** `DELETE /hidden`: clears hidden listings and blocked authors of the caller. */
    public function destroy(Request $request): Response
    {
        $this->hidden->clear($this->signedInUser($request));

        return $this->noContent();
    }
}
