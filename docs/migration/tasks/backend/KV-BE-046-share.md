# KV-BE-046 — Share: API-017 prepared inline messages

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (needs the Bot API client of HANDOFF T1) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-SHARE-001 |
| Dependencies | KV-BE-036; HANDOFF T1 Bot API client (`TelegramClient`); KV-BE-020/KV-BE-021 (card text); KV-QA-003 (fake Bot API) |

## Goal

`POST /api/listings/:id/share` prepares a Telegram message for the requesting user with Bot API
`savePreparedInlineMessage` and returns its id for `WebApp.shareMessage`; the id is reused per (user, listing, locale)
until it expires, and any Bot API failure yields a non-2xx so the legacy client falls back to its `t.me` link.

## Legacy reference

- API-017 (`08-api-inventory.md:743-767`); client `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:97-100`,
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:28-49` (fallback
  `https://t.me/<bot_username>?startapp=l_<id>` with «title · price · kind · district»), `:35`;
  `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:12-15` (only with `shareMessage`, Telegram ≥ 8.0);
  `$KVADRO_ROOT/docs/api.md:707-717`; `$KVADRO_ROOT/docs/about.md:243-246`; mock
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:129`.
- Rules: `02-legacy-backend-audit.md:620-639` (§14: BR-API-117, BR-API-118 🔶, BR-API-119, Q-API-044).
- Fix by policy (`09` §4.3): LB-API-046 (cache per (user, listing, locale); rate limit).
- Bot API features: `04-telegram-bot-audit.md` §1 (prepared inline messages, Bot API 9.x); `10` §4.14 (in-house thin
  client, no library).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md`, `.claude/skills/laravel-best-practices/`, the T1 client code and
   `04` §1. Wait for HANDOFF T1's `TelegramClient` (do not build a second client).
2. `php artisan make:class Services/Telegram/ShareService`: `prepare(User, Listing, LocaleCode): PreparedShare` —
   a. cache key `share:{user_id}:{listing_number}:{locale}` in Redis; a hit returns the stored id;
   b. miss → `TelegramClient::call('savePreparedInlineMessage', [...])` with `user_id` = the user's Telegram id,
      `result` = an `InlineQueryResultArticle` (or photo) whose text comes from the display formatter (KV-BE-020,
      KV-BE-021: title · price · kind · district; HTML escaped by the bot escaping helper, SEC-REQ-020) and an inline
      button opening the Mini App with `startapp=l_<number>` (`web_app` or `url` button — record the choice; the
      share must open the listing, BR-API-119), `allow_user_chats`/`allow_group_chats`/`allow_channel_chats` true;
   c. store the returned `id` until the returned `expiration_date` minus a margin.
3. `php artisan make:controller Legacy/ShareController --no-interaction`; route `POST listings/{number}/share`
   (`auth:tma`, `legacy.access`, `throttle:legacy-share`).
4. Map client errors: Bot API error, timeout or circuit open → `502 {"detail":"share_failed"}` (no retry inside the
   request; the client falls back).
5. No database table: the prepared id lives only in Redis (ENT-039, `06` §4.2).
6. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Services/Telegram/ShareService.php`, `backend/app/Domain/Telegram/PreparedShare.php` (new)
- `backend/app/Http/Controllers/Legacy/ShareController.php` (new)
- `backend/routes/legacy.php` (changed)
- `backend/tests/Feature/LegacyApi/Api017ShareTest.php` (new)

## API contract

- `POST /api/listings/:id/share` — no body → `200 {"id": "<prepared inline message id>"}` (string).
- Errors: unknown number → `404 {"detail":"Not Found"}`; Bot API failure → `502 {"detail":"share_failed"}`;
  `401 {"detail":"unauthorized"}`; `403 {"detail":"<reason>"}`; over 20/h → `429 {"detail":"rate_limited"}`. On any
  non-2xx the client shares the `t.me/<bot>?startapp=l_<id>` fallback (`ListingTitleRow.jsx:28-49`).
- The client tracks `listing_shared` before the attempt (`/api/events`, M7) — not this route's concern.

## Business rules

- Keep: BR-API-117 (prepared server-side for `WebApp.shareMessage`; client fallback on failure), BR-API-118 (spec:
  `savePreparedInlineMessage` for the requesting user — 🔶, Q-API-044), BR-API-119 (`startapp=l_<number>` deep link).
- Defect fix `APPROVED`: LB-API-046 — reuse per (user, listing, locale) until expiry; rate limited.
- No DEV applies. Message content beyond title, price, kind, district and the button is spec-tested until Q-API-044
  is answered by a recording on the test account (`15` §1.6).

## Acceptance criteria

- First call → one Bot API call and `{"id": …}`; second call within the cache window → same id, no Bot API call.
- The prepared message carries the deep link with the listing `number` and plain, escaped text.
- Bot API `400`, `429`, `5xx` or timeout → `502` with a string `detail`; never `500`.

## Tests

- `Api017ShareTest` with the fake Bot API of KV-QA-003 and `Http::preventStrayRequests()`: success → `200 {"id"}`
  and the outbound request has `user_id` = the caller's Telegram id; cache hit → no second outbound call
  (`15` §3.4 #9); locale switch → new prepared message; Bot API `429 retry_after` and `500` → `502
  {"detail":"share_failed"}`; unknown number → `404`; `blocked` → `403`; no auth → `401`; 21st call in an hour →
  `429`; contract via KV-QA-004.
- Escaping (SEC-REQ-020): a listing title containing `<b>` and `&` → the fake (which validates entities) accepts the
  payload and shows the text literally.
- IDOR (`15` §3.1, "Prepared share"): a prepared id is created for the requester only; B never receives A's cached id
  (cache key includes the user).

## Edge cases

- Listing withdrawn or purged: share still allowed with the remaining public fields (spec); taken down → `404`.
- Bot token rotated at S2 (SEC-REQ-012): cached ids from the old token are discarded on deploy (flush the `share:`
  prefix in the cut-over runbook).
- User blocked the bot (`403` from Bot API) → `502`; no retry storm.

## Security

- SEC-REQ-014 (prepared for the requester only), SEC-REQ-027 (`legacy-share` 20/h), SEC-REQ-020 (HTML escaping),
  SEC-REQ-019 (button URL only `https://t.me/...` or the Mini App origin), SEC-REQ-013 (bot token never in logs,
  `bot***` in client errors). No phone in the shared text (DEV-007 spirit: shares carry no contact).

## Definition of done

Tests green (`make ci-backend`), parity gate items for F-SHARE-001 ticked (`15` §4; G9 needs a staging check with the
staging bot **[PT]**), API-017 contract case real in KV-QA-004, the F-SHARE-001 row in `09` updated, PR reviewed by the
other developer.
