# KV-FE-069 — Listing share

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-SHARE-001 |
| Dependencies | KV-FE-063, KV-FE-030; backend KV-BE-046 (API-017) |

## Goal

The share button in the listing title row forwards the listing through Telegram's native picker with a server-prepared
message (Telegram 8.0+), or falls back to a `t.me/share/url` link that opens the listing in the Mini App; repeated taps
cannot open the picker twice.

## Legacy reference

- Screen: SCR-018 title row (`03` §2 «Share»), SCR-044 (native forward picker).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:11-63` (`listing_shared`, prepared message,
  fallback text, 1.5 s cooldown), `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:12-70` (`shareMessage` with the
  stale-window recovery, `shareUrl` fallbacks).
- Integration: TMA-030 (`shareMessage` with a prepared message), TMA-031 (fallbacks), TMA-013 (deep link created),
  URL-052 (`t.me/<bot>?startapp=l_<id>`), URL-058 (`t.me/share/url`).
- Rules: BR-APP-038 (share only with a known bot username; prepared message from 8.0; fallback text).
- Contract: API-017.
- Visual baseline: the title row in `listing-open` (`SCR-018-*.png`); the native picker has no app-side layout.

## Implementation

1. `features/listing/share/useShareListing.ts`, used by the title row of KV-FE-063:
   - lock flag held while sharing and for 1 500 ms after (`SHARE_COOLDOWN_MS`); taps during the lock are ignored;
   - light haptic, then `listing_shared {listing_id}` (sent before trying, legacy order);
   - when `canShareMessage()` (KV-FE-030: `shareMessage` exists and version ≥ 8.0): `POST /api/listings/:id/share` →
     `shareMessage(id)`; any error or `false` → fallback;
   - fallback: `shareUrl('https://t.me/<bot>?startapp=l_<id>', text)` with `text = [title, main + period, price-kind
     label, district_name].filter(Boolean).join(' · ')` (title and price parts from KV-FE-063 / KV-FE-068 helpers;
     price-kind label `card.downPayment` «первый взнос» when `price_kind = down_payment`).
2. The bot username comes from `meta.bot_username`; the button is hidden when it is `null` (KV-FE-063).
3. The stale-window recovery (`WebAppShareMessageOpened` → `prepared_message_failed` with `STALE`, one retry) lives in
   KV-FE-030; this task only calls it.
4. DEV-040 (attribution tags on Mini App links) does not change this link: the share link stays `l_<id>` (source
   `share`, TMA-011).

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| hidden | `meta.bot_username` is `null` |
| idle | icon button, aria `listing.share` «Поделиться» |
| sharing (disabled) | taps ignored during the request and 1.5 s after |
| success | native picker (prepared message) or Telegram's share screen (fallback); no toast |
| error | silent fallback to the share link; no toast (legacy) |

## Interaction

- Tap: light haptic; the native picker opens over the app (SCR-044). No animation of its own.
- Outside Telegram (development only): `navigator.share`, else a new tab with `t.me/share/url`.

## Telegram integration

TMA-030 (`shareMessage(preparedId)`, version 8.0 gate, stale recovery in KV-FE-030), TMA-031 (`openTelegramLink` of
`t.me/share/url`; `navigator.share` outside Telegram), TMA-013, TMA-042 (version gate), TMA-025.

## Storage and analytics

- Storage: none.
- Journal (KV-FE-034): `listing_shared {listing_id}` on every accepted tap, before the share attempt (legacy).

## Files

- `frontend/app/app/(miniapp)/features/listing/share/useShareListing.ts` (new)
- `frontend/app/app/(miniapp)/features/listing/ListingTitleRow.tsx` (wire the button)
- Tests: `frontend/app/tests/listing/useShareListing.test.ts`

## API contract

API-017 `POST /api/listings/:id/share`, no body → `200 {"id": string}` (prepared message id). Errors (any status,
timeout) → fallback link. The server prepares a message per user × listing × locale (KV-BE-046); the client never
builds message text for the prepared path.

## Business rules

- Kept: BR-APP-038.
- No DEV applies. The fallback text uses server strings as sent (title and price, CF-017).

## Acceptance criteria

- On Telegram 8.0+ with a successful API-017, `shareMessage` is called with the returned id and no fallback opens.
- On Telegram 7.x, or when API-017 fails, `t.me/share/url?url=https%3A%2F%2Ft.me%2F<bot>%3Fstartapp%3Dl_<id>&text=…`
  opens via `openTelegramLink`.
- A double tap produces one `listing_shared` and one picker.
- The button is absent when `bot_username` is `null`.
- Visual: the title row matches the `listing-open` baseline (share, heart, «⋯» order).

## Tests

- Unit `useShareListing.test.ts` (Telegram adapter faked): prepared path; version < 8.0 path; API failure path;
  `shareMessage` returns `false`; cooldown with fake timers; fallback text for rent, sale with down payment, no price.
- E2E (KV-FE-170): share twice quickly → one request.

## Edge cases

- `title` contains « · » parts: only the first part is used.
- `district_name` `null`: omitted from the text.
- The user dismisses the native picker: nothing happens; the lock releases after 1.5 s.

## Security

- SEC-REQ-019: the fallback URL is built from the configured bot username and the numeric id only.
- TMA-009: no `initData` or user data in the share text or URL.

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review recorded in the PR; parity
gate G4 for F-SHARE-001 ticked (`15` §4); the feature row in `09` updated; PR reviewed by the other developer.
