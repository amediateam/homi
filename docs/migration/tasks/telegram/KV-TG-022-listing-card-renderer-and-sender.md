# KV-TG-022 — Listing card renderer and `CardSender` with the delivered-card log

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | L |
| Feature IDs | F-BOT-011, F-OWNER-002, F-SETTINGS-007 |
| Dependencies | KV-TG-010 (reply conventions, keyboards), KV-TG-011 (callback codec); listing details and display strings — F-LISTING-001 (API-008 domain service), formatter F-LOCALE-003 (CF-017); market comparison F-LISTING-004; signed listing photos F-MEDIA-001 (RES-001); public listing numbers CF-003; KV-DB-009 (`14` §8, `bot_listing_messages`); Q-BOT-002 |

## Goal

One renderer builds the bot's listing card — photo with caption or plain text, the rows of TXT-BOT-044, the four
button rows — from the listing's current server state, and one `CardSender` sends it and records every sent copy in
the delivered-card log with `chat_id` + `message_id`. Every other card path (number buttons, `/fav`, deep links,
radar pushes, digests, takedown edits) uses these two classes.

## Legacy reference

- Since Mini App release `index-BnFvC-Ft.js` the user picks the card style `classic` or `rich`, and the Mini App
  asks for a sample card (`04` §3.10, BOT-085; built in WP-53 and WP-57, DEC-57).
- Card: BOT-059, TXT-BOT-044 (`tb:619–644`), state machine `04` §3.10, element table `04` §3.10 "Rows" and "Keyboard".
- Buttons: BTN-035 (`📱 Открыть в приложении`, web_app, primary), BTN-036 (`📍 На карте`, only with coordinates),
  BTN-037 (`🔗 Открыть оригинал`, url), BTN-038 (`📷 Ещё N фото`, only if the post has photos), BTN-039/BTN-040
  (favourite), BTN-041 (`Это риелтор`), BTN-042 (`Уже сдано`), BTN-044 (`Скрыть похожие`); layout `tb:648–653`.
- Rules: BR-BOT-056 (photo vs text, HTML), BR-BOT-057 (conditional buttons), BR-BOT-058 (`🔗` line, `ещё N`, time and
  age), BR-BOT-059 (`📊` market line), BR-BOT-001 (cards are new messages), BR-API-141 (Bot API features).
- Defects fixed here: LB-BOT-004 (`👨‍👩‍👧 депозит` for «без депозита» — deposit as a tri-state with its own icon);
  LB-BOT-006 (photo button only when photos can be delivered) is finished in KV-TG-023.
- Delivered-card log: ENT-010 (`06`), BR-DATA-016, `04` §5 "Migration constraint", Q-DATA-013.
- Mini App deep link for `web_app`: `?listing=<number>` is read by the legacy client
  (`$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:17-19`).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md`, `04` §3.10, `16` SEC-REQ-019/020 and the formatter of F-LOCALE-003.
   Tests first (`php artisan make:test --pest Bot/Card/ListingCardRendererTest`).
2. `php artisan make:class Telegram/Rendering/ListingCardRenderer`: input = a `ListingCardData` DTO built from the
   listing details service (title, deal, price, market comparison, district, place, metro, distances, area, floor,
   renovation, furniture, deposit tri-state, summary, channel handle + post id, duplicate count, published time,
   photo count, coordinates, owner/realtor marks) plus the viewer's state (favourite, rented-by-me) and locale;
   output = `CardMessage {photo?, html, keyboard}`.
3. Rows in the order of `tb:619–634`: `🏠` title · deal (bold title), `💰` price (bold), `📊` market line (BR-BOT-059,
   omitted when no comparison), blank, `📍` district · place (distance here when there is no metro), `🚇` station ·
   distance to centre, blank, `🏢` area · floor, `🛠` renovation (· furniture), deposit line from
   `bot.card.deposit.required|not_required` (own icon; nothing when unknown — LB-BOT-004), `📝` summary, blank,
   `🔗` `<a href>` channel → post · `ещё N` · `🕐` time, age (italic), original post in
   `<blockquote expandable>`. All values via `Html::escape` (KV-TG-007); dates in Asia/Tashkent.
4. Photo variant when the listing has at least one deliverable photo: `sendPhoto` with the first photo and the card
   as caption; the caption is truncated on the escaped text to 1 024 characters by shortening the blockquote first,
   never splitting a tag or entity. Text variant otherwise (`sendMessage`, 4 096 limit, `link_preview_options`
   disabled).
5. Photo source: in staging and production the signed legacy media URL of F-MEDIA-001 (Telegram fetches it); locally
   (Telegram cannot reach `.loc`) a multipart upload, switched by `telegram.media.upload` config. The returned
   `file_id` is cached per `bot_id` + photo key (it belongs to one bot, `04` §1 note 2).
6. Keyboard (`App\Telegram\Keyboards\ListingCardKeyboard`): `[📱 Открыть в приложении][📍 На карте?]` /
   `[🔗 Открыть оригинал][📷 Ещё N фото?]` / `[⭐ В избранное | ★ В избранном][Это риелтор]` /
   `[Уже сдано][Скрыть похожие]`. `web_app` URL = `TELEGRAM_MINIAPP_URL` + `?listing=<number>`, style `primary`
   (BR-BOT-004); original link `https://t.me/<channel>/<post>` (allow-listed host, SEC-REQ-019); callbacks
   `k1:cd:<number36>:<op>` (ops of the plan; actions themselves in KV-TG-023…026). Variants: default, rented-by-me
   (KV-TG-024), hide submenu (KV-TG-026), withdrawn (text owned by KV-TG-054). «Это риелтор» is hidden where the
   listing is already marked as an owner's or a realtor's (DEV-010, F-OWNER-002 marks) once DEV-010 is approved.
7. `php artisan make:class Services/Delivery/CardSender`: `send(User, Listing, CardOrigin, ?Radar, ?replyTo)` renders,
   sends through the KV-TG-004 client and inserts into `bot_listing_messages` (`chat_id`, `message_id`, `user_id`,
   `listing_id`, `radar_id`, `origin` ∈ `instant`, `digest`, `starter`, `fav`, `number`, `deeplink`, `sent_at`,
   `state`); a `403` is reported to KV-TG-021 and logged as `failed`. `rerender(chat, message, Listing, User)` edits
   a pressed copy from the server state (BR-BOT-010) and treats "message is not modified" as success.
8. `CardOrigin` enum (`php artisan make:enum Enums/Delivery/CardOrigin`).
9. Texts `bot.card.*` (TXT-BOT-044 rows, button labels BTN-035…BTN-044) in the catalogue of KV-TG-008/009; the
   deposit keys are new texts of the LB-BOT-004 defect fix (`09` §4.3).

## Files

- `backend/app/Telegram/Rendering/{ListingCardRenderer,ListingCardData,CardMessage}.php` (new)
- `backend/app/Telegram/Keyboards/ListingCardKeyboard.php` (new)
- `backend/app/Services/Delivery/CardSender.php`, `backend/app/Enums/Delivery/CardOrigin.php` (new)
- `backend/config/telegram.php` (`media.upload`), `backend/lang/{ru,uz,en}/bot.php` (`card.*`)
- `backend/tests/Unit/Telegram/ListingCardRendererTest.php`, `backend/tests/Feature/Bot/Card/CardSenderTest.php` (new)

## API contract

Bot API: `sendPhoto` (`photo`, `caption`, `parse_mode=HTML`, `reply_markup`) or `sendMessage`; `editMessageCaption` /
`editMessageText` / `editMessageReplyMarkup` for re-renders. No HTTP endpoint. Callback grammar `k1:cd:<n>:<op>`
(KV-TG-011).

## Business rules

- Kept: BR-BOT-001, BR-BOT-004, BR-BOT-010, BR-BOT-056, BR-BOT-057, BR-BOT-058, BR-BOT-059, BR-DATA-016 (every sent
  copy addressable by `chat_id` + `message_id`).
- Defect fix without a DEV: LB-BOT-004 (deposit tri-state) — `APPROVED` by policy (`09` §4.3).
- `PROPOSED`: DEV-010 (hide «Это риелтор» where already marked) — the keyboard flag is wired, tests `todo` until approved.
- Q-BOT-002: whether a radar push shows the radar name is unknown; the renderer accepts an optional heading line that
  KV-TG-051 decides.

## Acceptance criteria

- The fixture listing of `tb:619–634` renders text equal to TXT-BOT-044 (Russian), except the deposit line.
- Map button only with coordinates, photo button only with deliverable photos, web_app button primary with
  `?listing=<number>`.
- Every send writes exactly one `bot_listing_messages` row with the right origin; a failed send writes `failed` and
  never a `sent` row without a `message_id`.
- Captions never exceed 1 024 and texts 4 096 characters after escaping; `FakeBotApi` validators pass.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | listing with photos, coordinates, metro, market comparison | `sendPhoto`, caption rows in order, 4 keyboard rows with map and photo buttons |
| 2 | listing without photos and coordinates | `sendMessage`; no `📍 На карте`, no `📷` |
| 3 | post text «без депозита» parsed as `not_required` | deposit line `bot.card.deposit.not_required`, no `👨‍👩‍👧` (LB-BOT-004) |
| 4 | title `<b>x</b> & </blockquote>` and a 5 000-character post | rendered literally, caption truncated inside the blockquote, valid HTML |
| 5 | `CardSender::send(origin: number)` | one `sendPhoto`, one log row `origin=number`, `message_id` from the fake answer |
| 6 | fake answers `403` | log row `failed`, `ChatUnreachable` raised for KV-TG-021, no exception to the router |
| 7 | `rerender` after the favourite flips on another copy | only the pressed `message_id` edited, button label from server state |
| 8 | locale `en` | labels and rows from the `en` catalogue, numbers in `en` format (BR-BOT-008) |
| 9 | listing with 3 duplicates in other channels | `ещё 3` in the `🔗` line |
| 10 | channel handle with `_` and a post id | `url` button `https://t.me/<handle>/<post>`, allow-list check passes |

## Edge cases

- Merged listing: the number in callbacks resolves through the alias table to the survivor (CF-003); the card shows
  the survivor.
- Withdrawn listing opened from an old list: rendered in the withdrawn variant (KV-TG-054), no vote buttons.
- Photo URL rejected by Telegram (`400 wrong file identifier` / fetch failed): fall back to the text variant once and
  log; no retry loop.
- Very long district or ЖК names: rows stay single-line; Telegram wraps.
- Listing without a market comparison or without a summary: the row is omitted, not printed empty.

## Security

- SEC-REQ-020 / SEC-024: one escaping helper for every interpolated value; `<a href>` only to allow-listed `https`
  hosts (SEC-REQ-019).
- No phone number is ever rendered in the card (the original post text comes from the stored text, whose phones are
  shown only as the post shows them; the bot adds none) — follow DEV-007 for any later masking decision.
- SEC-REQ-011: callbacks carry only the public listing number; actions resolve the listing and the viewer server-side.
- The log rows hold ids only, no texts (BR-BOT-085).

## Definition of done

Tests green (`make ci-backend`), transcripts of KV-QA-009 for the card pass, the F-BOT-011 parity-gate row updated
(G3/G7/G8 with evidence), `09` row F-BOT-011 updated, PR reviewed by the other developer and the `security-reviewer`
agent (HTML escaping).
