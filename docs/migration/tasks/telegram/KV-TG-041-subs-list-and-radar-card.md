# KV-TG-041 — `/subs`: radar list and radar card

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-010, F-RADAR-001 |
| Dependencies | KV-TG-034 (summary renderer), KV-TG-011 (callback codec); radar list of the radar service — API-018 domain (F-RADAR-001); radar hide rules (ENT-009); `max_subscriptions` (BR-API-076) |

## Goal

`/subs` shows the user's radars as a list with one button per radar (state icon + title) and `➕ Новый радар`, or the
empty state. A radar button turns the same message into the radar card with its status, summary and hide rules; the
card's buttons are implemented in KV-TG-042 … KV-TG-044, and `◀️ К списку` returns to the list.

## Legacy reference

- BOT-015 (`/subs`), BOT-063 (empty), BOT-064 (list), BOT-065 (radar card), `tb:674–725`; state machine `04` §3.11.
- Texts: TXT-BOT-057 (empty: `Радаров пока нет. Опишите, что ищете, — включу первый: …`), TXT-BOT-058 `📡 Радар (k из
  10)` + explanation, TXT-BOT-059 radar title `<сделка> · <объект> · <комнаты> · <город> · <район> +N · <бюджет>`,
  TXT-BOT-060 radar card (title, status line, summary, `🙈 скрыто: …`).
- Buttons: BTN-049 (`▶️ <название>` / `⏸ <название>`), BTN-030 `➕ Новый радар`, BTN-060 `◀️ К списку`; card buttons
  BTN-050 … BTN-057 (other tasks).
- Rules: BR-BOT-064 (`k из 10`), BR-BOT-065 (title), BR-BOT-066 (three visible states: on/instant, paused, on/digest),
  BR-BOT-001 (callbacks edit the message).

## Implementation

1. Read `04` §3.11. Tests first (`php artisan make:test --pest Bot/SubsCommandTest`).
2. `php artisan make:class Telegram/Handlers/SubsCommand`: `/subs` sends a NEW message; `k1:sb:0:ls` (from the save
   message, the card's `◀️ К списку`, after delete) edits the pressed message into the same view.
3. Empty: TXT-BOT-057 + `➕ Новый радар` (`k1:nw`).
4. List: TXT-BOT-058 with `k` = number of radars and the limit from `max_subscriptions`; one button per radar in the
   radar service's order (as API-018): `▶️` when active, `⏸` when paused, then the title TXT-BOT-059 built by
   `RadarTitle` (deal · object · rooms · city · first district `+N` · budget; BR-BOT-065), truncated to 60 characters
   with `…`; callback `k1:sb:<radar36>:op`; last row `➕ Новый радар`.
5. Radar card (`op`): edit into TXT-BOT-060 — title; status line by state (`▶️ Включён — новые объявления приходят
   сразу` / `⏸ На паузе — объявления не приходят` / `📬 Подборкой — список новых объявлений в заданное время
   (/settings)`; paused wins over digest); summary rows from `RadarSummaryRenderer` (incl. the extra-filters line for
   Mini App radars); `🙈 скрыто: <@канал · район>` when hide rules exist. Keyboard (layout specified here, legacy order
   kept): `[⏸ Пауза | ▶️ Включить][✏️ Изменить]` / `[📬 Присылать подборкой | 📡 Присылать сразу]` /
   `[🙉 Показать скрытое]` (only with rules) / `[🗑 Удалить][◀️ К списку]`, callbacks `k1:sb:<r>:<op>` of the plan.
6. Every view is rendered from the server state at press time, so a stale list shows the current icons after any press.
7. `RadarTitle` and the card renderer are reused by KV-TG-042 … KV-TG-044 and by the hide-rule radar choice of
   KV-TG-026.

## Files

- `backend/app/Telegram/Handlers/SubsCommand.php`, `backend/app/Telegram/Rendering/{RadarTitle,RadarCardRenderer}.php` (new)
- `backend/app/Telegram/Keyboards/{RadarListKeyboard,RadarCardKeyboard}.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`subs.*`)
- `backend/tests/Feature/Bot/SubsCommandTest.php`, `backend/tests/Unit/Telegram/RadarTitleTest.php` (new)

## API contract

Bot API: `sendMessage` (`/subs`), `editMessageText` + `reply_markup` (list ↔ card), `answerCallbackQuery` (silent).
Callbacks `k1:sb:0:ls`, `k1:sb:<radar36>:op`, `k1:nw`.

## Business rules

- Kept: BR-BOT-001, BR-BOT-064, BR-BOT-065, BR-BOT-066.
- No DEV here; DEV-033 changes the hidden-rules button (KV-TG-043), DEV-030 / DEV-031 the edit flow (KV-TG-044).

## Acceptance criteria

- `/subs` with no radars equals TXT-BOT-057 + one button.
- With one radar the text equals TXT-BOT-058 `📡 Радар (1 из 10)` + explanation and the button
  `▶️ Аренда · квартира · 2 комн. · Ташкент · Юнусабад +1 · до $800/мес`.
- The radar card of the fixture equals the `tb:698–708` sample including `🙈 скрыто: @<канал> · Юнусабад`.
- `◀️ К списку` restores the list in the same message.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `send('/subs')`, no radars | new message TXT-BOT-057, `➕ Новый радар` |
| 2 | one active radar | TXT-BOT-058 `(1 из 10)`; button `▶️ Аренда · квартира · 2 комн. · Ташкент · Юнусабад +1 · до $800/мес`; `➕ Новый радар` |
| 3 | → press the radar | same message → card: title, `▶️ Включён — новые объявления приходят сразу`, summary, buttons |
| 4 | paused digest radar | status `⏸ На паузе — объявления не приходят`; button `▶️ Включить` |
| 5 | active digest radar | status `📬 Подборкой — список новых объявлений в заданное время (/settings)` |
| 6 | radar with two hide rules | `🙈 скрыто: @<канал> · Юнусабад` and `🙉 Показать скрытое` |
| 7 | card → `press('◀️ К списку')` | list again in the same message |
| 8 | radar deleted in the Mini App, press its stale button | catch-all alert TXT-BOT-039; list re-rendered on the next `/subs` |
| 9 | Mini App radar with `polygon` and `renovation` | summary shows `bot.summary.extra_filters` |
| 10 | locale `en` | list and card from the `en` catalogue |

## Edge cases

- Ten radars: ten buttons + `➕ Новый радар`; the new-radar path enforces the limit at save (KV-TG-036).
- Titles of radars without districts: `… · Ташкент · до $800/мес` (no `+N`).
- Two radars with the same title (legacy twins before DEV-009): both listed; their numbers differ.

## Security

- SEC-REQ-014: radars loaded and resolved only through the actor's relation by `number`; a foreign number is "unknown".
- SEC-REQ-020: titles and channel handles escaped.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 `/subs` transcripts pass, F-BOT-010 parity-gate row updated, `09` rows
F-BOT-010 / F-RADAR-001 (bot part) updated, PR reviewed by the other developer.
