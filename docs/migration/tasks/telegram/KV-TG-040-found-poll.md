# KV-TG-040 — Poll «Нашли жильё?»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-007 |
| Dependencies | KV-TG-011 (callback codec); found survey service — API-032, API-033 domain (F-DELIVERY-007, `found_answers` of KV-DB-010); the `ask_found` rule of the radar service on pause / delete (BR-API-090, F-RADAR-004, F-RADAR-005); Q-BOT-006 |

## Goal

When a radar is paused or deleted and the radar service says it is time to ask, the bot sends «Нашли жильё?» as a new
message. One answer per poll is stored with the same codes the Mini App uses; «Да, в другом месте» leads to «Где
нашли?», and every path ends with a short reply without buttons. The pause / delete handlers (KV-TG-042, KV-TG-043)
only call `FoundPoll::maybeSend()`.

## Legacy reference

- BOT-069 (poll after pause, new message; after delete expected, not observed), BOT-070 (`🏠 Где нашли?`), BOT-071
  (other answers not checked), `tb:727–747`; state machine `04` §3.12.
- Buttons: BTN-061 `🎉 Да, через kvadro²`, BTN-062 `🏠 Да, в другом месте`, BTN-063 `🔎 Ещё ищу`, BTN-064 `🙅 Больше не
  ищу` (two per row); BTN-065 where-options `📢 Telegram-канал` · `🛒 OLX` / `🌐 Uybor, Uysot…` · `🤝 Риелтор` /
  `👥 Знакомые` · `🪧 На доме, на улице` / `Другое`.
- Texts: TXT-BOT-068, TXT-BOT-069, TXT-BOT-070 `🎉 Поздравляем! Спасибо, что рассказали — это помогает нам стать
  лучше.`, TXT-BOT-071 (replies to the other answers — not checked).
- Rules: BR-BOT-067 (poll after pause, not repeated shortly after an answer), BR-BOT-070 (codes `kvadro` / `elsewhere` /
  `searching` / `stopped`; where `telegram` / `olx` / `site` / `agent` / `friends` / `street` / `other`; trigger `pause` /
  `delete`), BR-BOT-071 (one answer per poll), BR-API-090 (`ask_found` on pause / delete).
- Shared contract: `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:28-75`; the bot's poll has no share step
  (`04` §10).

## Implementation

1. Read `04` §3.12 and the found survey service of the backend track. Tests first
   (`php artisan make:test --pest Bot/FoundPollTest`).
2. `php artisan make:class Telegram/Handlers/FoundPoll` with `maybeSend(User, Radar, trigger)`: ask the radar service's
   `ask_found` decision (the same rule the legacy API uses for the Mini App, including its suppression window —
   Q-BOT-006 / Q-API-030); when true, send TXT-BOT-068 as a NEW message with the four buttons, callbacks
   `k1:fp:<radar36><p|d>:<kv|el|se|st>` (radar number + trigger letter).
3. Answer (`kv`, `el`, `se`, `st`): store through the found survey service (`answer`, `trigger`, `radar`, channel
   `bot`); idempotency — the service refuses a second answer for the same (user, radar, trigger) within the suppression
   window and the handler then only re-renders the final state (BR-BOT-071).
4. `el` → edit the message into TXT-BOT-069 with the seven where-options (`k1:fp:<id>:w:<tg|ol|si|ag|fr|st|ot>`) → store
   `where` → edit into TXT-BOT-070 without buttons.
5. `kv` → TXT-BOT-070 without buttons; `se` and `st` → TXT-BOT-071 variants `bot.found.searching`,
   `bot.found.stopped` (wording specified here, `oracle: spec`, Q-BOT-006; the product owner confirms the copy). The
   bot does not pause other radars on `st` (no legacy evidence).
6. All presses answer silently (`04` §4.3 "poll answers").

## Files

- `backend/app/Telegram/Handlers/FoundPoll.php` (new)
- `backend/app/Telegram/Keyboards/FoundPollKeyboard.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`found.*`)
- `backend/tests/Feature/Bot/FoundPollTest.php` (new)

## API contract

Bot API: `sendMessage`, `editMessageText` (+ `reply_markup` or none), `answerCallbackQuery` (silent). Callbacks
`k1:fp:<id>:<answer>`, `k1:fp:<id>:w:<where>`. Stored codes exactly as BR-BOT-070 (shared with API-032 / API-033).

## Business rules

- Kept: BR-BOT-067, BR-BOT-070, BR-BOT-071, BR-API-090.
- The replies to `kvadro`, `searching`, `stopped` are specifications for an unobserved case (Q-BOT-006), not a DEV.

## Acceptance criteria

- After a pause with `ask_found = true` exactly one poll message arrives; with `false` none.
- The stored rows use the BR-BOT-070 codes and trigger `pause` / `delete`; a second answer to the same poll stores
  nothing.
- «Да, в другом месте» → «Где нашли?» with seven options in the legacy layout → TXT-BOT-070 without buttons.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | radar card → `press('⏸ Пауза')` with `ask_found` true | toast and card edit (KV-TG-042), then a new message TXT-BOT-068 with four buttons |
| 2 | → `press('🏠 Да, в другом месте')` | same message → TXT-BOT-069 with seven options |
| 3 | → `press('🛒 OLX')` | answer `elsewhere` + where `olx` stored; message → TXT-BOT-070 without buttons |
| 4 | poll → `press('🎉 Да, через kvadro²')` | answer `kvadro`; TXT-BOT-070 |
| 5 | poll → `press('🔎 Ещё ищу')` | answer `searching`; `bot.found.searching` (spec) |
| 6 | press an answer twice on two copies | one stored answer |
| 7 | delete a radar with `ask_found` true | poll with trigger `delete` |
| 8 | pause again within the suppression window | no poll |
| 9 | forged `k1:fp:<radar of another user>p:kv` | catch-all alert, nothing stored |

## Edge cases

- The radar was deleted before the user answered a pause poll: the answer is stored with the radar reference null
  (service rule); the reply is the same.
- A poll message older than 48 hours cannot be edited: the answer is stored, and the reply is sent as a new message.

## Security

- SEC-REQ-014: the radar in the poll id is resolved through the actor's relation; foreign ids → catch-all.
- SEC-REQ-015: one answer per (user, radar, trigger) enforced by the service.
- Answers are analytics data without personal content.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 poll transcripts pass, F-DELIVERY-007 parity-gate row updated (bot part),
`09` row updated, PR reviewed by the other developer.
