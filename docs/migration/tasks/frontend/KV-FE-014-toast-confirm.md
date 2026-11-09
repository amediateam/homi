# KV-FE-014 — Toast and confirm dialog

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-005 |
| Dependencies | KV-FE-012 (primitives), KV-FE-024 (Telegram adapter: `showConfirm`, version gates); DEV-016 `PROPOSED` (error toast for haptic-only failures) |

## Goal

One toast host and one confirm helper serve every screen: a bottom pill that replaces any previous toast, closes after
4 s (text) or 6 s (with an action), and a confirm that uses Telegram's native `showConfirm` from 6.2 and
`window.confirm` otherwise. A second toast host can live inside a sheet (the pets tips of the filters sheet). The
helper `notifySaveFailed()` makes DEV-016 a one-line change per call site.

## Legacy reference

- SCR-042 (`03` §2): `$KVADRO_ROOT/demo/app/src/components/Toast.jsx:11-38` — string → tap to close, 4 s; object
  `{text, action, run}` → action button, 6 s; one toast at a time, a new one replaces the old; `role="status"`;
  z-index 60 (`03` §3.6); `rise-in` animation; second instance inside the filters sheet
  (`$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:244-248`).
- SCR-043: `$KVADRO_ROOT/demo/app/src/lib/telegram/dialogs.js:9-17` — `WebApp.showConfirm` when
  `isVersionAtLeast('6.2')`, else `window.confirm`; uses `feed.clearConfirm`, `subs.deleteConfirm`,
  `hidden.confirmAll`, `chat.restart` (TMA-026).
- TMA-027: `showPopup`, `showAlert`, `showScanQrPopup` are not used — keep it so.
- Constants: `03` §3.4 "Toast lifetime | 4 s (text) / 6 s (with action)".
- Defects / deviations: LB-APP-027 (failures with haptic only) → DEV-016 `PROPOSED`.
- Visual baseline: KV-QA-019 `listing-hide` → `docs/migration/visual-baseline/SCR-042-*.png` (toast with «Вернуть»).

## Implementation

1. `frontend/packages/ui/src/feedback/Toast.tsx` + `ToastHost` (`'use client'`): state is a single message; `show(msg)`
   replaces; timers 4000 / 6000 ms; tap on a plain toast closes; the action button runs `run()` then closes; `role=
   "status"`, `aria-live="polite"`; bottom offset uses `--bottom-chrome` so it sits above the tab bar or CTA bar.
2. `ToastContext` with `toast(text)`, `toast({text, action, run})`, `dismiss()`; nested hosts: the nearest provider
   wins (the filters sheet mounts its own host).
3. `frontend/app/lib/telegram/dialogs.ts`: `confirm(message): Promise<boolean>` — `WebApp.showConfirm(message, cb)` when
   the SDK exists and `isVersionAtLeast('6.2')`, else `window.confirm(message)`; wrapped in the adapter's
   `safeCallback` (TMA-044).
4. `notifySaveFailed()` helper: always error haptic; with DEV-016 on (`dev016ErrorToastForSilentFailures` in
   `frontend/app/lib/deviations.ts`), also `toast(t('common.saveFailed'))`. Call sites in FE-2 use the helper where
   legacy vibrated only (language picker, settings saves, hidden list, radar mode/unhide/delete/toggle, clear history).
5. Haptics come from the injected feedback context (KV-FE-012 / KV-FE-029); the toast itself plays none.

## States and texts

| State | Behaviour | Text |
| ----- | --------- | ---- |
| plain | closes on tap or after 4 s | caller text, e.g. `toast.hidden` «Объявление скрыто» |
| with action | button; closes after 6 s or after the action | e.g. `toast.blocked` «Автор {label} заблокирован» + `toast.undo` «Вернуть» |
| replaced | a new toast replaces the visible one; timers restart | — |
| save failed (DEV-016 on) | plain toast | `common.saveFailed` «Не получилось сохранить» |
| confirm | native dialog; resolves `true` on OK | `feed.clearConfirm` «Очистить историю просмотров?», `subs.deleteConfirm` «Удалить радар «{name}»?», `hidden.confirmAll` «Снова показывать все скрытые объявления и заблокированных авторов?», `chat.restart` «Бот не может писать вам — похоже, он остановлен. Открыть чат с ботом? Нажмите там «Перезапустить» и включите радар снова.» |

## Interaction

Toast rises in (`rise-in`, 0.25–0.35 s, the legacy easing), no animation under reduced motion; not draggable. Confirm is
modal and native; outside Telegram the browser dialog appears (TMA-043 fallback).

## Telegram integration

TMA-026 (`showConfirm` 6.2+), TMA-027 (absence kept: no popups/alerts), TMA-042 (version gate), TMA-044
(`safeCallback`), TMA-025 (error haptic through the helper).

## Storage and analytics

n/a. No analytics event for toasts (legacy sends none).

## Files

- `frontend/packages/ui/src/feedback/{Toast,ToastHost,ToastContext}.tsx` (new)
- `frontend/app/lib/telegram/dialogs.ts` (new), `frontend/app/lib/feedback/notifySaveFailed.ts` (new)
- `frontend/app/lib/deviations.ts` (flag `dev016ErrorToastForSilentFailures`)
- `frontend/packages/ui/tests/feedback/Toast.test.tsx`, `frontend/app/tests/telegram/dialogs.test.ts` (after KV-FE-010)

## API contract

n/a.

## Business rules

- Kept: one toast at a time; 4 s / 6 s lifetimes; native confirm from 6.2.
- DEV-016 `PROPOSED`: error toast for failures that only vibrated (flag off until approved; test
  `todo('DEV-016 PROPOSED')`).

## Acceptance criteria

- Plain toast disappears after 4 s or on tap; action toast after 6 s; the action runs once.
- A second `toast()` while one is visible replaces it and restarts the timer.
- `confirm()` uses `showConfirm` on a fake Telegram 6.2+ and `window.confirm` on 6.1 and outside Telegram.
- Visual: the action toast matches the `listing-hide` baseline (position above the CTA/tab bar, pill shape, colours).

## Tests

Fake timers: 3999 ms visible / 4000 ms gone; 6000 ms for action toasts; replacement; nested host isolation; confirm
gate table (6.1 vs 6.2, SDK missing); `notifySaveFailed` with the flag off (haptic only) and on (haptic + toast).

## Edge cases

- Unmount of the screen that showed the toast: the host lives at the app root, so the toast stays for its lifetime.
- `run()` throws: the toast still closes; the error goes to the global handler (KV-FE-034).
- Very long uz text: wraps to at most three lines; no truncation of the action button.

## Security

Toast texts are React text (no HTML); interpolated values such as author labels arrive already masked from the server
and are passed as text (SEC-REQ-021).

## Definition of done

`make ci-frontend` green; tests green (after KV-FE-010); visual review of the SCR-042 baseline recorded; PR reviewed by
the other developer.
