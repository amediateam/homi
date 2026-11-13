# KV-TG-036 — Save a new radar: limit, twins, confirmation, sticker

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-008, F-RADAR-002 |
| Dependencies | KV-TG-034 (review, summary renderer), KV-TG-021 (chat reachability); radar create with limit and twin detection — F-RADAR-002 (API-019 domain, idempotent by filter hash, DEV-009); starter query — F-DELIVERY-005; KV-TG-013 (post-save sticker); Q-BOT-007 |

## Goal

`✅ Сохранить` creates the radar exactly once through the shared radar service, answers `Сохранил ✅`, turns the review
into «✅ Радар включён» with the summary and the number of current matches, and sends the post-save sticker. The
starter list and the first-radar tip that follow are KV-TG-037. The radar limit and duplicate radars get clear
answers.

## Legacy reference

- BOT-051, BTN-028 `✅ Сохранить` (primary), toast TXT-BOT-075 `Сохранил ✅`; message → TXT-BOT-034 `✅ Радар включён` +
  summary + `Подходит уже сейчас: N — список ниже. Дальше радар будет присылать новые карточками, как только появятся.`
  with BTN-029 `📡 Радар` · BTN-030 `➕ Новый радар`; then sticker, starter list, tip (`tb:517–566`, `04` §3.8).
- Rules: BR-BOT-047 (save sequence), BR-BOT-064 (≤ 10 radars, behaviour at the limit unknown — Q-BOT-007), BR-API-076
  (limit 409 and the Mini App toast), BR-API-092 (twins detected client-side in legacy).
- Decision: DEV-009 (server-side uniqueness: create or reactivate; «такой радар уже есть» in the bot).
- Double tap: `15` §3.4 case 7 (two `callback_query` ids, one radar).

## Implementation

1. Read `04` §3.8, `15` §3.4 and the radar service of the backend track. Tests first
   (`php artisan make:test --pest Bot/Wizard/RadarSaveTest`).
2. `php artisan make:class Telegram/Conversations/RadarWizard/SaveRadar`: on `k1:wz:<sid>:sv` take a Redis lock
   `bot:save:{sid}` (`SET NX EX 10`); a second press while locked or after the state is gone answers silently.
3. Call the radar service `create(user, filters, mode: instant, active: true, source: bot)`. The bot never sees
   `no_chat` (the user is writing to the bot), but the service's reachability check uses `users.bot_chat_state` of
   KV-TG-021, which a message from the user has just refreshed.
4. Outcomes:
   - created → toast TXT-BOT-075; edit the review into TXT-BOT-034 (`RadarSummaryRenderer` of KV-TG-034, `N` from the
     starter query of F-DELIVERY-005; when `N = 0` the last paragraph is `bot.radar.saved_none` — specified here,
     legacy unobserved); keyboard `📡 Радар` (`k1:sb:0:ls`) · `➕ Новый радар` (`k1:nw`); delete the conversation state;
     send the post-save sticker (KV-TG-013) as a new message; only then dispatch `RadarSavedByBot` (queued after
     commit), so the starter list and tip of KV-TG-037 always follow the sticker;
   - limit reached → `answerCallbackQuery` with `show_alert` `bot.radar.limit_reached` («Уже {max} радаров — удалите
     ненужный в /subs», adapted from BR-API-076; specification for Q-BOT-007, `oracle: spec`); review kept;
   - twin (DEV-009, flag `bot.dev009`): an active twin → toast `bot.radar.twin_exists` and the review edited into a
     short message with `📡 Открыть радар` (`k1:sb:<radar36>:op`); a paused twin → reactivated by the service and
     treated as "created" with the twin's number. Without the flag (legacy) a twin is created as a new radar.
5. Analytics `radar_created` with the radar number only (KV-TG-061).
6. Texts `bot.radar.saved*`, `bot.radar.limit_reached`, `bot.radar.twin_exists` in the catalogue.

## Files

- `backend/app/Telegram/Conversations/RadarWizard/SaveRadar.php` (new)
- `backend/app/Events/Telegram/RadarSavedByBot.php` (new; `php artisan make:event`)
- `backend/lang/{ru,uz,en}/bot.php` (`radar.*`)
- `backend/tests/Feature/Bot/Wizard/RadarSaveTest.php` (new)

## API contract

Bot API: `answerCallbackQuery` (toast or alert), `editMessageText` + `reply_markup`, `sendSticker`. Callbacks
`k1:wz:<sid>:sv`, `k1:sb:0:ls`, `k1:nw`, `k1:sb:<radar36>:op`.

## Business rules

- Kept: BR-BOT-047 (sequence: toast, edit, sticker, list, tip), BR-BOT-064 (limit 10 from `max_subscriptions`).
- `PROPOSED`: DEV-009 (twins) — tests `todo` until approved.
- Q-BOT-007: limit behaviour specified here (alert, review kept).

## Acceptance criteria

- One press → one radar, one toast, one edit, one sticker; two concurrent presses → still one radar.
- The confirmation text equals TXT-BOT-034 for the fixture (with `N = 11`).
- The 11th radar is refused with the alert; the review stays editable and savable after deleting one radar.
- The created radar has `mode = instant`, `active = true` and the draft's filters byte-equal after normalisation.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | review → `press('✅ Сохранить')` | toast `Сохранил ✅`; message → `✅ Радар включён` + summary + `Подходит уже сейчас: 11 — список ниже. …`; buttons `📡 Радар` · `➕ Новый радар`; then `sendSticker` |
| 2 | two `callback_query` ids for the same button within 50 ms | one radar row, one edit (`15` §3.4 case 7) |
| 3 | user already has 10 radars | alert `bot.radar.limit_reached`; review unchanged; no radar |
| 4 | starter count 0 | last paragraph `bot.radar.saved_none` |
| 5 | → `press('📡 Радар')` | same message becomes the `/subs` list (KV-TG-041) |
| 6 | → `press('➕ Новый радар')` | new wizard message (KV-TG-028) |
| 7 | DEV-009 on (`todo`), active twin exists | toast `bot.radar.twin_exists`; button `📡 Открыть радар`; no new row |
| 8 | DEV-009 on, paused twin | twin active again; confirmation as created |
| 9 | press save on a stale review after `/new` started another wizard | alert TXT-BOT-039 |

## Edge cases

- Radar service throws (database down): toast `bot.common.save_failed` (new text, KV-TG-010 error convention), the
  review stays, the lock expires; no partial radar (transaction in the service).
- Sticker send fails: logged; the save stands.
- The user blocked the bot between the press and the answer: the save stands; sends fail with `403` → KV-TG-021.

## Security

- SEC-REQ-015: idempotent create by filter hash under the per-user lock of the radar service; the bot's own lock only
  removes double edits.
- SEC-REQ-014: the radar belongs to `from.id`'s user only.
- SEC-REQ-017: filters normalised before the call.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 save transcripts pass, F-BOT-008 and F-RADAR-002 (bot part) parity-gate
rows updated (G5 waits for DEV-009), `09` rows updated, PR reviewed by the other developer.
