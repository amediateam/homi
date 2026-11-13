# KV-FE-029 — Links, haptics, calls and closing

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-005, F-TMA-006, F-CONTACT-001 |
| Dependencies | KV-FE-024 (adapter); consumers: KV-FE-030, KV-FE-041, KV-FE-042, KV-FE-065, KV-FE-067, KV-FE-068, KV-FE-071, KV-FE-081 and every control with haptics |

## Goal

Small, safe primitives for leaving the app: open a link the Telegram way (with the 1.5 s double-tap guard), call a
phone number with the Android `tel:` attempt and the call-page fallback, close the Mini App, and give haptic feedback —
each degrading gracefully outside Telegram and on old clients.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:5-74` (`dialPhone`, 1 200 ms detection; `openLink`, 1 500 ms
  debounce, `t.me` → `openTelegramLink`, other → `openLink`, outside Telegram `window.open(url, '_blank', 'noopener')`);
  `$KVADRO_ROOT/demo/app/src/lib/telegram/haptics.js:8-18`; `$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:131`
  (`close`).
- TMA-025 (haptics, about 60 call sites, no gate, `selectionChanged` unused), TMA-028 (`openLink` /
  `openTelegramLink`, no `try_instant_view`), TMA-029 (phone calls), TMA-032 (`switchInlineQuery`, `shareToStory`,
  `sendData`, `downloadFile`, `openInvoice`: confirmed absence), TMA-039 (`close`; `enableClosingConfirmation` unused).
- `03` §3.4 constants (Android `tel:` detection 1 200 ms, link debounce 1.5 s); BR-APP-033 (calling rule).
- Defect: LB-APP-028 (call dead end and over-counting) — the fix is applied by KV-FE-068 using `onResult` honestly.

## Implementation

1. `frontend/app/lib/telegram/links.ts`:
   - `openLink(url): boolean` — reject anything that is not `https:` and not on the allowlist (`t.me`, the Mini App
     origin, the landing origin, `yandex.uz`, `google.com/maps`, `www.instagram.com`, `openstreetmap.org` — list in one
     constant, SEC-REQ-019); same URL within 1 500 ms → `false`; `https://t.me/…` → `openTelegramLink`, else `openLink`
     (external browser); outside Telegram `window.open(url, '_blank', 'noopener')`;
   - `openTelegramUrl(path)` helper that builds `https://t.me/<username>[?start=…]` from validated parts (used by
     KV-FE-041, KV-FE-042, KV-FE-071, KV-FE-081).
2. `frontend/app/lib/telegram/phone.ts` — `dialPhone(phone, fallback, onResult)`: when `platform.startsWith('android')`
   set `location.href = 'tel:<+998…>'`, watch `visibilitychange` → hidden and `blur` for 1 200 ms; if the app was left
   → `onResult('tel')`, else run `fallback()` (open the call page through `openLink`) and `onResult('browser')`; on
   other platforms `fallback()` at once. The phone must match `^\+998\d{9}$`, else no `tel:` attempt. The return value
   reports whether anything opened so KV-FE-068 logs `contact_call` only on a real open (LB-APP-028).
3. `frontend/app/lib/telegram/haptics.ts` — `hapticImpact(style = 'light')` (`light`, `medium`, `heavy`, `rigid`,
   `soft`), `hapticNotify('success' | 'error' | 'warning')`; optional chaining only, no gate (TMA-042 row "none");
   `selectionChanged` not used.
4. `closeApp()` — `WebApp.close()`; outside Telegram a no-op. No closing confirmation (legacy; enabling it would be a
   product change).
5. Document the absences of TMA-032 in the module header: these APIs stay unused; adding any is a product change.

## States and texts

n/a — no UI of its own. Haptic conventions used by screen tasks: light impact on taps, tabs, chips and Back; medium
on primary actions; `success` / `error` notifications on mutation results (KV-FE-014 pairs every `error` with a toast,
DEV-016).

## Interaction

- Double-tap guard: the same URL is ignored for 1.5 s; different URLs open immediately.
- Android call: the WebView may go to background for the dialer; returning triggers the visibility handlers of other
  tasks (contact-link refresh, KV-FE-068).

## Telegram integration

TMA-025 (haptics), TMA-028 (links), TMA-029 (calls), TMA-032 (absences kept), TMA-039 (`close`), TMA-041
(`platform.startsWith('android')`), TMA-043 (outside-Telegram fallbacks: `window.open`, haptics no-op, close no-op).

## Storage and analytics

- Storage: none.
- Analytics: `dialPhone` reports `via: 'tel' | 'browser'` to its caller, which sends `contact_call` (KV-FE-068). No
  event is sent from this module.

## Files

- `frontend/app/lib/telegram/links.ts`, `phone.ts`, `haptics.ts`, `close.ts`, `allowlist.ts` (new)
- `frontend/app/tests/telegram/links.test.ts`, `phone.test.ts`

## API contract

n/a — opens URLs produced elsewhere (`call_url` of API-009, `contact_url` / `original_url` of API-008, bot usernames
of API-003 / API-001).

## Business rules

- Kept: BR-APP-033 (Android `tel:` first, 1.2 s, then the call page; elsewhere the call page directly).
- LB-APP-028 defect fix `APPROVED` (policy): the caller learns whether something opened (applied in KV-FE-068).

## Acceptance criteria

- `openLink('https://t.me/x')` twice within 1 s opens once and returns `false` the second time; after 1.6 s opens again.
- `openLink('javascript:…')`, `http://…` and an unlisted host are refused and reported once to the error journal.
- Android stub with a hidden visibility event within 1.2 s → `onResult('tel')` and no fallback; without it →
  fallback once and `onResult('browser')`; iOS stub → fallback immediately.
- Outside Telegram haptics and `closeApp` do nothing and throw nothing.

## Tests

- Unit (`links.test.ts`, fake timers and SDK): debounce, routing `t.me` vs external, outside-Telegram `window.open`,
  allowlist refusals.
- Unit (`phone.test.ts`): Android left / not left, `blur` only, iOS, invalid phone string.

## Edge cases

- `openTelegramLink` throws on very old clients: fall back to `openLink`.
- The page returns from the dialer after more than 1.2 s: the result stays `tel` (decided by the event, not the time
  of return).
- Two different call buttons pressed quickly: both allowed (debounce is per URL).

## Security

SEC-REQ-019 (only `https:` and allowlisted hosts; `t.me` usernames validated `^[A-Za-z0-9_]{4,32}$`); phone numbers are
never logged (SEC-REQ-047); `tel:` only for `+998` numbers.

## Definition of done

`make ci-frontend` green; unit tests green (with KV-FE-010); parity gate G4 for F-TMA-005 and F-TMA-006 ticked
(F-CONTACT-001 with KV-FE-068); `09` rows updated; PR reviewed by the other developer.
