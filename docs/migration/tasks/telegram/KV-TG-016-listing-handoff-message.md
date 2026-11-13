# KV-TG-016 — Listing hand-off message for `s_<source>--l<id>` and `l_<id>`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-ONBOARD-005 |
| Dependencies | KV-TG-015 (parser); public listing number resolver with alias redirect (F-LISTING-001, CF-003); listing title from the server formatter (F-LOCALE-003); DEV-037 (`PROPOSED`) |

## Goal

A user who arrives from a listing link gets, after the welcome, a third message naming that listing with a button that
opens it in the Mini App — for `s_<source>--l<id>` as in legacy and, once DEV-037 is approved, also for the Mini App's own
`l_<id>` format that legacy ignored.

## Legacy reference

- BOT-031 (observed with `s_web--l51358`: sticker + welcome + TXT-BOT-008 with BTN-004), BR-BOT-095, state machine
  `04` §3.1 (`WelcomeListing`), `tb:1011–1017`.
- TXT-BOT-008: `Квартира, по которой вы пришли: <2-комн. квартира · Юнусабад · $600>. Откройте её кнопкой ниже 👇`;
  BTN-004 `🏠 Открыть квартиру` (web_app, primary, URL inferred — Q-BOT-011).
- `l_<id>` ignored by legacy: BOT-033, BR-BOT-097, LB-BOT-028 → DEV-037.
- Gated users are sent here by the Mini App's no-access screen (BR-API-015; `$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:26-27`, `:66`).
- The legacy Mini App accepts `?listing=<id>` in its URL (`$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:17-19`);
  URL-048.

## Implementation

1. Tests first (`php artisan make:test --pest Bot/ListingHandoffTest`).
2. `php artisan make:class Telegram/Handlers/ListingHandoff`: called by `StartCommand` after the welcome when the payload
   kind is `Source` with a listing number, or `ListingLegacy` while the approval flag `bot.dev037` (DEV-037) is on.
3. Resolve the number through the listing number resolver (a merged id answers with the survivor, CF-003). Send nothing
   more when the listing is unknown, withdrawn, taken down, or blocked for the user (hidden lists do not apply — the
   user asked for it explicitly).
4. Text `bot.handoff.body` (TXT-BOT-008) with the title from the server formatter (`<N>-комн. квартира · <район> ·
   <цена>` in the user's locale and currency, F-LOCALE-003); button `webApp(bot.buttons.open_flat,
   TELEGRAM_MINIAPP_URL + '?listing=<number>')->primary()` (BR-BOT-004).
5. Approval flag `dev037` in `backend/config/bot.php` (the shared convention for DEV switches, `11b` §2.3), `false`
   until DEV-037 is `APPROVED`; flipping it is a one-line PR.
6. The hand-off message is not a listing card and is not written to the delivered-card log.

## Files

- `backend/app/Telegram/Handlers/ListingHandoff.php` (new), `backend/app/Telegram/Handlers/StartCommand.php` (call)
- `backend/config/bot.php` (`dev037`), `backend/lang/{ru,uz,en}/bot.php` (`handoff.*`)
- `backend/tests/Feature/Bot/ListingHandoffTest.php` (new)

## API contract

Bot API `sendMessage` with one inline `web_app` button `{"text": "🏠 Открыть квартиру", "web_app": {"url":
"<TELEGRAM_MINIAPP_URL>?listing=<number>"}, "style": "primary"}`.

## Business rules

- Kept: BR-BOT-095 (third message with the listing and a web_app button), BR-API-015.
- DEV-037 (`PROPOSED`): `l_<id>` treated like `s_<source>--l<id>`; until approval BR-BOT-097 holds (welcome only).

## Acceptance criteria

- `s_web--l<n>` for an active listing: exactly three outgoing calls (sticker, welcome, hand-off) in that order.
- The button opens the Mini App URL of the current environment with `?listing=<n>` (survivor number after a merge).
- Withdrawn, unknown and taken-down listings: welcome only, no error.
- `l_<n>` behaves like legacy while the feature is off and like `s_<source>--l<n>` when on.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `conversation(user: 'A')->send('/start s_web--l51358')`, listing 51358 active, 2 rooms, Юнусабад, $600 | sticker, TXT-BOT-006, then TXT-BOT-008 `… 2-комн. квартира · Юнусабад · $600 …` with `🏠 Открыть квартиру` (primary, `?listing=51358`) |
| 2 | listing 51358 merged into 60001 | button URL `?listing=60001`, title of 60001 |
| 3 | listing withdrawn | only sticker + welcome |
| 4 | `send('/start l_51358')`, feature off | only sticker + welcome (BR-BOT-097) |
| 5 | same, feature on (DEV-037 approved) | three messages as in 1 |
| 6 | locale `en`, currency UZS | title in English with the UZS price from the formatter |
| 7 | user blocked by the operator | nothing sent (router guard) |

## Edge cases

- The listing number exceeds the legacy maximum (new HOMI listing): resolved normally.
- `TELEGRAM_MINIAPP_URL` already has a query string: the builder appends with `&`.
- The Mini App URL at the cut-over stays `https://app.kvadro.app/` (CF-008); only the environment config changes it.

## Security

- SEC-REQ-019 (web_app URL only from config), SEC-REQ-020 (title escaped), SEC-REQ-014 (no per-user data revealed; the
  listing is public within the app).

## Definition of done

Tests green (`make ci-backend`), DEV-037 state recorded in the F-ONBOARD-005 parity-gate row, transcript added to KV-QA-009,
PR reviewed by the other developer.
