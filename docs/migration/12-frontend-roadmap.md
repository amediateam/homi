# 12 — Frontend roadmap

Part of the kvadro² → HOMI migration audit (rules, labels, ID scheme and the migration policy:
[`README.md`](README.md)). Milestone IDs are those of [`13-dependency-graph.md`](13-dependency-graph.md) §1 — the
frontend is milestone **M9**; the task format is [`tasks/README.md`](tasks/README.md).

- **Status:** wave 1 (2026-11-09). Plan only — no application code exists for any task below. Every architecture
  choice is the `PROPOSED` option of [`10-target-architecture.md`](10-target-architecture.md) §3 and §5; every
  deviation `DEV-…` is `PROPOSED` ([`09`](09-feature-parity-matrix.md) §4.2) and every client-side "defect fix without
  a DEV" (`09` §4.3, `LB-APP`, `LB-LND`, `LB-SEO`) is `APPROVED` by the migration policy.
- **Scope.** The new HOMI frontends: the Mini App (`frontend/app`, shape decided by DEC-06 / CF-011), the landing and
  the SEO pages (`frontend/landing`, CF-010), and ARM (`frontend/arm`, only what the audit found). **Not in scope:**
  serving the *unchanged* legacy Mini App and landing artefacts during S1–S3 (infrastructure track: KV-INF-010,
  KV-INF-016, KV-INF-024), the call page `/call/<token>` (a Laravel no-JS route, CF-013, KV-BE-037), and the bot UI
  (telegram track).
- **Numbering.** `KV-FE-001…199`, in blocks per milestone: FE-0 `001–009`, FE-1 `010–039`, FE-2 `040–099`, FE-3
  `100–149`, FE-4 `150–169`, FE-5 `170–199`. **126 numbers are used**; gaps inside a block are reserved.
- **Owner.** Every task belongs to the development track (second developer). Steps that need the production track
  (hosting, BotFather, CDN, staging bots) are marked **[PT]** inside the task files
  ([`docs/handoff/parallel-work.md`](../handoff/parallel-work.md) §1).
- **Contracts.** The frontend is built against the **frozen legacy contract** of [`08`](08-api-inventory.md)
  (`API-001…API-034`, `RES-001…RES-022`; the hand-written legacy OpenAPI of KV-BE-012 / KV-BE-013), with contract mocks
  from the golden fixtures of KV-QA-002 — so it can start before M2 is finished (`13` §2: "M2 contracts can start early
  with mocks"). Whether the S4 Mini App talks to the legacy surface or to `/api/v1` adapters is decision FD-2 (§9,
  KV-FE-004).

## 1. Ground rules for every frontend task

1. **Next.js 16.4 first.** Before any Next code, read the matching guide in `frontend/<app>/node_modules/next/dist/docs/`
   (`frontend/*/AGENTS.md`): for the Mini App `01-app/02-guides/single-page-applications.md`,
   `content-security-policy.md`, `03-api-reference/02-components/script.md`,
   `03-api-reference/03-file-conventions/{instrumentation-client,proxy,route-groups,layout}.md`,
   `03-architecture/supported-browsers.md`; for the landing `01-app/02-guides/{internationalization,json-ld,redirecting,
   incremental-static-regeneration-cache-components,cdn-caching}.md`,
   `03-api-reference/03-file-conventions/01-metadata/{sitemap,robots,manifest}.md`,
   `03-api-reference/04-functions/{generate-static-params,generate-metadata,cacheLife,cacheTag}.md`,
   `05-config/01-next-config-js/{trailingSlash,redirects,headers,cacheComponents}.md`. Both apps run with
   `cacheComponents: true` and `partialPrefetching: true` (`frontend/app/next.config.ts`): caching is `use cache` +
   `cacheLife` + `cacheTag`, not route-segment `revalidate`.
2. **The Mini App is client-rendered** (CF-011 option A, `10` §5.2): a route group `frontend/app/app/(miniapp)/` with its
   own root layout; everything below the layout is a Client Component; data is fetched only on the client after
   `initData` exists. No URL routing between screens: base tabs + a LIFO layer stack that drives Telegram's
   `BackButton` (TMA-022). If DEC-06 picks option B (a Vite SPA, `10` §5.2), the component code and the shared packages
   stay as planned and only the app paths of the tasks change (KV-FE-003 records the mapping).
3. **Where code lives.** Design tokens and shared UI (also used by the landing's phone demo, LND-036) in `@homi/ui`;
   locale catalogues and the `t()` runtime in a new workspace package `@homi/i18n` (ADR-0006: catalogues in a shared
   package); the 25-key filter model, query builder and summaries in a new workspace package `@homi/search`; legacy
   contract types in `@homi/types` (subpath `legacy`); formatters in `@homi/utils`; test fixtures (fake Telegram,
   contract-mock helpers) in a dev-only workspace package `@homi/testing` (KV-FE-010). Mini App-only code (Telegram
   adapter, API client for the legacy contract, screens) stays in `frontend/app`. A workspace package is not a
   third-party dependency, but adding one changes `pnpm-lock.yaml` (a shared file): announce it in the PR. New env keys
   (for example `NEXT_PUBLIC_KVADRO_MOCKS`, KV-FE-022) are announced and added to the app's `.env.example` in a small
   separate PR. Legacy-shaped numbers use `@homi/i18n` `numberLocale` (`ru-RU` for ru and uz, `en-GB` for en, `03`
   §3.1), not `@homi/utils` `intlLocale` (which maps `en` to `en-US`). Spike reports go to `docs/migration/spikes/`,
   the FD records of §9.1 to `docs/migration/decisions/`; accepted decisions become ADRs in
   `docs/architecture/decisions/`.
4. **No new third-party dependency without approval.** KV-FE-005 files every request in `scripts/packages/proposed.json`
   with the exact legacy version; a task that needs a package is `BLOCKED (approval)` until then (§9.2).
5. **The legacy tree is read-only** (`README.md`): port behaviour, not code. Quote UI strings verbatim; keep the legacy
   i18n key names (`03` §3.1, `$KVADRO_ROOT/demo/app/src/i18n/locales/{ru,uz_Latn,en}.js`), with the catalogue key `uz`
   instead of `uz_Latn` (CF-006).
6. **Defects are fixed, deviations are switchable.** Every `LB-APP`/`LB-LND`/`LB-SEO` defect fix of `09` §4.3 is
   implemented and tested. Every client-side `DEV-…` that changes what a user sees is implemented behind a typed flag in
   `frontend/app/lib/deviations.ts` (landing: `frontend/landing/lib/deviations.ts`), default **off** until the DEV is
   `APPROVED`; its test is written as `todo('DEV-NNN PROPOSED')` (`11` §1 rule 3, `15` §1.4).
7. **Visual parity.** Each screen task captures the new screen in the states of the legacy baseline set of KV-QA-019
   (`docs/migration/visual-baseline/<SCR-NNN>-<variant>.png`, 390 × 844, ru light, plus the dark / uz / en variants
   where captured) and reviews them side by side in the PR. A difference is a regression unless it is an `LB` fix or a
   DEV row (`15` §2.8).
8. **Tests.** Vitest + Testing Library (unit, component) and Playwright with a fake Telegram (E2E) once KV-FE-010 lands
   (HANDOFF T8 gate). Until then a task ships with lint, typecheck, build and a manual checklist in the PR, and its test
   files are added as soon as the runner exists. Test names are given in every task.
9. **Security.** API strings are rendered as text only; the only `dangerouslySetInnerHTML` is serialised JSON-LD
   (SEC-REQ-021); no credentials in any storage (SEC-REQ-007); `initData` never reaches logs, analytics or URLs
   (TMA-009, SEC-REQ-003, SEC-REQ-047); CSP per SEC-REQ-031; server URLs are opened only when `https:` and on the
   allowlist (SEC-REQ-019).
10. **Continuity.** `kv-*` storage keys, analytics event names and `$pageview` screen names keep their legacy names
    (`03` §3.2, §3.3), so users keep client settings and dashboards keep working at S4 (`18` §12.1).
11. **Size.** One task = one branch = one PR of roughly ≤ 400 changed lines without generated files; `make ci-frontend`
    green; reviewed by the other developer (`docs/handoff/parallel-work.md`).

## 2. Milestone overview

M9 is not on the S2 critical path **except the SEO pages**: they have no legacy artefact that HOMI could serve, so the
SEO part of FE-3 (FE-3a) is needed for S2 unless the DEC-15 contingency (HOMI proxies SEO paths to the legacy origin,
`18` §5.3) is accepted (`10` §3.10).

| ID | Milestone | Content | Tasks | Depends on | Unlocks | Stage | Blocking decisions |
| -- | --------- | ------- | ----- | ---------- | ------- | ----- | ------------------ |
| **FE-0** | Decisions and spikes | Browser-floor data, CF-011 spike, Mini App ADR, data-transport decision, dependency approvals, landing CSP spike, SEO archive | KV-FE-001…007 (7) | — | FE-1…FE-5 | — | DEC-06, DEC-08, DEC-15, DEC-23, DEC-26 |
| **FE-1** | Foundations | Test runner, tokens and UI primitives, i18n, formatters, filter model, legacy-contract client and mocks, Telegram layer, boot shell and CSP, analytics, error states, deep links | KV-FE-010…038 (29) | FE-0 (approvals, ADR) | FE-2 | S4 | DEC-06, DEC-23 |
| **FE-2** | Mini App screens, in user-flow order | Onboarding and access, shell, feed, filters, map, listing and sheets, favourites and history, radars, settings, nudges | KV-FE-040…086 (47) | FE-1; M2/M3 endpoints (or mocks); M4 radar endpoints | FE-5 | S4 | DEC-06; client DEV approvals (§9.1) |
| **FE-3a** | SEO pages (S2) | Routing, path parser, head and JSON-LD, CSP, analytics, bot links, the 14 page types, interlinking, sitemap, caching | KV-FE-100…106, KV-FE-114…129 (23) | FE-0 (archive, CSP spike); KV-BE-157…KV-BE-164 | S2 | **S2** | DEC-08, DEC-15, DEC-30, DEC-10 |
| **FE-3b** | Landing replacement (S4) | Landing data, page frame, display versions, hero and phone demo, live map, live blocks, privacy pages | KV-FE-107…113 (7) | FE-3a; FE-2 components for the phone demo | FE-5 | S4 | DEC-04 (brand copy) |
| **FE-4** | ARM (operations the audit found) | Foundation with Telegram sign-in + TOTP, access administration, takedowns and opt-outs, moderation, broadcasts — all `UNVERIFIED` placeholders | KV-FE-150…154 (5) | DEC-22; ARM API (unnumbered) | — | after S2 | DEC-22, OPQ-4 |
| **FE-5** | Parity and release | E2E, visual and behaviour comparison, performance budgets, old-WebView pass, landing and SEO parity, S4 switch readiness | KV-FE-170…177 (8) | FE-2, FE-3 | **S4** (and the SEO gate of S2) | S2 / S4 | DEC-06 |

**Dependency columns** list direct prerequisites. Every FE-2 and FE-3 task also uses the FE-1 foundations it imports —
tokens and primitives (KV-FE-011, KV-FE-012), catalogues and formatters (KV-FE-015…KV-FE-018), the Telegram adapter and
links (KV-FE-024, KV-FE-029) and the event journal (KV-FE-034) — without repeating them.

## 3. FE-0 — Decisions and spikes

**Goal.** The decisions that shape every later task are taken on data, and the approvals with the longest lead time
are filed: browser floor and Mini App strategy (DEC-06, CF-011), the Mini App's data transport, the dependency set, the
landing CSP (DEC-08) and the SEO parity archive (Q-SEO-001).

| ID | Task | Size | Features | Legacy items | Depends on | Status |
| -- | ---- | ---- | -------- | ------------ | ---------- | ------ |
| KV-FE-001 | [Browser-floor data and legacy startup baseline](tasks/frontend/KV-FE-001-browser-floor-data.md) | S | F-TMA-001, F-TMA-002, F-MAP-001 | Q-APP-001, Q-APP-018, Q-APP-022 | DEC-26 (PostHog access, product owner) | TODO |
| KV-FE-002 | [CF-011 spike: Next 16.4 client route group on old WebViews](tasks/frontend/KV-FE-002-cf011-webview-spike.md) | M | F-TMA-001 | TMA-001…TMA-005 | — (uses the legacy floor as the first target) | TODO |
| KV-FE-003 | [ADR draft: Mini App rendering, browser floor and CSP](tasks/frontend/KV-FE-003-miniapp-rendering-adr.md) | S | F-TMA-001, F-TMA-002 | DEC-06, CF-011 | KV-FE-001, KV-FE-002 | TODO |
| KV-FE-004 | [Mini App data contract and transport decision](tasks/frontend/KV-FE-004-data-contract-transport.md) | S | F-ACCESS-001, F-COMPAT-001, F-COMPAT-002 | CF-002, DEC-06 | KV-BE-012, KV-BE-013 | TODO |
| KV-FE-005 | [Frontend dependency approval request](tasks/frontend/KV-FE-005-dependency-approvals.md) | S | F-MAP-001, F-ANALYTICS-002, F-TMA-001 | DEC-23 | — | TODO |
| KV-FE-006 | [Landing and SEO CSP spike: SRI vs `'unsafe-inline'`](tasks/frontend/KV-FE-006-landing-csp-spike.md) | S | F-LANDING-007, F-SEO-009 | DEC-08, Q-SEC-013, LB-LND-009 | — | TODO |
| KV-FE-007 | [SEO archive: templates and fixtures from the legacy crawl](tasks/frontend/KV-FE-007-seo-archive-templates.md) | M | F-SEO-001…F-SEO-012 | Q-SEO-001, Q-SEO-004, Q-SEO-009, Q-SEO-010, Q-SEO-011 | crawl approval (touches production) | BLOCKED (crawl approval) |

**Exit criteria.** DEC-06 answered and the ADR merged (option A or B, browser floor, CSP model); FD-2 (transport)
recorded; the dependency request filed and answered; DEC-08 answered; the SEO archive (or the decision to proceed
without it) exists with per-type templates for ru/uz/en.

**Blockers.** DEC-06, DEC-08, DEC-15, DEC-23, DEC-26; Q-APP-001, Q-APP-018, Q-SEC-013, Q-SEO-001, Q-SEO-004.

## 4. FE-1 — Foundations

**Goal.** Everything a screen needs exists once: tokens and primitives, an i18n runtime that never throws, the money,
date, distance and flow formatters, the filter model, a typed client of the legacy contract with mocks, the Telegram
layer (boot, back stack, theme, storage, links, share, location), CSP, analytics and the error states.

| ID | Task | Size | Features | Legacy items | Depends on | Status |
| -- | ---- | ---- | -------- | ------------ | ---------- | ------ |
| KV-FE-010 | [Test runner and frontend CI wiring](tasks/frontend/KV-FE-010-test-runner-ci.md) | M | Technical (HANDOFF T8) | — | KV-FE-005 | BLOCKED (approval) |
| KV-FE-011 | [Design tokens and the brand layer in `@homi/ui`](tasks/frontend/KV-FE-011-design-tokens.md) | M | F-SETTINGS-002, F-SETTINGS-003 | `03` §3.6 | — | TODO |
| KV-FE-012 | [Shared UI primitives](tasks/frontend/KV-FE-012-ui-primitives.md) | M | F-TMA-005, F-FEED-001 | `03` §2.1 | KV-FE-011 | TODO |
| KV-FE-013 | [Sheet and sub-page primitives with gestures](tasks/frontend/KV-FE-013-sheet-subpage-gestures.md) | M | F-TMA-004, F-FILTER-001 | `03` §1.2 | KV-FE-011, KV-FE-012 | TODO |
| KV-FE-014 | [Toast and confirm dialog](tasks/frontend/KV-FE-014-toast-confirm.md) | S | F-TMA-005 | SCR-042, SCR-043, TMA-026, TMA-027 | KV-FE-012, KV-FE-024 | TODO |
| KV-FE-015 | [i18n runtime: `t()` that never throws, plurals, locale codes](tasks/frontend/KV-FE-015-i18n-runtime.md) | M | F-LOCALE-001, F-LOCALE-002 | TMA-008, LB-APP-002, LB-APP-032 | — | TODO |
| KV-FE-016 | [Mini App catalogues: 461 keys × ru/uz/en](tasks/frontend/KV-FE-016-miniapp-catalogues.md) | M | F-LOCALE-002 | `03` §3.1, LB-APP-026 | KV-FE-015 | TODO |
| KV-FE-017 | [Money and number formatting](tasks/frontend/KV-FE-017-money-number-format.md) | M | F-FILTER-006, F-SETTINGS-004, F-LOCALE-002 | `03` §3.5, LB-APP-011 | KV-FE-015, KV-QA-006 | TODO |
| KV-FE-018 | [Date, age, distance and flow formatters](tasks/frontend/KV-FE-018-date-distance-flow-format.md) | S | F-LISTING-006, F-LISTING-007, F-FILTER-005 | LB-APP-025, LB-APP-031, LB-APP-033 | KV-FE-015, KV-QA-006 | TODO |
| KV-FE-019 | [Filter model and query builder (`@homi/search`)](tasks/frontend/KV-FE-019-filter-model-query.md) | M | F-FILTER-001, F-FILTER-003 | `08` §1.7, LB-APP-007 | KV-QA-002 | TODO |
| KV-FE-020 | [Filter transitions, sort availability and summaries](tasks/frontend/KV-FE-020-filter-rules-summaries.md) | M | F-FILTER-001, F-FILTER-003, F-FILTER-004, F-RADAR-001 | LB-APP-023, LB-APP-029, LB-APP-030 | KV-FE-019, KV-FE-016 | TODO |
| KV-FE-021 | [Legacy-contract API client](tasks/frontend/KV-FE-021-legacy-api-client.md) | M | F-COMPAT-001, F-COMPAT-002, F-ACCESS-001 | TMA-007, TMA-009, LB-APP-005, LB-APP-006 | KV-FE-004, KV-FE-024; KV-BE-012, KV-BE-013 | TODO |
| KV-FE-022 | [Contract mocks from the golden fixtures](tasks/frontend/KV-FE-022-contract-mocks.md) | M | F-COMPAT-001 | `08` §2 | KV-FE-021, KV-QA-002 | TODO |
| KV-FE-023 | [Request cache, boot prefetch and session maps](tasks/frontend/KV-FE-023-request-cache-prefetch.md) | M | F-ONBOARD-001, F-FEED-001 | `03` §1.3, §1.11 | KV-FE-021 | TODO |
| KV-FE-024 | [Telegram adapter core](tasks/frontend/KV-FE-024-telegram-adapter-core.md) | M | F-TMA-002, F-TMA-003 | TMA-004, TMA-005, TMA-006, TMA-008, TMA-014…TMA-016, TMA-040…TMA-044 | — | TODO |
| KV-FE-025 | [Navigation: tabs, layer stack, BackButton, SettingsButton](tasks/frontend/KV-FE-025-navigation-layer-stack.md) | M | F-TMA-004 | TMA-022, TMA-023, TMA-024, LB-APP-046 | KV-FE-024 | TODO |
| KV-FE-026 | [Theme, safe areas and fullscreen](tasks/frontend/KV-FE-026-theme-safe-areas.md) | S | F-SETTINGS-002, F-TMA-003 | TMA-016…TMA-021 | KV-FE-011, KV-FE-024, KV-FE-028 | TODO |
| KV-FE-027 | [Graphics lite mode](tasks/frontend/KV-FE-027-graphics-lite-mode.md) | S | F-SETTINGS-003 | TMA-041 | KV-FE-011, KV-FE-028 | TODO |
| KV-FE-028 | [Client storage and the DeviceStorage policy](tasks/frontend/KV-FE-028-client-storage.md) | S | F-TMA-007 | TMA-037, TMA-038, LB-APP-012, LB-APP-021 | KV-FE-024 | TODO |
| KV-FE-029 | [Links, haptics, calls and closing](tasks/frontend/KV-FE-029-links-haptics-calls.md) | S | F-TMA-005, F-TMA-006, F-CONTACT-001 | TMA-025, TMA-028, TMA-029, TMA-032, TMA-039 | KV-FE-024 | TODO |
| KV-FE-030 | [Share and chat-access flows](tasks/frontend/KV-FE-030-share-chat-access.md) | M | F-SHARE-001, F-RADAR-008, F-TMA-006 | TMA-030, TMA-031, TMA-033, SCR-044 | KV-FE-024, KV-FE-029, KV-FE-014, KV-FE-034 | TODO |
| KV-FE-031 | [Location service and nearest city](tasks/frontend/KV-FE-031-location-service.md) | S | F-ONBOARD-003, F-PRIVACY-004 | TMA-035, LB-APP-009 | KV-FE-024 | TODO |
| KV-FE-032 | [Pre-hydration boot shell and the «Обновите Telegram» screen](tasks/frontend/KV-FE-032-boot-shell.md) | M | F-TMA-001 | TMA-001, TMA-002, TMA-003, SCR-001 | KV-FE-002, KV-FE-003, KV-FE-024 | BLOCKED (DEC-06) |
| KV-FE-033 | [Mini App CSP and security headers](tasks/frontend/KV-FE-033-miniapp-csp-headers.md) | M | F-TMA-001 | SEC-REQ-031, SEC-REQ-033, Q-SEC-012 | KV-FE-003, KV-FE-032 | BLOCKED (DEC-06) |
| KV-FE-034 | [Event journal and global error reporting](tasks/frontend/KV-FE-034-event-journal-errors.md) | S | F-ANALYTICS-001, F-TMA-009 | API-034, TMA-003, TMA-009 | KV-FE-021; KV-BE-151 | TODO |
| KV-FE-035 | [PostHog analytics and screen tracking](tasks/frontend/KV-FE-035-posthog-screen-tracking.md) | M | F-ANALYTICS-002 | RES-006, LB-APP-037 | KV-FE-005, KV-FE-025 | BLOCKED (approval) |
| KV-FE-036 | [Error boundary, crash screen and session-expired state](tasks/frontend/KV-FE-036-error-boundary-session.md) | S | F-TMA-009, F-ACCESS-001 | SCR-045, LB-APP-047 | KV-FE-016, KV-FE-025, KV-FE-034 | TODO |
| KV-FE-037 | [Deep-link router: `start_param`, `?listing=`, `?news=`](tasks/frontend/KV-FE-037-deep-link-router.md) | S | F-SHARE-002, F-TMA-001 | TMA-010…TMA-013, URL-052…URL-057 | KV-FE-024 | TODO |
| KV-FE-038 | [Dev-only Telegram emulator](tasks/frontend/KV-FE-038-dev-telegram-emulator.md) | S | F-TMA-010 | TMA-045 | KV-FE-024 | TODO |

**Exit criteria.** A blank `(miniapp)` shell boots inside Telegram (dev bot, KV-INF-001) and in the emulator on the
decided floor, shows the boot screen on a forced boot failure, renders text from all three catalogues without a
throw for a missing key, formats the KV-QA-006 money and time fixtures identically to the server formatter, and
answers every endpoint from the contract mocks; `make ci-frontend` runs the first unit tests.

**Blockers.** DEC-06 (boot shell, CSP), DEC-23 (runner, PostHog), KV-QA-002 (fixtures), KV-QA-006 (shared money and
time fixtures).

## 5. FE-2 — Mini App screens

**Goal.** Every legacy screen, sheet, overlay and state (`SCR-001…SCR-045`) exists in the new Mini App with the same
capabilities, texts, storage keys and analytics, the `LB-APP` defects fixed and the client DEVs behind flags. Order is
the user flow: onboarding and access → shell → feed → filters → map → listing → saved → radars → settings → nudges.

| ID | Task | Size | Features | Legacy items | Depends on | Status |
| -- | ---- | ---- | -------- | ------------ | ---------- | ------ |
| KV-FE-040 | [Bootstrap provider and render gating](tasks/frontend/KV-FE-040-bootstrap-render-gating.md) | M | F-ONBOARD-001, F-ACCESS-002, F-LOCALE-001 | API-001, API-002, `03` §1.3–§1.4 | KV-FE-015, KV-FE-017, KV-FE-021, KV-FE-023, KV-FE-024, KV-FE-026, KV-FE-028, KV-FE-034, KV-FE-037; KV-BE-029, KV-BE-030 (KV-FE-035 hooks in when approved) | TODO |
| KV-FE-041 | [Outside-Telegram state](tasks/frontend/KV-FE-041-outside-telegram.md) | S | F-TMA-002 | SCR-002, TMA-043, API-003 | KV-FE-040; KV-BE-022 | TODO |
| KV-FE-042 | [No-access screen](tasks/frontend/KV-FE-042-no-access-screen.md) | M | F-ACCESS-002 | SCR-003, DEV-001, LB-APP-045 | KV-FE-040, KV-FE-037, KV-FE-029; KV-BE-009, KV-BE-022 | TODO |
| KV-FE-043 | [First-launch language picker](tasks/frontend/KV-FE-043-language-picker.md) | S | F-ONBOARD-002, F-LOCALE-001 | SCR-004, LB-APP-041 | KV-FE-040; KV-BE-045 | TODO |
| KV-FE-044 | [City picker sheet and the first-launch variant](tasks/frontend/KV-FE-044-city-picker.md) | M | F-ONBOARD-003, F-FILTER-004 | SCR-005, SCR-017, DEV-023 | KV-FE-013, KV-FE-020, KV-FE-031, KV-FE-040; KV-BE-030, KV-BE-045 | TODO |
| KV-FE-045 | [App shell: top bar, tab bar, view toggle, collapsing chrome](tasks/frontend/KV-FE-045-app-shell.md) | M | F-TMA-004 | SCR-006 | KV-FE-012, KV-FE-016, KV-FE-025, KV-FE-026 | TODO |
| KV-FE-046 | [Pull-to-refresh](tasks/frontend/KV-FE-046-pull-to-refresh.md) | S | F-FEED-003 | SCR-010 | KV-FE-045 | TODO |
| KV-FE-047 | [Listing card and photo strip](tasks/frontend/KV-FE-047-listing-card.md) | M | F-FEED-001, F-OWNER-002, F-MEDIA-001, F-FAV-001 | `03` §2.1, RES-001, RES-002, LB-APP-039 | KV-FE-012, KV-FE-016, KV-FE-017, KV-FE-018; KV-BE-027, KV-BE-028 | TODO |
| KV-FE-048 | [Search feed list with header chips and paging](tasks/frontend/KV-FE-048-search-feed.md) | M | F-FEED-001 | SCR-007, SCR-008, API-004, LB-APP-042 | KV-FE-019, KV-FE-023, KV-FE-045, KV-FE-047; KV-BE-031 | TODO |
| KV-FE-049 | [Feed empty and few-results states](tasks/frontend/KV-FE-049-feed-empty-few.md) | S | F-FEED-002 | SCR-009, DEV-024 | KV-FE-048, KV-FE-074 | TODO |
| KV-FE-050 | [Filters sheet: shell, footer, live count and flow](tasks/frontend/KV-FE-050-filters-sheet-shell.md) | M | F-FILTER-001, F-FILTER-005 | SCR-014, API-005, API-006 | KV-FE-013, KV-FE-014, KV-FE-020; KV-BE-032 | TODO |
| KV-FE-051 | [Filters: deal, city, housing, rent term, rooms](tasks/frontend/KV-FE-051-filters-deal-city-rooms.md) | M | F-FILTER-001 | SCR-014 | KV-FE-050, KV-FE-044 | TODO |
| KV-FE-052 | [Filters: price section and «Не дороже рынка»](tasks/frontend/KV-FE-052-filters-price.md) | M | F-FILTER-006, F-FILTER-007 | SCR-014, SCR-015, DEV-025, DEV-052 | KV-FE-050, KV-FE-017; KV-BE-024 | TODO |
| KV-FE-053 | [Filters: «Где искать» — area, zones, metro, districts](tasks/frontend/KV-FE-053-filters-where.md) | M | F-FILTER-001, F-MAP-002 | SCR-014 | KV-FE-050 | TODO |
| KV-FE-054 | [Filters: owner, tenant, pets, furniture, renovation, floor, area, market, appliances, posted](tasks/frontend/KV-FE-054-filters-preferences.md) | M | F-FILTER-001 | SCR-014, DEV-017 | KV-FE-050, KV-FE-028 | TODO |
| KV-FE-055 | [Quick filter sheet: rooms, price, owner](tasks/frontend/KV-FE-055-quick-filter-sheet.md) | S | F-FILTER-002 | SCR-015, LB-APP-042 | KV-FE-051, KV-FE-052 | TODO |
| KV-FE-056 | [Sort sheet](tasks/frontend/KV-FE-056-sort-sheet.md) | S | F-FILTER-003 | SCR-016, LB-APP-023 | KV-FE-013, KV-FE-020 | TODO |
| KV-FE-057 | [Map engine selection and loader](tasks/frontend/KV-FE-057-map-engine-loader.md) | M | F-MAP-001, F-MEDIA-002 | SCR-011, RES-003, RES-004, LB-APP-018, LB-APP-019 | KV-FE-005, KV-FE-027, KV-FE-028; KV-BE-029, KV-INF-009, KV-INF-021 | BLOCKED (approval) |
| KV-FE-058 | [Search map view: points, clusters, stacks, pins, camera](tasks/frontend/KV-FE-058-search-map-view.md) | L | F-MAP-001 | SCR-011, API-007, LB-APP-008, LB-APP-020, LB-APP-044 | KV-FE-057, KV-FE-019, KV-FE-031; KV-BE-033 | BLOCKED (approval) |
| KV-FE-059 | [Leaflet fallback map](tasks/frontend/KV-FE-059-leaflet-fallback.md) | M | F-MAP-001 | SCR-011, LB-APP-013 | KV-FE-057, KV-FE-058, KV-FE-001, KV-FE-005 | BLOCKED (Q-APP-018, approval) |
| KV-FE-060 | [Lasso area drawing](tasks/frontend/KV-FE-060-lasso-drawing.md) | M | F-MAP-002 | SCR-012 | KV-FE-058 | BLOCKED (approval) |
| KV-FE-061 | [Map selection card](tasks/frontend/KV-FE-061-map-selection-card.md) | S | F-MAP-003 | SCR-013, DEV-013, LB-APP-017 | KV-FE-058, KV-FE-047; KV-BE-036 | BLOCKED (approval) |
| KV-FE-062 | [Map tile prefetch and preload](tasks/frontend/KV-FE-062-map-tile-prefetch.md) | S | F-MAP-001, F-MEDIA-002 | SCR-011 | KV-FE-057, KV-FE-048 | BLOCKED (approval) |
| KV-FE-063 | [Listing screen: shell, hero, title row, key facts, loading and errors](tasks/frontend/KV-FE-063-listing-screen-shell.md) | L | F-LISTING-001, F-LISTING-002 | SCR-018, SCR-019, API-008, LB-APP-003 | KV-FE-013, KV-FE-023, KV-FE-025, KV-FE-047; KV-BE-036, KV-BE-018 | TODO |
| KV-FE-064 | [Listing: facts, stats, history, description](tasks/frontend/KV-FE-064-listing-facts-history.md) | M | F-LISTING-001, F-LISTING-006 | SCR-018, DEV-014 | KV-FE-063, KV-FE-018 | TODO |
| KV-FE-065 | [Listing: source, original text and translation](tasks/frontend/KV-FE-065-listing-source-translation.md) | M | F-LISTING-005, F-CONTACT-002 | SCR-018, API-010, DEV-008 | KV-FE-063, KV-FE-029; KV-BE-048 | TODO |
| KV-FE-066 | [Listing: market block and «Откуда эта цифра»](tasks/frontend/KV-FE-066-listing-market.md) | M | F-LISTING-004 | SCR-022, LB-APP-015, LB-APP-039 | KV-FE-063, KV-FE-013, KV-FE-017 | TODO |
| KV-FE-067 | [Listing: location, nearby and the fullscreen spot map](tasks/frontend/KV-FE-067-listing-location-spot-map.md) | M | F-LISTING-003, F-LISTING-007 | SCR-021, LB-APP-001, LB-APP-016, DEV-019 | KV-FE-063, KV-FE-057, KV-FE-031, KV-FE-029 | BLOCKED (approval) |
| KV-FE-068 | [Listing: CTA bar and contact](tasks/frontend/KV-FE-068-listing-cta-contact.md) | M | F-CONTACT-001, F-CONTACT-002 | SCR-018, API-009, RES-005, LB-APP-028, DEV-007 | KV-FE-063, KV-FE-029, KV-FE-034; KV-BE-035, KV-BE-037 | TODO |
| KV-FE-069 | [Listing share](tasks/frontend/KV-FE-069-listing-share.md) | S | F-SHARE-001 | SCR-018, SCR-044, API-017 | KV-FE-063, KV-FE-030; KV-BE-046 | TODO |
| KV-FE-070 | [Photo viewer](tasks/frontend/KV-FE-070-photo-viewer.md) | M | F-LISTING-002 | SCR-020, LB-APP-004 | KV-FE-063, KV-FE-025 | TODO |
| KV-FE-071 | [Listing actions sheet: hide, block, report, support](tasks/frontend/KV-FE-071-listing-actions-sheet.md) | M | F-HIDE-001, F-HIDE-002, F-REPORT-001 | SCR-023, API-012…API-016, DEV-051 | KV-FE-063, KV-FE-013, KV-FE-014; KV-BE-040, KV-BE-041, KV-BE-043, KV-BE-022 | TODO |
| KV-FE-072 | [Saved tab: favourites](tasks/frontend/KV-FE-072-favourites.md) | S | F-FAV-001 | SCR-024, API-029, DEV-003, LB-APP-022 | KV-FE-045, KV-FE-047, KV-FE-048; KV-BE-038 | TODO |
| KV-FE-073 | [History «Смотрели»](tasks/frontend/KV-FE-073-history.md) | S | F-HISTORY-001 | SCR-025, API-030, API-031 | KV-FE-072, KV-FE-014; KV-BE-039 | TODO |
| KV-FE-074 | [Radar subscribe flow (create, reactivate, widen, `no_chat`)](tasks/frontend/KV-FE-074-radar-subscribe-flow.md) | M | F-RADAR-002, F-RADAR-006, F-RADAR-008 | API-018, API-019, API-021, API-023, LB-APP-005 | KV-FE-014, KV-FE-019, KV-FE-021, KV-FE-030; KV-BE-101, KV-BE-102, KV-BE-103, KV-BE-104, KV-BE-105 | TODO |
| KV-FE-075 | [Radar tab: list, tiles, previews](tasks/frontend/KV-FE-075-radar-tab.md) | M | F-RADAR-001, F-FILTER-005 | SCR-026, LB-APP-014, LB-APP-036 | KV-FE-018, KV-FE-045, KV-FE-047, KV-FE-074; KV-BE-101, KV-BE-032 | TODO |
| KV-FE-076 | [Radar empty state](tasks/frontend/KV-FE-076-radar-empty-state.md) | S | F-RADAR-001 | SCR-027 | KV-FE-075 | TODO |
| KV-FE-077 | [Radar subscription sheet](tasks/frontend/KV-FE-077-radar-sheet.md) | M | F-RADAR-004, F-RADAR-005 | SCR-028, API-021, API-022, API-024, DEV-022 | KV-FE-013, KV-FE-014, KV-FE-047, KV-FE-075, KV-FE-079; KV-BE-104, KV-BE-106, KV-BE-045 | TODO |
| KV-FE-078 | [New radar and radar editor sheets](tasks/frontend/KV-FE-078-radar-create-edit.md) | M | F-RADAR-002, F-RADAR-003 | SCR-029, SCR-030, API-019, API-020, API-023 | KV-FE-050…KV-FE-054, KV-FE-074; KV-BE-103, KV-BE-105, KV-BE-032 | TODO |
| KV-FE-079 | [«Нашли жильё?» survey](tasks/frontend/KV-FE-079-found-survey.md) | S | F-DELIVERY-007 | SCR-031, API-032, API-033 | KV-FE-013, KV-FE-030; KV-BE-044 | TODO |
| KV-FE-080 | [Radar follow nudge](tasks/frontend/KV-FE-080-follow-nudge.md) | S | F-RADAR-007 | SCR-040, LB-APP-006 | KV-FE-028, KV-FE-034, KV-FE-048, KV-FE-074 | TODO |
| KV-FE-081 | [Settings screen and «О приложении»](tasks/frontend/KV-FE-081-settings-screen.md) | M | F-SETTINGS-001 | SCR-032, API-024, API-026 | KV-FE-012, KV-FE-013, KV-FE-045, KV-FE-086; KV-BE-045, KV-BE-042, KV-BE-022, KV-BE-101 | TODO |
| KV-FE-082 | [Settings › Theme and Graphics](tasks/frontend/KV-FE-082-settings-theme-graphics.md) | S | F-SETTINGS-002, F-SETTINGS-003 | SCR-033, SCR-034 | KV-FE-081, KV-FE-026, KV-FE-027 | TODO |
| KV-FE-083 | [Settings › Language and Currency, without a reload](tasks/frontend/KV-FE-083-settings-language-currency.md) | S | F-LOCALE-001, F-SETTINGS-004 | SCR-035, SCR-036, LB-APP-041 | KV-FE-081, KV-FE-015, KV-FE-017, KV-FE-023; KV-BE-045, KV-BE-020 | TODO |
| KV-FE-084 | [Settings › Quiet hours and Digest time](tasks/frontend/KV-FE-084-settings-quiet-digest.md) | S | F-SETTINGS-005 | SCR-037, SCR-038 | KV-FE-081 | TODO |
| KV-FE-085 | [Settings › «Скрытое»](tasks/frontend/KV-FE-085-settings-hidden.md) | M | F-HIDE-003 | SCR-039, API-026…API-028, DEV-034 | KV-FE-081, KV-FE-047, KV-FE-014; KV-BE-042 | TODO |
| KV-FE-086 | [Home-screen nudge and settings row](tasks/frontend/KV-FE-086-home-screen-nudge.md) | S | F-TMA-008 | SCR-041, TMA-036, LB-APP-010, LB-APP-040 | KV-FE-014, KV-FE-028, KV-FE-034, KV-FE-045 | TODO |

**Exit criteria.** Each of SCR-001…SCR-045 is reachable in the new Mini App against the contract mocks and against a
local HOMI backend for every endpoint that exists; its KV-QA-019 baseline states are reviewed side by side; every
`LB-APP` defect fix of `09` §4.3 has a test; every client DEV sits behind its flag with a `todo` test.

**Blockers.** DEC-06; the radar endpoints API-018…API-023 (KV-BE-101…KV-BE-105) and the event intake API-034
(KV-BE-151) — contract mocks until they land; Q-APP-005…Q-APP-012 (data shapes the fixes guard against);
Q-APP-018 (Leaflet); DEV approvals of §9.1.

## 6. FE-3 — Landing and SEO pages

**Goal.** `frontend/landing` serves every public URL of `03b` §6 with the legacy behaviour (CF-010): the 1 008 SEO
pages, sitemap, robots and the CSV links for **S2** (FE-3a), and the re-implemented landing and privacy pages for
**S4** (FE-3b), with the `LB-LND` / `LB-SEO` fixes and the landing DEVs behind flags.

| ID | Task | Size | Features | Legacy items | Depends on | Status |
| -- | ---- | ---- | -------- | ------------ | ---------- | ------ |
| KV-FE-100 | [Landing routing: language prefixes, trailing slash, legacy redirects, localised 404](tasks/frontend/KV-FE-100-landing-routing-404.md) | M | F-SEO-001, F-SEO-012, F-LANDING-001, F-LANDING-009 | LND-038, LND-055, URL-001…URL-005, URL-007, URL-039 | — | TODO |
| KV-FE-101 | [SEO path parser and builder](tasks/frontend/KV-FE-101-seo-path-parser.md) | M | F-SEO-001 | URL-023…URL-039, DEV-045, DEV-047, DEV-048 | KV-FE-100; KV-DB-006, KV-DB-034, KV-BE-157, KV-BE-159, KV-BE-163 | TODO |
| KV-FE-102 | [Landing and SEO catalogues and formatters](tasks/frontend/KV-FE-102-landing-seo-i18n.md) | M | F-LANDING-006, F-SEO-002 | LND-028, LND-029, LB-SEO-001, LB-SEO-002, LB-LND-011 | KV-FE-015, KV-FE-017, KV-FE-007 | TODO |
| KV-FE-103 | [Head metadata, JSON-LD, manifest, icons and og images](tasks/frontend/KV-FE-103-head-metadata-assets.md) | M | F-LANDING-007, F-SEO-008 | LND-033, LND-035, LND-057, URL-011, URL-013…URL-016, DEV-042 | KV-FE-100, KV-FE-101, KV-FE-102 | TODO |
| KV-FE-104 | [Landing and SEO CSP and security headers](tasks/frontend/KV-FE-104-landing-csp-headers.md) | S | F-LANDING-007, F-SEO-009 | LND-034, RES-015, URL-021 | KV-FE-006, KV-FE-100; KV-INF-024, KV-BE-153 | BLOCKED (DEC-08) |
| KV-FE-105 | [Site analytics loader and visit id](tasks/frontend/KV-FE-105-site-analytics.md) | S | F-ANALYTICS-004 | LND-031, LND-063, RES-014 | KV-FE-104 | TODO |
| KV-FE-106 | [Bot and Mini App link builders for landing and SEO](tasks/frontend/KV-FE-106-bot-link-builders.md) | S | F-LANDING-005, F-SEO-010 | LND-030, LND-062, URL-045…URL-055, DEV-040, DEV-049 | KV-FE-101, KV-FE-105; KV-BE-154, KV-BE-155, KV-BE-159, KV-BE-160, KV-TG-015 | TODO |
| KV-FE-107 | [Landing data contract and snapshot rendering](tasks/frontend/KV-FE-107-landing-data-snapshot.md) | M | F-LANDING-003, F-MEDIA-004, F-PIPELINE-008 | LND-032, LND-036, RES-010…RES-013, DEV-012, DEV-039 | KV-FE-100, KV-FE-102; KV-BE-154, KV-BE-155, KV-BE-156 | TODO |
| KV-FE-108 | [Landing page frame: header, language menu, final block, footer, QR, dock](tasks/frontend/KV-FE-108-landing-frame.md) | M | F-LANDING-001, F-LANDING-004, F-LANDING-005, F-LANDING-006 | LND-001, LND-002, LND-004, LND-016…LND-020, LND-027, LND-029 | KV-FE-100, KV-FE-102, KV-FE-103, KV-FE-106 | TODO |
| KV-FE-109 | [Landing display versions, motion and responsive behaviour](tasks/frontend/KV-FE-109-landing-display-versions.md) | M | F-LANDING-002, F-LANDING-008 | LND-021…LND-026, LND-037, DEV-043 | KV-FE-108 | TODO |
| KV-FE-110 | [Landing hero scene and the phone demo](tasks/frontend/KV-FE-110-landing-hero-phone.md) | L | F-LANDING-002 | LND-005, LND-006, LND-007, LND-009, LND-010, LND-011 | KV-FE-109, KV-FE-045, KV-FE-047, KV-FE-107 | TODO |
| KV-FE-111 | [Landing live map in the phone](tasks/frontend/KV-FE-111-landing-live-map.md) | M | F-LANDING-003 | LND-008 | KV-FE-110, KV-FE-107, KV-FE-106 | TODO |
| KV-FE-112 | [Landing live pushes, owner/agent switch, savings block, FAQ](tasks/frontend/KV-FE-112-landing-live-owner-savings-faq.md) | M | F-LANDING-003, F-LANDING-004 | LND-012, LND-013, LND-014, LND-015 | KV-FE-107, KV-FE-108, KV-FE-109 | TODO |
| KV-FE-113 | [Privacy pages](tasks/frontend/KV-FE-113-privacy-pages.md) | S | F-PRIVACY-001, F-LANDING-010 | LND-003, LND-039, URL-010, URL-022, DEV-041, DEV-044 | KV-FE-100, KV-FE-102, KV-FE-103; KV-BE-049, KV-TG-048 | TODO |
| KV-FE-114 | [SEO page frame: breadcrumbs, counters, CTA, footer](tasks/frontend/KV-FE-114-seo-page-frame.md) | M | F-SEO-002 | LND-040, LND-041 | KV-FE-101, KV-FE-102, KV-FE-103, KV-FE-106; KV-BE-157, KV-BE-159 | TODO |
| KV-FE-115 | [SEO listing cards, sorting and photos](tasks/frontend/KV-FE-115-seo-cards-sorting.md) | M | F-SEO-007 | LND-056, LND-060, URL-037 | KV-FE-114; KV-BE-160, KV-BE-026 | TODO |
| KV-FE-116 | [SEO section hubs](tasks/frontend/KV-FE-116-seo-section-hubs.md) | S | F-SEO-002 | LND-042, URL-023 | KV-FE-114, KV-FE-115 | TODO |
| KV-FE-117 | [SEO city pages](tasks/frontend/KV-FE-117-seo-city-pages.md) | M | F-SEO-002 | LND-043, LND-044, URL-024 | KV-FE-114, KV-FE-115 | TODO |
| KV-FE-118 | [SEO rooms pages: city + rooms, district + rooms](tasks/frontend/KV-FE-118-seo-rooms-pages.md) | M | F-SEO-002 | LND-045, URL-025, URL-027 | KV-FE-117, KV-FE-119 | TODO |
| KV-FE-119 | [SEO district pages](tasks/frontend/KV-FE-119-seo-district-pages.md) | M | F-SEO-002 | LND-046, URL-026 | KV-FE-117; KV-BE-158 | TODO |
| KV-FE-120 | [SEO quarter pages](tasks/frontend/KV-FE-120-seo-quarter-pages.md) | M | F-SEO-003 | LND-047, URL-028 | KV-FE-119; KV-BE-158 | TODO |
| KV-FE-121 | [SEO metro hub and station pages](tasks/frontend/KV-FE-121-seo-metro-pages.md) | M | F-SEO-003 | LND-048, LND-049, URL-029, URL-030 | KV-FE-114, KV-FE-115; KV-BE-158 | TODO |
| KV-FE-122 | [SEO by-owner pages](tasks/frontend/KV-FE-122-seo-by-owner-pages.md) | S | F-SEO-004 | LND-050, URL-031, URL-032 | KV-FE-119; KV-BE-158 | TODO |
| KV-FE-123 | [SEO new-builds pages](tasks/frontend/KV-FE-123-seo-new-builds-pages.md) | M | F-SEO-005 | LND-051, DEV-046 | KV-FE-117, KV-FE-118, KV-FE-119 | TODO |
| KV-FE-124 | [Rent index page](tasks/frontend/KV-FE-124-seo-rent-index.md) | L | F-SEO-006 | LND-052, LND-061, URL-033, URL-040 | KV-FE-114; KV-BE-161, KV-BE-162 | TODO |
| KV-FE-125 | [Sale prices page](tasks/frontend/KV-FE-125-seo-sale-prices.md) | M | F-SEO-006 | LND-053, LND-061, URL-035, URL-041 | KV-FE-124; KV-BE-161, KV-BE-162 | TODO |
| KV-FE-126 | [Methodology page](tasks/frontend/KV-FE-126-seo-methodology.md) | S | F-SEO-006, F-LANDING-010 | LND-054, URL-034 | KV-FE-114 | TODO |
| KV-FE-127 | [SEO interlinking blocks](tasks/frontend/KV-FE-127-seo-interlinking.md) | M | F-SEO-011 | LND-064, DEV-050 | KV-FE-116…KV-FE-123; KV-BE-164 | TODO |
| KV-FE-128 | [Indexing rules, sitemap and robots](tasks/frontend/KV-FE-128-seo-sitemap-robots.md) | M | F-SEO-008 | LND-058, RES-019, RES-020, URL-012, URL-036 | KV-FE-101, KV-FE-103; KV-BE-163 | BLOCKED (DEC-30) |
| KV-FE-129 | [SEO caching, revalidation and HTTP headers](tasks/frontend/KV-FE-129-seo-caching-headers.md) | S | F-SEO-009, F-PIPELINE-008 | LND-059, RES-017 | KV-FE-104, KV-FE-114 (shares `frontend/landing/proxy.ts` with KV-FE-100) | TODO |

**Exit criteria.** FE-3a: every URL of the generated 1 008-page list and of `data/public-urls.json` that is owned by
the landing app answers on staging as the URL suite (KV-QA-014) and the crawl comparison (KV-FE-176) expect: status,
canonical, hreflang, robots, title, H1, card count, CSV link. FE-3b: the 40 landing scenarios (KV-QA-013) pass or map to
an `LB-LND` decision.

**Blockers.** The public statistics API, sitemap data, CSV files and landing data (KV-BE-154…KV-BE-163, `11a`);
DEC-08, DEC-15, DEC-30, DEC-10 (SEO currency stays USD until it says otherwise), DEC-14 (no per-listing pages); Q-SEO-001,
Q-SEO-002, Q-SEO-004, Q-SEO-009…Q-SEO-011, Q-SEO-020; Q-LND-008 (PostHog selectors).

## 7. FE-4 — ARM (operations the audit found)

**Goal.** Placeholders for the operator work the audit could infer but never saw (Q-SYS-004, Q-API-058, GAP-023): no
legacy admin UI exists, so every task is **`UNVERIFIED` in scope** and stays `BLOCKED` until DEC-22 (roles, admin list,
TOTP) and OPQ-4 are answered and the ARM API exists. Until then the backend's artisan commands (KV-BE-011) are the
operator tool.

| ID | Task | Size | Features | Legacy items | Depends on | Status |
| -- | ---- | ---- | -------- | ------------ | ---------- | ------ |
| KV-FE-150 | [ARM foundation: Telegram sign-in, TOTP, roles, layout](tasks/frontend/KV-FE-150-arm-foundation.md) | M | F-ADMIN-001 | GAP-023, SEC-REQ-046 | DEC-22; ARM auth API (unnumbered) | BLOCKED (DEC-22) |
| KV-FE-151 | [ARM access administration](tasks/frontend/KV-FE-151-arm-access-admin.md) | M | F-ADMIN-001 | GAP-020, BR-API-016 | KV-FE-150; KV-BE-011 | BLOCKED (DEC-22) |
| KV-FE-152 | [ARM takedowns and channel opt-outs](tasks/frontend/KV-FE-152-arm-takedowns-sources.md) | M | F-ADMIN-002, F-PIPELINE-001 | BR-API-043, BR-API-068, SEC-REQ-040 | KV-FE-150; KV-BE-126, KV-BE-138 | BLOCKED (DEC-22) |
| KV-FE-153 | [ARM report and vote moderation](tasks/frontend/KV-FE-153-arm-moderation.md) | M | F-ADMIN-003, F-REPORT-003 | DEV-010, SEC-REQ-045 | KV-FE-150 | BLOCKED (DEC-22, OPQ-4) |
| KV-FE-154 | [ARM service-news broadcasts](tasks/frontend/KV-FE-154-arm-broadcasts.md) | M | F-DELIVERY-008 | BR-API-148, SEC-REQ-029 | KV-FE-150 | BLOCKED (DEC-22) |

**Exit criteria.** Once unblocked: each operation of GAP-023 that the product owner keeps has a screen with an audited
action (SEC-REQ-046); `noindex` everywhere (ADR-0013).

**Blockers.** DEC-22, OPQ-4, Q-SEC-018, DEC-21 (support bot), the ARM API (no backend task numbered yet).

## 8. FE-5 — Parity and release

**Goal.** Evidence for gate G4/G8/G10 of `15` §4.1 on every frontend feature, and a reversible S4 switch.

| ID | Task | Size | Features | Legacy items | Depends on | Status |
| -- | ---- | ---- | -------- | ------------ | ---------- | ------ |
| KV-FE-170 | [Mini App E2E suite with a fake Telegram](tasks/frontend/KV-FE-170-miniapp-e2e.md) | L | F-TMA-001…F-TMA-009, F-FEED-001, F-RADAR-002 | `15` §2.7 | KV-FE-010, KV-FE-022 | BLOCKED (approval) |
| KV-FE-171 | [Visual comparison against the legacy baselines](tasks/frontend/KV-FE-171-miniapp-visual-comparison.md) | M | F-TMA-004, F-FEED-001, F-LISTING-001 | SCR-001…SCR-045 | KV-QA-019, KV-FE-170 | TODO |
| KV-FE-172 | [Behaviour comparison with the legacy reference client](tasks/frontend/KV-FE-172-miniapp-behaviour-comparison.md) | M | F-COMPAT-001, F-FILTER-001, F-MAP-001 | `15` §2.5 | KV-QA-011, KV-QA-012, KV-FE-170 | TODO |
| KV-FE-173 | [Mini App performance budgets](tasks/frontend/KV-FE-173-miniapp-performance.md) | M | F-TMA-001, F-FEED-001 | `10` §5.12 | KV-FE-001, KV-FE-010 | TODO |
| KV-FE-174 | [Old-WebView and device pass](tasks/frontend/KV-FE-174-webview-device-pass.md) | M | F-TMA-001…F-TMA-009 | TMA-001…TMA-045 | KV-FE-003, KV-QA-022 | TODO |
| KV-FE-175 | [Landing parity run and performance](tasks/frontend/KV-FE-175-landing-parity.md) | M | F-LANDING-001…F-LANDING-010 | `03b` §1.6 | KV-QA-013, KV-FE-108…KV-FE-113 | TODO |
| KV-FE-176 | [SEO crawl parity gate](tasks/frontend/KV-FE-176-seo-crawl-parity.md) | M | F-SEO-001…F-SEO-012 | Q-SEO-001, `10` §5.13 | KV-FE-007, KV-FE-114…KV-FE-129, KV-QA-014 | TODO |
| KV-FE-177 | [S4 canary and switch readiness](tasks/frontend/KV-FE-177-s4-switch-readiness.md) | M | F-TMA-001, F-LANDING-001 | `18` §12.1 | KV-FE-170…KV-FE-175 | TODO |

**Exit criteria.** The parity-gate rows (`docs/migration/data/parity-gate.csv`, KV-QA-023) of every frontend feature
have G4, G8 and G10 `done`; S4 has a written canary plan, budgets and a rollback that swaps the files back (`18` §12.1).

## 9. Decisions and approvals the frontend needs

### 9.1 Decisions

`FD-n` labels are local to this roadmap; the owner of `10` §8 turns them into `DEC-…` rows where they are new.

| # | Decision | Options | Recommendation | Who | Blocks |
| - | -------- | ------- | -------------- | --- | ------ |
| FD-1 | Mini App strategy and browser floor (= DEC-06, CF-011) | A: Next client route group / B: Vite SPA | the rule of `10` §3.11 on the data of KV-FE-001 and the spike of KV-FE-002 | product owner (floor), developer, first developer (hosting) | KV-FE-032, KV-FE-033, all FE-2 paths |
| FD-2 | Mini App data transport at S4 (**new**; `10` §5.6–§5.7 assumed `/api/v1` + Sanctum token, the frozen contract of `13` is the legacy surface) | A: legacy surface `/api/*` with `tma` (same origin, byte-tested, server-formatted strings) / B: `/api/v1` adapters with the T6 token exchange (raw values; needs the unnumbered adapters of `11` §12) | A for S4 behind a typed port; B later, and before S5 can remove the legacy surface. DEV-002, DEV-003, DEV-007 and DEV-008 are written for v1 and apply only with B | developer + first developer | KV-FE-021, KV-FE-036, S5 (`18` §12.2) |
| FD-3 | Port the Leaflet fallback or GL only | keep both / GL + raster fallback only | decide on the GL/Leaflet/lite session shares (Q-APP-018) from KV-FE-001 | developer + product owner | KV-FE-059 |
| FD-4 | Client DEV approvals | approve / reject each | approve the client-only fixes with no legacy-client impact first: DEV-001, DEV-013, DEV-014, DEV-016, DEV-018, DEV-019, DEV-020, DEV-021, DEV-022, DEV-023, DEV-024, DEV-025; then the landing/SEO set DEV-038…DEV-050. Not client-only: DEV-003, DEV-007, DEV-008 need the v1 server half (FD-2 = B; under A the client can only hide the number or keep the POST), DEV-051 needs a vote-withdrawal route that the legacy surface lacks (KV-BE-043 has only the service) | developer (+ product owner for SEO and copy) | flags in FE-2 and FE-3 |
| FD-5 | Landing and SEO CSP (= DEC-08) | nonce + dynamic / experimental SRI / `'unsafe-inline'` with recorded risk | per the spike KV-FE-006 | developer + security review | KV-FE-104 |
| FD-6 | SEO pages at S2 or the proxy contingency (= DEC-15) | full / contingency | full; contingency only if the crawl gate KV-FE-176 fails | first developer + product owner | FE-3a scope |
| FD-7 | ARM scope and roles (= DEC-22, OPQ-4) | — | moderator, operator, admin; TOTP mandatory | product owner | FE-4 |
| FD-8 | Brand assets in the new apps (logos, mascots `empty-magnifier.svg`, `empty-shrug.svg`, `hooray.webp`, the yellow accent) during S4 (CF-008, DEC-04) | copy the legacy assets into the brand layer / redraw | copy into one brand layer so S6 touches one place | product owner | KV-FE-011, KV-FE-012 |
| FD-9 | PostHog project for the new clients (= DEC-26) | legacy EU project / new | legacy project in production (distinct-id continuity) | product owner | KV-FE-035, KV-FE-105 |
| FD-10 | Thin-page threshold (= DEC-30) and the indexing policy (DEV-050) | legacy threshold / new | legacy at S2, review after | product owner | KV-FE-128 |

### 9.2 New npm packages — PROPOSED, needs approval (dependency change)

Filed by KV-FE-005 in `scripts/packages/proposed.json`. Versions are the ones the legacy production bundle ships
(`$KVADRO_ROOT/demo/app/package.json`; `03` §1.10); ranges marked "inferred" come from the recovery and need a check.

| # | Package | Legacy version | For | Tasks | Without it |
| - | ------- | -------------- | --- | ----- | ---------- |
| 1 | `maplibre-gl` | `6.11.2` (legacy loads the vendored ESM `/assets/maplibre-gl-6.11.2/maplibre-gl.mjs`) | GL map, spot map | KV-FE-057, KV-FE-058, KV-FE-060, KV-FE-061, KV-FE-062, KV-FE-067 | no map |
| 2 | `pmtiles` | `^4.5.0` (inferred) | vector tiles from `meta.tiles` (RES-003) | KV-FE-057 | raster OSM only (RES-004) |
| 3 | `supercluster` | `^8.0.1` (inferred) | GL clustering, radius 48, maxZoom 17 | KV-FE-058 | in-house grid clustering |
| 4 | `leaflet` | `1.9.4` | Leaflet fallback, lite mode | KV-FE-059 | GL only (FD-3) |
| 5 | `leaflet.markercluster` | `1.5.3` | Leaflet clusters | KV-FE-059 | as 4 |
| 6 | `protomaps-leaflet` | `^5.1.0` (inferred) | vector basemap in Leaflet | KV-FE-059 | raster basemap in Leaflet |
| 7 | `posthog-js` | `1.434.15` | Mini App analytics (RES-006) | KV-FE-035 | journal events only (API-034) |
| 8 | `lucide-react` | `^1.69.0` (inferred) | the icon set used in 45 legacy files | KV-FE-012 | hand-copied SVG icons in `@homi/ui` |
| 9 | `vitest`, `@testing-library/react`, `@testing-library/dom`, `jsdom` | — (HOMI T8) | unit and component tests | KV-FE-010 | no unit tests |
| 10 | `@playwright/test` | — (HOMI T8; or the Pest browser plugin chosen in KV-QA-010) | E2E, screenshots | KV-FE-010, KV-FE-170, KV-FE-171 | Dusk smoke only |
| 11 | optional: `zod` (or hand-written guards) | — | response normalisation (LB-APP-005, LB-APP-006) | KV-FE-021 | hand-written guards (default) |
| 12 | optional: a query library (TanStack Query or SWR) | — | request cache (`10` §5.5) | KV-FE-023 | in-house cache (default) |
| 13 | optional: an image-diff tool | — | automatic visual diff (`15` §2.14) | KV-FE-171 | human side-by-side review |
| 14 | `vite` (+ `@vitejs/plugin-react`) — **only if DEC-06 picks option B** | — (legacy built with Vite 8) | the static Mini App build | KV-FE-003, KV-FE-032 | option A (Next route group) |

The landing loads PostHog as legacy does, from `https://eu-assets.i.posthog.com/static/<version>/array.js` (LND-031),
so it needs no npm package. The 12 Noto Sans `woff2` map-label glyph files (`03` §3.6) are assets, not packages (OFL).

## 10. Cross-track needs

Only task ids verified on disk on 2026-11-09 are named (the backend M4/M6/M7 files `KV-BE-1NN` were being written in
parallel; the ids below existed as files at writing time); unnumbered work is named by API, feature or decision.

| # | Need | From | Used by |
| - | ---- | ---- | ------- |
| 1 | Frozen legacy contract (OpenAPI) | KV-BE-012, KV-BE-013 | KV-FE-004, KV-FE-021 |
| 2 | Golden fixtures per endpoint and model | KV-QA-002 | KV-FE-019, KV-FE-022, every FE-2 test |
| 3 | Shared money and time fixtures | KV-QA-006 | KV-FE-017, KV-FE-018 |
| 4 | Enum-safety key list (`legacy-i18n-keys.json`) | KV-QA-002 (writes it), KV-QA-007 (uses it) | KV-FE-016 (whichever task lands first commits the list; the other checks it is byte-identical) |
| 5 | Bootstrap and reads: API-001, API-002, API-003, API-004…API-008 | KV-BE-029, KV-BE-030, KV-BE-022, KV-BE-031, KV-BE-032, KV-BE-033, KV-BE-036 | KV-FE-040…KV-FE-063 |
| 6 | Per-user endpoints API-009…API-017, API-024…API-033 | KV-BE-035, KV-BE-037, KV-BE-038…KV-BE-046, KV-BE-048 | KV-FE-065…KV-FE-085 |
| 7 | Radar endpoints API-018…API-023, starter and relax options, hide count | KV-BE-101…KV-BE-106 | KV-FE-074…KV-FE-078 |
| 8 | Event intake API-034, CSP reports RES-015 | KV-BE-151, KV-BE-153 | KV-FE-034, KV-FE-104 |
| 9 | Landing data files and snapshots (RES-010…RES-013); SEO slice catalogue, place statistics, public statistics API, slice cards, index series, CSV (RES-018), sitemap data (RES-019) | KV-BE-154…KV-BE-156; KV-BE-157…KV-BE-164 | KV-FE-107, KV-FE-114…KV-FE-129 |
| 10 | Signed photo URLs and the legacy media route (RES-001, RES-002) | KV-BE-026, KV-BE-027 | KV-FE-047, KV-FE-115 |
| 11 | Gazetteer dictionaries and slugs (cities, districts, quarters, stations, cases per language) | KV-DB-006, KV-DB-034, KV-BE-015 | KV-FE-101, KV-FE-102 |
| 12 | Local legacy-host aliases and `/media`, PMTiles serving | KV-INF-002, KV-INF-009 | local Mini App and landing runs |
| 13 | PMTiles on `cdn.*` with `Range` and CORS | KV-INF-021 **[PT]** | KV-FE-057 |
| 14 | Security headers per vhost, CSP header config | KV-INF-024 **[PT]** | KV-FE-033, KV-FE-104 |
| 15 | Legacy artefact manifest and CSP hashes (the transition client) | KV-INF-010 | KV-FE-171, KV-FE-172 (reference runs) |
| 16 | Deploy pipeline and smoke tests for the Next processes | KV-INF-023 **[PT]** | KV-FE-177 |
| 17 | Dev bot per developer, staging bot | KV-INF-001, KV-INF-017 **[PT]** | KV-FE-002, KV-FE-174 |
| 18 | Reference-client runner, base and filter/map scenarios, visual baselines, URL suite, device pass, parity-gate file | KV-QA-010, KV-QA-011, KV-QA-012, KV-QA-019, KV-QA-014, KV-QA-022, KV-QA-023 | FE-5 |
| 19 | Bot parsing of the payloads the frontend emits (`s_web…`, `s_<src>--l<id>`, `s_friend`); the `s_seo…` payload per slice is delivered by the public statistics API (KV-BE-159) and only validated by the frontend | KV-TG-015, KV-TG-016, KV-BE-159 | KV-FE-042, KV-FE-079, KV-FE-106 |
| 20 | `/api/v1` adapters (bootstrap, feed, listing, lists, settings, radars) and T6 exchange — only if FD-2 = B | unnumbered (`11` §12); T6 reuses KV-BE-006 | KV-FE-021 transport B |
| 21 | ARM API (auth with TOTP, access admin, moderation, broadcasts); the takedown and channel opt-out services exist as KV-BE-138, KV-BE-126 | unnumbered ARM endpoints (GAP-023, DEC-22) | FE-4 |
| 22 | A vote-withdrawal route on the legacy surface (or v1) for the «rented» undo of DEV-051; the service exists in KV-BE-043 | unnumbered (DEV-051 approval) | KV-FE-071 |
| 23 | Frozen rent-index and sale-price history from the archive (Q-SEO-013) | KV-BE-161 | KV-FE-007 (provides the archived CSVs) |

## 11. Execution order

1. **KV-FE-005** — file the dependency request now: approval latency gates the runner, the map and PostHog.
2. **KV-FE-007** — the SEO archive: the uz/en templates of most page types are unknown (Q-SEO-004) and FE-3a sits on
   the S2 critical path; the crawl itself needs the developer's approval (it touches production).
3. **KV-FE-001** — the browser-floor data request to the product owner (DEC-06 cannot be decided without it).
4. **KV-FE-002** — the CF-011 spike, no dependency change needed; it runs on the legacy floor while the data arrives.
5. **KV-FE-100** — landing routing, the first FE-3a step; then KV-FE-101 → KV-FE-102 → KV-FE-103 → KV-FE-114.

In parallel and without decisions: KV-FE-004, KV-FE-011, KV-FE-015, KV-FE-016, KV-FE-017, KV-FE-018, KV-FE-019,
KV-FE-024. After DEC-06: KV-FE-003 → KV-FE-032 → KV-FE-033, then FE-2 in table order.

## 12. Coverage

### 12.1 Screens (`SCR`, 45 of 45)

| # | Screen | Task |
| - | ------ | ---- |
| 1 | SCR-001 boot failure | KV-FE-032 |
| 2 | SCR-002 outside Telegram | KV-FE-041 |
| 3 | SCR-003 no access | KV-FE-042 |
| 4 | SCR-004 language picker | KV-FE-043 |
| 5 | SCR-005 first-launch city picker | KV-FE-044 |
| 6 | SCR-006 app shell | KV-FE-045 (navigation KV-FE-025) |
| 7 | SCR-007 search feed | KV-FE-048 (card KV-FE-047) |
| 8 | SCR-008 feed loading and errors | KV-FE-048 |
| 9 | SCR-009 feed empty and few results | KV-FE-049 |
| 10 | SCR-010 pull-to-refresh | KV-FE-046 |
| 11 | SCR-011 search map | KV-FE-057, KV-FE-058, KV-FE-059, KV-FE-062 |
| 12 | SCR-012 lasso | KV-FE-060 |
| 13 | SCR-013 map selection card | KV-FE-061 |
| 14 | SCR-014 full filters sheet | KV-FE-050, KV-FE-051, KV-FE-052, KV-FE-053, KV-FE-054 |
| 15 | SCR-015 quick filter sheet | KV-FE-055 |
| 16 | SCR-016 sort sheet | KV-FE-056 |
| 17 | SCR-017 city picker | KV-FE-044 |
| 18 | SCR-018 listing screen | KV-FE-063…KV-FE-069 |
| 19 | SCR-019 listing loading and errors | KV-FE-063 |
| 20 | SCR-020 photo viewer | KV-FE-070 |
| 21 | SCR-021 fullscreen spot map | KV-FE-067 |
| 22 | SCR-022 market sheet | KV-FE-066 |
| 23 | SCR-023 listing actions | KV-FE-071 |
| 24 | SCR-024 favourites | KV-FE-072 |
| 25 | SCR-025 history | KV-FE-073 |
| 26 | SCR-026 radar tab | KV-FE-075 |
| 27 | SCR-027 radar empty state | KV-FE-076 |
| 28 | SCR-028 radar sheet | KV-FE-077 |
| 29 | SCR-029 radar editor | KV-FE-078 |
| 30 | SCR-030 new radar | KV-FE-078 |
| 31 | SCR-031 found survey | KV-FE-079 |
| 32 | SCR-032 settings | KV-FE-081 |
| 33 | SCR-033 theme | KV-FE-082 |
| 34 | SCR-034 graphics | KV-FE-082 |
| 35 | SCR-035 language | KV-FE-083 |
| 36 | SCR-036 currency | KV-FE-083 |
| 37 | SCR-037 quiet hours | KV-FE-084 |
| 38 | SCR-038 digest time | KV-FE-084 |
| 39 | SCR-039 hidden | KV-FE-085 |
| 40 | SCR-040 follow nudge | KV-FE-080 |
| 41 | SCR-041 home-screen nudge | KV-FE-086 |
| 42 | SCR-042 toast | KV-FE-014 |
| 43 | SCR-043 confirm dialogs | KV-FE-014 |
| 44 | SCR-044 Telegram system sheets | KV-FE-029, KV-FE-030, KV-FE-031, KV-FE-086 |
| 45 | SCR-045 crash screen | KV-FE-036 |

### 12.2 Telegram integration points (`TMA`, 45 of 45)

| # | Item | Task | Note |
| - | ---- | ---- | ---- |
| 1 | TMA-001 SDK script tag | KV-FE-032 | `beforeInteractive` (option A) |
| 2 | TMA-002 native-callback stubs | KV-FE-032 | |
| 3 | TMA-003 boot watchdog | KV-FE-032, KV-FE-034 | |
| 4 | TMA-004 3 s SDK wait, late SDK | KV-FE-024 | |
| 5 | TMA-005 native bridge without SDK | KV-FE-024 | |
| 6 | TMA-006 initData source | KV-FE-024 | |
| 7 | TMA-007 `tma` header | KV-FE-021 | transport per FD-2 |
| 8 | TMA-008 user language | KV-FE-024, KV-FE-015 | one detector (DEV-020) |
| 9 | TMA-009 initData out of logs | KV-FE-021, KV-FE-034, KV-FE-035 | |
| 10 | TMA-010 `start_param` → listing | KV-FE-037 | |
| 11 | TMA-011 source formats | KV-FE-037, KV-FE-042 | |
| 12 | TMA-012 Mini App query parameters | KV-FE-037, KV-FE-057 (`?map=`) | |
| 13 | TMA-013 deep links created | KV-FE-037 (builders), KV-FE-042, KV-FE-069, KV-FE-071, KV-FE-079, KV-FE-081 | |
| 14 | TMA-014 `ready`, `expand` | KV-FE-024 | |
| 15 | TMA-015 vertical swipes off | KV-FE-024 | |
| 16 | TMA-016 fullscreen | KV-FE-024, KV-FE-026 | |
| 17 | TMA-017 safe areas | KV-FE-026 | |
| 18 | TMA-018 viewport height (absence) | KV-FE-026 | kept as an absence |
| 19 | TMA-019 `themeParams` | KV-FE-026 | |
| 20 | TMA-020 header and background colour | KV-FE-026 | |
| 21 | TMA-021 app theme override | KV-FE-026, KV-FE-082 | |
| 22 | TMA-022 BackButton stack | KV-FE-025 | |
| 23 | TMA-023 SettingsButton | KV-FE-025 | LB-APP-046 fixed |
| 24 | TMA-024 MainButton (absence) | KV-FE-025 | recorded as "not used": a MainButton port would be a product change |
| 25 | TMA-025 haptics | KV-FE-029 | |
| 26 | TMA-026 `showConfirm` | KV-FE-014 | |
| 27 | TMA-027 popups (absence) | KV-FE-014 | kept as an absence |
| 28 | TMA-028 `openLink` | KV-FE-029 | |
| 29 | TMA-029 phone calls | KV-FE-029, KV-FE-068 | |
| 30 | TMA-030 `shareMessage` | KV-FE-030, KV-FE-069 | |
| 31 | TMA-031 share fallbacks | KV-FE-030 | |
| 32 | TMA-032 unused share APIs (absence) | KV-FE-029 | kept as an absence |
| 33 | TMA-033 `requestWriteAccess` | KV-FE-030, KV-FE-074 | |
| 34 | TMA-034 `requestContact` | WP-81 | used by the owner form since legacy release `index-CBlEKxdL.js`; the bot's `/owner` keeps its own contact share |
| 35 | TMA-035 location | KV-FE-031 | LB-APP-009 fixed |
| 36 | TMA-036 home-screen shortcut | KV-FE-086 | |
| 37 | TMA-037 DeviceStorage | KV-FE-028 | |
| 38 | TMA-038 Cloud/Secure storage (absence) | KV-FE-028 | kept as an absence; SEC-REQ-007 |
| 39 | TMA-039 closing | KV-FE-029 | |
| 40 | TMA-040 visibility | KV-FE-024 | |
| 41 | TMA-041 platform checks | KV-FE-024, KV-FE-027 | |
| 42 | TMA-042 version gates | KV-FE-024 | |
| 43 | TMA-043 outside Telegram | KV-FE-024, KV-FE-041 | |
| 44 | TMA-044 exception isolation | KV-FE-024 | |
| 45 | TMA-045 dev emulator | KV-FE-038 | dev tooling |

### 12.3 Landing and SEO items (`LND`, 64 of 64)

| # | Item | Task |
| - | ---- | ---- |
| 1 | LND-001 landing ru | KV-FE-108 |
| 2 | LND-002 landing uz, en | KV-FE-100, KV-FE-108 |
| 3 | LND-003 privacy | KV-FE-113 |
| 4 | LND-004 header and language menu | KV-FE-108 |
| 5 | LND-005 hero scene | KV-FE-110 |
| 6 | LND-006 phone demo | KV-FE-110 |
| 7 | LND-007 steps | KV-FE-110 |
| 8 | LND-008 live map | KV-FE-111 |
| 9 | LND-009 demo finger and cursor | KV-FE-110 |
| 10 | LND-010 hints and scroll cue | KV-FE-110 |
| 11 | LND-011 lock-screen phase | KV-FE-110, KV-FE-112 |
| 12 | LND-012 «Узнавайте первым» | KV-FE-112 |
| 13 | LND-013 owner/agent switch | KV-FE-112 |
| 14 | LND-014 savings block | KV-FE-112 |
| 15 | LND-015 FAQ | KV-FE-112 |
| 16 | LND-016 final block | KV-FE-108 |
| 17 | LND-017 footer row | KV-FE-108 |
| 18 | LND-018 footer SEO links | KV-FE-108 |
| 19 | LND-019 floating QR | KV-FE-108 |
| 20 | LND-020 dock | KV-FE-108 |
| 21 | LND-021 display versions | KV-FE-109 |
| 22 | LND-022 v1 scroll scene | KV-FE-109 |
| 23 | LND-023 v2 time-driven show | KV-FE-109 |
| 24 | LND-024 static layout | KV-FE-109 |
| 25 | LND-025 responsive | KV-FE-109 |
| 26 | LND-026 theme colour | KV-FE-109 |
| 27 | LND-027 language selection | KV-FE-100, KV-FE-108 |
| 28 | LND-028 client texts, plurals, numbers | KV-FE-102 |
| 29 | LND-029 server-side localisation | KV-FE-100, KV-FE-102 |
| 30 | LND-030 bot links with tag and visit | KV-FE-106 |
| 31 | LND-031 analytics | KV-FE-105 |
| 32 | LND-032 data snapshot loading | KV-FE-107 |
| 33 | LND-033 head metadata | KV-FE-103 |
| 34 | LND-034 CSP and stamps | KV-FE-104 |
| 35 | LND-035 robots, manifest, icons, og | KV-FE-103, KV-FE-128 |
| 36 | LND-036 generated files | KV-FE-107, KV-FE-110 |
| 37 | LND-037 debug parameters | KV-FE-109 |
| 38 | LND-038 HTTP routing | KV-FE-100 |
| 39 | LND-039 Cloudflare e-mail obfuscation | KV-FE-113, KV-FE-126 (dropped per DEV-044) |
| 40 | LND-040 SEO pages general | KV-FE-114 |
| 41 | LND-041 page frame | KV-FE-114 |
| 42 | LND-042 section hub | KV-FE-116 |
| 43 | LND-043 city with districts | KV-FE-117 |
| 44 | LND-044 city without districts | KV-FE-117 |
| 45 | LND-045 rooms pages | KV-FE-118 |
| 46 | LND-046 district | KV-FE-119 |
| 47 | LND-047 quarter | KV-FE-120 |
| 48 | LND-048 metro hub | KV-FE-121 |
| 49 | LND-049 metro station | KV-FE-121 |
| 50 | LND-050 by owner | KV-FE-122 |
| 51 | LND-051 new builds | KV-FE-123 |
| 52 | LND-052 rent index | KV-FE-124 |
| 53 | LND-053 sale prices | KV-FE-125 |
| 54 | LND-054 methodology | KV-FE-126 |
| 55 | LND-055 404 | KV-FE-100 |
| 56 | LND-056 cards and sorting | KV-FE-115 |
| 57 | LND-057 head | KV-FE-103 |
| 58 | LND-058 indexing and sitemap | KV-FE-128 |
| 59 | LND-059 HTTP headers and CDN | KV-FE-129 |
| 60 | LND-060 photos | KV-FE-115 |
| 61 | LND-061 CSV exports | KV-FE-124, KV-FE-125 (links and `Dataset`; the files are backend output) |
| 62 | LND-062 bot and Mini App links | KV-FE-106 |
| 63 | LND-063 analytics on SEO pages | KV-FE-105 |
| 64 | LND-064 interlinking | KV-FE-127 |

### 12.4 Public URLs (`URL`, 62 of 62)

| # | URL | Task | Note |
| - | --- | ---- | ---- |
| 1 | URL-001…URL-003 landing | KV-FE-100, KV-FE-108 | S1–S3 served from the legacy files (infrastructure) |
| 2 | URL-004, URL-005 redirects | KV-FE-100 | |
| 3 | URL-006 `?s=` / `?utm_source=` | KV-FE-106 | |
| 4 | URL-007 `?lang=` | KV-FE-100 | DEV-038 flag |
| 5 | URL-008, URL-009 display and debug parameters | KV-FE-109 | DEV-043 flag |
| 6 | URL-010 privacy | KV-FE-113 | DEV-041 flag |
| 7 | URL-011 robots | KV-FE-128, KV-FE-103 | |
| 8 | URL-012 sitemap | KV-FE-128 | |
| 9 | URL-013…URL-016 manifest, icons, favicon, og images | KV-FE-103 | |
| 10 | URL-017, URL-018 versioned landing assets and images | KV-FE-108, KV-FE-109 | replaced by the build (no redirect needed, `03b` §6.2) |
| 11 | URL-019 landing data files | KV-FE-107 | produced by the backend |
| 12 | URL-020 `img/snap/` | KV-FE-107 | dropped per DEV-012; snapshots come from the media pipeline |
| 13 | URL-021 CSP report endpoint | KV-FE-104 | endpoint is backend (RES-015) |
| 14 | URL-022 Cloudflare e-mail links | KV-FE-113 | not emitted (DEV-044) |
| 15 | URL-023…URL-035 SEO page types | KV-FE-101, KV-FE-114…KV-FE-126 | hubs (all three sections) KV-FE-116; rent and sale city/rooms/district pages KV-FE-117…KV-FE-119; every new-builds page below the hub KV-FE-123 |
| 16 | URL-036 thin slices | KV-FE-128 | |
| 17 | URL-037 `?sort=` | KV-FE-115 | |
| 18 | URL-038 ignored parameters, `?page=` | KV-FE-101 | DEV-045 flag |
| 19 | URL-039 trailing slash | KV-FE-100 | |
| 20 | URL-040, URL-041 CSV | KV-FE-124, KV-FE-125 | files are backend output served by nginx |
| 21 | URL-042, URL-043 media | KV-FE-047, KV-FE-115 | consumed; the route is backend (KV-BE-027) |
| 22 | URL-044 call page | KV-FE-068 | consumed; the page is backend (KV-BE-037, CF-013) |
| 23 | URL-045…URL-049 bot links | KV-FE-106, KV-FE-042, KV-FE-079 | emitted; parsed by the bot (KV-TG-015) |
| 24 | URL-050, URL-051 support bot | KV-FE-042, KV-FE-071, KV-FE-081, KV-FE-108, KV-FE-114 | emitted (DEC-21 decides the target) |
| 25 | URL-052…URL-056 `startapp` | KV-FE-037 (parse), KV-FE-069, KV-FE-106, KV-FE-111, KV-FE-115 (emit) | |
| 26 | URL-057 Mini App origin | KV-FE-037, KV-FE-177 | |
| 27 | URL-058 `t.me/share/url` | KV-FE-030 | |
| 28 | URL-059 source post | KV-FE-042, KV-FE-065, KV-FE-068 | |
| 29 | URL-060 Instagram | KV-FE-081, KV-FE-108, KV-FE-114 | |
| 30 | URL-061 project mailbox | KV-FE-113, KV-FE-126 | |
| 31 | URL-062 OpenStreetMap attribution | KV-FE-108, KV-FE-057 | |

### 12.5 Features with frontend work (`09`, column `new_frontend`)

| # | Feature | Task |
| - | ------- | ---- |
| 1 | F-ACCESS-001 | KV-FE-004, KV-FE-021, KV-FE-024, KV-FE-036 |
| 2 | F-ACCESS-002 | KV-FE-040, KV-FE-042 |
| 3 | F-COMPAT-001, F-COMPAT-002 | KV-FE-004, KV-FE-021, KV-FE-022 (the new client honours the dialect; the legacy client is served unchanged by the infrastructure track) |
| 4 | F-ONBOARD-001 | KV-FE-023, KV-FE-040 |
| 5 | F-ONBOARD-002 | KV-FE-043 |
| 6 | F-ONBOARD-003 | KV-FE-031, KV-FE-044 |
| 7 | F-FEED-001 | KV-FE-047, KV-FE-048 |
| 8 | F-FEED-002 | KV-FE-049 |
| 9 | F-FEED-003 | KV-FE-046 |
| 10 | F-FILTER-001 | KV-FE-019, KV-FE-020, KV-FE-050…KV-FE-054 |
| 11 | F-FILTER-002 | KV-FE-055 |
| 12 | F-FILTER-003 | KV-FE-020, KV-FE-056 |
| 13 | F-FILTER-004 | KV-FE-044 |
| 14 | F-FILTER-005 | KV-FE-050, KV-FE-075 |
| 15 | F-FILTER-006 | KV-FE-017, KV-FE-052 |
| 16 | F-FILTER-007 | KV-FE-052 |
| 17 | F-MAP-001 | KV-FE-057, KV-FE-058, KV-FE-059, KV-FE-062 |
| 18 | F-MAP-002 | KV-FE-053, KV-FE-060 |
| 19 | F-MAP-003 | KV-FE-061 |
| 20 | F-LISTING-001 | KV-FE-063, KV-FE-064 |
| 21 | F-LISTING-002 | KV-FE-063, KV-FE-070 |
| 22 | F-LISTING-003 | KV-FE-067 |
| 23 | F-LISTING-004 | KV-FE-066 |
| 24 | F-LISTING-005 | KV-FE-065 |
| 25 | F-LISTING-006 | KV-FE-064 |
| 26 | F-LISTING-007 | KV-FE-067 |
| 27 | F-CONTACT-001 | KV-FE-029, KV-FE-068 |
| 28 | F-CONTACT-002 | KV-FE-065, KV-FE-068 |
| 29 | F-SHARE-001 | KV-FE-030, KV-FE-069 |
| 30 | F-SHARE-002 | KV-FE-037 |
| 31 | F-FAV-001 | KV-FE-047, KV-FE-072 |
| 32 | F-HISTORY-001 | KV-FE-073 |
| 33 | F-HIDE-001, F-HIDE-002 | KV-FE-071 |
| 34 | F-HIDE-003 | KV-FE-085 |
| 35 | F-REPORT-001 | KV-FE-071 |
| 36 | F-REPORT-003 | KV-FE-153 |
| 37 | F-OWNER-002 | KV-FE-047 |
| 38 | F-RADAR-001 | KV-FE-075, KV-FE-076 |
| 39 | F-RADAR-002 | KV-FE-074, KV-FE-078 |
| 40 | F-RADAR-003 | KV-FE-078 |
| 41 | F-RADAR-004, F-RADAR-005 | KV-FE-077 |
| 42 | F-RADAR-006 | KV-FE-074 |
| 43 | F-RADAR-007 | KV-FE-080 |
| 44 | F-RADAR-008 | KV-FE-030, KV-FE-074 |
| 45 | F-DELIVERY-007 | KV-FE-079 |
| 46 | F-DELIVERY-008 | KV-FE-154 |
| 47 | F-SETTINGS-001 | KV-FE-081 |
| 48 | F-SETTINGS-002 | KV-FE-026, KV-FE-082 |
| 49 | F-SETTINGS-003 | KV-FE-027, KV-FE-082 |
| 50 | F-SETTINGS-004 | KV-FE-017, KV-FE-083 |
| 51 | F-SETTINGS-005 | KV-FE-084 |
| 52 | F-PRIVACY-001 | KV-FE-113 (landing pages; the bot `/privacy` is telegram track) |
| 53 | F-PRIVACY-004 | KV-FE-031 (location stays on the device) |
| 54 | F-LOCALE-001 | KV-FE-015, KV-FE-043, KV-FE-083 |
| 55 | F-LOCALE-002 | KV-FE-015, KV-FE-016, KV-FE-017 |
| 56 | F-LOCALE-003 | KV-FE-047, KV-FE-063 (server strings rendered as sent; the strings are backend, KV-BE-020) |
| 57 | F-TMA-001 | KV-FE-001…KV-FE-003, KV-FE-032, KV-FE-033 |
| 58 | F-TMA-002 | KV-FE-024, KV-FE-041 |
| 59 | F-TMA-003 | KV-FE-024, KV-FE-026 |
| 60 | F-TMA-004 | KV-FE-025, KV-FE-045 |
| 61 | F-TMA-005 | KV-FE-014, KV-FE-029 |
| 62 | F-TMA-006 | KV-FE-029, KV-FE-030 |
| 63 | F-TMA-007 | KV-FE-028 |
| 64 | F-TMA-008 | KV-FE-086 |
| 65 | F-TMA-009 | KV-FE-034, KV-FE-036 |
| 66 | F-TMA-010 | KV-FE-038 |
| 67 | F-LANDING-001 | KV-FE-100, KV-FE-108 |
| 68 | F-LANDING-002 | KV-FE-109, KV-FE-110 |
| 69 | F-LANDING-003 | KV-FE-107, KV-FE-111, KV-FE-112 |
| 70 | F-LANDING-004 | KV-FE-108, KV-FE-112 |
| 71 | F-LANDING-005 | KV-FE-106, KV-FE-108 |
| 72 | F-LANDING-006 | KV-FE-102, KV-FE-108 |
| 73 | F-LANDING-007 | KV-FE-103, KV-FE-104 |
| 74 | F-LANDING-008 | KV-FE-109 |
| 75 | F-LANDING-009 | KV-FE-100 |
| 76 | F-LANDING-010 | KV-FE-113, KV-FE-126 |
| 77 | F-SEO-001 | KV-FE-100, KV-FE-101 |
| 78 | F-SEO-002 | KV-FE-114, KV-FE-116…KV-FE-119 |
| 79 | F-SEO-003 | KV-FE-120, KV-FE-121 |
| 80 | F-SEO-004 | KV-FE-122 |
| 81 | F-SEO-005 | KV-FE-123 |
| 82 | F-SEO-006 | KV-FE-124, KV-FE-125, KV-FE-126 |
| 83 | F-SEO-007 | KV-FE-115 |
| 84 | F-SEO-008 | KV-FE-103, KV-FE-128 |
| 85 | F-SEO-009 | KV-FE-104, KV-FE-129 |
| 86 | F-SEO-010 | KV-FE-106 |
| 87 | F-SEO-011 | KV-FE-127 |
| 88 | F-SEO-012 | KV-FE-100 |
| 89 | F-MEDIA-001 | KV-FE-047 |
| 90 | F-MEDIA-002 | KV-FE-057, KV-FE-062 |
| 91 | F-MEDIA-004 | KV-FE-107 |
| 92 | F-PIPELINE-001 | KV-FE-152 (ARM sources) |
| 93 | F-PIPELINE-008 | KV-FE-107, KV-FE-129 |
| 94 | F-ANALYTICS-001 | KV-FE-034 |
| 95 | F-ANALYTICS-002 | KV-FE-035 |
| 96 | F-ANALYTICS-004 | KV-FE-105 |
| 97 | F-ADMIN-001 | KV-FE-150, KV-FE-151 |
| 98 | F-ADMIN-002 | KV-FE-152 |
| 99 | F-ADMIN-003 | KV-FE-153 |

### 12.6 Items without a frontend task (justified)

| # | Item | Why |
| - | ---- | --- |
| 1 | F-MEDIA-003, RES-005, URL-044 (call page) | a Laravel no-JS page on the Mini App origin (CF-013), KV-BE-037; the Mini App only opens it (KV-FE-068) |
| 2 | F-LANDING-011, RES-016 (`/api/landing/*`) | obsolete endpoints, `DEPRECATED_CANDIDATE` (Q-API-049) |
| 3 | TMA-034 (`requestContact`) | no longer an absence: the owner form uses it (WP-81); the bot's `/owner` (F-OWNER-001) keeps its own contact share |
| 4 | F-SUPPORT-001 (support bot) | outside the parity scope until DEC-21; the frontend only emits URL-050 / URL-051 |
| 5 | Bot-only features (F-BOT-…, F-ONBOARD-004, F-ONBOARD-005, F-FAV-002, F-REPORT-002, F-HIDE-004, F-OWNER-001, F-SETTINGS-006, F-LOCALE-004, F-PRIVACY-002, F-DELIVERY-001…F-DELIVERY-006) | telegram track (`11b`) |
| 6 | Server-only features (F-ACCESS-003, F-PRIVACY-003, F-PIPELINE-002…F-PIPELINE-007, F-ANALYTICS-003, F-BOT-012) | no UI |
| 7 | Serving the legacy Mini App and landing artefacts during S1–S3 (F-TMA-001 transition client, RES-008, RES-009, RES-014) | infrastructure track (KV-INF-010, KV-INF-016, KV-INF-024); the frontend uses them only as the reference (FE-5) |
| 8 | RES-021 (Cloudflare edge artefacts) | not emitted by HOMI (DEV-044) |
| 9 | RES-022 (bot updates) | backend / telegram track |

## 13. Counts

| Milestone | Tasks | S | M | L | Blocked at writing time |
| --------- | ----: | -: | -: | -: | ----------------------- |
| FE-0 | 7 | 5 | 2 | 0 | 1 (crawl approval) |
| FE-1 | 29 | 11 | 18 | 0 | 4 (approval, DEC-06) |
| FE-2 | 47 | 18 | 27 | 2 | 7 (map approval, Q-APP-018) |
| FE-3 | 30 | 8 | 20 | 2 | 2 (DEC-08, DEC-30) |
| FE-4 | 5 | 0 | 5 | 0 | 5 (DEC-22) |
| FE-5 | 8 | 0 | 7 | 1 | 1 (approval) |
| **Total** | **126** | **42** | **79** | **5** | **20** |

No task is `XL`. Every SCR (45), TMA (45), LND (64) and URL (62) item is mapped in §12, one TMA item and the call-page
and obsolete-endpoint items with a recorded reason.
