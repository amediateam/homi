# KV-FE-086 — Home-screen nudge and settings row

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-TMA-008 |
| Dependencies | KV-FE-014 (toast), KV-FE-028 (`kv-home` storage, DeviceStorage restore), KV-FE-034 (journal events), KV-FE-045 (app shell, nudge slot) |

## Goal

On Telegram 8.0+, after the user has opened the Mini App on at least three different days, the search list offers once
to add the app to the phone's home screen (SCR-041); the «Значок на экране телефона — Добавить» row in Settings offers
the same while the shortcut is missing; adding it shows a toast. Visit days are counted in Tashkent days (LB-APP-010)
and the offer is used up only when it was actually shown (LB-APP-040).

## Legacy reference

- SCR-041 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:62-89` (`HomeScreenNudge`, 10 s timeout),
  `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:15-85` (4 s delay, conditions, `markHomeScreenOffered`,
  `homeScreenAdded` → toast), `$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:6-98` (`kv-home`, 3 days, last 10
  days, 1.5 s status timeout, UTC day key).
- Settings row: `$KVADRO_ROOT/demo/app/src/features/settings/AboutGroup.jsx:17-29`, `useHomeScreenStatus.js:10-17`.
- Wiring: `$KVADRO_ROOT/demo/app/src/app/App.jsx:603-613` (shown only when nudges are allowed, no follow nudge, no toast;
  × → `home_screen_closed`).
- TMA-036 (home-screen API), TMA-042 (version gate 8.0), SCR-044 (the native add dialog).
- Rules: BR-APP-045 (offer conditions; settings row on `missed` / `unknown`), BR-APP-046 (nudges only on search/list
  with nothing open; the home offer waits for the follow nudge, its candidate and toasts).
- Defects: LB-APP-010 (UTC days), LB-APP-040 (offer marked as made without being shown).
- No KV-QA-019 baseline; compare with the legacy markup (same `.nudge` card as SCR-040).

## Implementation

1. `frontend/app/lib/telegram/homeScreen.ts`: `checkHomeScreenStatus()` (8.0+, resolves `unknown` after 1.5 s, else
   `unsupported`), `addToHomeScreen()`, `onHomeScreenAdded(cb)` with unsubscribe; all no-ops below 8.0 and outside
   Telegram (TMA-043).
2. Visit days: `recordVisitDay()` after the DeviceStorage restore of KV-FE-028; day key with
   `Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Tashkent'})` (LB-APP-010 fix); keep the last 10 distinct days. Days
   written by the legacy client in UTC stay valid entries (a one-day overlap at most).
3. `useHomeScreenOffer.ts`: when meta is loaded, nudges are allowed (search tab, list view, nothing open), there is no
   follow nudge or candidate, no toast, the offer is not yet marked and `days.length ≥ 3` → wait 4 s → check status →
   only if `missed`: show the nudge, send `home_screen_offered` and **then** mark `offered: true` (LB-APP-040 fix:
   `unknown`, `unsupported` or `added` leave the offer for a later day).
4. `HomeScreenNudge.tsx` (`.nudge` card): smartphone icon, title, subtitle, «Добавить» (medium haptic → hide →
   `addToHomeScreen()`), × (`home_screen_closed`, hide); auto-hide after 10 s without an event.
5. `homeScreenAdded` from Telegram → `home_screen_added` event, hide the nudge, toast `home.added`.
6. Settings row: `useHomeScreenStatus()` (starts `unsupported`, then the check, `added` after the event) feeds the
   «О приложении» group of KV-FE-081: row `settings.home` with value `home.add` when the status is `missed` or
   `unknown`; tap → `addToHomeScreen()`.

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| nudge shown | `home.title` «kvadro² на экране телефона»; `home.what` «Открывать в одно касание, как обычное приложение»; button `home.add` «Добавить»; × `common.close` |
| added | toast `home.added` «Значок kvadro² добавлен на экран телефона» |
| settings row | label `settings.home` «Значок на экране телефона», value `home.add` «Добавить» |
| hidden | below 8.0, outside Telegram, status `added`/`unsupported`, or conditions not met |
| loading | status check pending (≤ 1.5 s): settings row hidden until `missed`/`unknown` |

The brand name «kvadro²» in `home.title` and `home.added` belongs to the brand layer (FD-8).

## Interaction

- Nudge rises in above the tab bar (`rise-in`, z 35), auto-hides after 10 s, no Back handler (legacy overlay).
- «Добавить» opens Telegram's native dialog (SCR-044); the app only reacts to `homeScreenAdded`.
- Reduced motion and lite mode as KV-FE-080.

## Telegram integration

TMA-036 (`checkHomeScreenStatus`, `addToHomeScreen`, `homeScreenAdded`), TMA-042 (8.0 gate), TMA-037 (`kv-home`
mirrored to DeviceStorage 9.0+), TMA-025 (medium haptic), TMA-043 (no-ops outside Telegram).

## Storage and analytics

- `kv-home` JSON `{days: ['YYYY-MM-DD' ×≤10], offered: boolean}` — mirrored and restored (KV-FE-028).
- Journal events (KV-FE-034): `home_screen_offered`, `home_screen_closed`, `home_screen_added` (no properties).

## Files

- `frontend/app/lib/telegram/homeScreen.ts`, `frontend/app/app/(miniapp)/features/feed/useHomeScreenOffer.ts`,
  `HomeScreenNudge.tsx`, `frontend/app/app/(miniapp)/features/settings/useHomeScreenStatus.ts` (new)
- `frontend/app/tests/telegram/homeScreen.test.ts`, `HomeScreenNudge.test.tsx`

## API contract

n/a — Telegram WebApp API only; events through API-034 (KV-FE-034).

## Business rules

- Kept: BR-APP-045, BR-APP-046.
- Defect fixes `APPROVED` (policy): LB-APP-010, LB-APP-040.

## Acceptance criteria

- With 3 recorded days, status `missed` and a calm search list, the nudge appears after 4 s, `home_screen_offered` is
  sent once and `offered` becomes `true`.
- With status `unknown` the nudge is not shown and `offered` stays `false` (LB-APP-040).
- A visit at 02:00 Tashkent (21:00 UTC the day before) counts as the Tashkent date (LB-APP-010).
- The settings row shows on `missed` and `unknown`, disappears after `homeScreenAdded`; the toast shows once.
- Nothing renders and no API is called on Telegram 7.x.

## Tests

- Unit `homeScreen.test.ts` (fake clock, fake WebApp): status timeout → `unknown`; day key at 18:59 / 19:00 UTC; 10-day
  window; offered only after display; mixed legacy UTC entries.
- Component: nudge timeout, ×, «Добавить»; settings row visibility per status.

## Edge cases

- `kv-home` corrupted → `{days: [], offered: false}`.
- The follow nudge appears during the 4 s wait → the home offer waits (BR-APP-046).
- The user adds the shortcut from the Telegram menu instead → `homeScreenAdded` still hides both nudge and row.

## Security

- SEC-REQ-007 (only dates and a flag stored), TMA-009 (no identifiers in events).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); review against the legacy markup recorded in the PR;
parity gate G4 for F-TMA-008 ticked (`15` §4); row in `09` updated; PR reviewed by the other developer.
