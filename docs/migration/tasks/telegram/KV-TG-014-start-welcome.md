# KV-TG-014 — `/start` welcome: sticker, live counters, buttons

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-ONBOARD-004 |
| Dependencies | KV-TG-008, KV-TG-010, KV-TG-013; KV-TG-021 (chat marked reachable); live listing counts from listing search (F-FEED-001, API-005 count service); city names from the geo dictionaries (KV-DB-006); Q-BOT-036 |

## Goal

`/start` (and the client's Start button) answers like legacy: the welcome sticker, then the welcome text with two live
counters and three button rows — open the Mini App, turn on a radar, switch to one of the two other languages. A
repeated `/start` sends both again and resets nothing.

## Legacy reference

- BOT-012, state machine `04` §3.1; text TXT-BOT-006 (`tb:195–210`, bold: the active count and «Чем удобнее каналов»,
  `tb:212`), EN TXT-BOT-007 (`tb:1070–1085`); buttons BTN-001 (`📱 Открыть kvadro²`, web_app, primary), BTN-002
  (`📡 Включить радар`, callback → new wizard message), BTN-003 (the two other languages).
- Rules: BR-BOT-011 (sticker + welcome, repeat resets nothing), BR-BOT-012 (live counters, e.g. 18 657 / 1 050),
  BR-BOT-013 (language row shows the two other languages), BR-BOT-004 (BTN-001 primary).
- Copy fix LB-BOT-013 (EN welcome must use English exonyms; `09` §4.3, `APPROVED` by policy).
- Counter definitions «актуальных» / «за сутки новых» unknown: Q-BOT-036. Access gate `join` opens after Start
  (BR-API-012, BR-API-013).
- URL-045 (`t.me/KvadroAppBot` without payload) lands here.

## Implementation

1. Read `04` §3.1 and `tb` §6.1. Tests first (`php artisan make:test --pest Bot/StartCommandTest`).
2. `php artisan make:class Telegram/Handlers/StartCommand` (command `start`). Payloads are parsed by KV-TG-015 first;
   this handler renders the welcome for every payload kind.
3. Before replying, mark the chat reachable (KV-TG-021) so the access gate's `join` reason clears while the user is still
   looking at the Mini App's «Нет доступа» screen (BR-API-013: re-check every 2.5 s).
4. Replies: `SendSticker('welcome')` (skipped if the asset is missing, KV-TG-013), then `SendMessage` with
   `bot.welcome.body` — counters `:active` and `:new` formatted by the shared formatter (`18 657` / `18,662`), bold
   applied by the renderer to the active count and the heading (`Html::bold`), cities from the dictionary in the
   user's locale (English exonyms in `en`, LB-BOT-013).
5. Keyboard: row 1 `webApp(bot.buttons.open_app, TELEGRAM_MINIAPP_URL)->primary()`; row 2
   `callback(bot.buttons.radar_on, 'k1:nw')` (the new-wizard handler of KV-TG-028 sends a **new** message and leaves
   the welcome untouched); row 3 the two languages other than the current one, `k1:lg:<code>` (KV-TG-017).
6. Counters: `WelcomeCounters` service calls the listing count of F-FEED-001 for "active" and "published in the last
   24 h" (definitions `PROPOSED` until Q-BOT-036; compared with the landing live data at the same minute), cached for
   60 s.
7. No state is reset: radars, favourites, settings and an open wizard stay as they are.

## Files

- `backend/app/Telegram/Handlers/StartCommand.php`, `backend/app/Telegram/Rendering/WelcomeRenderer.php`,
  `backend/app/Services/Telegram/WelcomeCounters.php` (new)
- `backend/tests/Feature/Bot/StartCommandTest.php`, `backend/tests/Fixtures/Bot/transcripts/start.json` (new)

## API contract

Bot API: `sendSticker`, `sendMessage` (`parse_mode: HTML`, inline keyboard). Inbound: `message.text = "/start"` or
`"/start <payload>"`.

## Business rules

- Kept: BR-BOT-004, BR-BOT-011, BR-BOT-012, BR-BOT-013; BR-BOT-008 (number formats).
- Copy fix: LB-BOT-013 (EN city names). No DEV.

## Acceptance criteria

- `/start` produces exactly two calls in order: `sendSticker`, `sendMessage`; the text equals TXT-BOT-006 with live
  numbers; bold spans as in `tb:212`.
- Keyboard rows, labels, types and the `primary` style match `tb` §6.1.
- The language row shows the two languages other than the user's (`ru` → `🇺🇿 Oʻzbekcha` · `🇬🇧 English`).
- A repeated `/start` after creating a radar leaves the radar and the favourites unchanged.
- A user whose access reason was `join` gets `Granted` (or the next reason) within one gate check after `/start`.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `conversation(user: 'A', locale: 'ru')->send('/start')` | `expectSticker('welcome')`, `expectNew('TXT-BOT-006')` with `18 657` and `1 050` from the seeded counts |
| 2 | same, keyboard | `📱 Открыть kvadro²` (web_app, primary) / `📡 Включить радар` / `🇺🇿 Oʻzbekcha` · `🇬🇧 English` |
| 3 | locale `en` | TXT-BOT-007 with `Tashkent, Tashkent Region, Andijan, Namangan, Kokand, Fergana`; `18,657`; row 3 `🇷🇺 Русский` · `🇺🇿 Oʻzbekcha` |
| 4 | `send('/start')` twice with a radar in between | four messages; radar still active |
| 5 | `send('/start')->press('📡 Включить радар')` | new message `expectNew('TXT-BOT-012')`; welcome message not edited |
| 6 | sticker asset missing | only the text message |
| 7 | user in access state `join` | after `/start` the gate decision is no longer `join` |
| 8 | counts cached, second `/start` within 60 s | one count query |

## Edge cases

- Counts unavailable (search down): the welcome is sent with the last cached values; with none cached, the counter line
  is omitted (logged) rather than failing `/start`.
- A user who blocked and unblocked the bot: `my_chat_member` already restored reachability; `/start` behaves the same.
- `/start` inside the typed-amount wait: commands leave the wait (DEV-029 in KV-TG-032); the welcome is sent.

## Security

- No personal data in the welcome; counters are aggregates. `web_app` URL from config only (SEC-REQ-019).
- First contact creates the user without names (KV-TG-006, SEC-REQ-036).

## Definition of done

Tests green (`make ci-backend`), transcript `start.json` passing in KV-QA-009's runner, F-ONBOARD-004 parity-gate row
updated (Q-BOT-036 recorded as spec-tested until answered), PR reviewed by the other developer.
