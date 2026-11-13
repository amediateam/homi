# KV-TG-027 — `/fav` list

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-FAV-002 |
| Dependencies | KV-TG-022 (`CardSender`, origin `fav`); favourites list of F-FAV-001 (API-029 domain, KV-DB-010); KV-TG-010 (reply conventions); Q-BOT-038 |

## Goal

`/fav` answers with the user's favourites as a numbered list with one button per listing, or the empty-state text; a
button sends that listing's card as a new message. The list message is a snapshot and is not refreshed later, as in
legacy.

## Legacy reference

- BOT-016 (command), BOT-072 (empty), BOT-073 (list), BTN-066 (one button per item), `tb:749–766`, state machine
  `04` §3.13.
- Texts: TXT-BOT-072 `В избранном пусто. Нажмите «⭐ В избранное» под карточкой — она появится здесь.`;
  TXT-BOT-073 `⭐ Избранное (N)` + rows `<n>. 2-комн. квартира · Юнусабад · $700 · @<канал>` + `Нажмите на объявление,
  чтобы снова открыть карточку.`; button label `1. 2-комн. квартира · Юнусабад · $700`.
- Rules: BR-BOT-072 (numbered list, button → card as new message, list not refreshed), BR-BOT-001.
- Shared contract: the Mini App's `GET /api/favorites` returns the whole list with `next_cursor: null`
  (`$KVADRO_ROOT/docs/api.md:926-941`); cap unknown (Q-BOT-038).

## Implementation

1. Read `04` §3.13. Tests first (`php artisan make:test --pest Bot/FavCommandTest`).
2. `php artisan make:class Telegram/Handlers/FavCommand`: load the favourites through the favourites service (same order
   as API-029), render with `bot.fav.*` keys: header `⭐ Избранное (N)`, rows built by the display formatter (title ·
   district · price · `@channel`), footer; send as a new message.
3. Keyboard: one button per listing, label `<n>. <title> · <district> · <price>` truncated to 60 characters, callback
   `k1:ln:<number36>`; the open-by-number handler (shared with the starter list, KV-TG-037) calls
   `CardSender::send(origin: fav)`.
4. Size: Q-BOT-038 is open. Until it is answered, lists up to 20 items render in one message; longer lists are paged
   20 per message with `◀️` / `▶️` buttons (`bot.fav.prev`, `bot.fav.next`, new labels) and a paging action `fl:<page>`
   registered in the codec of KV-TG-011 — `PROPOSED` (spec, `oracle: spec` in the transcript).
5. Empty list → TXT-BOT-072, no keyboard.
6. Withdrawn listings stay in the list (the Mini App keeps them); their card opens in the withdrawn variant
   (KV-TG-054).

## Files

- `backend/app/Telegram/Handlers/FavCommand.php`, `backend/app/Telegram/Handlers/OpenListingByNumber.php` (new; shared
  with KV-TG-037)
- `backend/app/Telegram/Keyboards/FavListKeyboard.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`fav.*`)
- `backend/tests/Feature/Bot/FavCommandTest.php` (new)

## API contract

Bot API: `sendMessage` (list), `answerCallbackQuery` (silent), card sends through `CardSender`. Callbacks
`k1:ln:<n>`, `k1:fl:<page>` (paging, proposal).

## Business rules

- Kept: BR-BOT-001, BR-BOT-072.
- No DEV; paging above 20 items is a specification for an unobserved case (Q-BOT-038), not a deviation.

## Acceptance criteria

- With 0 favourites the reply equals TXT-BOT-072.
- With N ≤ 20 the reply equals TXT-BOT-073 for the fixture data and has N buttons in list order.
- A button sends exactly one card with origin `fav` and leaves the list message untouched.
- A favourite removed after the list was sent still opens its card from the old button.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `send('/fav')` with no favourites | new message TXT-BOT-072, no keyboard |
| 2 | one favourite | `⭐ Избранное (1)`, row `1. 2-комн. квартира · Юнусабад · $700 · @<канал>`, footer, one button |
| 3 | → `press('1. 2-комн. квартира · Юнусабад · $700')` | `sendPhoto` card; log row `origin=fav`; list not edited |
| 4 | remove the favourite on the card, press the list button again | card still sent (list not refreshed, BR-BOT-072) |
| 5 | 25 favourites | first message 20 rows + `▶️`; `press('▶️')` edits to rows 21–25 + `◀️` (spec) |
| 6 | locale `uz` | header and footer from the `uz` catalogue; formatter in `uz` |
| 7 | forged `k1:ln:<number of a nonexistent listing>` | catch-all alert TXT-BOT-039 |

## Edge cases

- A favourite whose listing was purged after 90 days (F-PRIVACY-003): the favourites service drops it; the list never
  shows a row that cannot open.
- Merged listings: one row for the survivor (the service de-duplicates after merge).
- Button labels with emoji count by characters, not bytes; `callback_data` holds only the number.

## Security

- SEC-REQ-014: favourites loaded through the actor's relation only.
- SEC-REQ-011: open-by-number accepts any public number (cards are not secret) but logs `origin=fav` only when it comes
  from this list; no user id in `callback_data`.
- SEC-REQ-020: titles and channel handles escaped.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for `/fav` pass, F-FAV-002 parity-gate row updated, `09` row
updated, PR reviewed by the other developer.
