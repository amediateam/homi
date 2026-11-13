# WP-03 — Dependencies and test tooling

| Field | Value |
| ----- | ----- |
| Stage | 0 |
| Status | TODO |
| Depends on | WP-01 (ADR-0019 names the UI stack; the PR size rule is agreed) |
| Size | about 900 changed lines without `pnpm-lock.yaml`, M |
| Behaviour reference | `25` §9, §10; `24` §8.1 (DEC-49); tasks `tasks/frontend/KV-FE-005-dependency-approvals.md` (versions, vetting) and `tasks/frontend/KV-FE-010-test-runner-ci.md` (runner, fake Telegram); `15` §2.7, §5.4, §5.5; `docs/handoff/parallel-work.md` §4; `HANDOFF.md` T8; Next.js guides `frontend/app/node_modules/next/dist/docs/01-app/02-guides/testing/{vitest,playwright}.md` |
| Needs from the production track | The first developer confirms the package list in this PR (DEC-49, `docs/handoff/parallel-work.md` §4). No server-side action: nothing in this package runs on staging or production |

## Goal

Every npm package Wave 1 needs is installed once, at a pinned version, with a vetting note. The frontend workspace has
a unit and component test runner, an end-to-end runner with a fake Telegram, and a dev-only package `@homi/testing`.
CI and `make ci-frontend` run the unit tests; the backend has a PostgreSQL test group.

## Scope

In: the dependency batch of `25` §10; Vitest, Testing Library and jsdom; Playwright; `@homi/testing`; the CI steps;
`make ci-frontend`; one smoke test per runner; the backend `pgsql` test group.

Out: any use of the packages in product code (stage B); shadcn/ui component files and tokens (WP-20); the generated
types and `openapi-typescript` wiring (WP-10 — the package is installed here, used there); Composer dependencies
(none are needed, `25` §10).

## Decisions that bind this package

- The batch is approved by the developer (DEC-49); the first developer confirms in the install PR. Nothing outside
  the table below is installed. A package that later proves necessary gets its own line of approval in the PR that
  needs it.
- Lockfile rules (`docs/handoff/parallel-work.md` §4): never merge `pnpm-lock.yaml` by hand; on a conflict take
  `main`'s lockfile and re-run `pnpm install`.
- `scripts/packages/proposed.json` and `make registry` cover Composer only (`HANDOFF.md` T5). npm packages are **not**
  added there; their record is the table in the PR description. `composer.lock` does not change in this package, so
  `make registry-check` must stay green without a regeneration.
- Tests run on stubs and a fake Telegram; nothing reaches Telegram, PostHog, a tile host or legacy (DEC-33).

## Design

### Packages and where they go

Versions of the map stack, PostHog and the icon set are the legacy ones (`tasks/frontend/KV-FE-005-…` lists them;
ranges marked "inferred" there are resolved to an exact version at install time and written into the PR table).
Everything is pinned exactly (no `^`) except type packages.

| Package | Version | Workspace package | Kind |
| ------- | ------- | ----------------- | ---- |
| `next-intl` | current stable | `app`, `landing` | runtime |
| `lucide-react` | 1.69.x | `@homi/ui` | runtime |
| `class-variance-authority`, `clsx`, `tailwind-merge` | current stable | `@homi/ui` | runtime (shadcn/ui helpers) |
| `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toast` | current stable | `@homi/ui` | runtime (the primitives behind dialogs, sheets, switches, tabs and toasts of `25` §3.6) |
| `maplibre-gl` | 6.11.2 | `app` | runtime |
| `pmtiles` | 4.5.x | `app` | runtime |
| `supercluster` | 8.0.x | `app` | runtime |
| `leaflet` | 1.9.4 | `app` | runtime |
| `leaflet.markercluster` | 1.5.3 | `app` | runtime |
| `protomaps-leaflet` | 5.1.x | `app` | runtime |
| `posthog-js` | 1.434.15 | `app` | runtime |
| `@types/leaflet`, `@types/leaflet.markercluster`, `@types/supercluster` | matching | `app` | development (types of approved packages) |
| `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom` | current stable | workspace root | development |
| `@playwright/test` | current stable | workspace root | development |
| `openapi-typescript` | current stable | `@homi/types` | development |

Two points the first developer must see in the PR, because `25` §10 does not name them:

- The Next.js Vitest guide installs `@vitejs/plugin-react` and `vite-tsconfig-paths` next to Vitest. Default: list
  both in the PR table as test tooling and install them at the workspace root. If either is refused, configure Vitest
  without it (`esbuild: { jsx: 'automatic' }` and an explicit `resolve.alias` for `@/*`) and say so in the PR.
- If a shadcn/ui component added in WP-20 needs a Radix primitive that is not in the table, WP-20 adds it under the
  same decision and names it in its PR.

Vetting note per package in the PR description (SEC-REQ-049): licence, date of the last release, number of transitive
packages (`pnpm why`), result of `pnpm audit --prod`. No high or critical finding may remain for a runtime package.

pnpm 11 does not run dependency build scripts unless they are allowed. After `pnpm install`, read the list of ignored
build scripts it prints; allow only what the test tools need (expected: `esbuild`) in `frontend/pnpm-workspace.yaml`,
and name each allowed script in the PR. Verify the exact key in the pnpm 11 documentation before writing it.

### Unit and component tests

- Runner configuration at `frontend/vitest.config.ts` with one project per workspace package and app (use the
  "projects" syntax of the installed Vitest version; verify it in the Vitest documentation, the older workspace file
  is deprecated in recent versions). `environment: 'jsdom'` for `app`, `landing`, `arm` and `@homi/ui`; `node` for
  `@homi/config`, `@homi/types`, `@homi/utils`, `@homi/api-client`.
- `TZ=UTC` is set in the configuration. A second CI invocation runs `@homi/utils` with `TZ=Asia/Tashkent`
  (`15` §3.10).
- Scripts: every package and app gets `"test": "vitest run --project <name>"`; `frontend/package.json` gets
  `"test": "pnpm -r --if-present test"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`.
- Only synchronous Server Components and Client Components are unit-tested; async Server Components are covered end
  to end (the Next.js guide says Vitest does not support them).
- A `@flaky` tag is excluded from pull-request runs (`15` §5.5).

### `@homi/testing` (new, dev only)

`frontend/packages/testing/`, private, never imported by `app`, `landing` or `arm` outside test files (an ESLint
`no-restricted-imports` rule in each app config enforces it).

| Export | Behaviour |
| ------ | --------- |
| `fakeTelegram(options)` | Installs a `window.Telegram.WebApp` double. Options: `version`, `platform`, `initData`, `startParam`, `colorScheme`, `themeParams`, `viewport`. Implements the members the app uses (`05`): `ready`, `expand`, `close`, `BackButton`, `SettingsButton`, `HapticFeedback`, `showConfirm`, `showAlert`, `openLink`, `openTelegramLink`, `shareMessage`, `requestWriteAccess`, `LocationManager`, `DeviceStorage`, `checkHomeScreenStatus`, `addToHomeScreen`, events. Records every call in `fake.calls`. A member that the configured `version` does not support throws, with the same version gates as TMA-042 |
| `syntheticInitData(user?)` | Returns a query string with the right fields and an obviously fake hash; never a real user |
| `freezeClock(isoUtc)` | Fixes `Date` and timers for a test |
| `fixture(name)` | Reads a stub fixture of the API by name from `backend/resources/fixtures/v1/` (the store WP-10 creates); throws on an unknown name. The fixtures stay in one place for both sides |
| `playwrightTelegram(page, options)` | The same double as an init script for Playwright, plus a block list for external hosts (`telegram.org`, PostHog, OpenStreetMap, any tile host) |

### End-to-end tests

- `frontend/playwright.config.ts`: project `miniapp` (390 × 844, device scale 1, touch, locale `ru-RU`); projects
  `landing-desktop` (1440 × 900) and `landing-phone` are declared and empty until WP-61. `webServer` starts
  `pnpm --filter app build && pnpm --filter app start` on port 3001 when `E2E_BASE_URL` is not set.
- Tests live in `frontend/app/e2e/`. The first one loads `/` with the fake Telegram and asserts that the page
  renders and the console has no error.
- From WP-21 on the suite needs the API on stubs. WP-33 extends the workflow with a backend service; this package
  only makes the runner work.

### CI and local gate

- `.github/workflows/frontend.yml`: a step `Unit tests` (`pnpm test`) after `Typecheck`, and a second step
  `Unit tests (Asia/Tashkent)` for `@homi/utils`.
- `.github/workflows/frontend-e2e.yml` (new): on `pull_request` for `frontend/**` and on `workflow_dispatch`; same
  pinned actions, `permissions: contents: read`; installs the Chromium browser of Playwright (cached by lockfile
  hash), runs `pnpm test:e2e`, uploads traces on failure.
- `Makefile`: `ci-frontend` becomes lint, typecheck, build, `pnpm test`; a new target `e2e` runs `pnpm test:e2e`.
  Update the help text of `ci-frontend`.
- `CLAUDE.md` says "There is no test setup in the Next.js apps yet": correct that sentence and the command list in a
  small shared-file PR after this one merges.

### Backend: the `pgsql` test group

`25` §9 asks for API tests on PostgreSQL where SQL differs. Tests that need it carry `->group('pgsql')` and skip
themselves on another driver. Add to `backend/tests/Pest.php` a helper `pgsqlOnly()` that returns the skip closure,
and to `.github/workflows/backend.yml` a step after the main gate:
`php artisan test --compact --group=pgsql` with `DB_CONNECTION=pgsql` and the service's credentials in `env`. Verify
that the process environment wins over the `<env>` entries of `phpunit.xml`; if it does not, add
`backend/phpunit.pgsql.xml` and pass `-c`. The first member of the group is the concurrency case of WP-00.

## Files

- `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/pnpm-workspace.yaml`
- `frontend/app/package.json`, `frontend/landing/package.json`, `frontend/packages/ui/package.json`,
  `frontend/packages/types/package.json`, and a `test` script in every `frontend/packages/*/package.json`
- `frontend/vitest.config.ts`, `frontend/playwright.config.ts` (new)
- `frontend/packages/testing/{package.json,tsconfig.json,src/index.ts,src/fakeTelegram.ts,src/initData.ts,src/clock.ts,src/fixtures.ts,src/playwright.ts}` (new)
- `frontend/packages/utils/src/index.test.ts`, `frontend/packages/testing/src/fakeTelegram.test.ts`,
  `frontend/app/e2e/smoke.spec.ts` (new)
- `frontend/app/eslint.config.mjs`, `frontend/landing/eslint.config.mjs`, `frontend/arm/eslint.config.mjs` (import
  restriction)
- `.github/workflows/frontend.yml`, `.github/workflows/frontend-e2e.yml` (new), `.github/workflows/backend.yml`
- `Makefile`; `backend/tests/Pest.php`
- `frontend/.gitignore` or the root one: `test-results/`, `playwright-report/`

## Steps

1. Read the two Next.js testing guides and `tasks/frontend/KV-FE-010-…` (its fake-Telegram member list).
2. Open the PR as a draft with the package table and the vetting notes; wait for the first developer's confirmation
   before running any install.
3. Install the runtime packages into the workspace packages of the table (`pnpm --filter <name> add --save-exact …`),
   then the development packages. Commit `pnpm-lock.yaml` with the manifests.
4. Run `pnpm audit --prod`; record the result in the PR. Handle ignored build scripts as described.
5. Add `frontend/vitest.config.ts` and the `test` scripts; write the smoke test of `@homi/utils` (an existing
   formatter, existing behaviour).
6. Create `@homi/testing` with `fakeTelegram`, `syntheticInitData`, `freezeClock`, `fixture`; write its self-tests.
7. Add the ESLint import restriction and check that `pnpm -r lint` still passes.
8. Add `frontend/playwright.config.ts`, `playwrightTelegram` and the smoke test; run `pnpm test:e2e` locally against
   `https://app.homi.loc` (`E2E_BASE_URL`) and against the built app.
9. Wire CI and the `Makefile`; push and see both workflows green.
10. Add the `pgsql` group to the backend (helper, workflow step); confirm the WP-00 case runs in CI.
11. After merge: the small shared-file PR for `CLAUDE.md`.

## Behaviour to reproduce

- The fake Telegram must refuse what a real client of that version refuses (TMA-042), so a missing version gate in
  app code fails a test instead of passing silently.
- `initData` in tests is synthetic (SEC-REQ-034); the fake never produces a value that would verify against a real
  bot token.
- No test may reach an external host. The Playwright block list fails the test on such a request; Vitest runs with
  `fetch` unmocked calls rejected in the setup file.

## Tests

- `@homi/testing` self-tests: the version gate table (6.0, 6.1, 6.2, 6.9, 7.0, 7.7, 8.0, 9.0) for `BackButton`,
  `SettingsButton`, `showConfirm`, `requestWriteAccess`, `shareMessage`, `LocationManager`, `DeviceStorage`,
  `checkHomeScreenStatus`; recorded calls; `freezeClock` under `TZ=UTC` and `TZ=Asia/Tashkent`; `fixture()` throws on
  an unknown name.
- `@homi/utils`: one smoke test of an existing formatter.
- End to end: the smoke test in project `miniapp`; a request to `https://telegram.org/` from the page fails the test.
- Backend: `php artisan test --compact --group=pgsql` runs at least one test in CI and none locally on SQLite.

## Acceptance checklist

- [ ] The PR table lists every installed package with version, reason, licence and audit result; the first developer
      confirmed it in the PR.
- [ ] No runtime package has a high or critical audit finding; every allowed build script is named.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build` and `pnpm test` pass; `make ci-frontend` runs all four and
      fails when a unit test fails.
- [ ] `pnpm test:e2e` passes locally and in the `frontend-e2e` workflow; traces are uploaded on failure.
- [ ] `@homi/testing` cannot be imported from non-test files of the apps (lint fails on a deliberate import).
- [ ] No product code imports a newly installed package yet.
- [ ] `make registry-check` is green; `composer.lock` is unchanged.
- [ ] The backend `pgsql` group runs in CI.
- [ ] Deployed to staging and production (a no-op for users: nothing new is rendered).

## Handoff

Empty.
