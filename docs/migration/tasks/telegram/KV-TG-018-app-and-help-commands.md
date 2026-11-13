# KV-TG-018 — `/app` and `/help`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-002, F-SUPPORT-001 |
| Dependencies | KV-TG-010 (replies, keyboards); KV-TG-008 (texts); DEC-21 (fate of `@KvadroSupportBot` — this task only links to it) |

## Goal

`/app` answers with one line and a button that opens the Mini App; `/help` answers with the support line and a primary
button that opens the support bot. Both texts and buttons match legacy, and the support bot's username comes from
configuration so staging can point elsewhere.

## Legacy reference

- `/app`: BOT-013, TXT-BOT-009 `Лента объявлений, карточки с галереей и избранное — в приложении:`, BTN-005
  `📱 Открыть приложение` (web_app, default style) — `tb` §6.3 (`tb:238–244`).
- `/help`: BOT-019, TXT-BOT-082 `✉️ Вопрос, жалоба или идея — напишите в поддержку: @KvadroSupportBot. Ответим там же.`,
  BTN-034 `✉️ Написать в поддержку` (url, primary) → `https://t.me/KvadroSupportBot` — `tb` §6.11 (`tb:839–845`).
- State machine `04` §3.3; BR-BOT-004 (BTN-034 primary, BTN-005 not).
- Support bot: BOT-011 (`UNVERIFIED`), F-SUPPORT-001 (`DEFER`, DEC-21, Q-SYS-003, Q-BOT-016); `GET /api/bot` returns the
  same username (API-003).

## Implementation

1. Tests first (`php artisan make:test --pest Bot/AppHelpCommandTest`).
2. `config/telegram.php` → `support_bot_username` from `TELEGRAM_SUPPORT_BOT_USERNAME` (also read by API-003 on the
   backend side; add to `backend/.env.example`, announced for KV-INF-003).
3. `php artisan make:class Telegram/Handlers/AppCommand`: `SendMessage(bot.app.body)` with
   `webApp(bot.buttons.open_application, TELEGRAM_MINIAPP_URL)` (no style).
4. `php artisan make:class Telegram/Handlers/HelpCommand`: `SendMessage(bot.help.body, ['support' => '@'.username])`
   with `url(bot.buttons.write_support, 'https://t.me/'.username)->primary()`.
5. `Telegram/Keyboards/SupportButton` reused by the not-understood reply of KV-TG-038 (BTN-034 appears there too).
6. When `TELEGRAM_SUPPORT_BOT_USERNAME` is empty (local), `/help` still answers, without the button and without the
   `@username` placeholder text (a config check warns in `security:check`, KV-INF-004).

## Files

- `backend/app/Telegram/Handlers/{AppCommand,HelpCommand}.php`, `backend/app/Telegram/Keyboards/SupportButton.php` (new)
- `backend/config/telegram.php`, `backend/.env.example` (changed)
- `backend/tests/Feature/Bot/AppHelpCommandTest.php`, transcripts `app.json`, `help.json` (new)

## API contract

Bot API `sendMessage` with one inline button: `/app` → `{"text": "📱 Открыть приложение", "web_app": {"url":
"<TELEGRAM_MINIAPP_URL>"}}`; `/help` → `{"text": "✉️ Написать в поддержку", "url": "https://t.me/<support>", "style":
"primary"}`.

## Business rules

- Kept: BR-BOT-004; behaviour of BOT-013 and BOT-019 unchanged.
- F-SUPPORT-001 stays `DEFER` (DEC-21): the link is kept, the support bot itself is not migrated by this task.

## Acceptance criteria

- `/app` and `/help` produce one `sendMessage` each with the texts TXT-BOT-009 and TXT-BOT-082 in the user's locale.
- The `/help` button URL uses the configured username; the `/app` button URL is the environment's Mini App URL.
- Both work for a user with an open wizard without touching it.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `conversation(user: 'A')->send('/app')` | `expectNew('TXT-BOT-009')`, one web_app button `📱 Открыть приложение`, no style |
| 2 | `send('/help')` | `expectNew('TXT-BOT-082')` with `@KvadroSupportBot` from config, url button primary |
| 3 | staging config with another support username | text and URL use it |
| 4 | support username empty | text without the handle, no button, no error |
| 5 | `send('/new')->send('/help')->press('🔑 Снять надолго')` on the wizard | wizard continues (state untouched) |
| 6 | locale `uz` | Uzbek texts from KV-TG-009 |

## Edge cases

- DEC-21 retires the support bot: the button points to whatever channel the product owner names; only config changes.
- `/help@KvadroAppBot` (menu tap in a client that appends the username) is the same command (KV-TG-006 parser).

## Security

- SEC-REQ-019 (`https://t.me/…` only; the username validated `[A-Za-z0-9_]{5,32}`), SEC-REQ-020.
- No personal data.

## Definition of done

Tests green (`make ci-backend`), transcripts in KV-QA-009, F-BOT-002 parity-gate row updated, new env key announced, PR
reviewed by the other developer.
