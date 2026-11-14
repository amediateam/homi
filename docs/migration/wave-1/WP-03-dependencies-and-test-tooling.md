# WP-03 — Dependencies and test tooling

| Field | Value |
| ----- | ----- |
| Stage | 0 |
| Status | WAITING (draft PR: the first developer confirms the package list; the backend `pgsql` group is done) |
| Depends on | WP-01 (ADR-0019 names the UI stack; the PR size rule is agreed); WP-00 (the first test of the `pgsql` group exercises its reference table) |
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
| `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-radio-group` | current stable | `@homi/ui` | runtime (the primitives behind dialogs, sheets, switches, tabs and toasts of `25` §3.6) |
| `maplibre-gl` | 6.11.2 | `app` | runtime |
| `pmtiles` | 4.5.x | `app` | runtime |
| `supercluster` | 8.0.x | `app` | runtime |
| `leaflet` | 1.9.4 | `app` | runtime |
| `leaflet.markercluster` | 1.5.3 | `app` | runtime |
| `protomaps-leaflet` | 5.1.x | `app` | runtime |
| `posthog-js` | 1.434.15 | `app` | runtime |
| `@types/leaflet`, `@types/leaflet.markercluster`, `@types/supercluster` | matching | `app` | development (types of approved packages) |
| `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom` | current stable | workspace root | development |
| `vite` | current stable 8.x | workspace root | development (a required peer of Vitest 5) |
| `@vitejs/plugin-react` | current stable | workspace root | development (test tooling, see below) |
| `@playwright/test` | current stable | workspace root | development |
| `openapi-typescript` | current stable | `@homi/types` | development |

Points the first developer must see in the PR, because `25` §10 does not name them (corrected on 2026-11-15 against
the npm registry, when the package list was prepared):

- Vitest 5 declares `vite` (`^6.4 || ^7 || ^8`) as a peer that is not optional; without its own line pnpm would
  install an undeclared version. It is therefore in the table, pinned like the rest.
- The Next.js Vitest guide installs `@vitejs/plugin-react` and `vite-tsconfig-paths` next to Vitest. Vite 8 resolves
  tsconfig paths itself (`resolve.tsconfigPaths`, typed in `vite/dist/node/index.d.ts` of 8.3.8), so
  `vite-tsconfig-paths` is not requested. `@vitejs/plugin-react` is requested as test tooling; if it is refused,
  configure Vitest without it (`oxc: { jsx: { runtime: 'automatic' } }` — the `esbuild` option is deprecated in
  Vite 8) and say so in the PR.
- `next-intl` 4.15 depends on `@swc/core` and `@parcel/watcher` for its message extractor: native packages with one
  prebuilt binary per platform and an install script each. They are listed in the PR so the approval covers them.
- `openapi-typescript` 7.13 declares `typescript ^5.x` as a peer while the workspace uses TypeScript 6; pnpm warns.
  WP-10 verifies that generation works with TypeScript 6 before it relies on it.
- The Radix primitives need `react-dom` as a peer; `@homi/ui` gets `react-dom` (`^19`, already in the workspace) and
  `@types/react-dom` as peer and development dependencies, so pnpm does not install them implicitly.
- If a shadcn/ui component added in WP-20 needs a Radix primitive that is not in the table, WP-20 adds it under the
  same decision and names it in its PR.

Vetting note per package in the PR description (SEC-REQ-049): licence, date of the last release, number of transitive
packages, result of `pnpm audit --prod`. No high or critical finding may remain for a runtime package. Before the
install the numbers come from a resolution in a scratch copy outside the repository (`pnpm install --lockfile-only
--ignore-scripts`: no download, no script); after the install they are checked again with `pnpm why` and
`pnpm audit --prod` in the repository.

pnpm 11 holds back versions younger than its minimum release age, and when a pinned version is younger it adds an
entry to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` by itself. No such entry is committed: if a pinned version
is still too young at install time, wait or take the previous release, and say so in the PR.

pnpm 11 does not run dependency build scripts unless they are allowed. After `pnpm install`, read the list of ignored
build scripts it prints and name each one in the PR. The resolved tree has no `esbuild` (Vite 8 builds with Rolldown
and Oxc); its install scripts are `@swc/core` (postinstall check) and `@parcel/watcher` (build from source only without
a prebuilt binary), both through `next-intl`, and `fsevents` (macOS, through `vite` and `playwright`). Allow none of
them unless a test or a build fails without it; then allow only that one in `frontend/pnpm-workspace.yaml`, after
verifying the exact key in the pnpm 11 documentation.

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
| `playwrightTelegram(page, options)` | The same double as an init script for Playwright, plus a block list for external hosts (`telegram.org`, PostHog, OpenStreetMap, any tile host). An `allowHosts` option lets a spec fulfil a tile or media host itself from a fixture (WP-27); it never lets a request leave the machine |

### End-to-end tests

- `frontend/playwright.config.ts`: project `miniapp` (390 × 844, device scale 1, touch, locale `ru-RU`); projects
  `landing-desktop` (1 366 × 860) and `landing-phone` are declared and empty until WP-61, which also adds the
  `webServer` entry for `landing`. `webServer` starts
  `pnpm --filter app build && pnpm --filter app start` on port 3001 when `E2E_BASE_URL` is not set.
- Tests live in `frontend/app/e2e/`. The first one loads `/` with the fake Telegram and asserts that the page
  renders and the console has no error.
- From WP-21 on the suite needs the API on stubs: WP-21 adds the API service to this workflow; WP-33 adds stub
  media, WebKit, the nightly run and the check steps. This package only makes the runner work.

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

`25` §9 asks for API tests on PostgreSQL where SQL differs, and many packages test concurrent writes (WP-10, WP-40,
WP-44 … WP-47, WP-50, WP-51). This package builds the one place for them; later packages only add files.

- **Folder and suite.** `backend/tests/Pgsql/` (outside `tests/Feature`, whose Pest binding applies
  `RefreshDatabase` to everything below it). `backend/phpunit.xml` gets a third test suite `Pgsql` for that folder.
- **Base class** `backend/tests/PgsqlTestCase.php`: extends `Tests\TestCase`, uses
  `Illuminate\Foundation\Testing\DatabaseTruncation` (a child process or a second connection cannot see the open
  transaction that `RefreshDatabase` keeps). Its `setUp()` reads the process environment **before**
  `parent::setUp()`: unless `DB_CONNECTION` is `pgsql` and `DB_DATABASE` ends with `_test`, it calls
  `markTestSkipped()`. The truncation trait runs `migrate:fresh` on first use, so this guard is what keeps the suite
  from ever touching a development database; do not replace it with a Pest `->skip()` closure, which runs after
  the traits are set up. `createApplication()` repeats the check on the booted configuration, because a cached
  configuration (`config:cache`) ignores the environment. The rule itself is the static `PgsqlTestCase::refusal()`,
  unit-tested in `backend/tests/Unit/PgsqlGuardTest.php`.
- **`backend/tests/Pest.php`:** `pest()->extend(Tests\PgsqlTestCase::class)->group('pgsql')->in('Pgsql');` and one
  helper `concurrently(array $tasks): array`, which runs the given closures in parallel through
  `Concurrency::driver('process')->run($tasks)` and returns their results in order (ten identical tasks:
  `concurrently(array_fill(0, 10, $task))`). The driver serialises the closure and runs it
  in child `php artisan` processes (`Illuminate\Concurrency\ProcessDriver`), so a task is a `static` closure that
  captures scalars only, and it sees committed rows only. A closure written inside a Pest test keeps the generated
  test class as its scope, which the child does not have ("Class P\Tests\… not found"), so the helper unbinds each
  task (`Closure::bind($task, null, null)`); a task cannot use `self::`, `static::` or `$this`. The serialiser reads
  the source and cannot tell two closures on one line apart: one task per closure, on its own lines.
  `backend/tests/Pgsql/ConcurrentlyTest.php` asserts inside a task that the child has `APP_ENV=testing` and the test
  database, and that the results keep the order of the tasks.
- **Environment.** The `<env>` entries of `phpunit.xml` carry no `force` attribute, so variables set in the process
  environment win (PHPUnit rule); a normal `php artisan test` keeps SQLite and skips the suite. `php artisan test`
  clears only the variables Dotenv itself loaded from `.env`, so `DB_CONNECTION=pgsql` set in the shell reaches the
  tests (checked on 2026-11-15).
- **CI.** `.github/workflows/backend.yml`, a step after the main gate: create the database `homi_test` on the
  PostgreSQL service with `psql`, then `php artisan test --compact --testsuite=Pgsql --fail-on-skipped` with
  `DB_CONNECTION=pgsql`, `DB_DATABASE=homi_test` and the service credentials the step "Setup application" already
  uses. `--fail-on-skipped` turns a wrong environment into a failure instead of a green run of skipped tests.
- **Locally.** `createdb homi_test` once, on the server of the local `.env`; `make test-pgsql` runs the suite with
  `DB_CONNECTION=pgsql`, `DB_DATABASE=$(PGSQL_TEST_DATABASE)` (default `homi_test`) and `--fail-on-skipped`. Host and
  credentials come from the local `.env`; `DB_HOST=…` and the other keys set on the command line win.
- **First member** `backend/tests/Pgsql/MediaOwnershipRaceTest.php`: ten parallel uploads of the same bytes by one
  actor leave one `media_files` row and one reference (the case WP-00 leaves to this package). Each child runs the
  database half of an upload (`MediaFile::recordFor()`, as `MediaController::store` does after storing the object);
  the objects are not written, because a child process cannot use a faked disk.

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
- `Makefile` (also the new target `test-pgsql`); `backend/tests/Pest.php`, `backend/tests/PgsqlTestCase.php` (new),
  `backend/tests/Pgsql/MediaOwnershipRaceTest.php`, `backend/tests/Pgsql/ConcurrentlyTest.php`,
  `backend/tests/Unit/PgsqlGuardTest.php` (new), `backend/phpunit.xml` (test suite `Pgsql`)
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
10. Add the `pgsql` group to the backend (base class, Pest binding, `concurrently()`, test suite, workflow step,
    `make test-pgsql`) and its first test; run it locally against `homi_test` and see it green in CI.
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
- Backend: `php artisan test --compact --testsuite=Pgsql` runs `MediaOwnershipRaceTest` and `ConcurrentlyTest` in CI
  and with `make test-pgsql`; a plain `php artisan test` reports the suite as skipped; with `DB_CONNECTION=pgsql` and
  a database whose name does not end with `_test` the suite is skipped and the database is untouched (the cases of
  `PgsqlGuardTest`, and a run by hand).

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
- [ ] The backend `pgsql` group runs in CI and through `make test-pgsql`, and refuses any database whose name does
      not end with `_test`.
- [ ] Deployed to staging and production (a no-op for users: nothing new is rendered).

## Handoff

**2026-11-15, development track (Claude Code).** Branch `feat/wp-03-dependencies-and-test-tooling`, draft PR.

- **Done — backend `pgsql` group (step 10), without any new dependency:** `PgsqlTestCase`, the Pest binding,
  `concurrently()`, the test suite, the CI steps and `make test-pgsql`; tests `ConcurrentlyTest`,
  `MediaOwnershipRaceTest`, `PgsqlGuardTest`. Seen red first (class, helper and binding missing), then green:
  `make test-pgsql` against a local `homi_test` → 3 passed. The race test fails when `MediaFile::fromStored()` is made
  a non-atomic `first() ?? create()` (tried and reverted), so it can catch a regression. `make ci-backend` → exit 0
  (103 tests: 100 passed, the 3 of the group skipped).
- **Done — step 2:** the package table with vetting notes is in the PR description, from a scratch resolution outside
  the repository (no download, no install script run). This file is corrected where the registry disagreed with it
  (`vite` peer, `vite-tsconfig-paths` not needed, the `esbuild` key, the build scripts, `next-intl`'s native packages,
  the `openapi-typescript` peer, `react-dom` for `@homi/ui`, the minimum release age).
- **Waiting:** the first developer's confirmation of the package table in the PR. Nothing is installed in the
  repository; `frontend/pnpm-lock.yaml` is unchanged.
- **Next concrete step after the confirmation:** step 3 with the confirmed versions (re-run the resolution first if a
  version changed), then steps 4–9 and the acceptance checklist.
