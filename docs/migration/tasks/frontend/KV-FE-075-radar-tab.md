# KV-FE-075 — Radar tab: list, tiles, previews

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-RADAR-001, F-FILTER-005 |
| Dependencies | KV-FE-018 (flow formatter), KV-FE-045 (app shell, «+» in the top bar), KV-FE-074 (radar actions and list store), KV-FE-047 (thumbnails and price helpers for the collage); backend KV-BE-101 (API-018), KV-BE-032 (API-005, API-006); decisions: DEV-021 `PROPOSED`; Q-APP-005, Q-APP-010 |

## Goal

The «Радар» tab (SCR-026) lists the user's radars as tiles with a cover collage, title, area summary, live status line
and an on/off switch, loads the per-radar previews without the legacy burst of three uncached requests per radar
(LB-APP-036), makes the tiles keyboard-accessible (LB-APP-014) and hands a tile tap to the radar sheet (KV-FE-077).

## Legacy reference

- SCR-026 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:33-238` (load, error, spinner, toggle,
  resume after a radar feed), `RadarTiles.jsx:17-56`, `subscriptionStatus.js:11-32`, `useRadarPreviews.js:7-72`
  (`PREVIEW_FINDS_LIMIT = 5`).
- Tile title and area: `$KVADRO_ROOT/demo/app/src/features/filters/summary.js` (`filtersTitle`, `filtersAreaSummary`;
  BR-APP-064, BR-APP-065, BR-APP-066) — implemented in KV-FE-020.
- Rules: BR-APP-044 (flow wording), BR-APP-048 (turning on goes through chat access), BR-APP-058 (pull-to-refresh
  reloads the radar list), BR-APP-063 (previews: newest page, count, flow).
- Defects: LB-APP-014 (tiles not keyboard-accessible), LB-APP-036 (3 requests per radar), LB-APP-033 → DEV-021,
  LB-APP-006 (flow `204` crash pattern; same normaliser).
- Visual baseline: KV-QA-019 scenario `tab-radar` → `docs/migration/visual-baseline/SCR-026-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/radar/RadarScreen.tsx`: loads the list from the store of KV-FE-074 on mount, on
   every `subsVersion` change and on pull-to-refresh (KV-FE-046); renders the spinner, the error state, the empty state
   (KV-FE-076) or the tiles; owns the open-sheet id and the found-survey trigger (KV-FE-077, KV-FE-079).
2. `RadarTiles.tsx`: each tile is a real `<button>` (LB-APP-014 fix) containing the collage and texts; the switch is a
   sibling control, not nested in the button, so Enter/Space on the tile opens the sheet and the switch toggles on its
   own. Inactive tiles are greyscale (`03` §3.6 product CSS).
3. Collage: up to 4 covers from the radar's preview finds that have a `cover`, through the thumbnail helper of KV-FE-047
   (`.s.jpg` variant, BR-APP-059); none → the radar icon at 28 px.
4. Status line through `radarStatus(subscription, flow)` built on the flow formatter of KV-FE-018: paused →
   `subs.paused`; no flow yet → the mode label `subs.mode.<mode>` in lower case; otherwise `alert.rare` / `alert.week` /
   `alert.day` + « · » + mode label. Mode labels go through the enum table of KV-FE-015 (unknown mode → the code, never a
   throw, LB-APP-002). DEV-021 (flag `dev021OneFlowVocabulary`): when on, the formatter's shared vocabulary replaces the
   `alert.*` wording.
5. Previews (`useRadarPreviews.ts`), LB-APP-036 fix (`APPROVED`, internal): per radar `GET /api/feed?…&limit=5`
   (newest; `sort` omitted), `GET /api/feed/count`, `GET /api/feed/flow`, each through the request cache (KV-FE-023)
   keyed by the canonical filter key, so revisiting the tab or two radars with equal filters cost nothing for 60 s;
   requests start only for tiles in or near the viewport (IntersectionObserver, 200 px margin) and at most 6 run in
   parallel. The burst stays under the `legacy-reads` limiter (SEC-REQ-027). Flow responses that are not objects become
   `null` (LB-APP-006 normaliser of KV-FE-074).
6. Toggle: optimistic `active` flip; turning on → `PATCH {active:true}` through the chat-access flow (KV-FE-030);
   turning off → plain `PATCH {active:false}`. Result: replace the radar with `result.subscription`; turning on with
   `starter > 0` → toast `subs.resumed`; `ask_found` → close the sheet and open the survey with trigger `pause`. Failure →
   revert; `no_chat` → `toast.noChat`; any other failure → haptic only (legacy) or `common.saveFailed` with DEV-016
   (flag `dev016ErrorToastOnFailure`).
7. «+» in the top bar (KV-FE-045) and the empty-state button open the new-radar sheet (KV-FE-078).
8. Resume after «Смотреть найденное»: when navigation (KV-FE-025, radar-return mode) brings the user back, reopen the
   same sheet without the rise animation and restore `scrollY` (`RadarScreen.jsx:63-71`).

## States and texts

| State | Shown when | Texts (keys) |
| ----- | ---------- | ------------ |
| loading | list not loaded | centred spinner (no text) |
| error | list failed and nothing cached | ErrorState (KV-FE-012): offline `error.offline` «Нет связи» / `error.offlineText`, else `common.loadFailed` «Не загрузилось» / `error.serverText`; button `error.retry` «Повторить» |
| empty | `[]` | KV-FE-076 |
| success | ≥ 1 radar | tiles: title (BR-APP-065, e.g. «2-комн. · до $600»), area summary, status |
| status, paused | `active: false` | `subs.paused` «На паузе» |
| status, no flow | flow not loaded or failed | `subs.mode.instant` «сразу» / `subs.mode.digest` «подборкой» (lower case) |
| status, flow | flow loaded | `alert.rare` «пока редко» / `alert.week` «{n} за неделю» / `alert.day` «≈{n} в день» + « · » + mode |
| resumed toast | resume with `starter > 0` | `subs.resumed` «Радар снова включён. {count}, которые вы не видели, — в чате с ботом» |
| no chat toast | final `no_chat` | `toast.noChat` |
| disabled | switch request in flight | the switch shows the optimistic state; a second tap waits for the first |

## Interaction

- Tap or Enter/Space on a tile: light haptic, open the radar sheet (KV-FE-077). Switch: light haptic, optimistic toggle.
- Pull-to-refresh on this tab reloads the list (BR-APP-058, KV-FE-046); `$pageview subs` is not repeated.
- Layout: single column of tiles, 16 px gutters, max width 608 px; safe areas from KV-FE-026; Telegram Desktop windows
  keep the column. Radar animation in the icon stops under lite mode and reduced motion (KV-FE-027).

## Telegram integration

TMA-033 (write access when turning on), TMA-025 (haptics), TMA-022 (no Back handler on the base tab; the sheet pushes
its own).

## Storage and analytics

- Storage: none.
- `$pageview subs` (legacy screen name, KV-FE-035). Journal: `chat_access_declined` / `chat_access_allowed` via
  KV-FE-030.

## Files

- `frontend/app/app/(miniapp)/features/radar/RadarScreen.tsx`, `RadarTiles.tsx`, `useRadarPreviews.ts`,
  `radarStatus.ts` (new)
- `frontend/app/tests/radar/radarStatus.test.ts`, `RadarTiles.test.tsx`, `frontend/app/e2e/radar-tab.spec.ts`

## API contract

- API-018 `GET /api/subscriptions` → `200 Subscription[]`; errors → error state with retry.
- API-004 `GET /api/feed?<FilterQuery>&limit=5` → `{items, next_cursor}`; only `items[0..4]` are used (`limit` 1…50 is
  accepted by KV-BE-031).
- API-005 `GET /api/feed/count?<FilterQuery>` → `{count}`; API-006 `GET /api/feed/flow?<FilterQuery>` → `{week, days,
  options?}`; preview errors are ignored (tile keeps the mode-only status).
- API-021 `PATCH /api/subscriptions/:id {"active": bool}` → `{subscription, starter?, ask_found?}`; `409 no_chat` on
  resume; `409 subscription_limit` on resume at the limit → revert silently (legacy).

## Business rules

- Kept: BR-APP-044, BR-APP-048, BR-APP-058, BR-APP-063, BR-APP-065.
- Defect fixes `APPROVED` (policy): LB-APP-014, LB-APP-036, LB-APP-006 pattern, LB-APP-002 (enum labels).
- DEV-021 `PROPOSED` (flag `dev021OneFlowVocabulary`), DEV-016 `PROPOSED` (flag `dev016ErrorToastOnFailure`).

## Acceptance criteria

- Tiles show title, area, status and switch exactly as the `tab-radar` baseline (ru light) — collage, greyscale for
  paused radars, switch position.
- Status wording: `week = 0` → «пока редко · сразу»; `week = 3, days = 7` → «3 за неделю · подборкой»; `week = 21,
  days = 7` → «≈3 в день · сразу».
- With 10 radars the tab sends at most 30 preview requests on the first visit and none on a revisit within 60 s; with
  two radars sharing filters, their previews are fetched once.
- Keyboard: Tab reaches each tile and its switch separately; Enter opens the sheet, Space on the switch toggles it.
- Turning a paused radar on after `409 no_chat` and granted access sends the `PATCH` twice in total and ends active.

## Tests

- Unit `radarStatus.test.ts`: paused, no flow, `week 0`, `perDay < 1`, `perDay ≥ 1` rounding, unknown mode,
  `todo('DEV-021 PROPOSED')`.
- Component `RadarTiles.test.tsx`: collage 0/1/4/5 covers, greyscale class, button + switch roles.
- E2E `radar-tab.spec.ts` (contract mocks): list → tiles; list `500` → error → retry; toggle off/on with `starter: 2`
  toast; toggle on with `no_chat` granted; `ask_found` opens the survey; pull-to-refresh reloads.

## Edge cases

- A radar without `filters.city` → summary uses the default city (BR-APP-012 defaults).
- The list changes while previews are loading → stale responses are dropped by key.
- A preview feed answers `403` → handled by the access routing of DEV-001 (KV-FE-042), not as a tile error.
- 10 radars on a 320 px wide screen → texts truncate with ellipsis, the switch never wraps.

## Security

- SEC-REQ-014 (ids only from the user's list), SEC-REQ-027 (preview burst within limits), SEC-REQ-021 (titles and area
  summaries rendered as text).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); visual review of the `tab-radar` baseline recorded in
the PR; parity gate G4 for F-RADAR-001 and F-FILTER-005 ticked (`15` §4); rows in `09` updated; PR reviewed by the
other developer.
