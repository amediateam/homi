# KV-QA-009 — Bot conversation test kit and golden transcripts

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | L |
| Feature IDs | F-BOT-001 … F-BOT-015, F-ONBOARD-004, F-ONBOARD-005, F-FAV-002, F-REPORT-002, F-OWNER-001, F-SETTINGS-006, F-PRIVACY-002, F-DELIVERY-002 … F-DELIVERY-007, F-LOCALE-004 |
| Dependencies | KV-QA-003; T1 (webhook pipeline) for real runs; Q-BOT-017 for the legacy `callback_data` cases |

## Goal

Bot behaviour is tested as conversations: synthetic updates go in through the webhook, and the exact Bot API calls
that come out are compared with golden transcripts built from the bot audit. Callback data is taken from the captured
keyboards, so the tests do not hard-code the new grammar.

## Legacy reference

- Flows and state machines: `04` §3.1–§3.17; handlers BOT-001 … BOT-084, buttons BTN-001 … BTN-076, texts TXT-BOT-001
  … TXT-BOT-088 (`04` §2, §4); `data/bot-handlers.json`.
- How callbacks are answered: `04` §4.3; old messages and the catch-all: `04` §6.3, BOT-023, BOT-024, TXT-BOT-039.
- Deep-link payloads: `04` §6.1, `03b` §6.3, BR-BOT-096.
- Fix decisions: DEV-015, DEV-026 … DEV-037, DEV-046, DEV-049 (`09` §4.2, all `PROPOSED`); the `copy` and `defect`
  rows of `09` §4.3 for LB-BOT items.

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md`, `04` §3–§7, `15` §2.6.
2. `backend/tests/Support/Bot/Conversation.php`: `conversation(user: 'A', locale: 'ru')->send('/new')->expectNew(...)
   ->press('🏠 Аренда')->expectEdit(...)`. `press()` finds the button by label in the last captured keyboard and posts
   a `callback_query` with its `callback_data`; `expect*()` match method, chat, `message_id` continuity for edits,
   text (by TXT-BOT id and locale), keyboard labels and order, `answerCallbackQuery` text and `show_alert`.
3. `backend/tests/Fixtures/Bot/texts.ru.json`: TXT-BOT id → verbatim Russian text from `04` §4.2 with placeholders
   (`{n}`, `{city}`) marked; `texts.uz.json`, `texts.en.json` only for texts `tb` §13 captured; others are asserted by
   key and shape only (Q-BOT-014).
4. Transcripts in `backend/tests/Fixtures/Bot/transcripts/` (one JSON per flow, steps of `{in, out[]}`):
   `/start` plain and with each payload of `04` §6.1 (incl. `s_web--l<id>`, 64 bytes of junk; `l_<id>` legacy welcome
   vs DEV-037); language switch; `/app`, `/help`, `/ping` (non-admin, DEV-036), unknown command (DEV-027);
   `/new` for `rent_long`, `rent_daily`, `sale`; typed amount valid / invalid (TXT-BOT-022; DEV-029); review, relax,
   cancel; save of a first radar (sticker, starter list, tip); `/subs` card: pause, resume, mode, edit, delete with
   confirmation; poll «Нашли жильё?»; `/fav` empty and list; `/settings` each option; `/owner` own contact, forwarded
   contact, contact without `user_id`, cancel; `/privacy` and the deletion confirmation; a stale wizard button; a
   forged callback with another user's radar id; a 65-byte callback.
5. Each transcript names the BOT, BTN and TXT-BOT ids it covers; `BotCoverageTest` counts covered ids against 84 BOT,
   76 BTN and 88 TXT-BOT and prints the result.
6. Until handlers exist, the flows are `todo`; `ConversationSelfTest` proves the DSL against a toy handler registered
   in the test (echo, edit, keyboard, alert).
7. Frozen-clock outbound flows (instant card, digest, quiet hours, «Объявление снято») are added as spec-tested
   transcripts with `"oracle": "spec"` (Q-BOT-002, Q-BOT-003, Q-BOT-031).

## Files

- `backend/tests/Support/Bot/Conversation.php` (new)
- `backend/tests/Fixtures/Bot/texts.{ru,uz,en}.json`, `backend/tests/Fixtures/Bot/transcripts/*.json` (new)
- `backend/tests/Feature/Bot/{ConversationSelfTest,TranscriptTest,BotCoverageTest,StartPayloadTest}.php` (new)

## API contract

Bot API methods used: `sendMessage`, `sendPhoto`, `sendSticker`, `editMessageText`, `editMessageCaption`,
`editMessageReplyMarkup`, `answerCallbackQuery`, `setMessageReaction`, `setMyCommands` (as the flows require).
Inbound: Telegram `Update` JSON on `POST /telegram/webhook` with the secret header.

## Business rules

BR-BOT-021 (objects per deal), BR-BOT-077 (quiet hours), BR-BOT-081, BR-BOT-082 (owner), BR-BOT-096 (payload grammar),
BR-BOT-099 (`no_chat`), BR-BOT-100, BR-BOT-101 (delivery). DEV rows per their state (`15` §1.4).

## Acceptance criteria

- `ConversationSelfTest` green; every listed flow has a transcript file citing its `04` evidence.
- `BotCoverageTest` reports the covered share of BOT / BTN / TXT-BOT ids.
- Every transcript passes the `FakeBotApi` validators (lengths, HTML, `callback_data` ≤ 64 bytes) when enabled.

## Tests

As in steps 2–7. Old-message compatibility: a callback carrying any undecodable data ends in TXT-BOT-039 with
`show_alert` and no state change (F-BOT-013).

## Edge cases

- The same button pressed on an older copy of a card applies to the current state (BOT-024, LB-BOT-007).
- Two presses of the save button → one radar (`15` §3.4 #7).
- Language switch re-renders the current message (BOT-025).
- A typed number while no amount is awaited goes to free-text parsing.

## Security

Forged callbacks and contacts are covered here as conversation cases; the full set lives in KV-QA-016
(SEC-REQ-011). Texts are escaped before sending (SEC-REQ-020).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR
reviewed by the other developer.
