# KV-FE-025 — Navigation: tabs, layer stack, BackButton, SettingsButton

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-004 |
| Dependencies | KV-FE-024 (adapter, `safeCallback`, gates); consumers: KV-FE-013 (sheets, sub-pages), KV-FE-045 (shell), every FE-2 layer; decisions: DEV-013 `PROPOSED` (map card is a layer) |

## Goal

The new Mini App navigates exactly like legacy, without URL routing between screens: four base tabs, a LIFO stack of
layers (listing, sheets, viewers, sub-pages, drawing mode, radar-return) whose top entry Telegram's `BackButton`
closes, and a `SettingsButton` that resets **every** overlay and opens the settings tab (LB-APP-046 fixed).

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/telegram/buttons.js:5-54` (module-level handler array, show/hide, per-push instance);
  `$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:10-79` (SettingsButton handler, drawing mode, radar-return);
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:51-106` (navigation flags), `:546-670` (overlay render order); tabs
  `$KVADRO_ROOT/demo/app/src/app/tabs.js:8-29`.
- `03` §1.1 (state list), §1.2 (layers that register Back, layers without Back, SettingsButton, swipe-back, collapsing
  chrome); `05` §3.2 (stack diagram), §4 (port notes).
- TMA-022 (BackButton stack), TMA-023 (SettingsButton 7.0+), TMA-024 (MainButton, SecondaryButton, BottomButton:
  confirmed absence — keep unused).
- Defects: LB-APP-046 (SettingsButton leaves sort, quick filter, city picker, create-radar open), LB-APP-024 → DEV-013.

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` ("strict SPA" pattern)
   and `03-api-reference/03-file-conventions/route-groups.md`: the `(miniapp)` group has one page; no `router.push`
   between screens, so `history.back()` can never leave the app (`10` §5.2).
2. `frontend/app/lib/navigation/navigationReducer.ts`: state `{tab: 'search'|'favorites'|'subs'|'settings', view:
   'list'|'map', savedTab: 'favorites'|'history', layers: Layer[], radarReturn, resume}` with actions `switchTab`,
   `setView`, `setSavedTab`, `openLayer(layer)`, `closeLayer(id)`, `closeTop()`, `resetToSettings()`.
   `Layer` is a discriminated union with an id: `listing{listingId, preview}`, `filters{mode: 'search'|'create'|'edit',
   focus?}`, `quickFilter{kind}`, `sort`, `cityPicker{nested}`, `radarSheet{id}`, `foundSurvey{trigger}`,
   `photoViewer`, `marketSheet`, `spotMap`, `actionsSheet{view: 'menu'|'report'}`, `subPage{name}`, `drawing`,
   `mapCard` (flag DEV-013). The first-launch city picker (SCR-005) is **not** a layer (no Back, as legacy).
3. `NavigationProvider` (Client Component) with `useNavigation()`; layer components render from `layers` in a fixed
   order equal to the legacy JSX order (sort, listing, radar editor, filters, create radar, nudges, quick filter, city
   picker, first-launch city picker, toast) so later layers paint on top; z-index tokens from KV-FE-011.
4. `frontend/app/lib/telegram/backButton.ts`: `pushBackHandler(handler)` keeps the legacy LIFO semantics — first push
   `BackButton.onClick` + `show()`, only the top handler runs (through `safeCallback`), removing the last handler
   `offClick` + `hide()`, unsubscribe on the instance captured at push time. `useBackHandler(onClose, enabled)` wraps it
   for layers (KV-FE-013 uses it for sheets and sub-pages).
5. Radar-return: while `radarReturn` is set and the tab is `search`, a Back handler restores the radar's previous
   filters and sort, switches to list view and the `subs` tab and sets `resume {radar, scrollY}`
   (`useTelegramButtons.js:54-79`); a tab press clears `radarReturn`.
6. Drawing mode registers a Back handler that cancels drawing (light haptic); leaving the map turns drawing off.
7. SettingsButton (gate 7.0): light haptic, `resetToSettings()` = **close every layer** (fixes LB-APP-046; legacy closed
   only listing, filters and radar editor), clear `radarReturn`, switch to `settings`, `scrollTo(0, 0)`.
8. Error boundary per layer: each layer renders inside the boundary of KV-FE-036; a crash closes that layer back to the
   base screen instead of the whole app (`10` §5.14).
9. Tab press semantics (used by KV-FE-045): light haptic, clear `radarReturn`, `scrollTo(0, 0)`; a press on the
   current tab does not reset layers.
10. Expose `currentScreen` (derived name) for analytics and error context (KV-FE-035, KV-FE-034); naming is owned by
    KV-FE-035.

## States and texts

| State | Back button | Texts |
| ----- | ----------- | ----- |
| base tab, no layer | hidden (Telegram shows Close) | tab labels `tab.search` «Поиск», `tab.favorites` «Избранное», `tab.subs` «Радар», `tab.settings` «Настройки» (rendered by KV-FE-045) |
| one or more layers | visible; closes the top layer | — |
| radar-return active on search | visible; restores the radar tab | — |
| drawing | visible; cancels drawing | drawing texts in KV-FE-060 |
| map card open | legacy: hidden (LB-APP-024); with DEV-013 visible, closes the card | — |

## Interaction

- Telegram Back closes exactly one layer per press; Android hardware Back maps to the same event.
- Swipe-back (iOS and desktop only) is a gesture of KV-FE-013 that calls the same `closeLayer`.
- Order of handlers equals mount order: a sheet opened over the listing wins (legacy).
- Animations of closing belong to the layer components; the reducer removes a layer only after its exit animation
  callback (sheet settle 200 ms, swipe settle 180 ms) so the stack and the UI never disagree.

## Telegram integration

TMA-022 (BackButton stack), TMA-023 (SettingsButton, gate 7.0), TMA-024 (MainButton/SecondaryButton/BottomButton stay
unused — porting primary actions to them would be a product change, `05` TMA-024), TMA-044 (`safeCallback`).

## Storage and analytics

- Storage: none (navigation is session-only, as legacy).
- Analytics: provides the screen-name input for `$pageview` (KV-FE-035) and the `screen` field of `app_error`
  (KV-FE-034); the precedence `listing > radar/edit > radar/new > filters > filters/<kind> > sort > city > map/draw >
  tab screen` is preserved.

## Files

- `frontend/app/lib/navigation/navigationReducer.ts`, `NavigationProvider.tsx`, `layers.ts` (new)
- `frontend/app/lib/telegram/backButton.ts`, `settingsButton.ts` (new)
- `frontend/app/lib/deviations.ts` (flag `dev013BackClosesMapCard`)
- `frontend/app/tests/navigation/navigationReducer.test.ts`, `backButton.test.ts`; `frontend/app/e2e/back-stack.spec.ts`

## API contract

n/a — no HTTP calls.

## Business rules

- Kept: TMA-022 semantics; layers with and without Back exactly as `03` §1.2 (no Back for base tabs, nudges, toasts,
  first-launch city picker); radar-return rule.
- LB-APP-046 defect fix `APPROVED` (policy): SettingsButton dismisses every overlay.
- DEV-013 `PROPOSED`: the map card is a layer (flag; test `todo('DEV-013 PROPOSED')`).

## Acceptance criteria

- Open listing → photo viewer → Back closes the viewer, Back closes the listing, the BackButton hides.
- Open filters → nested city picker → Back closes the picker only.
- With sort, quick filter, city picker or create-radar open, SettingsButton leaves **no** overlay rendered and shows the
  settings tab (legacy left them open).
- Radar sheet → «Смотреть найденное» → search tab: Back returns to the radar tab with the sheet reopened and the scroll
  restored; filters and sort equal the values before.
- On Telegram < 7.0 no SettingsButton is shown and nothing throws.
- A thrown error inside a layer closes that layer and leaves the tab usable.

## Tests

- Unit (`navigationReducer.test.ts`): open/close order, `closeTop` on an empty stack is a no-op, `resetToSettings`
  clears all layers and `radarReturn`, tab switch clears `radarReturn`.
- Unit (`backButton.test.ts`, fake BackButton): first push shows, last pop hides, only the top handler runs, unsubscribe
  uses the captured instance after a late-SDK swap (KV-FE-024).
- E2E (`back-stack.spec.ts`, fake Telegram of KV-FE-170): the four acceptance flows above.
- `todo('DEV-013 PROPOSED')`: Back closes the map card.

## Edge cases

- Two layers closing in the same tick (successful action closes sheet and listing): both removed, Back state correct.
- The late SDK arrives while layers are open: handlers re-registered on the new instance once.
- Deep link opens a listing at boot: the listing layer is pushed before the shell mounts (KV-FE-037); Back closes it to
  the search tab.

## Security

No data handled. Navigation never builds URLs from user input; external links go through KV-FE-029.

## Definition of done

`make ci-frontend` green; unit and E2E tests green (with KV-FE-010); parity gate G4 for F-TMA-004 ticked with the PR
link; the F-TMA-004 row in `09` updated; PR reviewed by the other developer.
