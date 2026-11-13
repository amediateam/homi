# KV-TG-042 — Radar card: pause, resume, delivery mode

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-010, F-RADAR-004 |
| Dependencies | KV-TG-041 (radar card), KV-TG-040 (found poll); radar patch of the radar service — API-021 domain (`active`, `mode`, resume `starter`); KV-TG-037 (starter list sender); Q-BOT-045 |

## Goal

The radar card's `⏸ Пауза` / `▶️ Включить` and `📬 Присылать подборкой` / `📡 Присылать сразу` change the radar through
the shared radar service, answer with the legacy toasts and re-render the card. Pausing may send the found poll; resuming
delivers the matches the user has not seen yet.

## Legacy reference

- BTN-050 `⏸ Пауза` → toast TXT-BOT-062 `На паузе ⏸`, status «на паузе», button → `▶️ Включить`, poll BOT-069 as a new
  message; BTN-051 `▶️ Включить` → toast TXT-BOT-063 `Радар снова включён ▶️ Нового подходящего пока нет — пришлю, как
  появится` (variant with new matches unknown, Q-BOT-045); BTN-052 `📬 Присылать подборкой` → TXT-BOT-064 `Теперь —
  подборкой в заданное время`; BTN-053 `📡 Присылать сразу` → TXT-BOT-065 `Теперь — сразу` (`tb:714–719`).
- Rules: BR-BOT-066 (three visible states), BR-BOT-067 (poll after pause), BR-API-089 (resume returns `starter` =
  matches the user has not seen), BR-API-090 (`ask_found`).
- Mini App equivalent: `PATCH /api/subscriptions/:id` (API-021).

## Implementation

1. Read `04` §3.11 and the radar patch of the backend track. Tests first
   (`php artisan make:test --pest Bot/RadarPauseResumeModeTest`).
2. `php artisan make:class Telegram/Handlers/Subs/RadarStateActions` handling `k1:sb:<r>:ps|on|dg|in`.
3. `ps` → radar service `patch(active: false)` → toast TXT-BOT-062 → re-render the card (KV-TG-041) → `FoundPoll::
   maybeSend(user, radar, pause)` (KV-TG-040), which sends the poll as a new message when `ask_found` is true.
4. `on` → `patch(active: true)` → the service returns the unseen matches (`starter`):
   - none → toast TXT-BOT-063 (legacy text);
   - K > 0 → toast `bot.subs.resumed_found` («Радар снова включён ▶️ {K}, которые вы не видели, — ниже», adapted from the
     Mini App text of BR-API-089; specification for Q-BOT-045) and the starter list of KV-TG-037 for those listings as a
     new message (delivered set updated);
   - re-render the card.
5. `dg` → `patch(mode: digest)` → toast TXT-BOT-064 → card with status `📬 Подборкой …` and button `📡 Присылать сразу`;
   `in` → `patch(mode: instant)` → toast TXT-BOT-065 → button `📬 Присылать подборкой`.
6. Idempotency: a press whose target state already holds (stale card) answers the same toast and re-renders from the
   server state; no second poll (the `ask_found` rule suppresses it).
7. Pending digest items of a radar switched to instant are released by the delivery planner (KV-TG-052/053); pausing
   drops nothing already sent.

## Files

- `backend/app/Telegram/Handlers/Subs/RadarStateActions.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`subs.paused`, `subs.resumed*`, `subs.mode_*`)
- `backend/tests/Feature/Bot/RadarPauseResumeModeTest.php` (new)

## API contract

Bot API: `answerCallbackQuery` (toast), `editMessageText` + `reply_markup`, `sendMessage` (poll, starter list).
Callbacks `k1:sb:<radar36>:ps|on|dg|in`.

## Business rules

- Kept: BR-BOT-066, BR-BOT-067, BR-API-089, BR-API-090.
- The resume toast with matches is a specification for Q-BOT-045; no DEV.

## Acceptance criteria

- Toast texts equal TXT-BOT-062 … TXT-BOT-065 (Russian); the card status and the toggled button follow the server state.
- A pause sends at most one poll message; resume with K unseen matches sends exactly K rows and records them as
  delivered.
- Mode changes never change `active`; pause never changes `mode`.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | card → `press('⏸ Пауза')` (`ask_found` true) | toast `На паузе ⏸`; card status paused, button `▶️ Включить`; then poll TXT-BOT-068 |
| 2 | → `press('▶️ Включить')`, no unseen matches | toast TXT-BOT-063; card active |
| 3 | resume with 3 unseen matches | toast `bot.subs.resumed_found` with 3; starter message with 3 rows; delivered set +3 |
| 4 | `press('📬 Присылать подборкой')` | toast TXT-BOT-064; status `📬 Подборкой …`; button `📡 Присылать сразу` |
| 5 | → `press('📡 Присылать сразу')` | toast TXT-BOT-065; button `📬 Присылать подборкой` |
| 6 | pause pressed on a stale card of an already paused radar | toast TXT-BOT-062; no poll; card re-rendered |
| 7 | forged `k1:sb:<radar of another user>:ps` | catch-all alert; the other radar unchanged |

## Edge cases

- Resume of a radar whose filters now exceed the limit of the normaliser (old data): the service normalises; the bot
  shows the result.
- Resume when the user has blocked the bot: impossible from the bot itself; the Mini App gets `409 no_chat`
  (KV-TG-021).

## Security

- SEC-REQ-014: radar resolved by number through the actor's relation.
- SEC-REQ-015: patches are idempotent; concurrent pause / resume presses end in the last server state.
- SEC-REQ-027: radar writes count against the per-user radar-write limit (30 / min) of the bot limiter.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for pause / resume / mode pass, F-BOT-010 and F-RADAR-004 (bot
part) parity-gate rows updated, `09` rows updated, PR reviewed by the other developer.
