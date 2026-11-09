# KV-FE-022 — Contract mocks from the golden fixtures

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-COMPAT-001 |
| Dependencies | KV-FE-021 (transport interface), KV-QA-002 (golden fixtures in `backend/tests/Fixtures/Legacy/`); used by every FE-2 task, KV-FE-010 (E2E interception), KV-FE-170, KV-FE-171 |

## Goal

The new Mini App can run and be tested without a backend: a `mockTransport` serves every legacy endpoint from the
KV-QA-002 golden fixtures, with named scenarios that reproduce the legacy parity states (so the KV-QA-019 baselines can
be re-captured from the new app) and fault injection for every error the screens handle. Development uses it behind a
build-time switch; E2E uses the same fixtures through request interception.

## Legacy reference

- Legacy mocks (read-only, as the scenario catalogue): `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs` (43 scenarios,
  incl. `feed`, `no-telegram`, `no-access-403`, `x-feed-error`, `x-feed-empty`, `listing-open`,
  `listing-post-deleted`, `tab-favorites`, `x-history`, `tab-radar`, `radar-sheet`, `found-pause`, `tab-settings`,
  `settings-hidden`, `listing-hide`), `mocks-filters.mjs` (36, incl. 500 and 403 on page 2, `:81-82`), `gl-parity.mjs`
  (16); harness design `$KVADRO_ROOT/demo/app/tools/parity/parity.mjs:32-89` (frozen `Date` and `Math.random`).
- Fixture format and location: KV-QA-002 (`backend/tests/Fixtures/Legacy/index.json` endpoint → method, path, files,
  models; `api/API-NNN/*.json` cases with `source` = `contract | mock`, `new.deviation`, `fix`; sanitised values:
  phones `+998000000000` / `+998 00 000 00 00`, channel `example_channel`, photos `/media/1/10.jpg?e=0&s=` + 32 zeros).
- Strategy: `15` §1.2 (comparison chain), §2.5 (fault-injection scenarios stay mock-only and become E2E cases), §2.8
  (visual baselines), `13` §2 ("M2 contracts can start early with mocks").

## Implementation

1. `frontend/app/lib/api/mockTransport.ts` implementing the transport interface of KV-FE-021: resolves `(method, path,
   query)` to a fixture case through `index.json`; default case = the positive one; unknown routes → `404
   {"detail":"Not Found"}` (legacy unknown-route answer, `08` §1.5).
2. Scenario registry `frontend/app/lib/api/mockScenarios.ts`: a scenario = a map of endpoint → case + optional latency
   + optional fault; names follow the legacy parity scenarios listed above so a baseline state is one switch away.
   Faults: `offline`, `timeout` (never resolves within 15 s — fake timers in tests), `status(403, reason)` for the five
   reasons, `status(401, 'auth_expired')`, `status(500)`, `status(204)` (flow), `status(409, 'no_chat')`,
   `status(409)` (limit), `status(404)` (listing), `status(422)`, page-2 failures.
3. Fixture loading: at build time (dev only) a small generator copies the needed JSON from
   `backend/tests/Fixtures/Legacy/` into `frontend/app/lib/api/__fixtures__/` (gitignored) so the app bundle never
   imports from `backend/`; tests read the originals through `@homi/testing` (KV-FE-010).
4. Switch: `NEXT_PUBLIC_KVADRO_MOCKS=1` enables the mock transport and a dev-only scenario picker (`?mock=<scenario>`
   read once at boot); `next build` fails if the variable is set for a production build (a check in
   `next.config.ts`). Announce the new variable for `frontend/app/.env.example` (shared file, separate small PR).
5. Images: in mock mode, `/media/…` URLs are rewritten to `frontend/app/public/dev/placeholder-{800,480}.jpg`
   (synthetic images) so no real photo is ever requested.
6. Fake Telegram in the browser: in mock mode the dev emulator of KV-FE-038 (or the `@homi/testing` fake) provides
   `initData`; mocks do not check signatures.
7. Deterministic data: frozen clock and seeded random in mock mode, as the legacy harness does.
8. Drift guard: a test asserts every API id of `index.json` is served and every model validates (reusing KV-QA-002's
   shapes), so a fixture change breaks the mocks loudly.

## States and texts

| Scenario family | What it shows |
| --------------- | ------------- |
| `feed`, `feed-dark-uz`, `feed-uzs-en-lite` | populated feed (SCR-007) in ru light / uz dark / en UZS lite |
| `x-feed-error`, `x-feed-empty` | error and empty states (SCR-008, SCR-009) |
| `no-telegram`, `no-access-403` | SCR-002, SCR-003 (per reason) |
| `listing-open`, `listing-post-deleted`, `listing-market`, `listing-actions`, `listing-hide` | listing states (SCR-018…SCR-023, SCR-042) |
| `tab-favorites`, `x-history`, `tab-radar`, `radar-sheet`, `found-pause`, `tab-settings`, `settings-hidden` | saved, radar and settings states |
| faults | offline, timeout, 401, 403 × 5, 404, 409 × 2, 422, 500, 204 flow, page-2 failure |

## Interaction

Dev-only scenario picker (a small floating panel in development builds) to switch scenarios and faults; absent from
production bundles.

## Telegram integration

Relies on the fake Telegram of KV-FE-038 / `@homi/testing` for `initData`, BackButton and dialogs in mock mode.

## Storage and analytics

Mock mode intercepts API-034 (`POST /api/events`) and records events in memory for E2E assertions; PostHog stays
disabled in mock mode.

## Files

- `frontend/app/lib/api/{mockTransport,mockScenarios}.ts`, `frontend/app/scripts/copy-fixtures.mjs` (new)
- `frontend/app/lib/api/__fixtures__/` (generated, gitignored), `frontend/app/public/dev/placeholder-*.jpg` (new)
- `frontend/app/next.config.ts` (production guard), `frontend/app/.env.example` (separate PR)
- `frontend/app/tests/api/mocks.test.ts` (after KV-FE-010)

## API contract

Serves API-001…API-034 exactly as the fixtures describe (`08` §2); RES-001/RES-002 replaced by placeholders in mock
mode.

## Business rules

Fixtures already encode the expected behaviour per `15` §1.4 (legacy, `fix:LB-…`, `DEV-NNN:PROPOSED`); the mocks serve
the `legacy` / fixed variant and expose the DEV variant only when the matching flag is on.

## Acceptance criteria

- With `NEXT_PUBLIC_KVADRO_MOCKS=1`, the app boots to each named scenario without a backend.
- Every API id in `index.json` is served; every fault type is reachable from a test.
- A production build with the variable set fails.
- No fixture content outside the sanitised set appears in the bundle (no `+998` number other than the placeholders).

## Tests

`mocks.test.ts`: coverage of all API ids; scenario resolution; each fault maps to the right `ApiFailure` through the
real client; deterministic clock; production guard (config unit test).

## Edge cases

- A fixture missing for a new endpoint variant: the mock answers `501 {"detail":"mock_missing"}` and the test suite
  lists it (never silently `200`).
- Query-string order differences: matching uses parsed parameters, not raw strings, except the prefetch-cache test that
  checks the exact order (KV-FE-019).

## Security

Only sanitised synthetic data (`15` §1.7); mock mode impossible in production builds; no real initData stored.

## Definition of done

`make ci-frontend` green; mock tests green (after KV-FE-010); scenario list documented in the file header; PR reviewed
by the other developer.
