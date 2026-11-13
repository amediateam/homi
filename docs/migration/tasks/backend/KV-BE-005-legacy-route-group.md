# KV-BE-005 — Legacy route group, host binding and the `{detail}` renderer

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-COMPAT-001 |
| Dependencies | KV-BE-001 (draft agreed) |

## Goal

An empty legacy surface exists: `routes/legacy.php` is registered for the legacy hosts only, every response of the
group is bare JSON with `Cache-Control: private, no-store` and no CORS headers, and every error — including unknown
`/api/*` paths and methods on a legacy host — is rendered as `{"detail": "<string>"}`, while `/api/v1/*` keeps the
ADR-0007 envelope. Later tasks only add routes.

## Legacy reference

- Client rules: `detail` used only when it is a string (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:87-97`), empty
  `200` throws (`client.js:99-102`), `204` → `undefined` (`08` §1.4); relative same-origin `/api/*` (`08` §1.1).
- Observed legacy errors: unknown route `404 {"detail":"Not Found"}` (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:13`;
  BR-API-019); validation `422` with an array `detail` (BR-API-018) — replaced by a string (LB-API-022 defect fix).
- Rules BR-API-001, BR-API-017, BR-API-019, BR-API-020; defect fixes LB-API-003, LB-API-022.
- HOMI today: `backend/bootstrap/app.php:18-28` (routing, `then:` hook), `:47-52` (`shouldRenderJsonWhen` for every
  `api/*`, `ApiExceptionRenderer::render`); `backend/app/Http/ApiExceptionRenderer.php:46-49` (wraps every `api/*`);
  `backend/config/cors.php:23` (`paths => ['api/*']`).
- Design: `10` §3.2, §4.6 (registration, hosts), §4.7 (renderer table), §4.2 (arch rules); `17` §3.2 (nginx paths).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (routing, middleware, exceptions) and `.claude/skills/laravel-testing/`.
2. `php artisan make:config legacy --no-interaction` (or create `backend/config/legacy.php`): `enabled`
   (`LEGACY_SURFACE_ENABLED`, default `false`), `app_hosts` (`LEGACY_APP_HOSTS`, CSV), `site_hosts`
   (`LEGACY_SITE_HOSTS`, CSV); local defaults documented in the PR (`kvadro-app.homi.loc`, `kvadro.homi.loc`).
3. Create `backend/routes/legacy.php` (empty groups: `api` prefix for the API, no prefix for `/media` and `/call`) and
   register it in `bootstrap/app.php` `then:` when `config('legacy.enabled')`:
   `Route::middleware('legacy')->prefix('api')->name('legacy.')->group(...)` plus the unprefixed group.
4. `php artisan make:middleware Legacy/EnsureLegacyHost --no-interaction` (host ∉ app/site hosts → throw
   `NotFoundHttpException`, rendered as legacy `404`), `Legacy/LegacyResponseHeaders` (`Cache-Control: private,
   no-store`, `Content-Type: application/json` for JSON, strip any `Access-Control-*`), and register the group
   `legacy` = [`EnsureLegacyHost`, `LegacyResponseHeaders`, `SubstituteBindings`] in `withMiddleware`. `AssignRequestId`
   is already global (prepended) and stays.
5. Narrow `backend/config/cors.php` `paths` to `['api/v1/*']` (SEC-REQ-032) and keep the v1 tests green.
6. `php artisan make:class Http/LegacyExceptionRenderer --no-interaction` with `render(Throwable, Request): ?JsonResponse`
   implementing the `10` §4.7 table: `LegacyValidationException`/`ValidationException` → `422 invalid_<first field>`;
   `AuthenticationException` → `401 unauthorized`; `InitDataExpired` → `401 auth_expired`; `AccessDenied` → `403
   <reason>`; `ModelNotFoundException`/`NotFoundHttpException` → `404 Not Found`; `MethodNotAllowedHttpException` →
   `405 Method Not Allowed`; `NoChatException` → `409 no_chat`; `RadarLimitReached` → `409 subscription_limit`;
   `ThrottleRequestsException` → `429 rate_limited` + its `Retry-After`; anything else → `500 internal_error` (details
   only in logs with the request id). Applies when the matched route carries the `legacy` group, or, with no matched
   route, when the host is a legacy host and the path is `api/*`, `media/*` or `call/*`. Register it in `withExceptions`
   **before** `ApiExceptionRenderer`, and make `ApiExceptionRenderer::isApiRequest()` return false for those requests.
7. Create exception classes with `php artisan make:exception --no-interaction`: `Legacy/LegacyValidationException`
   (carries the field code), `Access/AccessDenied` (carries `AccessState`), `Identity/InitDataExpired`; `NoChatException`
   and `RadarLimitReached` are created by M4 — the renderer matches them by an interface `LegacyDetailException`
   (`legacyStatus()`, `legacyDetail()`) so M4 needs no renderer change.
8. `php artisan make:controller Legacy/LegacyController --no-interaction` (abstract): `json(array $body, int $status =
   200): JsonResponse` refuses an empty body with status 200 (throws `LogicException` in tests), `noContent()` for the
   BR-API-020 routes.
9. Arch tests `backend/tests/Arch/LegacySurfaceTest.php`: `App\Http\Controllers\Legacy` and
   `App\Http\Serializers\Legacy` are not used by `App\Http\Controllers\Api\V1`, `App\Services`, `App\Domain`, `App\Jobs`;
   `Api\V1` is not used by `Legacy`.
10. Pint, PHPStan, tests. Manual checks in a browser need the local legacy host aliases `kvadro.homi.loc` and
    `kvadro-app.homi.loc` (`17` §3.1, infrastructure track); automated tests set the `Host` header and need nothing.

## Files

- `backend/routes/legacy.php`, `backend/config/legacy.php` (new)
- `backend/app/Http/Middleware/Legacy/{EnsureLegacyHost,LegacyResponseHeaders}.php` (new)
- `backend/app/Http/LegacyExceptionRenderer.php`, `backend/app/Http/Controllers/Legacy/LegacyController.php` (new)
- `backend/app/Exceptions/Legacy/{LegacyValidationException,LegacyDetailException}.php`,
  `backend/app/Exceptions/Access/AccessDenied.php`, `backend/app/Exceptions/Identity/InitDataExpired.php` (new)
- `backend/bootstrap/app.php`, `backend/app/Http/ApiExceptionRenderer.php`, `backend/config/cors.php`
- `backend/tests/Feature/LegacyApi/{LegacyRendererTest,LegacyHostTest,LegacyHeadersTest}.php`,
  `backend/tests/Arch/LegacySurfaceTest.php` (new)
- `backend/.env.example` (three keys, separate shared-file PR)

## API contract

Group-wide: bare JSON; error body exactly `{"detail": "<string>"}` with the statuses above; `Cache-Control: private,
no-store`; no `Access-Control-Allow-Origin`. Unknown path on a legacy host (`GET /api/does-not-exist`) →
`404 {"detail":"Not Found"}`; wrong method on an existing legacy path → `405 {"detail":"Method Not Allowed"}`; any
legacy path on a non-legacy host (`api.*`, `hook.*`) → `404` (legacy body on legacy paths, envelope under `/api/v1`).
`/api/v1/*` bodies unchanged (`{"success": false, "message": …}`).

## Business rules

Kept: BR-API-001, BR-API-017, BR-API-019, BR-API-020. Defect fixes asserted now (APPROVED by policy): LB-API-003 (no
empty `200`), LB-API-022 (`422` with a string `detail`).

## Acceptance criteria

- With `LEGACY_SURFACE_ENABLED=false` no legacy route is registered (`route:list` unchanged) and all v1 tests pass.
- With it enabled, each row of the renderer table produces its status and body on a test-only route of the group.
- `ApiExceptionRenderer` never renders a legacy request; `/api/v1/media/unknown` still returns the envelope `404`.
- No legacy response carries `Access-Control-Allow-Origin`; every one carries `Cache-Control: private, no-store`.
- The arch test passes and fails when a v1 controller imports a legacy serializer (verified once locally).

## Tests

`backend/tests/Feature/LegacyApi/LegacyRendererTest.php` (test routes registered in `beforeEach` under
`/api/__selftest/*` with the `legacy` middleware — never `/api/__probe/*`, reserved by the legacy harness):
- dataset over every exception → status + exact JSON body; `it('adds Retry-After to rate_limited')`.
- `it('renders unknown api paths on a legacy host as Not Found')`, `it('renders 405 for a wrong method')`.
- `it('never leaks exception messages in 500 bodies')` with `app.debug=true`.
`LegacyHostTest.php`: legacy path on `api.homi.loc` → `404`; on `kvadro-app.homi.loc` → reaches the route.
`LegacyHeadersTest.php`: no-store, no CORS on a preflight from `https://evil.example` (SEC-REQ-032).
`tests/Arch/LegacySurfaceTest.php`. Contract harness KV-QA-004 runs its self-tests against this group.

## Edge cases

- `HEAD` requests on GET routes behave like GET without a body.
- A request with `Accept: text/html` to a legacy path still gets JSON (the old client sends no `Accept`).
- Requests to `/media/*` must not be rendered as JSON `200`; their `404` body is decided by KV-BE-027.
- Trailing slash `/api/meta/` → `404` like legacy (no redirect).

## Security

SEC-REQ-032 (no CORS on the same-origin surface), SEC-REQ-033 (`no-store`), SEC-REQ-047 (500 details only in logs, with
the request id), host binding as defence against cross-host use; 500 bodies never contain stack traces or SQL.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; env keys announced in the PR description and
added to `backend/.env.example` in a separate PR; `docs/infrastructure/local-development.md` notes the two local hosts
once the infrastructure side exists.
