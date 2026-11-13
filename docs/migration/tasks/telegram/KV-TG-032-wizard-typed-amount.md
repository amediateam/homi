# KV-TG-032 — Wizard step 5a: typed budget amount

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-005 |
| Dependencies | KV-TG-031 (budget step); KV-TG-006 (router hands awaited text to the wizard); user currency — F-SETTINGS-004; DEV-029, DEV-006 (`PROPOSED`); Q-BOT-024 |

## Goal

`✍️ Своя сумма` turns the budget step into a prompt and makes the bot wait for one amount. A valid amount continues
the wizard; an invalid one gets an error. After DEV-029, common formats are accepted, commands and clear search phrases
leave the wait, and the error message is edited in place instead of stacking.

## Legacy reference

- BOT-042 (prompt), BOT-043 (text while waiting), BTN-019; TXT-BOT-021 `Напишите сумму в долларах одним числом,
  например 650 или 85000.`; TXT-BOT-022 `Не понял сумму. Напишите число в долларах, например 650.` (`tb:412–422`).
- Legacy flow: the prompt replaces the step with `◀️ Назад` · `✖️ Отмена`; a non-number → a NEW error message, still
  waiting; a number → the prompt loses its keyboard and step 6 arrives as a NEW message that is edited from then on
  (state machine `04` §3.6).
- Rules: BR-BOT-035, BR-BOT-051 (all text goes to the amount while waiting).
- Decisions: DEV-029 (LB-BOT-018), DEV-006 (LB-BOT-019); open question Q-BOT-024 (formats, limits, commands, TTL).

## Implementation

1. Read `04` §3.6 and the DEV-029 row of `09` §4.2. Tests first
   (`php artisan make:test --pest Bot/Wizard/TypedAmountTest`, `--unit Telegram/AmountParserTest`).
2. `k1:wz:<sid>:am` → edit the step into TXT-BOT-021 with Back · Cancel; set `awaiting = amount` in the wizard state
   (kind stays `wizard_new` / `wizard_edit`).
3. Router contract (KV-TG-006): a private text message while `awaiting = amount` goes to
   `RadarWizard\TypedAmountInput` instead of free-text parsing.
4. `php artisan make:class Telegram/Conversations/RadarWizard/AmountParser`: legacy mode accepts one integer
   (`650`, `85000`); DEV-029 mode (flag `bot.dev029`) also accepts `650$`, `$650`, `85 000`, `85 000$`, `85k`,
   `1,2 млн`, `1.2m`, `1,2 mln` and the currency words of the user's locale; result = positive integer amount + currency
   (USD, or UZS when DEV-006 is on and the user's currency is UZS). Bounds (`PROPOSED`, Q-BOT-024): > 0 and
   ≤ 10 000 000 USD (or its soʻm equivalent at the current rate); out of bounds = invalid.
5. Valid → remove the prompt's keyboard (`editMessageReplyMarkup`), store `price_max` (+ currency), clear `awaiting`,
   and continue with `Transition::newMessage()`: the next step (owner) — or the review in edit mode — is sent as a NEW
   message whose `message_id` replaces the one in the state (legacy behaviour, BR-BOT-035).
6. Invalid:
   - legacy mode: send TXT-BOT-022 as a new message each time;
   - DEV-029 mode: send TXT-BOT-022 once and edit that same message on later failures (`error_message_id` in the
     state); a command (`/subs`, `/new`, …) clears `awaiting`, keeps the wizard message as is and runs the command; a
     clear search phrase (two or more words with letters that do not parse as an amount and are not currency words)
     clears `awaiting`, closes the wizard message (keyboard removed) and goes to free-text parsing (KV-TG-038).
7. `◀️ Назад` on the prompt → the budget step again (`awaiting` cleared); `✖️ Отмена` → engine cancel.

## Files

- `backend/app/Telegram/Conversations/RadarWizard/{TypedAmountInput,AmountParser}.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`wizard.amount.*`)
- `backend/tests/Feature/Bot/Wizard/TypedAmountTest.php`, `backend/tests/Unit/Telegram/AmountParserTest.php` (new)

## API contract

Bot API: `editMessageText` (prompt), `sendMessage` (error, next step), `editMessageReplyMarkup` (prompt keyboard
removed), `editMessageText` (DEV-029 error edits). Callbacks `k1:wz:<sid>:am`, `k1:wz:<sid>:bk`, `k1:wz:<sid>:cx`.
Inbound: text messages.

## Business rules

- Kept: BR-BOT-035 (maximum only; new message after a valid amount), BR-BOT-051 (awaited text bypasses parsing).
- `PROPOSED`: DEV-029 (formats, leaving the wait, one error message), DEV-006 (currency) — tests `todo` until approved.
- Bounds are a specification for Q-BOT-024, not a deviation.

## Acceptance criteria

- `650` → `price_max = 650 USD`; the prompt has no keyboard; the owner step is a new message that later presses edit.
- `примерно шестьсот` → TXT-BOT-022 (new message in legacy mode), still waiting.
- With DEV-029: `85 000$`, `85k`, `1,2 млн` parse to 85 000, 85 000, 1 200 000; three bad inputs leave exactly one
  error message; `/subs` during the wait shows the radar list and ends the wait.
- A number typed when no amount is awaited is not handled here (goes to KV-TG-038).

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | step 5 → `press('✍️ Своя сумма')` | same message edited to TXT-BOT-021 with `◀️ Назад` · `✖️ Отмена` |
| 2 | → `send('650')` | prompt keyboard removed; new message owner step (TXT-BOT-023); draft 650 USD |
| 3 | → `send('примерно шестьсот')` (legacy) | new message TXT-BOT-022; state still awaiting |
| 4 | → `send('0')`, `send('-5')`, `send('99999999999')` | TXT-BOT-022 each (bounds) |
| 5 | DEV-029 (`todo`): `send('85 000$')` | 85 000 USD accepted |
| 6 | DEV-029: three invalid texts | one `sendMessage` + two `editMessageText` of that error message |
| 7 | DEV-029: `send('/subs')` while waiting | radar list sent; `awaiting` cleared |
| 8 | DEV-029: `send('двушка в Юнусабаде')` while waiting | wizard keyboard removed; free-text review (KV-TG-038) |
| 9 | prompt → `press('◀️ Назад')` | budget step re-rendered in the same message |
| 10 | edit mode (from review) → amount `700` | review as a new message with `💰 до $700/мес` |

Unit: `AmountParserTest` dataset of legacy and DEV-029 formats in ru, uz, en, including `1 000,5` (invalid fractions
of a dollar rounded down — spec), Cyrillic and Latin `k`/`к`.

## Edge cases

- The wizard expired while waiting: the text goes to free-text parsing (no state), as after a cut-over (`04` §6.3
  item 6).
- A voice message while waiting: not an amount; legacy mode answers TXT-BOT-022, DEV-029 mode treats it as a search
  phrase (KV-TG-039).
- Two numbers in one message (`600 700`): invalid (one number required).

## Security

- SEC-REQ-017: the parsed amount passes the normaliser bounds.
- SEC-REQ-010: typed inputs count against the per-user message limit.
- The typed text is not stored (BR-BOT-055); only the parsed amount enters the draft.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for valid / invalid amounts pass, F-BOT-005 parity-gate row
updated (G5 waits for DEV-029 / DEV-006), `09` row updated, PR reviewed by the other developer.
