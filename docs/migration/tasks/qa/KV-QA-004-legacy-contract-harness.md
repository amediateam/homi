# KV-QA-004 — Contract test harness for the legacy `/api/*` surface

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | M |
| Feature IDs | F-COMPAT-001, F-COMPAT-002 (and every API-bearing feature listed in KV-QA-002) |
| Dependencies | KV-QA-002, KV-QA-003; the compatibility route-group ADR (CF-001 option A, CF-002 option A) for the cases to turn from `todo` into real tests |

## Goal

One fixture-driven Pest suite checks HOMI's legacy surface against the golden fixtures: a case runs as soon as a route
with its method and path is registered and is reported as `todo` until then, so the denominator of 34 endpoints is
visible from day one.

## Legacy reference

- Protocol rules: `08` §1.1–§1.8; the list of checks in `15` §2.4.
- Client behaviour that makes the rules strict: `$KVADRO_ROOT/demo/app/src/lib/api/client.js:74-106` (headers, empty
  `200` throws, string `detail` only), `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:10-66` (query building with
  `URLSearchParams`).
- Fix decisions: `09` §4.3 (LB-API-001, LB-API-003, LB-API-004, LB-API-009, LB-API-015 …), `09` §4.2 (DEV-001,
  DEV-002 for statuses).

## Implementation

1. Read `15` §1.4, §2.4 and `.claude/skills/testing-best-practices/`.
2. `backend/tests/Support/LegacyApi/LegacyClient.php` (trait for Pest): `legacy()->as($user)->get($path, $query)`
   builds the query string like `URLSearchParams` (repeated keys via append, `+` for spaces, key order kept) and sends
   `Authorization: tma <signed>` from `InitDataFactory`; `post()`, `put()`, `patch()`, `delete()` add
   `Content-Type: application/json` only when a body is given; `anonymous()`; `withRawAuthorization('tma ')`.
3. Response assertions (macros on `TestResponse`): `assertLegacyShape($model)` (ShapeMatcher), `assertLegacyError
   ($status, $detail)`, `assertNoEnvelope()`, `assertJsonBodyWhen2xx()` (no empty `200`), `assertIntegerIds($paths)`,
   `assertUtcZ($paths)`, `assertNoStore()`, `assertNoCors()`.
4. `backend/tests/Feature/LegacyApi/LegacyContractTest.php`: one dataset per endpoint built from `index.json`; each
   case sends `legacy.input` (or `new.input`), compares per `compare.mode`, and resolves the expectation by `15` §1.4
   (approved DEV → new; proposed DEV → `todo`; defect fix → fixed; else legacy). A case whose method + path matches no
   registered route is reported as `todo('route not built: API-NNN')`.
5. `backend/tests/Feature/LegacyApi/ContractCoverageTest.php`: every endpoint of `docs/migration/data/api-inventory.json`
   has ≥ 1 case; prints implemented / todo / total per endpoint to the test output.
6. Self-tests with routes registered only inside the test under `/api/__selftest/*` (never `/api/__probe/*`, reserved
   by the legacy harness, `08` §4.2): the harness must fail on a missing strict key, a string listing id, a `null`
   array, an envelope body, an empty `200`, an array `detail`, a `204` on a `report` route, an offset timestamp.
7. Document in the PR how a backend task turns cases on (register the route; no test edits needed) and how to add a
   case (a new fixture file).

## Files

- `backend/tests/Support/LegacyApi/LegacyClient.php` (new)
- `backend/tests/Support/LegacyApi/LegacyAssertions.php` (new; response macros)
- `backend/tests/Feature/LegacyApi/{LegacyContractTest,ContractCoverageTest,HarnessSelfTest}.php` (new)
- `backend/tests/Pest.php` (bind the trait to `Feature/LegacyApi`)

## API contract

All 34 legacy endpoints as fixed by KV-QA-002; global rules of `15` §2.4.

## Business rules

BR-API-001 (same-origin relative `/api/*`), BR-API-017 … BR-API-023, BR-API-025 (repeated keys), BR-API-151. Apply
the defect fixes of `09` §4.3 that change statuses or shapes; DEV rows per their state.

## Acceptance criteria

- `HarnessSelfTest` proves each failure mode listed in step 6.
- `LegacyContractTest` lists every fixture case; with no legacy routes registered, all are `todo` and the run is green.
- Registering a route that violates its fixture makes the suite fail with a message naming API-NNN and the violated
  rule.
- `ContractCoverageTest` reports 34/34 endpoints covered by fixtures.

## Tests

The three files above; plus, as a demonstration, one real case wired to a test-only route that returns the API-003
fixture body (`GET /api/bot` shape, no auth).

## Edge cases

- `?preview=1` on API-008 has its own minimum shape (LB-API-012).
- `DELETE /api/subscriptions/:id` may answer `200 {ask_found}` or `204` (API-022): the fixture allows both.
- `POST /api/events` must accept unknown fields and answer `204` (API-034).
- Query values `undefined` sent by the legacy client for missing keys (`08` §1.7) must be handled as documented, not
  crash.

## Security

- The harness never accepts `initData` from query or body; tests for that live in KV-QA-015.
- No real tokens; `InitDataFactory` with the synthetic token only.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR
reviewed by the other developer.
