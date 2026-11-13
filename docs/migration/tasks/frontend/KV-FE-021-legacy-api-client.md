# KV-FE-021 — Legacy-contract API client

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-COMPAT-001, F-COMPAT-002, F-ACCESS-001 |
| Dependencies | KV-FE-004 (FD-2 transport decision and the port), KV-FE-024 (initData source); KV-BE-012, KV-BE-013 (legacy OpenAPI); fixes LB-APP-005, LB-APP-006, LB-APP-022, LB-APP-047 (client side); DEV-001, DEV-002 `PROPOSED` |

## Goal

The Mini App talks to the backend through one typed port, `KvadroApi`, with one method per legacy endpoint
(API-001…API-034) and the legacy dialect implemented once in a `legacyTransport`: `Authorization: tma <initData>`,
15 s timeout combined with caller `AbortSignal`s, `{detail}` errors read only when they are strings, `204` →
`undefined`, network and timeout as status 0. Responses are normalised (missing optional arrays → empty, non-object
flow → `null`) and errors become typed results, so no screen ever branches on raw status codes.

## Legacy reference

- Client: `$KVADRO_ROOT/demo/app/src/lib/api/client.js:1-111` — `ApiError(status, detail)`; `detail` only if
  `typeof body.detail === 'string'`; status 0 with `'timeout'` or `'network'`; `REQUEST_TIMEOUT_MS = 15000`; external
  signal merged; `AbortError` re-thrown when the caller aborted; `Content-Type: application/json` only with a body;
  `204` → `undefined`; any other 2xx parsed as JSON (an empty `200` throws).
- Endpoint modules: `$KVADRO_ROOT/demo/app/src/lib/api/{meta,feed,listings,subscriptions,user,events}.js`; `GET
  /api/bot` with plain `fetch` and **no** `Authorization` (`meta.js:15-23`, API-003); path ids interpolated unencoded
  (`08` §1.3).
- Protocol: `08` §1.1–§1.8 (models `ListingPreview`, `ListingDetails`, `FeedPage`, `Subscription`,
  `SubscriptionMutationResult`, `MetaResponse`, `CityMeta`, `CityStats`, settings, hidden, map, flow); per-endpoint
  rows `08` §2.
- TMA-007 (`tma` header on every call), TMA-009 (initData kept out of logs and analytics).
- Defects: LB-APP-005 (`result.relaxed[0]` read without a check → false «Не получилось сохранить»), LB-APP-006
  (`204` flow → crash), LB-APP-022 (favourites/history cursor loop), LB-APP-047 (no `401` branch). Deviations: DEV-001
  (any `403` → access screen), DEV-002 (`auth_expired`).
- Target: `10` §5.6 (15 s timeout, `AbortSignal`, request id propagation), `12` §1 rule 3 (legacy models in
  `@homi/types/legacy`).

## Implementation

1. `frontend/packages/types/src/legacy.ts` (export `@homi/types/legacy`): TypeScript types for every model of `08`
   §1.8 with the strict keys (`!`) required and the "unread" fields omitted; enums as string unions plus `string` where
   the server may add values (`median_tone`, `nearby[].kind`, `subscription.mode` — handled by enum tables).
2. `frontend/app/lib/api/errors.ts`: `ApiFailure` union — `Offline`, `Timeout`, `Aborted`, `Unauthorized(detail)`,
   `AccessDenied(reason)` (403 with a string `detail`; unknown → `private`), `NotFound`, `NoChat` (409 `no_chat`),
   `Limit` (other 409), `Validation(detail)` (422), `RateLimited` (429), `Server(status)`.
3. `frontend/app/lib/api/legacyTransport.ts`: `request(method, path, {query, body, signal, auth = true})` — same-origin
   relative URLs; header `Authorization: tma ${initData}` when `auth` (never for API-003); timeout 15 000 ms merged with
   the caller's signal; status mapping to `ApiFailure`; JSON parse failure of a 2xx (empty body) → `Server(200)` (legacy
   threw); request id header passed through if the server sends `X-Request-Id`.
4. `frontend/app/lib/api/kvadroApi.ts`: the port of KV-FE-004 — `meta()`, `cities()`, `bot()`, `feed(filters, sort,
   cursor)`, `feedCount`, `feedFlow`, `map`, `listing(id, {preview})`, `callLink(id)`, `translate(id)`, `favorite(id)`,
   `hide/unhide`, `blockAuthor/unblockAuthor`, `report(id, reason)`, `share(id)`, subscriptions (list, create, replace,
   patch, delete, relax), `settings()`, `saveSettings(partial)`, hidden (list, remove one, remove all), `favorites()`,
   `history()`, `clearHistory()`, `found(answer, trigger)`, `foundWhere(where)`, `event(name, props)` — URLs built with
   KV-FE-019; ids validated as positive integers below 2^53 before interpolation.
5. Normalisers (`normalize.ts`, hand-written guards by default; `zod` only if KV-FE-005 entry 11 is approved):
   `SubscriptionMutationResult` → `options ?? []`, `relaxed ?? []` (LB-APP-005 fix); flow → `null` unless an object with
   numeric `week` and `days > 0` (LB-APP-006 fix); favourites/history treated as single-page lists — `next_cursor` is
   ignored and never requested (LB-APP-022 fix, option A of FD-2); arrays never `null`.
6. `401` handling (LB-APP-047 fix): every `Unauthorized` is surfaced to the bootstrap, which shows the session-expired
   state of KV-FE-036; with `dev002AuthExpired` on, `detail = auth_expired` is distinguished in the report only (the UI
   is the same).
7. DEV-001 (`dev001AnyForbiddenShowsAccess`): when on, an `AccessDenied` from any endpoint is raised to the access
   boundary (KV-FE-042); when off, only `meta()` does that and lists show their inline «Нет доступа» (legacy).
8. Logging hygiene: `ApiFailure` objects carry method, path template (`/api/listings/:id`), status and `detail` — never
   headers, query strings or initData (TMA-009, SEC-REQ-047).

## States and texts

n/a — transport. The texts for each failure live in the screens (`error.offline`, `common.loadFailed`,
`common.noAccess`, `listing.loadFailed`, `toast.noChat`, `toast.subLimit`, `common.saveFailed`).

## Interaction

n/a.

## Telegram integration

TMA-006 (initData provider injected from KV-FE-024), TMA-007 (`tma` header), TMA-009 (no initData outside the header).

## Storage and analytics

No storage. No analytics from the transport itself; `event()` posts API-034 with `keepalive: true` (used by KV-FE-034).

## Files

- `frontend/packages/types/src/legacy.ts`, `frontend/packages/types/package.json` (export) (new/changed)
- `frontend/app/lib/api/{errors,legacyTransport,kvadroApi,normalize}.ts` (new)
- `frontend/app/lib/deviations.ts` (flags `dev001AnyForbiddenShowsAccess`, `dev002AuthExpired`)
- `frontend/app/tests/api/*.test.ts` (after KV-FE-010)

## API contract

All of API-001…API-034 as specified in `08` §2 (methods, paths, bodies, responses, errors); API-003 anonymous; API-010
bodiless `POST`; API-016 body `{"reason": "rented"|"agent"|"wrong_data"|"fraud"}`; API-019 body `{filters, entry,
relaxed?}`; API-021 exactly one of `{active}`, `{mode}`, `{unhide: true}`; API-034 `{name, …props}`.

## Business rules

- Kept: F-COMPAT-001 dialect; F-COMPAT-002 request budget (15 s, no automatic retries except meta in KV-FE-040 and the
  single `no_chat` retry in KV-FE-030).
- LB-APP-005, LB-APP-006, LB-APP-022, LB-APP-047 fixes `APPROVED` (policy).
- DEV-001, DEV-002 `PROPOSED` (flags; `todo` tests).

## Acceptance criteria

- Against the contract mocks of KV-FE-022, every method returns the fixture's typed value; every documented error
  status maps to the right `ApiFailure`.
- A `403` with `{"detail": ["x"]}` (array) maps to `AccessDenied('private')`; a `422` Pydantic array body maps to
  `Validation(null)`.
- `bot()` sends no `Authorization` header; every other call sends `tma <initData>`.
- A caller abort yields `Aborted` (not `Offline`); 15 s without an answer yields `Timeout`.
- No log line or error object produced by the client contains the initData string (test with a marker value).

## Tests

Unit with a fake `fetch`: header presence per method; timeout (fake timers); abort; `204`; empty `200`; `detail`
string vs array vs missing; each status → failure type; normalisers (missing `relaxed`, `options`, `204` flow, `null`
arrays); id validation (`0`, `-1`, `1.5`, `2^53`).

## Edge cases

- Server sends `next_cursor` non-null for favourites (Q-APP-009): ignored, no loop.
- `GET /api/bot` non-2xx: fallback `{username: null, support: null}` (legacy).
- A `200` with an HTML body (proxy error page): `Server(200)`.

## Security

SEC-REQ-003 (initData only in the `Authorization` header), SEC-REQ-005 (`401` = authentication only), SEC-REQ-047 (no
initData, query strings or headers in logs), SEC-REQ-019 (URLs returned by the server are not opened here — the link
layer of KV-FE-029 checks them).

## Definition of done

`make ci-frontend` green; unit tests green against the fixtures (after KV-FE-010); port documented in KV-FE-004's note;
PR reviewed by the other developer.
