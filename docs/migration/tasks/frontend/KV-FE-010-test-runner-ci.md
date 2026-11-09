# KV-FE-010 — Test runner and frontend CI wiring

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval — new npm dependencies, KV-FE-005 entries 9–10) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4; landing tests also S2) |
| Feature IDs | Technical migration task (HANDOFF T8 gate): every frontend feature needs unit and E2E evidence for gate G8 (`15` §4.1, §4.6) |
| Dependencies | KV-FE-005 (approval of Vitest + Testing Library + jsdom and Playwright, or the Pest browser plugin chosen by KV-QA-010); DEC-23 |

## Goal

The Next apps and the shared packages have a test runner: Vitest with Testing Library for unit and component tests in
every workspace package and app, and Playwright with a fake Telegram for E2E of the Mini App and the landing. `make
ci-frontend` and `frontend.yml` run the unit tests on every PR; E2E runs nightly and before a release (`15` §5.4).

## Legacy reference

- Legacy harness ideas to port (read-only): the fake `window.Telegram.WebApp`, frozen `Math.random` and `Date`, and
  request interception of `/api/*` and `/media/*` (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:7-60`,
  `$KVADRO_ROOT/demo/app/tools/parity/parity.mjs:32-89`); viewport 390 × 844, DPR 1, touch.
- Strategy: `15` §2.7 (E2E for the new clients), §2.8 (visual), §2.14 (tools that need approval), §5.4 (CI matrix:
  frontend unit on PR, E2E nightly and pre-release), §5.5 (flaky-test policy).
- HOMI today: `.github/workflows/frontend.yml` (install, lint, typecheck, build), `Makefile` target `ci-frontend`,
  `frontend/package.json` scripts; no test setup (`CLAUDE.md`).
- Next guides: `frontend/app/node_modules/next/dist/docs/01-app/02-guides/testing/{vitest,playwright}.md`.

## Implementation

1. Read the two Next testing guides; follow their config shape for App Router projects (Client Components only in
   unit tests; async Server Components only in E2E).
2. Root dev dependencies in `frontend/package.json` (after approval): `vitest`, `@testing-library/react`,
   `@testing-library/dom`, `jsdom`, `@playwright/test`. Pin exact versions; commit `pnpm-lock.yaml`.
3. `vitest.workspace.ts` (or the current Vitest projects syntax) at `frontend/` covering `packages/*`, `app`, `landing`,
   `arm`; `environment: 'jsdom'` for components, `node` for pure packages; `TZ=UTC` forced in the config, plus a second
   CI run with `TZ=Asia/Tashkent` for `@homi/utils` (`15` §3.10 #11).
4. Shared test helpers in `frontend/packages/testing/` (new workspace package `@homi/testing`, dev only):
   `fakeTelegram({version, platform, initData, colorScheme, themeParams})` that installs a `window.Telegram.WebApp`
   double with `BackButton`, `SettingsButton`, `HapticFeedback`, `showConfirm`, `openLink`, `openTelegramLink`,
   `shareMessage`, `requestWriteAccess`, `LocationManager`, `DeviceStorage`, `checkHomeScreenStatus`, and records every
   call; `freezeClock(isoUtc)`; `fixture(apiId, case)` reading the KV-QA-002 golden fixtures from
   `backend/tests/Fixtures/Legacy/`.
5. Playwright config `frontend/playwright.config.ts`: projects `miniapp` (390 × 844, mobile, touch, `ru-RU`), `landing-
   desktop` (1440 × 900), `landing-phone` (390 × 844, coarse pointer); base URLs from env (`https://app.homi.loc`,
   `https://homi.loc`); an init script that installs the fake Telegram with a synthetic initData; route interception
   that serves the contract mocks of KV-FE-022; external hosts (`telegram.org`, PostHog, OSM) blocked.
6. Scripts: `test` (`vitest run`), `test:watch`, `test:e2e` (`playwright test`) in `frontend/package.json`; per-package
   `test` scripts so `pnpm -r test` works.
7. CI: add a `Unit tests` step after `Typecheck` in `.github/workflows/frontend.yml`; add a nightly workflow
   `frontend-e2e.yml` (schedule + `workflow_dispatch`) that installs Playwright browsers and runs `test:e2e` against a
   `next build && next start` of each app with mocks; keep `permissions: contents: read` and pinned action SHAs.
8. `Makefile` `ci-frontend`: append `&& pnpm -r test`. Quarantine: a `@flaky` tag excluded from PR runs and listed in
   the nightly report (`15` §5.5).
9. First tests: a smoke test per package (`@homi/utils` `formatPrice` existing behaviour) and one E2E that loads the
   blank `(miniapp)` route with the fake Telegram and asserts no console error.

## States and texts

n/a — tooling.

## Interaction

n/a.

## Telegram integration

The fake implements the TMA surface used by the app (TMA-004…TMA-044) with version gating by the `version` option
(TMA-042), so tests can run a client as Telegram 6.0, 7.7, 8.0 or 9.0.

## Storage and analytics

The fake `DeviceStorage` and `localStorage` start empty per test; PostHog and `/api/events` are intercepted and
recorded, never sent.

## Files

- `frontend/package.json`, `frontend/pnpm-lock.yaml` (dev dependencies, scripts)
- `frontend/vitest.workspace.ts`, `frontend/playwright.config.ts` (new)
- `frontend/packages/testing/{package.json,src/index.ts,src/fakeTelegram.ts,src/clock.ts,src/fixtures.ts}` (new)
- `.github/workflows/frontend.yml` (unit step), `.github/workflows/frontend-e2e.yml` (new), `Makefile` (`ci-frontend`)

## API contract

n/a. Fixtures are read from KV-QA-002 output, unchanged.

## Business rules

n/a.

## Acceptance criteria

- `make ci-frontend` runs lint, typecheck, build and unit tests and fails when a unit test fails.
- The nightly E2E workflow runs the blank-route smoke test green and uploads its traces on failure.
- `fakeTelegram` refuses calls that the configured version does not support (same gates as TMA-042), so a missing
  version gate in app code fails a test.
- No test reaches `telegram.org`, PostHog, OSM or a production host (blocked hosts assert).

## Tests

The runner's own self-tests: `fakeTelegram` gate table (6.1, 6.2, 6.9, 7.0, 7.7, 8.0, 9.0), `freezeClock` in both
`TZ` values, `fixture()` failing loudly on an unknown API id.

## Edge cases

- CI Linux fonts differ from macOS: screenshots are compared only on the CI image (`15` §2.8).
- Node 26 + jsdom incompatibility at approval time: fall back to `happy-dom` only with a new approval line.
- Playwright browser download in CI: cached by lockfile hash; never downloaded inside `node_modules` of the legacy tree.

## Security

SEC-REQ-049 (lockfile, audit gate, install scripts disabled), synthetic initData only (SEC-REQ-034), no secrets in
workflow files; `permissions: contents: read`.

## Definition of done

Runner merged; `make ci-frontend` green with tests; nightly E2E green once; tasks that list tests "after KV-FE-010"
add theirs from now on; PR reviewed by the other developer.
