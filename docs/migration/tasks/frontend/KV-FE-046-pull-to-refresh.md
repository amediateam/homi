# KV-FE-046 — Pull-to-refresh

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FEED-003 |
| Dependencies | KV-FE-045 (shell slot, top-bar position); uses the haptics of KV-FE-029 and the body-class contract of KV-FE-013 |

## Goal

Pulling the window down at the top of the search list, favourites, history or the radar tab re-creates that list
(SCR-010), with the legacy distances, haptic and minimum spinner time, and never fires under a sheet, a listing, the
map or the settings tab.

## Legacy reference

- SCR-010 (`03` §2); `$KVADRO_ROOT/demo/app/src/components/PullToRefresh.jsx:1-131` (constants `:6-12`, guards
  `:45-62`); enable condition `$KVADRO_ROOT/demo/app/src/app/App.jsx:530-541`; effect `App.jsx:359-365` (`refresh`:
  `subsVersion` on the radar tab, else `feedVersion`).
- Rules: BR-APP-058. Constants `03` §3.4 («Pull-to-refresh | trigger 72 px, max 110 px, spinner ≥ 700 ms»).
- Visual baseline: none in KV-QA-019 (the gesture is transient); compare against the legacy constants and a screen
  recording made in the legacy harness if needed.

## Implementation

1. `frontend/app/app/(miniapp)/features/shell/PullToRefresh.tsx` (Client Component): a fixed `ptr glass` indicator with
   an ArrowDown icon and a spinner; window-level `touchstart` / `touchmove` (passive) / `touchend` / `touchcancel`
   listeners attached only while `enabled`.
2. Start only when one finger touches, `scrollY === 0`, no refresh is running, and `body` has none of `locked`,
   `sheet-open`, `listing-open` (classes maintained by KV-FE-013 and KV-FE-063).
3. Place the indicator under the top bar (`.topbar` bottom); move it at half the finger distance, capped at 110 px;
   rotate the arrow up to 180° as it approaches 72 px; opacity 1 above 4 px.
4. Crossing 72 px arms the gesture once with a light haptic; dropping below disarms it. Release while armed → spinner at
   64 px, call `onRefresh()`, keep the spinner at least 700 ms, then settle back (0.3 s `cubic-bezier(.2,.9,.3,1)`).
5. `enabled` from the shell: no listing open, not the map view, no filters / quick filter / radar editor / create-radar
   sheet, and not the settings tab (BR-APP-058).
6. `onRefresh`: radar tab → bump the radar list version (KV-FE-075); otherwise bump the feed version so the list is
   re-created (KV-FE-048, KV-FE-072, KV-FE-073). The request cache entry of that list is invalidated (KV-FE-023).

## States and texts

| State | Shown when | Texts |
| ----- | ---------- | ----- |
| idle | no gesture | indicator hidden (opacity 0) |
| pulling | finger moving, < 72 px | arrow rotating with the distance |
| armed | ≥ 72 px | arrow at 180°, light haptic once |
| refreshing | released while armed | spinner, ≥ 700 ms |
| disabled | guard fails | no indicator, native scroll |

No texts; the indicator is `aria-hidden` (legacy). Screen-reader users refresh by re-entering the tab.

## Interaction

- Gesture constants: trigger 72 px, max 110 px, spinner position 64 px, minimum spin 700 ms, finger ratio 0.5.
- Works with `disableVerticalSwipes` (TMA-015) so the Telegram sheet does not collapse on the pull.
- Reduced motion: no settle transition.
- Responsive: centred horizontally; follows the top-bar height including `--top-inset`.

## Telegram integration

TMA-015 (vertical swipes disabled by KV-FE-024, required for the gesture), TMA-025 (light haptic on arming).

## Storage and analytics

n/a — no storage and no events (legacy sends none).

## Files

- `frontend/app/app/(miniapp)/features/shell/PullToRefresh.tsx` (new)
- `frontend/app/tests/shell/PullToRefresh.test.tsx`

## API contract

n/a — the refreshed list repeats its own request: API-004 / API-029 / API-030 (list re-created) or API-018 (radar list).

## Business rules

- Kept: BR-APP-058 (radar tab reloads the radar list; elsewhere the list is re-created; disabled on settings, map and
  under overlays).

## Acceptance criteria

- On the search list at the top, a 150 px pull arms at 144 px finger travel (72 px indicator), vibrates once, and the
  list is re-created after release; the spinner stays ≥ 700 ms even when the response is instant.
- With any sheet open, a listing open, on the map or on the settings tab, pulling does nothing.
- On the radar tab the radar list is refetched, the feed is not.

## Tests

- Component (`PullToRefresh.test.tsx`, synthetic touch events): no start when `scrollY > 0`; no start with each of the
  three body classes; arming threshold and single haptic; minimum spinner time with a resolved promise; disabled prop
  removes listeners.
- E2E (in `shell.spec.ts` of KV-FE-045): pull on the feed triggers a second `GET /api/feed` first page.

## Edge cases

- Two fingers: ignored. A pull that turns into an upward scroll resets the indicator without refreshing.
- `onRefresh` rejects: the spinner still settles; the list shows its own error state.
- Rapid repeated pulls during a refresh: ignored until it ends.

## Security

n/a — no data, no network calls of its own.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); behaviour checked on a device in the dev bot
(iOS and Android) and noted in the PR; parity gate G4 for F-FEED-003 ticked (`15` §4); the `09` row updated; PR
reviewed by the other developer.
