# KV-FE-068 — Listing: CTA bar and contact

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-CONTACT-001, F-CONTACT-002, F-CONTACT-003 |
| Dependencies | KV-FE-063, KV-FE-029, KV-FE-034; backend KV-BE-035 (phone quota), KV-BE-037 (API-009, RES-005); decisions: DEV-007 `PROPOSED`, FD-2, DEC-19, Q-APP-017 |

## Goal

The fixed CTA bar shows the price with its period, the market delta or the price note, and one primary action in the
legacy priority — «Позвонить», «Написать» / «Номер платный», or «Открыть пост» — and the contact flow keeps the
short-lived call link fresh, tries `tel:` on Android and falls back to the call page. The dead-end call and the
over-counted `contact_call` of LB-APP-028 are fixed. Since the owner-cabinet plan the bar also has the request states
and the request sheet, built by WP-83.

## Legacy reference

- Screen: SCR-018 CTA bar (`03` §2: «CTA bar (fixed bottom, z 20)», «Contact»).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:17-83` (price parts, note, action priority,
  shimmer placeholder), `hooks/useListingContact.js:9-90` (TTL 10 min, refresh at 8 min, visibility refresh,
  `contact_call` / `contact_write`), `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:14-74` (`dialPhone` 1 200 ms
  detection, `openLink` debounce), `hooks/useListingLoader.js:28-34` (`call_url` captured with a timestamp),
  `format.js` `shortPrice`, `marketDeltaShort`.
- Rules: BR-APP-032 (CTA priority), BR-APP-033 (calling), BR-API-071 (price string format), BR-API-113 (`phone` ⇒
  `call_url`).
- Integration: TMA-029 (phone calls), TMA-028 (`openLink`), TMA-040 (visibility).
- Defects and deviations: LB-APP-028 → `APPROVED` fix; LB-API-030 → DEV-007; Q-APP-017 (meaning of `contact_paid`);
  SEC-REQ-028 / DEC-19 (phone quota).
- Visual baselines (KV-QA-019): `listing-open` (call button) and `listing-post-deleted` (no action) → `SCR-018-*.png`.

## Implementation

1. `features/listing/cta/priceParts.ts`: `shortPrice(item)` — first ` · ` part of `price`, parentheses removed, split at
   the first `/` into `main` and `period`; note = text inside `(…)` of part 1 plus the remaining ` · ` parts; no
   client re-formatting (CF-017: the server string is authoritative).
2. `cta/ListingCtaBar.tsx`: left — `main` + `period`, or `listing.negotiable` «Договорная» when `price` is empty;
   below — the verdict delta (`verdict.short` when a note exists, else `marketDeltaShort`, helpers of KV-FE-066) and the
   note. Right — the action:
   - details not loaded → shimmer placeholder;
   - `phone` → `listing.call` «Позвонить» (phone icon);
   - else `contact_url` → `listing.write` «Написать» (message icon) or `listing.writePaid` «Номер платный» (no icon)
     when `contact_paid`;
   - else `post_deleted` → no action, placeholder stays;
   - else `listing.openPost` «Открыть пост» (send icon) → `openOriginal(original_url, 'button')` of KV-FE-065.
3. `cta/useContact.ts`: `contact = {url, at}` from `call_url` when details arrive; refresh through API-009 8 minutes
   after `at` if the document is visible, and on `visibilitychange → visible` when older than 8 minutes; refresh
   errors are ignored. Relative URLs are resolved against the Mini App origin.
4. `call(src?)`: medium haptic; on Android (`platform` starts with `android`) set `location.href = 'tel:<phone>'`
   and watch `visibilitychange` / `blur` for 1 200 ms — left the app → `via: 'tel'`; otherwise open the call page.
   Elsewhere open the call page directly. Call page: fresh link (< 8 min) → open; stale → refresh then open, on refresh
   failure open the old one; **missing link** (`call_url` `null` while `phone` is set, or the quota nulled it) → fetch
   API-009 on demand, then open (LB-APP-028). `contact_call {listing_id, via, src?}` is sent **only when a page or the
   dialer actually opened** (LB-APP-028), `src: 'text' | 'author'` from the callers in KV-FE-064 / KV-FE-065.
5. `write(contactUrl)`: open with `openLink`; `contact_write {listing_id}` only when it opened.
6. DEV-007 (flag `dev007NoRawPhones` of KV-FE-064): the Android `tel:` attempt is dropped and every call goes through the
   call link; the bar never shows a number. With FD-2 = A this is the client half only (the legacy surface still sends
   `phone`); with FD-2 = B the v1 API never returns a raw number and «Позвонить» is shown when the v1 contact flag says
   a phone exists. Test `todo('DEV-007 PROPOSED')`.
7. Quota (SEC-REQ-028): when the server nulls `phone`, `phone_display` and `call_url` together, the bar falls through to
   «Написать» or «Открыть пост» — no error, no message (legacy shape).

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| loading (disabled) | price from the preview; action = shimmer placeholder |
| call | `listing.call` «Позвонить» |
| write | `listing.write` «Написать» |
| write, paid | `listing.writePaid` «Номер платный» (meaning open, Q-APP-017) |
| open post | `listing.openPost` «Открыть пост» |
| deleted post, no contact | placeholder only, no button |
| no price | `listing.negotiable` «Договорная» |
| delta | `listing.marketDelta` «{delta} к рынку»; `fmt.marketSameShort` «≈ обычная», `fmt.marketMixedShort` «≈ спорно» |
| refresh failed | silent; the old link is used |
| on-demand link failed | the error toast `common.saveFailed` is **not** used (legacy has none); the button plays the error haptic and logs nothing |

## Interaction

- Primary button: medium haptic; repeat taps within 1.5 s on the same URL are ignored (TMA-028 debounce).
- Bar fixed at the bottom (z 20 inside the listing layer) above the bottom safe-area inset; the scroll container keeps
  padding so the last section is never hidden.
- Telegram Desktop: no `tel:`; the call page opens in the external browser.

## Telegram integration

TMA-029 (Android `tel:` detection, call page elsewhere), TMA-028 (`openLink` / `openTelegramLink` for `contact_url`),
TMA-040 (visibility-driven refresh), TMA-041 (platform check), TMA-025 (haptics).

## Storage and analytics

- Storage: none; the call link lives in memory with its timestamp.
- Journal (KV-FE-034): `contact_call {listing_id, via: 'tel' | 'browser', src?: 'text' | 'author'}`,
  `contact_write {listing_id}`, `original_opened {listing_id, src: 'button'}` — each only after something opened.

## Files

- `frontend/app/app/(miniapp)/features/listing/cta/{ListingCtaBar.tsx,priceParts.ts,useContact.ts}` (new)
- Tests: `frontend/app/tests/listing/{priceParts,useContact,ListingCtaBar}.test.tsx`, `frontend/app/e2e/listing-contact.spec.ts`

## API contract

- API-009 `GET /api/listings/:id/call` → `200 {"url": string}` (relative `/call/<token>` or absolute); TTL about 10
  minutes (SEC-REQ-026). Errors ignored on refresh; on demand → error haptic.
- API-008 fields: `price` (server string, BR-API-071), `price_kind`, `phone` (`+998XXXXXXXXX` or `null`), `call_url`
  (non-null whenever `phone` is, BR-API-113), `contact_url` (`https://t.me/<username>`), `contact_paid?`,
  `original_url`, `post_deleted?`, `median_delta`, `median_tone`.
- RES-005 `/call/<token>`: a Laravel no-JS page (KV-BE-037, CF-013); the Mini App only opens it.

## Business rules

- Kept: BR-APP-032, BR-APP-033, BR-API-071, BR-API-113.
- LB fix `APPROVED` (policy): LB-APP-028 (on-demand link, honest `contact_call`).
- DEV-007 `PROPOSED` behind `dev007NoRawPhones` (client half with FD-2 = A, full with FD-2 = B).

## Acceptance criteria

- The action follows the priority for the fixture set: phone; contact only; paid contact; post only; deleted post
  without contact (no button).
- `$650/мес (торг) · залог 1 мес` renders `$650` + `/мес` and the note «торг · залог 1 мес».
- On Android with a mocked dialer that leaves the app, `contact_call` has `via: 'tel'` and no call page opens; when the
  app stays, the call page opens after 1.2 s and `via: 'browser'`.
- With `call_url` older than 8 minutes, «Позвонить» refreshes first (one API-009) and opens the new URL.
- With `call_url: null` and a phone, a tap fetches API-009 and opens the result; no `contact_call` is sent when the
  fetch fails.
- Visual: the bar matches the `listing-open` and `listing-post-deleted` baselines.

## Tests

- Unit `priceParts.test.ts`: dataset of server strings (rent with period, sale, down payment, brackets, ` · ` notes,
  `null`).
- Unit `useContact.test.ts` (fake timers, visibility events): refresh at 8 min only when visible; visibility refresh
  when stale; refresh error keeps the old link; on-demand fetch; Android detection both outcomes; events only on open.
- Component `ListingCtaBar.test.tsx`: action priority table; DEV-007 `todo`.
- E2E `listing-contact.spec.ts` (contract mocks): tap «Позвонить» on a non-Android platform opens the call page URL.

## Edge cases

- `call_url` absolute on another host: opened only if on the allowlist (Mini App origin, HOMI hosts; SEC-REQ-019).
- The user returns after 30 minutes: the visibility refresh runs before the next tap.
- `contact_url` not `https://t.me/…`: no «Написать» button (treated as absent) and logged once as a contract issue.
- Double tap on «Написать»: one open, one `contact_write`.

## Security

- SEC-REQ-026: call tokens are never stored beyond the layer's memory and never logged.
- SEC-REQ-028: quota responses keep the same shape; the client shows no hint about quotas.
- SEC-REQ-019: `contact_url` must be `https://t.me/<username>`; `call_url` must resolve to an allowlisted origin.
- TMA-009 / SEC-REQ-047: no phone number in analytics or logs; `contact_call` carries no number.

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review recorded in the PR; parity
gate G4 for F-CONTACT-001 and F-CONTACT-002 ticked (`15` §4); the feature rows in `09` updated; PR reviewed by the other
developer.
