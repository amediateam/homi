# KV-FE-045 — App shell: top bar, tab bar, view toggle, collapsing chrome

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-TMA-004 |
| Dependencies | KV-FE-012 (primitives, chips, icons), KV-FE-016 (catalogues), KV-FE-025 (tabs and layer stack), KV-FE-026 (safe areas, fullscreen class); decisions: DEV-015 `PROPOSED` (via the summary of KV-FE-020), LB-APP-046 fix lives in KV-FE-025 |

## Goal

The persistent frame of the Mini App (SCR-006) exists: the top bar in all its variants (search list, map, drawing,
saved, radar, settings), the four-tab glass tab bar with the moving lens, the floating «Карта / Список» toggle, the
collapsed one-line title and the scroll-driven collapsing chrome — with the legacy texts, haptics and timings, and with
slots that the feed, map, radar and settings tasks fill.

## Legacy reference

- SCR-006 (`03` §2); `$KVADRO_ROOT/demo/app/src/app/App.jsx:440-545` (frame), `:346-358` (collapsed-chrome first tap),
  `:251` (`miniTitle`), `:264-270` (`switchTab`), `:271-282` (`switchDeal`).
- `$KVADRO_ROOT/demo/app/src/app/TopBar.jsx:30-135` (variants), `$KVADRO_ROOT/demo/app/src/app/TabBar.jsx:12-33`,
  `$KVADRO_ROOT/demo/app/src/app/ViewToggle.jsx:11-18`, `$KVADRO_ROOT/demo/app/src/app/tabs.js:8-29`,
  `$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js:4-85`; styles `$KVADRO_ROOT/demo/app/src/styles/chrome.css:100-319`,
  `:223-230` (fullscreen).
- Rules: BR-APP-002 (deal switch keeps geography), BR-APP-064 (collapsed-title summary), BR-APP-023 (sort fallback on
  deal switch). Defects: LB-APP-026 → DEV-015 (whole-city label in the collapsed title), LB-APP-037 (screen names).
- Visual baselines (KV-QA-019): the shell appears in `feed` (`SCR-007-*` ru light), `feed-dark-uz`,
  `feed-uzs-en-lite`, `gl-base` (`SCR-011-*`), `gl-lasso` (`SCR-012-*`), `tab-favorites` (`SCR-024-*`), `tab-radar`
  (`SCR-026-*`), `tab-settings` (`SCR-032-*`). No separate SCR-006 baseline exists.

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` and
   `03-api-reference/03-file-conventions/route-groups.md`; the shell is a Client Component under
   `frontend/app/app/(miniapp)/`.
2. `features/shell/AppShell.tsx` composes, in legacy order: mini title (search tab only), `TopBar`, the base layer
   chosen by tab/view (slot filled by KV-FE-048 / KV-FE-058 / KV-FE-075 / KV-FE-081 / KV-FE-072), `ViewToggle` (search
   tab, hidden while drawing), the pull-to-refresh indicator (KV-FE-046), decorative `mini-ring` spans, `TabBar`, then
   the overlay stack of KV-FE-025 and the first-launch city sheet (KV-FE-044).
3. `TopBar.tsx` variants (`TopBar.jsx:48-134`):
   - search list: title tabs `deal.rent_long` / `deal.sale` (daily counts as «Аренда», `baseDeal`) + the feed header
     chips slot (KV-FE-048);
   - map: compact segmented deal control, lasso button (aria `map.area`), filters button (aria `sheet.title`) with a
     count badge when `countActiveFilters > 0` (BR-APP-011);
   - drawing: hint `map.areaHint` / `map.areaSmall` + sub-hint `map.areaMove`, button `map.areaCancel`;
   - saved: title tabs `app.saved.favorites` / `app.saved.history`;
   - radar and settings: `h1` `tab.subs` / `tab.settings`; the radar variant adds «+» (aria `sheet.createTitle`);
   - map with an area: pill `map.areaOn` + × (aria `map.areaRemove`).
   Actions are props; the component holds no data.
4. Deal switch from the title tabs or the map segment: `switchDeal()` of `@homi/search` (KV-FE-020) — defaults of the
   new deal, keep `districts`, `zones`, `polygon` (BR-APP-002); reset the sort to `new` if unavailable; light haptic.
   Tapping the active deal does nothing.
5. `TabBar.tsx`: order `search | favorites | subs | settings`, labels `tab.*`, icons Search / Heart / custom
   `RadarIcon` / Settings at 24 px (stroke 2.2 active, 1.7 idle), class `long` when a label is longer than 13
   characters, lens position from the CSS variable `--tab` (active index).
6. Tab press: if the chrome is collapsed, only expand it (light haptic); else light haptic, clear radar-return mode,
   switch tab, `scrollTo(0, 0)` (`App.jsx:264-270`, `:352-358`).
7. `useMiniChrome(enabled)`: enabled on the search list with no listing, map, filters, quick filter or radar editor
   open; collapse after scrolling down 24 px past the anchor, expand after scrolling up 24 px, always expanded within
   60 px of the top; one `requestAnimationFrame` per scroll; toggles `html.chrome-mini`; returns `expand()` that
   reports whether it expanded.
8. Mini title button (search tab): text `«<deal> · <filtersSummary>»` from `filtersSummary()` (KV-FE-020, BR-APP-064;
   the whole-city label follows DEV-015 there); tap → light haptic + expand.
9. `ViewToggle.tsx`: shows the target view — `app.view.map` with the Map icon in the list, `app.view.list` with the List
   icon on the map; first tap on a collapsed chrome only expands it.
10. Screen names for analytics: the shell reports `search/list`, `search/map`, `saved/favorites`, `saved/history`,
    `subs`, `settings` to the tracker of KV-FE-035 whenever the base layer changes.

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| search list | `tab=search`, `view=list` | `deal.rent_long` «Аренда», `deal.sale` «Продажа» (title tabs) |
| map | `view=map`, not drawing | segmented `deal.*`; aria `map.area` «Обвести на карте», `sheet.title` «Фильтры» |
| drawing | drawing mode | `map.areaHint` «Обведите пальцем, где искать» / `map.areaSmall` «Обведите покрупнее», `map.areaMove` «Двумя пальцами — двигать карту», `map.areaCancel` «Отмена» |
| area set on the map | polygon present | `map.areaOn` «Своя область», aria `map.areaRemove` «Убрать область» |
| saved | `tab=favorites` | `app.saved.favorites` «Избранное», `app.saved.history` «Смотрели» |
| radar | `tab=subs` | `tab.subs` «Радар», aria `sheet.createTitle` «Новый радар» |
| settings | `tab=settings` | `tab.settings` «Настройки» |
| tab bar | always | `tab.search` «Поиск», `tab.favorites` «Избранное», `tab.subs` «Радар», `tab.settings` «Настройки» |
| view toggle | search tab, not drawing | `app.view.map` «Карта» / `app.view.list` «Список» |
| loading meta | `meta = null` | shell renders; no city chip, default sort options, no area pill (`03` §1.4) |
| collapsed | `html.chrome-mini` | one-line mini title; tab bar and top bar shrink |

## Interaction

- Collapse animation: `clip-path` morph 0.35–0.45 s (translate-only in lite mode, KV-FE-027); the tab lens moves with
  a spring easing; `prefers-reduced-motion` disables transitions.
- Haptics: light on tab, deal, view toggle, mini title; none on scroll.
- Layout: no width breakpoints; single phone column, feed limited to 608 px; `--tabbar-h: 62px`;
  `--bottom-chrome = tabbar + bottom inset + 90px`; top padding from `--top-inset` (KV-FE-026); in `html.fullscreen`
  the mini title sits in Telegram's header row (`chrome.css:223-230`).
- Z-index ladder (`03` §3.6): top bar 10, view toggle 29, tab bar 30, mini title 31.
- Telegram Desktop: same column centred in the window.

## Telegram integration

TMA-022 (no Back handler on the base tabs: an empty stack hides BackButton), TMA-023 (SettingsButton switches to the
settings tab through KV-FE-025), TMA-016 / TMA-017 (fullscreen class and insets via KV-FE-026), TMA-025 (haptics).

## Storage and analytics

- Storage: none.
- Analytics: `$pageview` for the six tab screens above (KV-FE-035), same names as legacy.

## Files

- `frontend/app/app/(miniapp)/features/shell/{AppShell,TopBar,TabBar,ViewToggle,MiniTitle}.tsx` (new)
- `frontend/app/app/(miniapp)/features/shell/useMiniChrome.ts` (new)
- `frontend/packages/ui/src/icons/RadarIcon.tsx` (if not already added by KV-FE-012)
- `frontend/app/tests/shell/{TopBar,useMiniChrome}.test.tsx`, `frontend/app/e2e/shell.spec.ts`

## API contract

n/a — the shell renders data owned by other tasks. It requests a refresh of the radar list (API-018 `GET
/api/subscriptions`) when the search tab is entered and after radar changes (`App.jsx:173-177`); the call itself is
wired by KV-FE-074.

## Business rules

- Kept: BR-APP-002, BR-APP-011 (badge count), BR-APP-023 (sort fallback), BR-APP-064 (collapsed title).
- DEV-015 `PROPOSED` is applied by the summary function of KV-FE-020; this task only displays it.
- LB-APP-037 fix (screen names) is implemented in KV-FE-035; this task reports the tab screen names.

## Acceptance criteria

- Each top-bar variant renders the exact texts and controls of the table for its state; the filters badge shows the
  active group count (BR-APP-011).
- Switching from daily rent to «Продажа» keeps districts, zones and polygon and resets everything else; tapping the
  active deal is a no-op.
- Scrolling the feed 25 px down past the anchor collapses the chrome; scrolling 25 px up expands it; within 60 px of
  the top it is always expanded; while collapsed, the first tap on a tab only expands.
- Tab labels longer than 13 characters get the `long` class (checked in uz and en).
- Visual: side by side with the `feed`, `feed-dark-uz`, `feed-uzs-en-lite`, `gl-base`, `gl-lasso`, `tab-favorites`,
  `tab-radar` and `tab-settings` baselines — chrome position, glass, lens, badge and texts equal.

## Tests

- Unit (`useMiniChrome.test.ts`): hysteresis 24 px, top zone 60 px, `expand()` return value, cleanup removes the class.
- Component (`TopBar.test.tsx`): one render per variant × locale; deal-switch callback not fired for the active deal.
- E2E (`shell.spec.ts`): tab round trip with `scrollTo(0,0)`; collapse on scroll; first tap expands only; view toggle
  list → map → list.

## Edge cases

- `meta` still loading: deal tabs and chips render; city-dependent parts are absent, never `undefined` text.
- Very long uz labels in the tab bar: `long` class, no wrap overflow at 320 px width.
- Drawing mode on: view toggle hidden; leaving the map cancels drawing (KV-FE-060).
- Radar-return mode active (KV-FE-025): a tab press clears it.

## Security

- SEC-REQ-021: every label is text; the summary contains server city names rendered as text.
- No storage, no network calls of its own.

## Definition of done

`make ci-frontend` green; unit, component and E2E tests green (or added when KV-FE-010 lands); side-by-side review of
the listed baselines recorded in the PR; parity gate G4 for F-TMA-004 ticked (`15` §4); the `09` row updated; PR
reviewed by the other developer.
