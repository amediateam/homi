# 23 — Coverage audit (independent second pass)

A mechanical re-enumeration of the legacy sources, checked item by item against the migration audit. The auditor did
not write the audit. Every number below comes from enumerating the **sources** first and then searching the audit
for each item.

- **Date:** 2026-11-09.
- **Legacy tree:** `$KVADRO_ROOT`. It was only read (`rg`, `find`, `sed`, Python reads). Nothing was run, built or
  written there.
- **Audit snapshot:** `docs/migration/` with `01`–`10`, `13`–`18`, `README.md`, `data/*` and `tasks/qa/*`.
  `11-backend-roadmap.md` appeared at the very end of this pass and is not part of the denominators. `12` and
  `19`–`22` did not exist yet. Other agents were editing documents during the pass, so the final run was repeated on
  the latest files. The ID index was regenerated first with `python3 scripts/migration/collect_ids.py`.
- **Tooling:** throw-away scripts in a scratch directory outside both repositories, not committed. "Audit corpus"
  means the concatenated text of `docs/migration/**/*.{md,json,csv}` without `data/ids.csv` and without this file.
  Citation forms that were recognised: `$KVADRO_ROOT/<path>[:line[-line]]`, plus the shorthands defined in the audit
  (`Doc:` = `docs/api.md`, `tb:` / `tb … l.N` / `BOT:` = `docs/telegram-bot.md`, `SEO:`, `About:` / `ab:` / `ABT:`
  = `docs/about.md`, `IDX:`, `LJS:`, `REC:`, `STJ:`, `PRV:`, `CSS:`, `SP:`, `SCN:`, `SRV:`, `UZ:`, `EN:`).
- **Severity of a miss:** **high** means behaviour or data would be lost in the migration. **Medium** means a contract,
  legal or decision gap that is not yet a loss. **Low** means presentation, register hygiene or a stale reference.

## 0. Result

**No high-severity misses were found.** Three medium and twelve low misses are listed in §9. The audit's own inventories
(04 §0.1, 03 §3, 08 §2) matched the source enumerations in every count except the i18n prefix table (§1.4).

| # | Check | Enumerated from the sources | Denominator | Covered | Misses (H / M / L) |
| - | ----- | --------------------------- | ----------: | ------: | ------------------ |
| 1.1 | Mini App source files | `find …/demo/app/src -type f` | 219 | 204 by name or glob; 15 CSS presentational | 0 / 0 / 2 |
| 1.2 | Mini App HTTP calls | `/api/…` method + path pairs | 34 | 34 | 0 / 0 / 0 |
| 1.2b | Non-API resources used by the client | `/media`, `/tiles`, `/call`, OSM, PostHog, SDK | 7 | 7 | 0 / 0 / 0 |
| 1.3 | Back-handler sites | `pushBackHandler(` call sites | 14 | 14 | 0 / 0 / 0 |
| 1.3b | Screen-like components | `*Screen`, `*Sheet`, `*Picker`, `*Viewer`, overlays, states | 39 | 39 | 0 / 0 / 1 |
| 1.4 | i18n namespaces | 461 keys × 3 locales | 42 | 42 (40 reach an SCR) | 0 / 0 / 1 |
| 1.5 | Analytics event names | `trackEvent`, `sendErrorEvent`, `$pageview` | 17 (+16 screen names) | 17 (+16) | 0 / 0 / 0 |
| 1.6 | Client storage keys | `kv-*` (Mini App + landing) | 12 | 12 | 0 / 0 / 0 |
| 1.7 | Telegram WebApp integration points | SDK members, events, native bridge, CSS vars | 34 | 34 | 0 / 0 / 0 |
| 1.8 | `TODO: inferred from build` | `rg TODO` | 4 | 4 | 0 / 0 / 0 |
| 1.9 | Extra sweeps (strings, fields, constants, mocks, PostHog) | see §1.9 | 7; 98; 68; 159; 5 | 7; 81 (17 are SDK options); 66; 158; 3 | 0 / 0 / 2 |
| 2 | API contract `docs/api.md` | §2 rows; fields in all `ts` blocks; §14 items | 34; 241; 12 | 34; 241; 11 | 0 / 1 / 0 |
| 3 | Bot `docs/telegram-bot.md` | §3, §6, §7, §8, §10, §11, §12 | 10; 25; 54; 17; 6; 10; 18 | all | 0 / 0 / 1 |
| 4 | Landing and SEO | site files, data files, URL patterns, page types, calculations, quirks, gaps | 35; 4; 15; 12; 9; 7 + 2; 8 | all | 0 / 0 / 0 |
| 5 | `docs/about.md` | §5, §8.1, §8.2, §8.4, §8.5, §9.1–9.3, §10, §11 | 11; 9; 5; 9; 10; 19; 12; 17 | all (2 of §11 partial) | 0 / 1 / 0 |
| 6 | Mini App docs | RECOVERY §7; deferred items; ported release changes; MODULE_MAP modules | 14; 0; 23; 126 | 14; —; 22; 126 | 0 / 0 / 1 |
| 7 | `data/features.csv` rules | rows | 144 | 144 / 144 / 144 / 6 of 6 | 0 / 0 / 1 |
| 8 | Hygiene | paths, secrets, PII, citations, ID index | 1 181 + 1 523 citations | 2 out of range; `--check` failing | 0 / 1 / 3 |

### 0.1 Totals for the master plan

| Inventory | Total | CONFIRMED | DOCUMENTED_ONLY | UNVERIFIED | Other |
| --------- | ----: | --------: | --------------: | ---------: | ----- |
| Features (`data/features.csv`) | **144** | **32** | 71 | **39** | 2 `DEPRECATED_CANDIDATE` |
| Mini App API routes (`API`) — contract | 34 | 34 | — | — | server logic of all 34 is `DOCUMENTED_ONLY` |
| Non-API resources (`RES`) | 22 | 13 | 7 | 2 | — |
| Mini App screens (`SCR`) | 45 | 45 | — | — | — |
| Telegram WebApp points (`TMA`) | 45 | 45 | — | — | — |
| Bot handlers (`BOT`, from `data/bot-handlers.json`) | 84 | 0 | 65 | 19 | none can be `CONFIRMED`: no bot code exists |
| Bot buttons (`BTN`) | 76 | 0 | 67 | 9 | — |
| Public URLs (`URL`) | 62 | 31 | 29 | 2 | — |
| Landing / SEO items (`LND`) | 64 | 37 | 26 | 1 | — |

Features by priority: P0 94, P1 29, P2 15, P3 6. By decision: `MIGRATE_WITH_FIX` 79, `MIGRATE` 33, `REBUILD` 26,
`DROP_CANDIDATE` 4, `DEFER` 2.

Coverage of the confirmed surface, with explicit denominators:

- **HTTP routes the Mini App calls:** 34 found in code = 34 in `docs/api.md` §2 = 34 in `data/api-inventory.json`
  (API-001…API-034, same order). Covered: **34/34**.
- **Non-API resources the Mini App code requests:** **7/7** (RES-001…RES-007). Landing and SEO resources are
  RES-008…RES-022.
- **Mini App screens and integration:** 39/39 screen-like components and 14/14 back-handler sites map to an SCR item.
  34/34 SDK integration points map to a TMA item.
- **Bot:** 10/10 commands (BOT-012…BOT-021) plus the unknown-command behaviour (BOT-022). 54/54 button-table rows.
  17/17 toasts. 6/6 deep-link payloads. These are `DOCUMENTED_ONLY` by the README rule, because the bot was only
  observed and no code exists.
- **SEO URL patterns:** 15/15. Routing rules: 8/8.

## 1. Mini App code (`$KVADRO_ROOT/demo/app/src`, `index.html`)

### 1.1 Source files

- **Method:** `find $KVADRO_ROOT/demo/app/src -type f` gives 219 files. Each path was matched against the audit
  corpus in this order: the full `demo/app/src/…` path, then `src/…`, then the basename. Files not found that way were
  checked for glob or brace citations (`gl/*`, `leaflet/*`, `i18n/locales/{ru,uz_Latn,en}.js`) and for a description
  of their behaviour in SCR text.
- **Denominator:** 219.
- **Covered:**
  - 170 cited by path or basename. Of these, 163 are in `03` / `05` / `data/screens.json` and 7 only in `02` / `08`:
    `lib/api/{listings,settings,subscriptions}.js`, `lib/array.js`, `i18n/locales/ru.js`, `map/leaflet/basemap.js`,
    `map/gl/useActiveMarker.js`.
  - 27 covered by a glob or a topic paragraph:
    - 13 map helpers through `gl/*` and `leaflet/*` in SCR-011. Locate button, spiderfy, area mask and basemap delay
      are all described there.
    - 2 locales through `{ru,uz_Latn,en}.js`.
    - 12 Noto Sans `woff2` files (`03` "Fonts" paragraph).
  - 7 covered by behaviour but not cited by path:
    - `hooks/useScrolled.js` (named);
    - `lib/buildVersion.js` (the `v` field in `app_launch` and `app_error`, `08` API-034);
    - `features/listing/sections/DescriptionSection.jsx` (SCR-018 «Из объявления» `summary`);
    - `components/{Chip,Switch}.jsx`, `components/icons/{InstagramIcon,RadarIcon}.jsx` (presentational).
- **Uncited:** 15 CSS files under `$KVADRO_ROOT/demo/app/src/styles/` (`city-sheet`, `feedback`, `filters`, `found`,
  `header-chips`, `listing-card`, `listing-details`, `nearby`, `nudges`, `photo-viewer`, `pull-to-refresh`, `radar`,
  `settings`, `spot-map`, `subscriptions`). They are presentational, and visual parity is a separate gate in `15`.
- **Misses:** low — the 15 CSS files and the 4 presentational components (§9 items 8 and 9).

### 1.2 HTTP request strings

- **Method:**
  ```
  rg -n -o "['\"\`](/api/[^'\"\`]*|/media[^'\"\`]*|/tiles[^'\"\`]*|/call[^'\"\`]*)['\"\`]" \
    $KVADRO_ROOT/demo/app/src $KVADRO_ROOT/demo/app/index.html
  ```
  The HTTP method was read from the `method:` key within 4 lines of each `apiFetch(` in
  `$KVADRO_ROOT/demo/app/src/lib/api/*.js`. A call without one is a `GET`. Both pairs were compared with
  `data/api-inventory.json`.
- **Denominator:** 34 method + path pairs:
  - 32 through `apiFetch`;
  - `GET /api/bot` through a plain `fetch` and the `index.html` XHR;
  - `POST /api/events` through `fetch` with `keepalive` and the `index.html` XHR.
- **Covered:** 34/34 (API-001…API-034).
- **Non-API resources (7):** `/media/<id>/<n>.jpg` and `.s.jpg` (`$KVADRO_ROOT/demo/app/src/lib/images.js:5-10`),
  `meta.tiles` / `/tiles`, the OSM raster, `/call/<token>`, PostHog and the Telegram SDK. All map to RES-001…RES-007.
- **Misses:** none.

### 1.3 Back handlers, sheets and screens

- **Method:** `rg -n "pushBackHandler\(" $KVADRO_ROOT/demo/app/src`, without the definition and its doc comment.
  `find … -name '*Sheet*.jsx' -o -name '*Screen*.jsx' -o -name '*Picker*.jsx' -o -name '*Viewer*.jsx'` was extended
  with overlays, states, nudges, toast, top bar, tab bar, feed and radar strips. Each file was looked up in the
  `source_files` of `data/screens.json`.
- **Denominators:** 14 back-handler sites; 39 components.
- **Covered:** 14/14 and 39/39.
  - The two sites in `$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js` (`:39` drawing and `:66` radar return) are
    covered by SCR-012 and `03` "Radar-return mode" (`05` line 507).
- **Misses:** low — the `source_files` of SCR-018 lists 7 of the 11 files in
  `$KVADRO_ROOT/demo/app/src/features/listing/sections/`. `DescriptionSection.jsx`, `FactsSection.jsx`,
  `KeyFacts.jsx` and `StatsSection.jsx` are missing from the register, although the SCR-018 text describes all four
  (§9 item 10).

### 1.4 i18n key namespaces

- **Method:** `rg -o "^  '?([a-zA-Z0-9_.]+)'?:" $KVADRO_ROOT/demo/app/src/i18n/locales/{ru,en,uz_Latn}.js`. Multi-line
  values count. The namespace is the part before the first dot. Usage was found through `t('ns.`, `plural('ns.`,
  template keys and literal `'ns.key'` strings in the rest of `src`. The using files were then mapped to SCR items
  through `data/screens.json`.
- **Denominators:**
  - 461 keys in every locale;
  - identical key sets (diffed);
  - 42 namespaces.
- **Covered:** 42/42 namespaces are used in code and named in `03` §3.1 or in SCR texts.
  - 40 reach an SCR through `source_files`.
  - `money` (`lib/money.js`) and `sum` (`features/filters/summary.js`) are library formatters, documented in `03` §3.5
    and in the filter-summary text.
- **Misses:** low — the "Key families by prefix" table in `03` §3.1 adds up to 450, not 461 (§9 item 11). The real
  counts are `sheet` 69 (table: 67), `market` 53 (50), `found` 23 (21), `settings` 19 (17), `subs` 13 (12) and
  `city` 8 (7). The "461 keys, no key missing" statement itself is correct.

### 1.5 Analytics events

- **Method:**
  - `rg -o "\b(trackEvent|trackScreen)\(\s*['\"\`]([a-z_]+)"` over `src`;
  - the dynamic `trackEvent('app_opened', …)` in `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:101`;
  - `sendErrorEvent` and the `index.html` XHR for `app_error`;
  - `posthog.capture('$pageview')` in `$KVADRO_ROOT/demo/app/src/lib/analytics.js:64-72`;
  - screen names from `$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:26-44`.

  Each name was searched in the corpus.
- **Denominator:** 17 event names and 16 `$pageview` screen names.
- **Covered:** 17/17 (`08` API-034, `03` §3.3, `data/screens.json`) and 16/16 (`03` §3.3).
- **Misses:** none.

### 1.6 Storage keys

- **Method:**
  - `rg -o "kv-[a-z-]+"` and every `localStorage`, `sessionStorage` and `DeviceStorage` access in `src` and
    `index.html`;
  - the same for `$KVADRO_ROOT/demo/landing/site/*.js`.
- **Denominator:** 12 keys.
  - Mini App (10): `kv-locale`, `kv-city`, `kv-theme`, `kv-graphics`, `kv-graphics-measured`, `kv-home`, `kv-nudge`,
    `kv-new-<feature>`, `kv-map-fit:<center>`, `kv-map-v2`.
  - Landing (2): `kv-landing-lang`, `kv-visit`.
  - `kv-bot` and `kv-retry` in `index.html` are DOM ids, not storage keys.
- **Covered:** 12/12. Mini App keys are in `03` §3.2 and `06`; landing keys are in `03b`.
- **Misses:** none.

### 1.7 Telegram WebApp SDK

- **Method:**
  - `rg -o "\b(webApp|WebApp|w)\??\.([A-Za-z]+)"`;
  - `rg -o "(BackButton|SettingsButton|LocationManager|DeviceStorage|HapticFeedback)\??\.(\w+)"`;
  - `onEvent('…')`, `web_app_*`, `TelegramWebviewProxy`, `external.notify`;
  - `var(--tg-…)` in CSS;
  - `start_param` and `tgWebAppData`;
  - a probe of 50 known WebApp members to confirm what is absent.

  Every point was then looked up in `05`.
- **Denominator:** 34 points.
  - 27 SDK members:
    - `initData`, `initDataUnsafe.user`, `platform`, `version`, `isVersionAtLeast`;
    - `ready`, `expand`, `requestFullscreen`, `isFullscreen`, `disableVerticalSwipes`;
    - `setHeaderColor`, `setBackgroundColor`, `colorScheme`;
    - `BackButton.{show,hide,onClick,offClick}`, `SettingsButton`;
    - `showConfirm`, `requestWriteAccess`, `close`, `openLink`, `openTelegramLink`, `shareMessage`;
    - `HapticFeedback.{impactOccurred,notificationOccurred}`;
    - `LocationManager.{init,getLocation,isAccessRequested,isAccessGranted}`;
    - `DeviceStorage.{getItem,setItem,removeItem}`;
    - `checkHomeScreenStatus`, `addToHomeScreen`, `onEvent`.
  - 3 events: `themeChanged`, `fullscreenChanged`, `homeScreenAdded`.
  - The native bridge.
  - `start_param`.
  - The `tgWebAppData` hash.
  - Safe-area and theme CSS variables.
- **Covered:** 34/34 (TMA-001…TMA-045). The absences are recorded too: TMA-018, TMA-024, TMA-027, TMA-032, TMA-034
  and TMA-038.
- **Misses:** none.

### 1.8 `TODO: inferred from build`

- **Method:** `rg -n TODO $KVADRO_ROOT/demo/app/src $KVADRO_ROOT/demo/app/index.html $KVADRO_ROOT/demo/app/vite.config.js`.
- **Denominator:** 4 (`vite.config.js:67`, `features/map/MapScreen.jsx:7`, `features/map/gl/style.js:306`,
  `lib/geo/location.js:118`).
- **Covered:** 4/4 (`03` §6.1, Q-APP-001, Q-APP-004, Q-API-026).
- **Misses:** none.

### 1.9 Extra sweeps (blind spots of the requested checks)

- **Hard-coded non-ASCII UI strings outside the locale files.** Seven string literals were found in `src` and
  `index.html`. All 7 are covered. Five are quoted. The two `index.html` explanation paragraphs are cited as
  `index.html:31-33` in SCR-001.
- **Snake_case property names in `src`.** The 98 server-shaped names were checked against `02`, `03`, `05`, `06` and
  `08`. 81 are covered. The 17 not covered are all PostHog SDK options plus the Supercluster field `cluster_id`, and
  none of them is a server field.
- **Numeric constants** (`const UPPER_CASE = <number>`, 68 in `src`). The names are not used in the audit, so each
  value was looked up by hand in `03` §3.4 and the SCR texts. 66 are there. Purely presentational values, such as the
  `#0a84ff` location-dot colour, were not counted as misses. Two behavioural values are missing (low, §9 item 12):
  - `DEFAULT_CENTER = [41.3111, 69.2797]`, the fallback map centre in
    `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapInstance.js` and
    `$KVADRO_ROOT/demo/app/src/features/map/leaflet/useLeafletMap.js`;
  - the Leaflet `MAX_ZOOM = 18` in `$KVADRO_ROOT/demo/app/src/features/map/leaflet/basemap.js`.
- **Reconstructed response shapes.** `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs` and `mocks-filters.mjs` have
  159 keys. 158 are in the audit. The missing one is `first_name`, a mock `initData` user field.
- **PostHog privacy markers.** `rg -n 'ph-no-capture|ph-mask' $KVADRO_ROOT/demo/app/src` finds 5 elements.
  - SEC-021 lists three: `OriginalText.jsx:69`, `AuthorSection.jsx:32`, `HiddenScreen.jsx:79`.
  - It does not list `$KVADRO_ROOT/demo/app/src/features/listing/sections/DescriptionSection.jsx:9`
    (`ph-no-capture` on `summary`) or `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:197`
    (`ph-mask` on the block hint).
  - The audit never mentions that `ph-no-capture` also excludes elements from autocapture.
  - SEC-REQ-036 (default-deny replay) already supersedes this, so the miss is low (§9 item 7).
- **PostHog init options.** Not recorded: `element_attribute_ignorelist: href/src/srcset`,
  `capture_copied_text: false`, `disable_surveys`, `enable_recording_console_log: false`, `network_timing: false` and
  `disable_external_dependency_loading` (`$KVADRO_ROOT/demo/app/src/lib/analytics.js:136-160`). Low, folded into §9
  item 7.

## 2. API contract (`$KVADRO_ROOT/docs/api.md`)

- **§2 registry:**
  - Method: the table rows at `api.md:104-137`.
  - Result: 34/34. Order and paths are identical to API-001…API-034.
- **§3 models:**
  - Method: every `name?:` line inside fenced `ts` blocks, with the nesting kept. Each field must appear as a token
    inside backticks in `08-api-inventory.md`, `06-database-schema.md` or `data/api-inventory.json`.
  - Result for §3 (`SearchFilters`, `ListingPreview`, `ListingDetails`, `FeedPage`, `Subscription`,
    `SubscriptionMutationResult`): **122/122**.
  - Result for all `ts` blocks of the document (§3–§11 response types, including `MetaResponse`, `CityMeta`,
    `app_error`): **241/241**. `MapResponse.points` is written as `{points: …}` in `08` line 455.
  - The "fields the frontend does not read" list (`api.md:402-414`) is reflected in `08` / `06`: `photos_total`,
    `price_per_m`, `new_count`, `finds`, `hidden_count`, `ask_found`, `contacts`, `source_url`.
- **§14 open backend questions (12 items):**
  - Method: mapped by hand.
  - Covered: 11/12.

  | §14 item | Covered by |
  | -------- | ---------- |
  | 1. new `403` reasons | Q-API-006, Q-API-003 |
  | 2. code formats, numeric limits | Q-API-012, Q-API-007 |
  | 3. `call_url` TTL | Q-API-042 |
  | 4. repeated mutations | Q-API-038 |
  | 5. `/api/events` payload and retention | Q-API-045 |
  | 6. full `ListingPreview` / `ListingDetails` composition **per property type and deal** | **no question** (miss) |
  | 7. favourites/history pagination | Q-API-009, LB-API-024 |
  | 8. schema of `analytics`, `options`, `relaxed`, `history` | Q-API-047, Q-API-034 |
  | 9. rate limits and the error schema | Q-API-001, Q-API-007 |
  | 10. `posted_days` in radar matching | Q-API-014 |
  | 11. `median_reason` / `median` | Q-API-021 |
  | 12. `CityMeta.zoom < 11` | Q-API-026 |

- **Misses:**
  - Medium — §14 item 6. The coverage dataset in `15` (KV-QA-005, "all deals × types") will exercise it, but no
    `Q-API` asks the owner which fields land, commercial and daily-rent listings carry. Q-API-022 asks only about
    formatting (§9 item 2).

## 3. Bot (`$KVADRO_ROOT/docs/telegram-bot.md`)

- **Method:**
  - Each markdown table was parsed.
  - Button labels were normalised: emoji joiners removed, variable parts such as `<…>`, `…` and `N` stripped.
  - Each label was searched in `04-telegram-bot-audit.md` and `data/bot-handlers.json`.
  - Section coverage came from the line citations (`tb:N`, `tb §x l.N[-M]`) in the same two files.
  - The other sections were mapped by hand.

| Source part | Denominator | Covered | Where |
| ----------- | ----------: | ------: | ----- |
| §3 commands (+ unknown command) | 10 (+1) | 10 (+1) | BOT-012…BOT-022 |
| §6 headings (6.1–6.13 and the 11 wizard sub-headings) | 25 | 25 | every section has cited lines |
| §7 button-table rows | 54 | 54 | BTN-001…BTN-076. Generic rows (cities, settings options, `1`…`N`, radar names) are BTN-011, BTN-049, BTN-067…BTN-072 and line citations |
| §8 toasts / alerts | 17 | 17 | TXT-BOT entries listed in `04` §0.1 |
| §10 deep-link payloads (+ third message) | 6 (+1) | 6 (+1) | BOT-027…BOT-029, BOT-031…BOT-033; TXT-BOT-008 / BTN-004 |
| §11 quirks | 10 | 10 | LB-BOT-001…LB-BOT-014 (item 9 split in five) |
| §12 unverified rows | 18 | 18 | Q-BOT-001…Q-BOT-016. Two rows share Q-BOT-006 and two share Q-BOT-013 |
| §2 profile, §5 mechanics (button styles, reactions, outdated forms, number format, `Asia/Tashkent`) | — | yes | BOT-001…BOT-011, `04` §4.3, BR-BOT |

- **Line-level coverage of the whole document:** 789 content lines, of which 633 are cited by line.
  - The uncited lines are the navigation tree in §4 (a summary of §6), the §7 legend, the §9 API mapping (covered
    in `04` §10 and `08`) and parts of the §13 localisation lists (covered by the UZ/EN labels in BTN-067…BTN-072).
- **Verbatim texts:** the document has 37 `text` blocks. 28 are quoted at least partly in `04`. The other 9 are cited
  by line only:
  - the bot description `tb:57` and bio `tb:72`;
  - the navigation tree `tb:111`;
  - the step-4 keyboard `tb:320` and the zone hint `tb:337`;
  - the `/settings` keyboard `tb:790`;
  - the `/owner` intro `tb:817`;
  - the `/privacy` text `tb:850-865` (TXT-BOT-083);
  - the EN welcome `tb:1070`.

  The README allows this, but it makes the text migration depend on access to `$KVADRO_ROOT`.
- **Misses:** low — the 9 texts that are cited by line only (§9 item 13).

## 4. Landing and SEO

### 4.1 Landing (`$KVADRO_ROOT/demo/landing/site/**`, `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md`)

| Item | Method | Denominator | Covered |
| ---- | ------ | ----------: | ------: |
| Site files | `find $KVADRO_ROOT/demo/landing/site -type f`; path / `site`-relative / basename / `img/*` glob | 35 | 35 (13 full path, 9 relative, 3 basename, 10 through `img/*`, URL-018) |
| Data files | `landing.js` fetches, plus `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/{data,img}` | 4 (`live.json`, `pins-rent.json`, `pins-sale.json`, `img/snap/*.webp`) | 4 (RES-010…RES-013, URL-019, URL-020) |
| Data JSON keys | distinct leaf keys of the three fixtures, searched inside backticks | 19 + 24 + 22 | all |
| Server-side generators named in comments | `rg '\.py\b' …/site` | 5 (`app/api/landing_pages.py`, `area_pages.py`, `landing.py`, `site_stats.py`, `scripts/landing_snapshot.py`) | 5 |
| Query parameters | `rg -o "[?&]([a-z]+)="` | 11 (`lang`, `s`, `utm_source`, `v`, `motion`, `touch`, `glass`, `anim`, `bench`, `off`, `debug`) | 11 (URL-006…URL-009) |
| RECOVERY headings / content lines | `REC:n` line citations | 6 / 69 | 6 / 62. The uncited lines are the "why a mirror, not React" rationale |
| RECOVERY §5 quirks | by hand | 2 | 2 (LB-LND-001, LB-LND-016) |
| Landing CHANGELOG "Отложено" | read | 0 | — |

### 4.2 SEO (`$KVADRO_ROOT/docs/seo-pages.md`)

| Item | Method | Denominator | Covered |
| ---- | ------ | ----------: | ------: |
| Headings | `SEO:n` line citations in `03b`, `public-urls.json`, `02`, `04`, `08` | 25 (one is an empty umbrella heading, §5) | 24 / 24 non-empty |
| Content lines | same | 292 | 282. The 10 uncited are the §13 table, mapped by hand below |
| URL patterns (§3 block) | by hand | 15 | 15 (URL-023…URL-035, URL-040, URL-041) |
| Routing rules (§3 table) | by hand | 8 | 8 (URL-036…URL-039, LND-055, LB-SEO-004, LB-SEO-008, LB-SEO-009) |
| Page types (§2 table + new-builds + 404) | by hand | 12 | 12 (LND-042…LND-055) |
| Calculations (§7 subsections + §8 CSV) | line citations | 9 + 1 | 10 (BR-SEO, GAP-007) |
| §12 quirks | `SEO:426-436` | 7 | 7 (LB-SEO-001…LB-SEO-007) |
| §13 unchecked rows | by hand | 8 | 8 (Q-SEO-001…Q-SEO-008) |

**Misses:** none.

## 5. Product document (`$KVADRO_ROOT/docs/about.md`)

- **Method:** every numbered process, requirement bullet, §10 example and §11 question was mapped by hand to `F-`,
  `Q-`, `GAP-` or other IDs. Every ID used below was checked to exist in the regenerated `data/ids.csv`
  (229 / 229 exist).
- **Line-level coverage of §5–§11:** 180 of 313 content lines are cited by line (`About:` / `ab:` / `ABT:` /
  `about.md:`). The rest is covered by topic, as below.

| Section | Denominator | Covered | Mapping |
| ------- | ----------: | ------: | ------- |
| §5.1 steps 1–9 | 9 | 9 | 1 F-PIPELINE-001, F-PIPELINE-007, GAP-001, GAP-008 · 2 F-PIPELINE-002, F-PRIVACY-004 · 3 F-PIPELINE-004, GAP-006 · 4 F-PIPELINE-003, GAP-005 · 5 F-MEDIA-001, F-LISTING-002 · 6 F-LISTING-005, GAP-004 · 7 F-PIPELINE-005, F-LISTING-004, GAP-007 · 8 F-PIPELINE-006, F-PRIVACY-003, F-DELIVERY-006 · 9 F-ADMIN-002, GAP-023 |
| §5.2–§5.11 | 10 | 10 | 5.2 F-FEED-001, F-FILTER-001/003/005, F-MAP-001…003 · 5.3 F-RADAR-001…008, F-DELIVERY-001…005/007, F-BOT-003…010, GAP-010 · 5.4 F-BOT-011 · 5.5 F-REPORT-001…003, F-HIDE-001/002, F-ACCESS-003, Q-API-039 · 5.6 F-OWNER-001/002, GAP-017 · 5.7 F-CONTACT-001, F-MEDIA-003, Q-API-043 · 5.8 F-SHARE-001/002, GAP-016 · 5.9 F-ACCESS-002, F-ADMIN-001, GAP-020 · 5.10 F-ONBOARD-005, F-SHARE-002, F-LANDING-005, F-ANALYTICS-004 (`?news=` → BR-APP-057) · 5.11 F-PRIVACY-001…004, GAP-019 |
| §8.1 items 1–9 | 9 | 9 | 1 F-COMPAT-001/002, GAP-025 · 2 F-BOT-001…015, GAP-011, GAP-003 · 3 F-PIPELINE-001…007 · 4 F-DELIVERY-001…005, F-RADAR-006, GAP-010 · 5 F-LANDING-001…007, F-SEO-001…012, F-PIPELINE-008, GAP-021 · 6 F-MEDIA-001…003, GAP-014, GAP-015 · 7 F-ANALYTICS-001…003, F-PRIVACY-002, GAP-018 · 8 F-ACCESS-002, F-ADMIN-001 · 9 F-SUPPORT-001 (`DEFER`), GAP-026 |
| §8.2 compatibility | 5 | 5 | API contract F-COMPAT-001 · `initData` F-ACCESS-001 · links URL-045…URL-059, F-SEO-010 · data GAP-024, `14` · bot texts / old buttons F-BOT-013, Q-BOT-017 |
| §8.4 transition | 9 | 9 | one update receiver F-BOT-012, RES-022, Q-API-055 · per-environment token F-ACCESS-001, `17` · bot settings F-BOT-001, Q-BOT-011, Q-BOT-019, Q-BOT-020 · old messages F-BOT-013, Q-BOT-018 · stickers / banner BOT-010, F-ONBOARD-004, F-BOT-008 (`file_id`) · data incl. delivered cards GAP-024, F-DELIVERY-005, Q-DATA-013 · PostHog id mapping Q-API-046, F-ANALYTICS-002 · freeze Q-SYS-005 · switch order `18` |
| §8.5 secrets | 10 | 10 | `17`, `16`, `10` (bot tokens, channel reader, Gemini, PostHog incl. person deletion, PostGIS, media and tiles, CBU rate, beta mode, signing secrets, CSP hashes or nonce) |
| §9.1 Mini App (11 bullets), §9.2 landing (7), §9.3 SEO (1) | 19 | 19 | TMA-022 (+ swipe back, `03`), TMA-042, TMA-037, F-TMA-004, F-TMA-007, F-SETTINGS-003, TMA-003, Q-APP-001, F-LANDING-002/003/006, URL-008, LB-LND-008, F-SEO-001, F-SEO-009 |
| §10 do-not-port examples | 12 | 12 | LB-APP-002, 003, 001, 008, 010, 011 · LB-API-005, 008, 009 · LB-BOT-001, 008, 006, 010…012 · LB-LND-001 |
| §11 open questions | 17 | 17 (2 partial) | see below |

§11 questions:

| Question | Covered by |
| -------- | ---------- |
| 1 | Q-SYS-002, Q-DATA-001…003, GAP-024 |
| 2 | Q-BOT-017 |
| 3 | Q-API-017, GAP-001 — **photo-copying rights have no question** (partial) |
| 4 | Q-API-018, Q-API-020 |
| 5 | Q-API-019 |
| 6 | Q-API-021 |
| 7 | Q-API-023, Q-BOT-031, Q-API-039 |
| 8 | Q-API-027, Q-API-014, Q-BOT-033 (favourite notifications) |
| 9 | Q-API-028, Q-BOT-003 |
| 10 | Q-API-039 |
| 11 | `api.md` §14 → §2 above (item 6 missing, partial) |
| 12 | Q-API-043 |
| 13 | Q-API-058, Q-SYS-004, GAP-023 |
| 14 | Q-SYS-003, Q-BOT-016, GAP-026 |
| 15 | Q-SEO-002, Q-SEO-003, Q-SEO-007 |
| 16 | Q-SEC-005, Q-API-053, Q-DATA-050, Q-DATA-044, Q-SEC-011 |
| 17 | Q-BOT-034, Q-DATA-002 |

**Misses:** medium — §11 question 3. Nobody is asked whether kvadro² had the right to copy channel photos and whether
HOMI inherits that right. `16` lists "Copyright/takedown" as a threat to A6, and SEC-REQ-040 covers takedowns, but
there is no `Q-` for the owner or the lawyer (§9 item 3).

## 6. Mini App docs (`$KVADRO_ROOT/demo/app/docs/`)

- **RECOVERY.md §7, known bugs.**
  - Method: the bullets at `RECOVERY.md:152-172`.
  - Result: 14/14, mapped one to one and in order to LB-APP-001…LB-APP-014.
- **Deferred prod changes.**
  - Method: the "Отложено" sections of `CHANGELOG.md`; `rg -n -i 'отложен|skipped'` over
    `docs/releases/*/REPORT.md`; the `pendingSkipped` key in `docs/releases/*/delta/delta.json`.
  - Result: **zero deferred items in all three releases** (`index-nqhP1ZpL`, `index-CifYe6Dc`, `index-plF_TOcT`).
    - The release reports say so: «Отложенного (skipped) нет», «отложенного нет», «Отложено: ничего».
    - `pendingSkipped: []` in all three deltas.
    - The landing `CHANGELOG.md` has a single restore entry with no deferred items.
  - So the recovered code equals prod as of `index-plF_TOcT.js`. The audit records that as its baseline (`02`, `03`,
    `06`, `08` headers; `18` freeze manifest). Later prod releases are a separate risk, handled by Q-SYS-005.
- **Ported release changes.**
  - Method: the "Добавлено / Изменено / Breaking" bullets of the three releases, without the 3 parity-tooling bullets.
  - Denominator: 23 behaviour changes.
  - Covered: 22:
    - `post_deleted`, `is_owner`, the listing id redirect, `app_launch.js`, `owner_verified` / `card.ownerVerified`;
    - `offers`, `zone` → `zones` (breaking), `near_center`, `sum.zonesBoth`;
    - the share lock, the stale share window retry (`prepared_message_failed`);
    - the uz string fixes, the report-reason change for non-owners, the video tap on deleted posts;
    - the empty `sources`, the CTA without «Открыть пост».
  - Missing: the lite-mode heart colour rule (`.lite .fav.overlay.on svg` in
    `$KVADRO_ROOT/demo/app/src/styles/lite.css`). Low (§9 item 14).
- **MODULE_MAP.md modules.**
  - Method: the `### \`src/…\`` headings. The map describes the original snapshot `index-TQcW60BH.js`, and every
    path still exists.
  - Denominator: 126 modules.
  - Results:
    - 122 are named in `03`, `05` or `data/screens.json`.
    - 4 more are covered only through a glob: `map/gl/expressions.js`, `map/gl/geojson.js`,
      `map/leaflet/basemapRules.js`, `lib/buildVersion.js`.
    - 103 reach a feature row, directly or through an SCR linked in `data/features.csv`.
    - The other 23 are assets, UI primitives, map-style internals, gesture hooks, `images.js`, `newFeatures.js`
      (behaviour in BR-APP-057, covered by F-FILTER-001 and F-SHARE-002) and three listing sections. All 23 are
      described in `03`.
  - Misses: none beyond §1.3 (SCR-018 register).

## 7. Feature register (`docs/migration/data/features.csv`)

- **Method:** read the rows with Python `csv`. A cell counts as empty when it is blank, `—`, `-`, `n/a`, `none` or
  `TBD`.

| Rule | Denominator | Passing | Exceptions |
| ---- | ----------: | ------: | ---------- |
| `new_backend` or `new_frontend` filled | 144 | 143 | F-LANDING-011 has `none` / `none`. It is a `DROP_CANDIDATE`, so this is legitimate. 14 rows have no backend target and 9 no frontend target, but always one of the two |
| Priority is P0–P3 | 144 | 144 | — |
| Migration decision present | 144 | 144 | — |
| Every `DROP_CANDIDATE` / `DEFER` names who decides | 6 | 6 | F-TMA-010, F-LANDING-008, F-LANDING-010, F-LANDING-011, F-ADMIN-003, F-SUPPORT-001 |
| Status present | 144 | 144 | — |
| Evidence and acceptance tests present | 144 | 144 | — |
| `UNVERIFIED` row names its `Q-` | 39 | 6 | 33 rows have no `Q-` in the row. For all 33 the `Q-` exists one hop away, in a linked BOT/API/URL/LB item (low) |
| IDs equal between `features.csv` and the parity matrix (`ids.csv`) | 144 | 144 | — |

**Misses:** low — 33 `UNVERIFIED` features do not name their question directly (§9 item 15):

- F-ONBOARD-005, F-FILTER-001, F-FILTER-007;
- F-SHARE-001, F-SHARE-002;
- F-FAV-001, F-HISTORY-001;
- F-HIDE-001, F-HIDE-002, F-HIDE-004;
- F-RADAR-003;
- F-DELIVERY-001…F-DELIVERY-008;
- F-SETTINGS-004…F-SETTINGS-006;
- F-PRIVACY-002, F-LOCALE-001;
- F-BOT-004, F-BOT-007, F-BOT-008, F-BOT-009, F-BOT-012;
- F-SEO-010, F-MEDIA-001, F-PIPELINE-001, F-ANALYTICS-004.

## 8. Hygiene

| Check | Method | Result |
| ----- | ------ | ------ |
| Absolute machine paths | `rg -n` over `docs/migration` for the macOS and Linux home-directory roots, the macOS temp roots and Windows drive letters (the pattern is not reproduced here so that this file stays clean) | **0** |
| Bot tokens | `rg '\b[0-9]{8,10}:[A-Za-z0-9_-]{30,}\b'` | 0 |
| Key prefixes (`phc_`, `AIza`, `sk-`, `eyJ…`, `ghp_`, `xox`, `AKIA`, `-----BEGIN`) | `rg` | 0 |
| Long hex (≥ 32) / long base64-like (≥ 40) strings, `s=<hex>` signatures, `sha256-` CSP hashes | `rg -o` | 0 |
| Phone numbers | `+998…` and spaced or dashed national formats | 3 hits. All are synthetic test numbers with an all-zero subscriber part (`15`, `tasks/qa/KV-QA-002`, `tasks/qa/KV-QA-003`). No real number |
| `initData` fragments (`query_id=`, `auth_date=<n>`, `hash=<hex>`, `user=%7B`, `signature=`) | `rg -o` | 0 |
| E-mail addresses | `rg -o '[\w.+-]+@[\w.-]+\.[a-z]{2,}'` | 0. The project mailbox is written as `<project mailbox on kvadro.app>` |
| Long digit runs (≥ 9) | `rg -P -o` | only placeholders (`100000001`, `9999999999`) and a data version stamp |
| `$KVADRO_ROOT/…` path citations | every occurrence in `docs/migration/**/*.{md,json,csv}`, checked with `os.path.exists` and the line count | **1 181** citations to 221 distinct paths: **0 missing paths**. 848 carry line numbers: 847 in range, **1 out of range** |
| Shorthand citations (`Doc:`, `tb:`, `SEO:`, `About:`, `IDX:`, `LJS:`, `REC:`, …) | same, resolved through the audit's own shorthand tables | **1 523**: 1 out of range |
| Semantic spot check | 20 random `$KVADRO_ROOT` line citations from the `.md` files, read by hand next to the cited lines | 20/20 point at the described code or text |
| `collect_ids.py --check` | run before and after this pass | Before: passed (1 834 IDs). At the end: **failed**, see below |

- **Out-of-range citations:**
  - `data/api-inventory.json` line 604 cites `$KVADRO_ROOT/demo/app/src/lib/analytics.js:122-199`. The file has 197
    lines.
  - `03b-legacy-landing-seo-audit.md` line 689 cites `SCN:1-175`. `scenarios.mjs` has 122 lines.
- **Failing `collect_ids.py --check` at the end of the pass:**
  - It reports 58 duplicate definitions and 54 undefined `KV-BE-…` references. All of them come from the new, still
    unfinished `11-backend-roadmap.md`.
  - Its table rows start with feature IDs, and the collector treats a row-leading ID as a definition. That is why
    F-… IDs appear "defined" in both `09` and `11`.
  - The fix belongs to `11`: put the ID in a later cell, or reference it in prose.
- **`UNVERIFIED` without a paired `Q-`:** the README rule is "always paired with a `Q-…`".
  - Of 92 `UNVERIFIED` non-feature, non-question items, 13 name no `Q-` in their own block but are named inside some
    `Q-` text (for example BTN-013 in Q-BOT-010).
  - 10 name no `Q-` either way: BR-BOT-075, BTN-061, BTN-063, BTN-064, ENT-057, GAP-010, LB-DATA-005, LB-DATA-020,
    URL-015, URL-056.
  - For 8 of the 10 a topical question exists (Q-BOT-006, Q-API-050, Q-API-041, Q-API-020, Q-LND-006). BR-BOT-075 and
    URL-056 have none. Low (§9 item 16).

**Misses:** medium — the `--check` failure blocks anyone who relies on the index while `11` is being written (§9
item 4). Low — the two out-of-range citations (§9 items 5 and 6) and the unpaired `UNVERIFIED` items (§9 item 16).

## 9. Misses, consolidated

Nothing here is fixed by this document. The owners of the cited documents fix them.

| No. | Severity | What is missing | Source reference | Owner document |
| --: | -------- | --------------- | ---------------- | -------------- |
| 1 | — | **No high-severity miss found** | — | — |
| 2 | medium | No question on the full `ListingPreview` / `ListingDetails` composition per property type × deal (`api.md` §14 item 6). Land, commercial and daily-rent listings may carry or drop fields the old client reads strictly | `$KVADRO_ROOT/docs/api.md:1118` | `02` / `08` (add a `Q-API`) |
| 3 | medium | No question on the right to copy channel photos and whether HOMI inherits it (`about.md` §11 question 3) | `$KVADRO_ROOT/docs/about.md:566-567` | `16` or `02` (add a `Q-SEC` / `Q-API`) |
| 4 | medium | `collect_ids.py --check` fails: 58 duplicates and 54 undefined IDs from `11-backend-roadmap.md` rows that start with F- IDs | `docs/migration/11-backend-roadmap.md` | `11` |
| 5 | low | Citation out of range: `analytics.js:122-199` (the file has 197 lines) | `docs/migration/data/api-inventory.json` line 604 | `08` |
| 6 | low | Shorthand citation out of range: `SCN:1-175` (the file has 122 lines) | `docs/migration/03b-legacy-landing-seo-audit.md` line 689 | `03b` |
| 7 | low | SEC-021 lists 3 of the 5 PostHog-masked or excluded elements. `DescriptionSection.jsx:9` (`ph-no-capture`), `ListingActionsSheet.jsx:197` (`ph-mask`), the autocapture exclusion of `ph-no-capture` and six init options are not recorded. SEC-REQ-036 already supersedes this | `$KVADRO_ROOT/demo/app/src/features/listing/sections/DescriptionSection.jsx:9`; `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:197`; `$KVADRO_ROOT/demo/app/src/lib/analytics.js:136-160` | `16`, `03` §3.3 |
| 8 | low | 15 feature CSS files are never cited (visual parity) | `$KVADRO_ROOT/demo/app/src/styles/` | `03` |
| 9 | low | `Chip.jsx`, `Switch.jsx`, `InstagramIcon.jsx`, `RadarIcon.jsx` are never cited | `$KVADRO_ROOT/demo/app/src/components/` | `03` |
| 10 | low | The `source_files` of SCR-018 omits `DescriptionSection.jsx`, `FactsSection.jsx`, `KeyFacts.jsx`, `StatsSection.jsx`. The SCR text covers them | `$KVADRO_ROOT/demo/app/src/features/listing/sections/` | `data/screens.json` |
| 11 | low | The prefix table in `03` §3.1 adds up to 450, not 461 (sheet 69, market 53, found 23, settings 19, subs 13, city 8) | `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js` | `03` |
| 12 | low | Fallback map centre `[41.3111, 69.2797]` and Leaflet `MAX_ZOOM = 18` are not recorded | `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapInstance.js`; `$KVADRO_ROOT/demo/app/src/features/map/leaflet/basemap.js` | `03` §3.4 |
| 13 | low | 9 verbatim bot texts are cited by line only. Their migration needs `$KVADRO_ROOT` | `$KVADRO_ROOT/docs/telegram-bot.md:57`, `:72`, `:320`, `:337`, `:790`, `:817`, `:850-865`, `:1070` | `04` (TXT-BOT) |
| 14 | low | The ported lite-mode heart colour (release `index-nqhP1ZpL`) is not recorded | `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:44` | `03` |
| 15 | low | 33 `UNVERIFIED` features name their `Q-` only one hop away (list in §7) | `docs/migration/data/features.csv` | `09` |
| 16 | low | 10 `UNVERIFIED` items have no `Q-` link. BR-BOT-075 and URL-056 have no topical question either | `docs/migration/04-…`, `06-…`, `03b-…`, `10-…` | the defining documents |


## 10. How to re-run

1. `python3 scripts/migration/collect_ids.py --check`.
2. Rebuild the corpus from `docs/migration/**/*.{md,json,csv}` without `data/ids.csv` and without this file.
3. Repeat the enumerations of §1–§8 with the commands quoted there against the unchanged `$KVADRO_ROOT`. The
   denominators (219 files, 34 routes, 461 keys, 42 namespaces, 17 events, 12 storage keys, 34 SDK points, 4 TODOs,
   241 contract fields, 54 + 17 bot table rows, 35 site files, 15 SEO patterns, 14 known bugs, 126 modules) only
   change if the legacy tree changes.
4. A re-run must also re-check `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md` for new releases and "Отложено" items. Those
   are behaviour the recovered code does not have.

## 11. Task coverage and follow-up (added after the task files were written)

This pass ran before the task files existed. The orchestrator added this section on 2026-11-09, after all
roadmaps and tasks were written.

Method: `python3 scripts/migration/task_graph.py --check`, plus a script over `data/ids.csv`, `data/features.csv`,
`data/tasks.csv` and the text of `tasks/**/KV-*.md`. An item counts as covered when a task cites it directly, or
when a task cites a feature whose `linked_ids` contain it.

| Kind | Total | Cited directly in a task | Covered (directly or via a feature) |
| ---- | ----: | -----------------------: | ----------------------------------: |
| API | 34 | 34 | 34 |
| RES | 22 | 21 | 22 |
| SCR | 45 | 45 | 45 |
| TMA | 45 | 44 | 45 |
| BOT | 84 | 84 | 84 |
| BTN | 76 | 76 | 76 |
| LND | 64 | 64 | 64 |
| URL | 62 | 60 | 62 |

**Features and tasks.**
- Features: 144. Covered by at least one task: 143. Without a task: `F-LANDING-011`, a P3 drop candidate that the
  development track decides (Q-API-049).
- Tasks: 383. Every one cites a feature or is marked as a technical migration task.
- Task graph: 0 broken references, 0 cycles.
- How the cycles were resolved: the first runs found 36 cycles. They came from `Dependencies` cells that also named
  dependants ("used by", "consumers", "related"). The generator now ignores those segments. 14 cells that were
  genuinely mutual were rewritten to name only prerequisites.

**Follow-up on the misses in §9.**
- Both medium misses now have questions: Q-SYS-007 (field sets of land, commercial and daily-rent listings) and
  Q-SYS-008 (photo re-hosting rights), in `01` §8.
- The `collect_ids.py --check` failures reported above came from the half-written roadmap. The check now exits 0.
