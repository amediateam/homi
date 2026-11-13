# KV-TG-023 — Card buttons «На карте» and «Ещё N фото»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-011 |
| Dependencies | KV-TG-022 (card renderer, `CardSender`); listing location (F-LISTING-003 data, F-LISTING-001 domain service); signed listing photos F-MEDIA-001 (RES-001) |

## Goal

`📍 На карте` answers the card with a venue message, and `📷 Ещё N фото` answers it with an album of the listing's
photos. When photos can no longer be delivered, the user gets the legacy toast once and the button disappears from
that card instead of failing again on every press (LB-BOT-006).

## Legacy reference

- BTN-036 (`📍 На карте`, callback, only with coordinates): venue as a reply to the card, title
  `3-комн. квартира · Чиланзар · $600`, address `Чиланзар · Чиланзар-19` — TXT-BOT-045, `tb:658`.
- BTN-038 (`📷 Ещё N фото`, callback, only if the post has photos): album (media group) of N photos without captions,
  as a reply; the button stays; on failure toast TXT-BOT-050 `Фото больше недоступны` — `tb:660`, `tb:949`.
- Rules: BR-BOT-057 (conditional buttons), BR-BOT-001 (venue and album are the documented new messages), BR-BOT-002
  (silent on success, toast only for TXT-BOT-050).
- Defect: LB-BOT-006 (text-only cards answered «Фото больше недоступны»), fix `APPROVED` by policy (`09` §4.3).
- State machine `04` §3.10 transitions `BTN-036 venue reply`, `BTN-038 album reply or toast`.

## Implementation

1. Read `04` §3.10 and KV-TG-022. Tests first (`php artisan make:test --pest Bot/Card/CardMapPhotosTest`).
2. `php artisan make:class Telegram/Handlers/Card/ShowOnMap`: callback `k1:cd:<n>:map` → resolve the listing by number
   (alias-aware) → `sendVenue(chat, lat, lng, title, address, reply_parameters: card message)`; title and address
   from the formatter (`bot.card.venue.title`, `bot.card.venue.address`, TXT-BOT-045 shape); answer silently.
   Listing without coordinates (stale card after a data change) → answer silently and re-render the card without
   the button.
3. `php artisan make:class Telegram/Handlers/Card/ShowPhotos`: callback `k1:cd:<n>:ph` → load deliverable photos
   (signed URLs or cached `file_id`s, same source rule as KV-TG-022 step 5) → `sendMediaGroup` in chunks of at most 10
   items without captions, replying to the card; answer silently.
4. No deliverable photo (erased after withdrawal, purge, takedown) → `answerCallbackQuery` with TXT-BOT-050 and
   `editMessageReplyMarkup` of the pressed card without the `📷` button (LB-BOT-006).
5. Double taps: a per (chat, listing) lock of 30 s (Redis `SET NX EX`) so one press sends one album; a second press
   inside the window answers silently.
6. Partial failure of a media group (one photo rejected by Telegram) → retry once without the rejected item; if
   nothing is left, behave as step 4.
7. Texts `bot.card.venue.*` and `bot.card.photos_unavailable` in the catalogue (KV-TG-008/009).

## Files

- `backend/app/Telegram/Handlers/Card/{ShowOnMap,ShowPhotos}.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`card.venue.*`, `card.photos_unavailable`)
- `backend/tests/Feature/Bot/Card/CardMapPhotosTest.php` (new)

## API contract

Bot API: `sendVenue` (`latitude`, `longitude`, `title`, `address`, `reply_parameters`), `sendMediaGroup` (`media`
array of `InputMediaPhoto`, ≤ 10 per call), `editMessageReplyMarkup`, `answerCallbackQuery`. Callbacks
`k1:cd:<n>:map`, `k1:cd:<n>:ph`.

## Business rules

- Kept: BR-BOT-001, BR-BOT-002, BR-BOT-057.
- Defect fix: LB-BOT-006 (button removed when photos are gone) — no DEV, `APPROVED` (policy).
- No DEV applies.

## Acceptance criteria

- `📍 На карте` produces exactly one venue reply with TXT-BOT-045 title and address and no toast.
- `📷 Ещё 12 фото` produces two media groups (10 + 2) without captions, replying to the card; the card keeps the button.
- A card whose photos are gone shows the toast once and loses the button; the next render of the same listing has no
  `📷` button.
- Two presses within 30 s send one album.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | card with coordinates → `press('📍 На карте')` | `sendVenue` replying to the card; title `3-комн. квартира · Чиланзар · $600`; `answerCallbackQuery` without text |
| 2 | card with 4 photos → `press('📷 Ещё 4 фото')` | one `sendMediaGroup` with 4 photos, no captions; card unchanged |
| 3 | 12 photos | two `sendMediaGroup` calls (10, 2) in order |
| 4 | photos purged → `press('📷 Ещё 3 фото')` | toast `Фото больше недоступны`; `editMessageReplyMarkup` without the photo button |
| 5 | double tap within 1 s | one album |
| 6 | fake answers `400` for one photo of a group of 3 | retry with 2 photos, sent once |
| 7 | callback with a number of another listing that has no coordinates | silent answer, card re-rendered without the map button |
| 8 | merged listing number | venue of the survivor |

## Edge cases

- Coordinates present but outside Uzbekistan (bad geocode) → still sent; geo quality belongs to F-PIPELINE-004.
- A card older than 48 hours cannot be edited by the bot in some chats; removal of the button then fails silently
  (logged) while the toast still appears.
- Photo order follows the listing's photo numbers (`n`), the same as the Mini App gallery.

## Security

- SEC-REQ-011: the number in `callback_data` is only a reference; the listing is resolved server-side; foreign or
  undecodable data → catch-all of KV-TG-011.
- Photos are fetched by Telegram only through signed, expiring URLs (SEC-REQ-024); local uploads read private storage
  through the Media module, never a public immutable path (SEC-029).
- The venue carries no phone or author data.

## Definition of done

Tests green (`make ci-backend`), transcript cases added to KV-QA-009, F-BOT-011 parity-gate evidence updated, `09` row
updated, PR reviewed by the other developer.
