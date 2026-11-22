---
updated: 2026-11-22 (main a9e8955: WP-81 #107, WP-82 #108/#109, WP-83 #110, WP-33 parts 1–3 #111/#112/#113 merged; part 4 not started, no development branch open)
source-of-truth: git log, docs/ai/reports/phase-2.md, docs/ai/reports/phase-4-plan.md, docs/ai/reports/production-notes.md, docs/architecture/decisions/, HANDOFF.md §6, `make dev-check`, `make ci-backend`, `make ai-hooks-test` output
---

# Current state (facts only)

## Repository
- Branches: `main` holds everything — the phase stack (phase-0 … phase-4) was merged on 2026-11-09 through PRs #1–#4 with merge commits (last `834d69d`); the `chore/phase-*` branches are history. PRs #6–#8 merged later the same day. On 2026-11-14 `main` is at `596d0db` (last merge PR #24); PR #9 (`docs/migration/` + `scripts/migration/`, the kvadro² audit and migration plan) is merged as `b583d3d`. Open (`gh pr list`, 2026-11-14): Dependabot PR #5 (TypeScript 7 — not to be merged, KI-4); PR #25 (`docs/three-wave-plan`: the three-wave strategy and the Wave 1 plan — not on `main` yet). No branch protection (free GitHub plan) and no local push guard yet (KI-19).
- Two tracks since 2026-11-09: development (second developer, Codex) and production (first developer) — `HANDOFF.md`, `docs/handoff/parallel-work.md`.
- Tracked: backend baseline, frontend pnpm workspace (landing, app, arm, packages/*), `infra/local/nginx`, `scripts/dev`, `Makefile`, docs, ADRs 0001–0013 and 0015 (Accepted), 0016–0020 (merged 2026-11-15 with `Status: Proposed`, waiting for the first developer's acceptance), `scripts/packages/registry`, root CI workflows, CODEOWNERS, `HANDOFF.md`, `AGENTS.md`, `docs/handoff/`.
- Gitignored machine files: `infra/local/certs/`, `infra/local/nginx/snippets/paths.conf`, `infra/local/{run,logs}/`, `.ai/local.env`, `backend/.env`, `frontend/*/.env.local`.

## Backend (`backend/`)
- Laravel 13.42 (`php artisan --version` after PR #26, merged 2026-11-14), PHP 8.5.12, `php ^8.5` + platform pin. Starter Inertia/React UI present and **frozen** (ADR-0002).
- `composer ci:check` (`make ci-backend`) exit 0 on 2026-11-09 after the AM-36 fixes (`vite.config.ts` fmt/lint ignores, `phpstan.neon` exclude): 47 Pest tests, PHPStan 0 errors. GitHub's `backend.yml` has not run on the phase 3/4 branches (PR/`main` only). PostgreSQL via `DB_CONNECTION=pgsql`, no pending migrations.
- `make dev-setup` installs Composer deps only; the frozen starter UI needs `cd backend && npm ci && npm run build` before `ci-backend` (CI does it through `composer setup`).
- Local `.env`: `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis` (ADR-0005 applied), `MEDIA_PUBLIC_URL=https://cdn.homi.loc`, blank `AWS_*` and `TELEGRAM_*`. `.env.example` is the authoritative key list; `dev-check` enforces key parity. On 2026-11-15 `scripts/dev/env-keys.sh` reports four template keys missing from the developer's local file: `RADAR_CREATION_ENABLED`, `SOURCES_ALLOW_STUB`, `TELEGRAM_SUPPORT_USERNAME`, `TELESCOPE_RECORD_ALL` (the agent may not write it: deny rule `Edit(**/.env)`).
- `config/cors.php` env-driven; `config/filesystems.php` `public` disk URL from `MEDIA_PUBLIC_URL`; `storage/app/public/{health.txt,originals,derived}` exist locally.
- **Phase 3 WIP (branch `chore/phase-3-cdn-webhook`, paused by the developer on 2026-11-08):** packages added with approval — `league/flysystem-aws-s3-v3`, `intervention/image` 4.4, `dedoc/scramble` (registry regenerated). Media module implemented and tested (`/api/v1/media*`: upload, show, delete, presign/register; `HashedUploader`, `GenerateImageVariantsJob` on queue `media`, CDN/temporary URLs); `ApiController` envelope + `ApiExceptionRenderer`; `AssignRequestId`; rate limiters `api|uploads|intake|telegram-webhook`; Horizon queues `default+notifications|telegram|media|ingest`; tables `media_files`, `telegram_updates`, `sources`, `source_listings`, `intake_requests`, `intake_events` (migrated locally). Webhook route `POST /telegram/webhook` exists but is fail-closed (403/501 stubs). Intake endpoints, Telegram pipeline, OpenAPI export and Phase 3 docs are NOT done — the plan is `HANDOFF.md` §4 T1–T4 (development track), re-planned by the kvadro² migration tasks (PR #9, `docs/migration/10` §9). 47 tests green, PHPStan clean.
- Media ownership: the fix WP-00 is on `main` since PR #27 (merged 2026-11-15): `media_file_references`, owner-scoped load and policy, actor-typed upload prefix, migration `2026_11_14_150551_create_media_file_references_table` (run on the developer's dev database only). Staging and production still run the old code (KI-25) until the production track deploys it and approves the migration on production. KI-27 is open (PR #28, merged); KI-28 is narrowed by #73 (`register` checks the size before reading), and the tmp bucket's size bound and the replace race between the size check and the read are still open.
- **Since WP-10 (#42, merged 2026-11-15; staging and production do not run it yet):**
  - **Errors:** every `/api/v1` error body has `code` (`ApiException`, the renderer table, `SourceUnavailable` 503, `SourceNotFound` 404).
  - **Source drivers:** `config/sources.php` (no features yet), `SourceConfig`, `SourceSelector`, `SourceManager`, Pennant rules in the global scope, and `meta.source` in every sourced answer.
  - **Commands and audit:** `sources:list|set|reset|check|publish-stub-media`; the audit table `source_flag_changes` (migration `2026_11_14_224945_…`, run on the local test databases only; production approval pending).
  - **Stubs:** `FixtureStore` over `resources/fixtures/v1` (empty) with the `X-Stub-Scenario` header.
  - **OpenAPI:** the committed `docs/api/openapi.json`, `composer openapi:check` in `ci:check`, and `/docs/api` behind `viewApiDocs`.
  - **Tests:** `make ci-backend` → exit 0 (215 passed, 4 skipped); `make test-pgsql` → 4 passed; `backend` and `frontend` green on `main` after the merge (runs 43652932665, 43652932624).
  - `backend/.env.example` has `SOURCES_ALLOW_STUB` since PR #43 (merged).
- **Since WP-11 (#45, merged 2026-11-15 as `2e3d3bf`; staging and production do not run it yet):**
  - **Methods on stubs:**
    - `POST /auth/telegram` issues a real Sanctum token for the stub user `stub@homi.invalid`;
    - `GET /me`, `GET|PATCH /settings`, `GET /reference` (public), `GET /cities` (public), `POST /events`.
  - **Plumbing:**
    - `SetRequestLocale` on the whole `v1` group;
    - `AccessDenied` (`403 access_denied` + `reason`);
    - `StubResponder`;
    - the reference data objects with strict `fromArray()`.
  - **Sources and config:**
    - `StubReferenceSource` and the features `source.reference` and `source.cities`;
    - `config/{radar,settings}.php` and `telegram.support.username`;
    - the fixtures under `resources/fixtures/v1/{me,settings,reference,cities}`.
  - **Tests:** `make ci-backend` → exit 0 (343 passed, 4 skipped); `make test-pgsql` → 4 passed; `backend` and `frontend` green on `main` after the merge (runs 43657763081, 43657762964).
  - `backend/.env.example` has `TELEGRAM_SUPPORT_USERNAME` and `RADAR_CREATION_ENABLED=true` since PR #46 (merged as `e1a65f2`; `backend` run 43658186462 green). Staging and production leave the radar key unset until WP-57.

- **Since WP-12 (#48, merged 2026-11-15 as `b16993e`; staging and production do not run it yet):**
  - **Methods on stubs** (bearer, `app:read`): `GET /listings`, `/listings/count`, `/listings/new`, `/listings/flow`,
    `/listings/map`, `/listings/{number}`; `POST /listings/{number}/contact|translation|share`.
  - **Filters:** `SearchFilters` (25 keys, `canonicalHash()`), `SearchFiltersNormaliser`, `config/filters.php`
    (three DEV switches off), `ListingFiltersRequest`.
  - **No phone on the card:** `PhoneMasker` masks every author number to its last two digits; only `POST …/contact`
    gives a number (DEC-52).
  - **Stub:** `StubListingSource` over `resources/fixtures/v1/listings/catalog.json` (20 listings — 100018–100021 are WP-26's
    listing-screen variants outside the default set — 45 for the default filters); the eight `source.listings.*` features; six placeholder photos and `sources:publish-stub-media`.
  - **Tests:** `make ci-backend` → exit 0 (603 passed, 4 skipped); `make test-pgsql` → 4 passed; `backend` and
    `frontend` green on `main` after the merge (runs 43662113261, 43662113325).
- **Since WP-13 (#50, merged 2026-11-15 as `6c48ce6`; staging and production do not run it yet):**
  - **Methods on stubs:** favourites, history, hidden listings, blocked authors, the hidden list, reports, the two
    found-survey methods, the six radar methods, and the public `GET /landing/live` and `/landing/pins`. With them
    the `/api/v1` route list equals the 39 pairs of `25` §4.2 (a test pins it; 40 since the intake of
    `index-BnFvC-Ft`, #88, added `POST /settings/card-sample`; 41 since the intake of `index-CIa0Ldj2`, which added
    `DELETE /listings/{number}/reports`). Since the landing intake (#96, `efa4f9b`) `GET /landing/live` has
    `showcase.{rent,sale}` (lists of `{district_code, count}`) and a pin's `floor` may be `null`.
  - **Radar switch (DEC-51):** `EnsureRadarsEnabled` on the four radar writes answers `403 radars_disabled` while
    `radar.creation_enabled` is false; `GET /radars` answers `[]`; `DELETE` works.
  - **Stubs:** personal fixtures hold listing numbers resolved through the card source (`StubListingRefs`);
    `StubCursor` ends every stub list quietly on a foreign cursor (the feed included); `StubRadars`;
    `StubLandingSource` and the features `source.landing.live`, `source.landing.pins`.

## Frontend (`frontend/`)
- pnpm 11.24 workspace, Node 26, Next 16.4.5 × 3 apps on dev ports 3000/3001/3002, TypeScript ^6. `pnpm -r lint` and `pnpm -r typecheck` exit 0 (3 apps + 8 packages; on `fb4a2b2` of WP-23, merged in #68, and on `5fd06c9` of WP-24, merged in #71, where the packages are linted with the app's rules since #70).
- `packages/`: `@homi/config`, `@homi/types`, `@homi/utils`, `@homi/api-client`, `@homi/ui`, `@homi/i18n` (WP-20; `./format` since WP-22), `@homi/search` (WP-22) — each with lint/typecheck/test scripts (since #70 the `lint` scripts run the app's ESLint binary with `packages/eslint.config.mjs`; KI-29 resolved); `app` uses `@homi/config`, `@homi/i18n` and `@homi/ui` since WP-20, `@homi/search`, `@homi/api-client` and `@homi/types` since WP-22.
- Since WP-03 (#39, merged 2026-11-15):
  - **Packages:** the 31 Wave 1 npm packages are installed (lockfile 665 entries). The install scripts of `@parcel/watcher`, `@swc/core` and `core-js` are denied in `allowBuilds`. The map packages are used since WP-27 and WP-28; `posthog-js` is not imported yet.
  - **Unit tests:** Vitest 5 runs through `frontend/vitest.config.mts`, with one project per package. `pnpm test` → `@homi/testing` 89 passed, `@homi/utils` 2 passed.
  - **`@homi/testing`** is a dev-only package. `@homi/testing/playwright` provides the fake Telegram and the external-request guard.
  - **End to end:** Playwright 1.65.1 runs `frontend/playwright.config.ts`, with the `app/e2e/smoke.spec.ts` test. `pnpm test:e2e` → 2 passed.
  - **Gates:** `make ci-frontend` includes `pnpm test`, and `make e2e` is new. The workflow `frontend-e2e.yml` is new.
- Since WP-10 (#42):
  - `@homi/types` generates `src/generated/api.ts` from `docs/api/openapi.json`, and `pnpm types:check` runs in CI and
  in `make ci-frontend`.
  - `@homi/api-client` gains `put`, a required `ApiError.code`, `null` data for a `204`, and `createTypedClient`.
- Since WP-11 (#45): the generated types cover the seven contract methods; `@homi/testing` 90 passed, including a `fixture()` test on the real backend fixtures.
- **Since WP-20 (#52, merged 2026-11-15 as `2ef9b2f`; staging and production do not run it yet):**
  - **`frontend/app`:** the route tree of `25` §3.2 under `app/[locale]/` with `RoutePlaceholder` on every address;
    sheets and the listing layer intercepted into `(main)/@sheet` and `(main)/@overlay`; the three catch-alls are
    `[...rest]`. `proxy.ts` redirects to the `NEXT_LOCALE` cookie's locale or `ru`. next-intl reads the locale from
    `next/root-params` (pages stay static). `lib/navigation/routes.ts`, `lib/brand`, `lib/flags.ts` (17 flags off),
    the `track` and `reportError` facades, the sources store and `DemoDataMarker`. Starter files removed.
  - **`@homi/i18n`:** the `legacy` layer generated by `scripts/import-legacy.mjs` from the release pinned by WP-02
    (476 keys per locale, 15 plurals, 4 keys at `<key>._`; since the intake of `index-BnFvC-Ft`, #88, from that
    release: 504 keys, 5 at `<key>._`; since the intake of `index-CIa0Ldj2`: 581 keys, 16 plurals; since the intake of
    `index-CBlEKxdL`: 563 keys, 6 at `<key>._`; since the intake of `index-YX9bFVws`, #95: 591 keys, and four
    `homi` overrides for texts that carry the legacy brand), the `homi` layer, `getMessages`, `createIntlHandlers`,
    `labelFor`.
  - **`@homi/ui`:** tokens, themes, lite and motion CSS (`@homi/ui/styles.css`; Tailwind's default palette removed),
    the restyled shadcn/ui base components, `cn` = clsx + tailwind-merge.
  - **Tests:** `make ci-frontend` → exit 0 (app 135, `@homi/i18n` 30, `@homi/ui` 24, `@homi/testing` 90 passed);
    `pnpm exec playwright test --project miniapp` → 20 passed; `frontend` and `frontend-e2e` green on the PR,
    `frontend` green on `main` after the merge (run 43697001406).
- **Since WP-21 (#55 merged 2026-11-15 as `31b53f4`, shared files #54 as `68751f3`; staging and production do not
  run it yet):** the Telegram adapter `tg` (`lib/telegram/`), the ES5 boot script and update screen (`boot/`),
  storage and graphics mode, the session exchange `/bff/session` with `lib/session/`, the history stack with
  BackButton and SettingsButton, launch links, the locale and fragment guards, the development-only emulator
  (`dev/`), the nonce CSP and security headers of `proxy.ts` (every document at request time, ADR-0020; unknown
  address → `200` + `noindex`, AM-57); `frontend/app/.env.example` has the server-only keys `API_URL`, `CSP_*`.
  `frontend-e2e.yml` starts the API on stubs. On the branch: `make ci-frontend` → exit 0 (app 362 + the launch-order
  test, `@homi/testing` 95), Playwright `miniapp` → 51 passed; `frontend` and `frontend-e2e` green on the PR,
  `frontend` green on `main` after the merge (run 43732411072).
- **Since WP-22 (#61 merged 2026-11-16 as `e8c8f9e`; staging and production do not run it yet):** `lib/api/*` (typed server calls, `UiError`,
  `/bff/[...path]` with its read allow-list, `bffFetch`, stub scenarios), `lib/actions/{run,validate,useAction}`,
  `lib/data/{useResource,sessionMaps}`, `lib/reference/*` (cached per locale), `lib/search/*`, `lib/money/useMoney`,
  the packages `@homi/search` and `@homi/i18n/format`; the feed and map placeholders show a data proof. On the branch:
  `make ci-frontend` → exit 0 (app 480, `@homi/search` 238 + 1 todo, `@homi/i18n` 108), Playwright `data.spec.ts` → 5
  passed; `frontend` and `frontend-e2e` green on the PR (`3bb7831`, e2e 56 passed).
- **Since WP-23 (#68 merged 2026-11-16 as `901eaad`; staging and production do not run it yet):** `@homi/ui` shell
  primitives (`BottomSheet`, `SubPageFrame`, `FilterChip`/`HeaderChip`, `SegmentedControl`, `ChoiceList`,
  `EmptyState`, `ErrorState`, the gesture hooks, the icons) and the gallery `/dev/ui` (`local`, `ci`, `staging`
  builds); `lib/ui/*` (toast, feedback, confirm, `shellState`); `features/shell/*` (`AppShell`, top bar, tab bar, view
  toggle, mini title, pull-to-refresh, `RouteSheet`, `RouteOverlay`, `SubPage`, `ToastHost`); `features/gates/*`
  (`resolveGate`, `GateRedirector`, the boot retry, `/outside`, `/no-access`, `/welcome/language`, `/welcome/city`,
  the expired and crash screens); `features/city/*`; `lib/actions/settings.ts` (`updateSettings`, the first Server
  Action); `error.tsx`, `not-found.tsx` (the catch-all throws under `<Suspense>`, AM-59), `global-error.tsx`; WP-21's
  parser keeps the whole campaign code (AM-63). The screens behind the tabs were still placeholders (only settings is left, WP-31). On `fb4a2b2`:
  app 977, `@homi/ui` 111, `@homi/i18n` 109 tests passed, `pnpm -r lint` and `pnpm -r typecheck` exit 0,
  `make ci-frontend` exit 0; Playwright
  `miniapp` (85 tests, one worker, local API) → 82 passed, 3 failed on the stub user's 120/min API limit (AM-61),
  `shell.spec.ts` alone 16 passed; the D2 integrator's full run, before the D2 review fixes → 85 passed; `frontend` and `frontend-e2e` green on the PR
  (`f12574c`, e2e 85 passed), `frontend` green on `main` after the merge (run 43888986489). Known issues KI-32 … KI-43.
- **Since WP-24 (#71 merged 2026-11-17 as `780aea9`; staging and production do not run it yet):** the search tab
  shows the feed.
  `features/feed/*`: `FeedServer` (`readFirstPage`: page one with the cookie; on an address without a city `/me` first and
  `profileCity`; `unauthorized` → `null`), `FeedScreen` (`useScreenSearchState('feed')`, the per-search refresh
  version, the scroll to the top, the lite scroll measurement on the first scroll), `feedQuery.ts` (the query and
  list key of both sides), `ListingFeed` / `useCursorFeed` (the cursor list WP-29 reuses; the hook calls
  `onForbidden()` for DEV-001, AM-68), `ListingCard`,
  `PhotoStrip` / `Photo` (the small variant, the server's `serverSmallOnly`), `FavButton`, `FeedHeader` (the chips
  in the top bar), `FewResultsNote`, `FeedEmpty`; `features/radars/{capability,subscribe}.ts` (`radarsReady = false`,
  stubs, until WP-30 wired them); `lib/actions/favorites.ts` (`setFavorite`), `lib/data/previewCache.ts`, `lib/analytics/firstContent.ts`,
  `lib/device.ts`, `lib/search/useScreenSearchState.ts` (KI-43 for the feed). Changed WP-21/WP-22 code:
  `SessionState.renewed` and the router refresh only after a sign-in of the launch (AM-66), the saved city through
  `useSyncExternalStore` and `profileCity` (AM-67);
  `@homi/ui`'s lite card size 360 px (AM-69); `GET /listings` documents a nullable `meta.next_cursor`
  (`ListingController`, `openapi.json`, `@homi/types`; AM-65); `@homi/testing/playwright` gains `stubMedia`;
  `frontend-e2e.yml` sets `NEXT_PUBLIC_CDN_URL`; one `homi` key, `feed.loading`. `RefreshProof` is deleted;
  `data.spec.ts` ran on `/ru/map` until WP-27 deleted the proof and re-hosted it on the map's read and the feed (AM-86). On `1d1c964`: app 102 files / 1402,
  `@homi/i18n` 110, `@homi/ui` 112 tests passed, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm types:check` and the
  app build exit 0; backend on `9163d26` 720 passed, 4 skipped.
  On `f58cf88`: `make ci-frontend` exit 0 (app 1402, search 238, testing 95, ui 112, i18n 110, api-client 14, utils 2
  tests); `feed.spec.ts` 19 passed, csp + smoke 4 passed; every e2e file alone green in the verify run (shell after a
  `429` rerun).
  `frontend`, `frontend-e2e` (104 passed) and `backend` green on the PR (`6ae7331`); `frontend` and `backend` green on
  `main` after the merge (runs 44002675075, 44002675246). Known issues KI-44 … KI-53 (among them the local OpenAPI
  export, KI-47, and the Vitest path filter, KI-52); KI-32 counts the feed spec's share of the API limit, and KI-43
  names the feed's fix and what is left.
- **Since WP-25 (#79 merged 2026-11-17 as `f2f58cc`; staging and production do not run it yet):** the four sheet addresses render the real sheets.
  - `features/filters/*`:
    - `FiltersForm` with `FiltersFooter`: three modes; it owns the `RouteSheet`, the draft, the nested `pick=city`
      picker and the sheet's `ToastHost`;
    - seventeen sections over `sectionsFor`, plus `RoomsPicker`;
    - `QuickFilterForm`, with the server `QuickFilterPage`, which answers not-found for an unknown kind;
    - `SortList`, an own radiogroup;
    - the logic: `useDraft`, `useLiveStats` / `normalizeFlow`, `applyFilters` / `onFiltersApplied`, `formKey`,
      `newFeatures`;
    - the `…SheetRoute` glue, the only files that read `devFlags`.
  - `features/city/{CityPickerSheet,CitySheetRoute,useCityPick}`.
  - `@homi/ui`'s `IntInput` and `PriceInput`.
  - `lib/reference`: `refreshCitiesStats()` (AM-70) and `cityStats.ts` (`cityStatsOf`).
  - `lib/api/browser.ts`: `anySignal()` (KI-55, resolved).
  - Tests: `e2e/filters.spec.ts` and `e2e/city.spec.ts`.
  - On `37ffd27`, `make ci-frontend` → exit 0, with the app at 120 files / 1731 tests. End to end: city 6, filters 20
    and feed 19 passed; on `c41d07c` every related spec passed as well (KI-32 reruns). Known issue KI-54.
- **Since WP-26 (#81 merged 2026-11-17 as `95315fd`; staging and production do not run it yet):** `/listing/[number]`
  and its `photos`, `market` and `actions` children render the real listing screen in both route trees (`location`
  since WP-28: the spot map).
  - `features/listing/*`: `ListingLayer`, `ListingServer`, `ListingScreen`, `useListing` (string key `listing:<n>`,
    the merge redirect, the seen map), the hero, title row, key facts, the sections, the CTA bar with `useContact`
    (only on a tap) and `useTranslation`, the viewer (`gestures.ts`, `ZoomableImage`), the market block and sheet
    (`marketText.ts`), the actions sheet with `useListingActions`, `closeListing` and `useShareListing`.
  - `lib/actions/{listing,hidden,reports}.ts`; `lib/phone/masked.ts`; `lib/navigation/{useCloseOnce,history}`
    (`backBy`); `lib/data/useResource.ts` (`seedResource`, a render-time seed announced, an entry without data
    dropped when its last user leaves); `lib/telegram/links.ts` allows the host of `NEXT_PUBLIC_API_URL` (the stub
    call page); `@homi/ui` gained 28 icons, `prefersReducedMotion` and `BottomSheet`'s `leading`.
  - Backend: stub listings 100018–100021 and the per-m² values of 100008/100009 (contract tests).
  - Tests: `e2e/{listing-open,listing-contact,listing-actions,photo-viewer}.spec.ts`. On `fed314d`,
    `make ci-frontend` → exit 0 with the app at 153 files / 2304 tests, `composer ci:check` clean; in CI on
    `43d558a` the 18 e2e files passed in one run (180). Known issues KI-56, KI-57, KI-58.
- **Since WP-27 (#83 merged 2026-11-19 as `4e35154`; staging and production do not run it yet):** `/map` renders the
  search map on MapLibre GL; a device the engine rule sent to Leaflet saw «Карта на этом устройстве пока недоступна»
  until WP-28 replaced that state.
  - `features/map/*`: `MapScreen` (the session's engine, the lazy GL view, the pills, the note, locate,
    `MapAttribution`, the loading, empty and error states), `engine.ts` (`pickEngine`: WebGL2 for a saved `gl`,
    AM-80; with `failIfMajorPerformanceCaveat` and lite off when nothing is saved; `markGlFailed`, `warmMap`),
    `useMapPoints` and `pins` (pins, stacks, `supercluster` clusters, the spread), `camera`, `mask`, `tiles`,
    `palette`, `tilePrefetch`, `MapSelectionCard` with `useCardLayer` (DEV-013), `MapWarmup`; `gl/`: `library.ts`
    (`maplibre-gl` 6.11.2 and `pmtiles`, the worker URL, `prewarm()`), `useMapInstance`, `style.ts` (one pure
    builder, `setStyle(…, { diff: true })`), `fonts.ts`, the text-only DOM markers.
  - Basemap: the OSM raster, its tile requests with `strict-origin-when-cross-origin` (`osmTransformRequest`,
    AM-82), until a PMTiles file is hosted; the twelve Noto Sans woff2 label subsets with `OFL.txt` in
    `public/map-fonts/` (cut with fonttools in a throwaway virtual environment, AM-83).
  - Worker: `scripts/copy-maplibre-worker.mjs` (`predev`, `prebuild`) copies the worker and its shared module into
    the git-ignored `public/maplibre/<version>/`; `proxy.ts` answers `/maplibre/` with the worker's own policy from
    `lib/security/csp.ts` (`connect-src 'self' <CSP_TILE_HOSTS>`), cached as Next.js's revalidated `max-age=0`
    (AM-81).
  - Shared changes: `lib/deeplinks/{parse,launch}.ts` (`mapDebug`, `launchMapOptions()`, AM-85);
    `lib/telegram/links.ts` (the two attribution hosts); `ViewToggle`'s `onIntent`; `TopBar`'s `MapBar` on
    `useScreenSearchState("map")` (KI-43's map part done); `SearchProof` deleted and `data.spec.ts` re-hosted on the
    map's read and the feed (AM-86); the ESLint HTML-injection rule (also `setHTML`); `CSP_TILE_HOSTS` in
    `.env.example`, `frontend/playwright.config.ts` and `frontend-e2e.yml`; the guard of `@homi/testing/playwright`
    answers OSM tiles with a blank PNG (AM-84); the `homi` keys `map.empty`, `map.loading`, `map.unavailable`.
  - Backend: no change.
  - Tests: `e2e/map.spec.ts`. On `782216a`, `make ci-frontend` → exit 0 with the app at 168 files / 2608 tests;
    each of the 19 e2e files alone against a local `next start`, 198 passed; in CI on `94a414d` `frontend` (run
    44196889825) and `frontend-e2e` (run 44196889879, 198 passed) green. Known issues KI-59, KI-60.
- **Since WP-28 (#84 merged 2026-11-19 as `0ab4417`; staging and production do not run it yet):** every device gets
  a map — where GL cannot run, Leaflet shows the same pins, stacks, clusters, card, note, states and locate; the
  search area is drawn on either engine; `/listing/[number]/location` and the listing's location section show the
  spot map (the WP-20 placeholder and WP-26's `SpotMapSlot` are gone).
  - `features/map/leaflet/*`: `MapViewLeaflet`, `library.ts` (`loadLeaflet()`: `leaflet` 1.9.4,
    `leaflet.markercluster`, `protomaps-leaflet` 5.1.0 in order, for the global `L`, AM-90), `useLeafletMap` with
    `useLeafletCamera`, `listingLayer` and `useSpiderfy` (LB-APP-013), `icons.ts`, `basemap.ts`, `basemapRules.ts`
    (written layer by layer from GL's style, AM-89), `useDeferredBasemap`, `useLeafletMask`, `useMyLocation`,
    `lassoHandlers.ts`. `features/map/useBasemap.ts` holds the basemap rule and the session's vector failure for both
    engines; `markerElements.ts` moved up from `gl/`; `MapUnavailable` and `map.unavailable` removed; no attribution
    control on either engine, `MapAttribution` serves both (AM-88).
  - Drawing: the `draw=1` layer of `MapScreen` (`requestDraw()` / `consumeDrawRequest()` in `lib/ui/shellState.ts`,
    a request younger than 3 s), `lasso/polygon.ts` (the pure stroke → polygon rules) and `LassoOverlay` over
    `gl/GlLasso` and `leaflet/lassoHandlers.ts` (the deferred marker re-sync, AM-93); the finished stroke through
    `applyFilters`.
  - `features/listing/spot/*`: `SpotMap` (the mini map in `LocationSection`), `SpotMapRoute` and
    `SpotMapFullscreen` in both listing trees, `useSpotMap` (the one owner of the container, LB-APP-001),
    `spotGeometry`, the lazy `spotGL` / `spotLeaflet`; `SpotMapRoute` reads `useListingRecord()` and the listing
    layer's reported state (AM-92).
  - Shared changes: `prefetchTileUrls` in `tilePrefetch.ts` (one session cap for the list's and Leaflet's
    prefetch); `@homi/ui`'s `Maximize2`; `eslint.config.mjs` ignores the copied worker. Nothing new for the
    production track beyond WP-27's `CSP_TILE_HOSTS` (AM-91).
  - Backend: no change.
  - Tests: `e2e/{map-leaflet,map-lasso,spot-map}.spec.ts`. On `f7ba4b2`, `make ci-frontend` passed (its test step
    after one `ENOENT` on the Vitest cache, then `pnpm test` again) with the app at 183 files / 2831 tests; each of
    the 22 e2e files alone, 237 passed; in CI on `9e9587e` `frontend` (run 44254527108) and `frontend-e2e` (run
    44254527223, 237 passed) green, and `frontend` green on `main` after the merge (run 44410445948). Known issues
    KI-61, KI-62, KI-63 (two CI-only e2e flakes outside the package).
- **Since WP-29 (#85 merged 2026-11-19 as `ee5f7cd`; staging and production do not run it yet):** the saved tab's
  two lists render: `/saved` (SCR-024) and `/saved/history` (SCR-025).
  - `features/saved/*`: `server.tsx` (`readSaved`: page one with the cookie and a `renderId` drawn after `io()`;
    `FavoritesServer`, `HistoryServer`), `useSavedList` with `listKey.ts` (a new server render re-creates the list,
    AM-94; history's `seen` rule checked on the return to the list, AM-95; pulls, the top, a lost focus),
    `FavoritesScreen` and `HistoryScreen` over WP-24's `ListingFeed` (20 at a time, DEC-53; favourites drop the
    listings un-favourited or hidden in this launch, history shows every entry), `ClearHistoryButton` («Очистить»:
    a confirm, `DELETE /history`, the empty state with the success haptic and the focus).
  - `lib/actions/history.ts` (`clearHistory`); `FeedServer` exports `smallPhotosOnly`; `@homi/ui` re-exports
    `Trash`. `ListingFeed`, `useCursorFeed` and the `/bff` allow-list are unchanged.
  - Backend: no change.
  - Tests: `e2e/saved.spec.ts`. On `fcba4ca`, `make ci-frontend` → exit 0 with the app at 157 files / 2405 tests;
    each of the 19 e2e files alone against a local `next start` (the branch did not have the map specs yet), 190
    passed; in CI on `e3b24f3` (`main` with WP-27 and WP-28 merged in) `frontend` (run 44410780522) and
    `frontend-e2e` (run 44410780607, 247 passed) green. No new known issue; LB-APP-027 stays as DEV-016 decides.
- **Since WP-30 (#86 merged 2026-11-19 as `a818440`; staging and production do not run it yet):** the radar part
  of the Mini App works on stubs; where `RADAR_CREATION_ENABLED` is unset (staging and production, DEC-51) the
  radar tab shows its "soon" state and nothing sends a radar request or offers a radar.
  - `features/radars/*`: `capability.ts` (`radarsReady = true`, `useRadarsEnabled`), `useRadarsOffRedirect`;
    `normalize.ts`, `useRadars` (both lists through `/bff`), `match.ts`, `useRadarPreviews`, `radarStatus`;
    `subscribe.ts` (`runSubscribe` / `runSaveEdit` / `runRelax`, `useSubscribe()`) with `toasts.ts`; `server.tsx`
    (`readRadarTab` at request time, the cookie first, with a `renderId`, AM-96); the tab (`RadarScreen`,
    `RadarTiles`, `RadarEmptyState`, `RadarSoonState`, `RadarSweep`); the sheet (`RadarSheetRoute`, `RadarSheet`,
    `RadarStrip`, `radarReturn`); `RadarCreateSheet` and `RadarEditSheet` over `FiltersForm`; `FoundSheet`.
  - `features/nudges/*`: `NudgeHost` (mounted by `AppShell`; one slot, return banner > follow nudge > home offer;
    a polite live line), the follow nudge, the search visits (`homi-visits`), the return banner, the radar card in
    the feed (`FeedRadarCard` in `ListingFeed`'s inline slot), "shown" on the first render (LB-APP-050);
    `features/settings/{useSettings,format}` for the digest hint.
  - Shared changes: `lib/actions/{radars,surveys}.ts` with `invokeAction`; `lib/telegram/chatAccess.ts`
    (`withChatAccess` after a `409 no_chat`); `lib/api/server.ts` (`radars(query?)`, `relaxRadar(id, { code })`);
    `lib/data/useResource.ts` (`readResource`; `seedResource` aborts a read in flight; `invalidate` keeps an entry
    with data and no user as stale); `currentAddress()` (`lib/navigation/address.ts`); `routes.radarNew(q?, entry?)`
    and `routes.radarFound({ trigger })`; `write` drops `from=radar` and `rememberHref` skips it; `TabBar`, `TopBar`
    («+» only while radars are on), `RouteSheet` / `BottomSheet` `instant`; the restyled `Switch` of `@homi/ui`;
    `filtersHash` of `@homi/search`; the radar buttons of WP-24 and WP-25 wired (`FewResultsNote`, `FiltersFooter`,
    `FiltersSheetRoute`).
  - CI: `frontend-e2e.yml` gains a second run after a green first one — an API on stubs on `127.0.0.1:8081` with
    `RADAR_CREATION_ENABLED: 'false'`, checked through `GET /reference`, then the `@radars-off` tests with
    `E2E_RADARS_OFF=1` (AM-97).
  - Backend: no change.
  - Tests: `e2e/{radars,radar-subscribe,radar-forms,follow-nudge,return-nudge,feed-radar,radars-soon}.spec.ts`. On
    `0eafcf8`, `make ci-frontend` → exit 0 with the app at 181 files / 2833 tests. Locally (a second stub API with
    radars on, KI-65): every default file green before the review fixes; after them `radars.spec.ts` 31, back 11,
    boot-failure 6 and city 6 passed before the local database host went down, so the whole suite is CI's:
    `frontend` (run 44459187188) and `frontend-e2e` (run 44459187243, 350 passed, then the `@radars-off` run 14 passed) on `4abd8d0`. Known issues KI-64, KI-65, KI-66.
- **Since WP-34 (merged as #92, `5949365`, 2026-11-20; WAITING for the deploy):** the code of the rows 4, 21 – 25, 27 and 30 of
  `docs/migration/wave-1/baseline.md` is at the pin `index-CIa0Ldj2`.
  - `lib/flags.ts`: 19 flags; on by default (DEC-58) `dev010AgentMarkedToast`, `dev014TashkentDates`,
    `dev016ErrorToastOnFailure`, `dev051RentedUndo`; `dev016SuccessToastOnDestructive` (new) and the rest off.
  - `failed({ flags?, toast? })`: the heart, «Очистить» and the radar writes toast «Не получилось сохранить»; the
    contact failures and the language picker pass `toast: false` (the picker shows a `role="alert"` line).
  - `unreportListing` (`lib/actions/reports.ts`, `serverApi().unreport`) behind «Вернуть» of «Уже сдано»; the fraud
    undo reads «Показывать у меня»; the realtor toast by `agent_marked`; the realtor reason only for a phone author;
    the `homi` text `toast.reportedAgentReview` is gone.
  - `lib/ui/shellState.ts`: `useBottomMark` (`ViewToggle`, `SubPage`, `ListingCtaBar`) and `useToastPlacement`;
    `ToastHost` places the app's toast by them and follows a touch drag on a `data-toast-drag` frame.
  - Backend: no change. Tests: unit 3 501 in the app (`make ci-frontend` exit 0 on `08c07e9` plus the title fix); e2e `listing-actions.spec.ts` 20 and `feed.spec.ts` 19 passed
    each alone (KI-32 when together); `radars.spec.ts` not runnable here (KI-65).
- **Since WP-35 (merged as #93, `989d041`, 2026-11-20; WAITING for the deploy):** the code of the rows 1, 2, 11, 12, 20, 26, 31, 32 and 38 – 42 of
  `baseline.md` is at the pin.
  - `features/feed/minuteClock.ts` (`useMinute`, the minute read from the device clock, a 15 s check and
    `visibilitychange` while anything listens) and `CardAge.tsx` (`useAgeLabel`, `CardAge`): the card's age is
    `ageLabel` of `cardText.ts` from `posted.at`, the server's string on the server and in the hydration render; the
    radar strip computes it at render without listening. The author section keeps `ageText`.
  - Floor `0` / negative: «цокольный этаж» / «подвал» on the card, «Цокольный этаж» / «Подвал» tiles; `Photo` starts
    over on a new `src`; the badge tones `warn | verified | quiet | plain` (`data-badge-tone`) and the compact card's
    `ShieldCheck` (exported by `@homi/ui`); the collapsed daily-rent title is the summary alone (DEC-66).
  - `@homi/search`: `area` for every deal (DEC-62); the rule key `dev017PetsLongRentOnly` (default on; app flag of
    the same name, 20 flags, five on); `dev017TenantPetsDailyRule` governs the tenant section only; `isRoomPicked`
    counts from 1 with only `rooms_max`.
  - `@homi/i18n` money: the dollar field drops one `$`; the сум field's text has no grouping. An inactive tab is
    tinted in `styles/shell.css`; a disabled `primary` button is at opacity 0.5.
  - The listing's key-fact values wrap (hyphenated) instead of being cut off; the tab tint fades (`color 0.2s`).
  - Tests: `pnpm test` app 216 files, 3 553 tests; `make ci-frontend` exit 0 on `61fd4bf`; e2e each alone `feed` 23,
    `listing-open` 18, `filters` 22, `map` 18, `shell` 16 passed; `radars.spec.ts` not runnable here (KI-65).
- **Since WP-36 (merged as #94, `d03a34f`, 2026-11-20; WAITING for the deploy):** the code of the rows 5, 6, 8, 9, 10, 15, 17, 18, 19, 28 and 29 of
  `baseline.md` is at the pin `index-CIa0Ldj2`.
  - Listing states: `ApiError.reason` (`@homi/api-client`), `ApiFailure.reason` `"daily"` only on a `429`; the view
    `day_limit` («Лимит на сегодня», `ErrorState kind="server"`); `not_found` is the "gone" block with `SearchX`
    (exported by `@homi/ui`) and «Смотреть свежие».
  - One close of the listing layer: `close` of `ListingLayerContext`, owned by `ListingLayer` (leave 200 ms by insets,
    `animate-listing-out`; entrance `animate-listing-in` for the overlay copy; none in lite / reduced motion / after a
    swipe / for an overlay copy at depth 0; a new opening during the leave cancels it; the settle releases a refused
    step back after 1 s). Telegram's Back reaches it through `lib/navigation/backHandler.ts` (`takeOverBack`, read by
    `TelegramButtons`). `closeListing(step, close)` steps back over the sheet, then closes; on a directly loaded
    listing it keeps the single move and the replace with the feed. `leaveListingRoute()` returns `back | replace`.
  - `features/shell/FallbackClose.tsx`: the app's cross while `webApp()` is null, in `RouteOverlay` (with `onClose`)
    and in `SubPage`'s `back` slot. `SubPageFrame` holds `body.subpage-open` (locked in `layout.css`).
  - The mini chrome stays on for a listing over the `search-list` variant. `AccessReason` has `paused` (no source in
    the bot link, re-checked like the others); `noAccessStartUrl(source, number, locale)` writes `seo_en` / `seo_uz`.
  - `lib/storage.ts` has the `session` policy (`homi-launch-done`, `sessionStorage`); `lib/deeplinks/launch.ts` marks a
    shown launch listing as `<cyrb53 of the hash>:<number>` and `launchTarget` skips a marked one. `app_launch` has `tg`.
  - The spot map's boxes are `isolate` (`data-spot-map-frame`): Leaflet's panes had painted over the controls and,
    from the mini map, over the whole fullscreen map. The swipe's own jump of the fixed children is KI-67.
  - Tests: `make ci-frontend` exit 0 on `028a144` (app 217 files, 3 629 tests); e2e each alone on `5ef3961`: `listing-open` 21,
    `listing-actions` 22, `spot-map` 14, `shell` 19, `back` 11, `saved` 10, `gates` 11, `launch` 6, `photo-viewer` 6,
    `map` 18 passed (the other specs on `006cb5a`; the radar ones need radars on, KI-65).
- **WP-38 (merged in #97 `a0a618d` on 2026-11-21):** rows 13, 14, 16 and 37 of `baseline.md`.
- **WP-39 (merged in #100 `c180b0b` on 2026-11-21):** rows 44 – 54 of `baseline.md` — the leave of sheets, sub-pages and toasts on a lifeless copy (`@homi/ui` `lib/leave.ts`: `playLeave`, `useLeave`, `leaveRef`, `skipLeave`; a leave layer at the end of `body`), `RollNumber` and the app's `rollText` in the filter footers (`flowParts` of `@homi/i18n/format`), the save phases of «Сохранить» and «Включить радар» (`SaveState`, `useSavePhase`, the `confirm` option of `subscribe` and `saveEdit`), the favourite's heart and burst and the countdown ring of an action toast (`app/styles/motion.css`), the thumb of `SegmentedControl`, the release's curves (`--ease-out`, `--ease-spring`, `--ease-pop`; the chrome's springs; the market marker by transform), the survey's `moved` step and «Это всё по вашему поиску» at the end of the search feed. `e2e/motion.spec.ts` reads the copies and their animations in the browser.
- **WP-31 (merged in #101 `8d5f9be` on 2026-11-21):** the settings tab and its eight sub-pages on stubs (`features/settings/`): the screen as the layout of `/settings` with the server read of `GET /settings` and `GET /hidden` in cookie mode; theme, graphics, language and currency (`applyProfileChange.ts`: the profile's locale through `patchMe`, the locale guard switches the address in place; the currency with `router.refresh()`), quiet hours and digest (`usePresetSave`), «Вид карточек» with the two bot-message mocks and «Прислать пример в чат» (`sendCardSample`), «Скрытое» with the three returns (`unblockAuthorById`, `unhideListing`, `unhideAll`); «О приложении»; the home-screen offer in `NudgeHost` (`features/nudges/{homeScreen.ts,useHomeScreenOffer.ts,HomeScreenNudge.tsx,NudgeFrame.tsx}`); the map's points follow the feed epoch. Specs `settings`, `settings-language`, `settings-hidden`, `home-nudge`. KI-68: the stub stores no setting.
  - The feed epoch (`bumpFeedEpoch`, `features/feed/feedQuery.ts`) counts as one more pull of the search shown.
  - The long return (`features/feed/fresh.ts`, the visit tracker's `onLongReturn`): another tab re-creates the feed and
    drops its scroll memory; uncovered within 60 px of the top a silent reload; otherwise `GET /bff/listings/new` and
    the pill «Показать N новых» (`FreshPill`, under the search bar; `ArrowUp` in `@homi/ui`).
  - The scroll memory (`features/feed/feedScroll.ts`) per `FeedScreen` instance and list key; the sale switch of a
    launch listing (`features/listing/saleSwitch.ts`, `launchListing()`, `leaveListingRoute(number)`); the radar
    sheet's body and strip scrolls (`RadarReturn.via`, `stripX`, `sheetY`).
  - Tests: `make ci-frontend` exit 0 on `95289e3` (app 220 files, 3 704 tests); `e2e/feed-continuity.spec.ts` not run
    here (the local API answered `500`: database host unreachable); CI on `1330323`: e2e 392 passed + `@radars-off` 14.
- **WP-37 (merged in #102 `820ff97` on 2026-11-21):** the map's cut note («На карте — N самых свежих. Остальные — в списке», from `with_point`; `mapCounts` → `{ shown, cut, missing }`), `MapViewBoundary` (a render error of either view shows the error pill with «Повторить» inside the map, reported as `render`), and the camera memory of the launch (`rememberCamera` / `recallCamera` in `features/map/camera.ts`, one per engine and search; the views skip the first fit for the restored search). Baseline rows 33 – 35 closed.
- **WP-32 (merged in #103 `78722b8` on 2026-11-21):** the journal (`lib/analytics/journal.ts`: `track()` → `POST /bff/events`, queued until the session is ready), the error reports (`lib/errors/{report,sanitize,global}.ts`, installed by `instrumentation-client.ts`), `POST /bff/boot-error`, the full screen-name table (`screenNameOf`), `ScreenTracker`, `AnalyticsBoot`, `useScreenLayer` and the PostHog loader (`lib/analytics/posthog.ts`; no PostHog code without `NEXT_PUBLIC_POSTHOG_KEY`/`_HOST`). The `@analytics` e2e run (`E2E_ANALYTICS=1`) is a step of the existing e2e job (DEC-98). KI-69.
- **WP-80 (merged in #104 `984c9e8` on 2026-11-21):** the owner cabinet's contract on stubs — 18 pairs (`/owner/*` and `POST /listings/{number}/contact-request`, 59 in all), the owner fields of the card and the map point, `owner` of `GET /me`, `owner_enabled` and the owner limits of `GET /reference`; the content writes answer `403 owner_disabled` while `OWNER_CABINET_ENABLED` is off (`config/owner.php`, DEC-81; `.env.example` keys in #105). Stub native listings `10000001` … `10000008`, two at each of the four addresses of the default search.
- **WP-81 (merged #107 ee33352):** the owner form on stubs (`features/owner/`): `/owner/new` and `/owner/<id>` with `place`, `phone`, `mode` and `done` in both trees (standalone and `@overlay/(.)owner`), the questionnaire with its autosave controller (`form/autosave.ts`, the server's bounds), photos over XHR to `/bff/owner/listings/{id}/photos` (`CSP_PRIVATE_MEDIA_HOSTS`), the place picker on both engines, demand and usual price, the phone step with `tg.requestContact()` and the poll, the contact mode, publish and the done step; the launch links `owner_new`, `owner-new`, `?owner=new`, `o_<id>`; the events `owner_place_set`, `owner_place_autofill`, `owner_mascot_tap` (24 in the journal); the `@owner-off` e2e run with `@radars-off`; the owner dictionary from `import-legacy.mjs --owner`.
- **WP-82 (merged #108 2b5736c, #109 fd20d1a):** «Мои объявления», «Отклики», the owner panel, the signals, the invitations and the survey's landlord block on stubs. **WP-83 (merged #110 4aa44fb):** the seeker's request sheet `/listing/<n>/contact`, the bar's request states, the owner chip and sheet `/listing/<n>/owner`, the owner sections, `c_<number>`.
- **WP-33 part 1 (merged #111 61d78c6):** Playwright projects `miniapp-cookie` (every spec) and `miniapp-header` (every test that names no mode, DEC-101); the other clients' projects only with `E2E_FULL=1` (manual run, DEC-100). `@homi/testing` `modes.ts` checks the session mode, console errors, CSP violations and missing messages after every passed test; `setScenario`/`withScenario`; `app/scripts/check-bundle.mjs` (`make bundle-check`, a CI step). Verified: local strict run 566 passed, `@radars-off` 20.
- **WP-33 part 2 (merged #112 27142e3):** `e2e/support/pages.ts` (the list of addresses with the scenario each needs), `e2e/coverage/{routes,render,version-gates,brand}.spec.ts`, a screen annotation on every describe, and `app/scripts/e2e-coverage.mjs` with its CI step "Screens without an end-to-end test" (`.github/workflows/frontend-e2e.yml`).
- **WP-33 part 3 (merged #113 a9e8955):** the eight journeys in `e2e/journeys/` (`first-launch`, `deep-link`, `search-to-radar`, `moderation`, `locale-currency`, `session-expiry`, `source-unavailable`, `demo-marker`), tagged `@journey` and run by both pull-request projects. CI of #113: `gh pr checks 113` → `ci` pass, `e2e` pass (runs 45002838031 and 45002837960). Reported in #113, not re-run: the full local strict run 919 passed in 25.3 min, `@radars-off` 20, `@analytics` 8.
- **WP-33 part 4 does not exist yet:** no `e2e/perf/`, no `perf` project in `frontend/playwright.config.ts`, no `app/scripts/check-budgets.mjs`, no `app/perf-budgets.json` (`ls` on 2026-11-22).
- `next.config.ts`: next-intl plugin (WP-20); `allowedDevOrigins` for the `.homi.loc` hosts; `images.remotePatterns` for `cdn.homi.loc`, `cdn.staging.homi.uz`, `cdn.homi.uz`. `.env.example` per app; `.env.local` present locally.

## Infrastructure
- Local (ADR-0008 + ADR-0012), **working on the first developer's machine** as of 2026-11-08: six `*.homi.loc` hosts in `/etc/hosts`; mkcert cert (valid to 2029-02-08) trusted by the system keychain; Homebrew nginx vhosts symlinked from `infra/local/nginx/`; nginx started by hand (`sudo nginx`, never `brew services` — KI-13); php-fpm :9000, PostgreSQL :5432, Redis :6379 as brew services; Horizon + Next dev servers via `make dev-start`; media on disk behind `cdn.homi.loc` (no local MinIO). `make dev-check` → 24 PASS / 0 WARN / 0 FAIL; HMR WebSocket (`/_next/hmr`) upgrades through nginx.
- Second developer's machine: `make dev-setup` end-to-end on a clean clone done in T0 (PR #7, 2026-11-09; `docs/testing/verification-log.md`). A fresh Homebrew nginx lacks the `sites-available`/`sites-enabled` layout `scripts/dev/nginx.sh` expects — manual step in `docs/handoff/setup.md` B1. On 2026-11-16 the shared nginx lost its `~/Documents` access after a reload (KI-31); `make dev-nginx-restart` from Terminal restored it, and `make dev-check` → `dev:check OK (0 warning(s))`, 24 PASS, on `main` = `59a34ad`.
- Local tooling since #63/#64: `dev-check` follows redirects on the three Next hosts (the app's `/` → `/ru`, KI-30); `scripts/dev/nginx.sh` has `start`, `stop` (waits, TERM after 10 s), `restart` and `reload` as separate commands, signals only the root master, and reports "Operation not permitted" with the restart hint; `make dev-nginx-restart`.
- Local tooling since 2026-11-21 (branch `chore/pipeline-speed`): `scripts/dev/e2e-local.sh [playwright arguments]` runs Playwright against an API of its own on stubs, as the CI job does (`php -S`, a temporary SQLite database, the array cache; no nginx, no database of `backend/.env`) — run on this machine while the shared local API answered `500`: `smoke.spec.ts` + `session.spec.ts` → 9 passed in 25 s. `scripts/audit/session_audit.py` splits the wall clock of the Claude Code sessions into model, tools and the kinds of waiting, from the local transcripts (`--gh` adds merged pull requests and CI runs); run on the window 2026-11-19T22:14:56Z … 2026-11-20T22:14:56Z.
- Staging/production (production track, 2026-11-09): PostgreSQL 18.6 on `5.45.127.98` has `homi_db` (production) and `homi_staging_db` (staging) with same-named owner roles, reachable only from the app host `159.253.19.121` (`pg_hba` + ufw + nftables), `DB_SSLMODE=disable` by the developer's decision — verified with `psql` and PHP PDO from `159.253.19.121`. The app host (Debian 12) already runs nginx, PHP 8.5.12 (`pdo_pgsql`, `redis`, `imagick`) and a shared Redis for other projects; PostGIS is not installed on the DB host. **Production is live on `159.253.19.121` since 2026-11-09**: `/var/www/homi.uz` (git, read-only deploy key) at `main`, Laravel API `https://api.homi.uz` and webhook host `https://hook.homi.uz` over php8.5-fpm, Next SSR `https://homi.uz`, `app.`, `arm.` as systemd units on `127.0.0.1:3100–3102`, Horizon as a systemd unit (Redis DB 3/4), Let's Encrypt certificates to 2027-02-06 — all verified from outside (`production-notes.md` §4). **Staging is live on the same host** since 2026-11-09: `/var/www/staging.homi.uz` at `main`, `*.staging.homi.uz` (five hosts, all `noindex`), Next SSR on `127.0.0.1:3200–3202`, `horizon-homi-staging`, database `homi_staging_db`, Redis DB 5/6. Deploys run with `homi-deploy <production|staging>`. The script is in `infra/production/bin/` and installed as `/usr/local/sbin/homi-deploy`. On 2026-11-09 staging ran a full repeat deploy plus a rollback and a forward deploy through it; production has had dry runs only (`production-notes.md` §3c). Not yet: bot tokens/webhooks (both environments), MinIO buckets + `cdn.*` DNS (still → app host), backups, atomic releases. Copies of the vhosts/units: `infra/production/`; runbook `docs/infrastructure/deployment.md`; log `docs/ai/reports/production-notes.md`.
- Telegram: three bots exist (dev/staging/prod); tokens not in repo; no webhook registered by us.

## AI tooling (Phase 4 in progress)
- Claude Code 2.1.319; Agent models sonnet/opus/haiku/fable. codex 0.167, gemini 0.67, grok 1.0.70 present. Codex: root `AGENTS.md` (2026-11-09) is loaded and the 37 skills in `.agents/skills` are listed (`codex debug prompt-input`); Boost MCP for Codex is a user-level `codex mcp add` (`docs/handoff/environment.md` §4), not committed. Gemini/Grok not configured (waiting).
- Laravel Boost 2.10.4 MCP: root `.mcp.json` runs `php backend/artisan boost:mcp` (project scope); the server answers `initialize` + `tools/list` (9 tools), also with the absolute artisan path from another directory. Claude Code asks each user to approve the project server once (`claude mcp list` → "Pending approval" on 2026-11-09). Sessions must start at the repository root.
- One knowledge base: canonical skills in `.ai/skills/` (19 vendored third-party skills + HOMI's own `save-session`, `SOURCES.md`), `backend/.ai → ../.ai`, `backend/boost.json` tracked (every skill must be listed there), `config/boost.php` agent paths; `php artisan boost:update` (`make ai-sync`) regenerates gitignored `.claude/skills` (37 = 17 official + 20 symlinks), `.agents/skills`, `.grok/skills`. Claude Code discovers the root skills.
- Guard rails: committed `.claude/settings.json` (permissions allow/ask/deny, `worktree.baseRef: head`) wires `.ai/hooks/guard_paths.py` (PreToolUse: reference codebases read-only, `.env*`/keys never printed), `session_context.py` (SessionStart: handoff + next AM/KI numbers), `format_on_edit.py` (PostToolUse: Pint / eslint / vp fmt). `make ai-hooks-test` → 46 tests OK; CI `tooling.yml`. `.ai/local.env` exists on both developer machines (gitignored). The guard has no key for the legacy kvadro² checkout (`KVADRO_ROOT`, KI-26).
- Subagents: `.ai/agents/` (`reference-reader`, `telegram-bot-engineer`, `intake-pipeline-engineer`, `listing-matching-engineer`, `postgis-geo-engineer`, `security-reviewer`), loaded through `.claude/agents → ../.ai/agents`.
- Not yet: `GEMINI.md`, `.ai/{rules,tasks}`, hook adapters for other agents (Codex has no guard — `AGENTS.md` hard rules only), plugins (`php-lsp`, `security-guidance`, `hookify`, `claude-md-management`), Codex/Gemini/Grok smoke tests, remaining marketing skills — waiting for the developer (`docs/ai/reports/phase-4-plan.md`).

## Collectors (outside this repo, read-only)
- `telegram.uz`: Laravel 13 + MadelineProto, PostgreSQL, stores listings/phones(HMAC)/photos, public API `/api/public/v1/listings` (tokens `tk_live_*`); rules + an Anthropic LLM; no push into HOMI, production use not confirmed. `geo.uz`: not a housing source (elmarket). `datahub.uz`: dedup/canon platform, intake not built, no consumer API. None of them mentions kvadro. ADR-0009's push model is not backed by any collector yet (AM-44; reported by `reference-reader` 2026-11-09, not re-run).

## kvadro² (the legacy product being migrated)
- Legacy sources: SVN checkout `kvadro.uz` (`KVADRO_ROOT` in `.ai/local.env`), read-only. The guard hook protects it by key and by folder name since PR #29 (merged 2026-11-14, KI-26). Since PR #37 (WP-02, merged 2026-11-15) the audit describes legacy release `index-DY_DH7h-.js` (`demo/app` SVN r27, `docs/migration/wave-1/baseline.md`); since its intake (#88, 2026-11-19) `index-BnFvC-Ft.js` (SVN r29: the card style, `card_style` and `POST /settings/card-sample` on stubs); since the intake of `index-CBlEKxdL.js` (2026-11-19) that release (SVN r31: the owner cabinet «Сдать квартиру» and the contact request to an owner are in the audit only — HOMI has no code and no contract for them yet; the merged code that is behind the pin is listed in `baseline.md`). Since the intake of `index-CIa0Ldj2.js` (2026-11-19, #90) the audit describes that release (source at SVN r33, the state of the checkout): the contract changes of the release are on stubs (41 pairs), the developer's eleven answers are DEC-58 … DEC-68, and the merged screens behind the pin are listed in `baseline.md` for the catch-up packages WP-34 … WP-38. Since the intake of `index-YX9bFVws.js` (2026-11-20, #95 `3f9baa0`; source at SVN r38) the audit describes that release: no contract change, DEC-89 … DEC-94, and the catch-up package WP-39 (rows 44 – 54). The legacy landing has its own pin (`baseline.md`, "The landing pin"): since the landing intake (#96, `efa4f9b`, 2026-11-20) `03b` describes landing release `d9bbbc696337` (2026-11-19, landing r37), with DEC-95 … DEC-97 and the new WP-62. The checkout holds the Mini App rebuilt from the production bundle, the landing and SEO pages, and docs. The legacy backend (Python/FastAPI) and its PostgreSQL/PostGIS database are not available.
- The audit and plan are in `docs/migration/` on `main` (start: `22-agent-handoff.md`); the merged packages are in the queue `docs/migration/wave-1/README.md`.
- Course decided by the developer on 2026-11-14 (PR #25, merged 2026-11-14): HOMI ships a new product under its own bot and brand instead of taking over the legacy bot, hosts and users; the frontend talks only to `/api/v1`; each method answers from a stub, from legacy through a service key, or from HOMI's own code. Strategy `docs/migration/24-three-wave-strategy.md`, plan `25-wave-1-plan.md`, queue `docs/migration/wave-1/README.md` (45 work packages including the support bot WP-59 at first; 50 with the catch-up packages WP-34 … WP-38 of #90 60 with the owner cabinet's WP-80 … WP-89 of #91, whose code is not started, and 61 with WP-39 on the intake branch of `index-YX9bFVws`; WP-00, WP-01 and WP-02 merged and `WAITING` (deploy; ADR acceptance; the operator request is not sent); WP-03 merged (#39, 2026-11-15) and `WAITING` for the deploy: the confirmed packages, the test tooling and the backend `pgsql` test group (`backend/tests/Pgsql`, `make test-pgsql`) are on `main`; the rest not started; 45 specifications `wave-1/WP-NN-*.md`, decisions DEC-31 … DEC-56, drafted by subagents, then read in full against the code and each other in a verification pass), answers `docs/migration/decisions/2026-11-14-developer-answers.md`.
- Not existing yet: the service key and its contract, the dump and schema, any `/api/v1` product method, the bot handlers, the landing. `frontend/app` renders the Wave 1 screens on stubs except settings, which is still a WP-20 placeholder until WP-31.
