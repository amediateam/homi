# KV-TG-017 — Language switch and per-chat command menus

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-LOCALE-004 |
| Dependencies | KV-TG-014 (welcome), KV-TG-009 (texts in three languages); settings service and its `SettingsChanged` event (F-SETTINGS-001, API-024/API-025); `users.bot_commands_locale` of the identity schema (KV-DB-007, ENT-059); command lists per locale from KV-TG-056; Q-BOT-043, Q-BOT-014 |

## Goal

Choosing a language in the bot saves it, re-renders the current message in the new language, and switches the chat's
command menu; a language change made in the Mini App switches the bot's menu too. One `LanguageSwitcher` serves the
welcome buttons and the `/settings` row.

## Legacy reference

- BOT-025, BTN-003 (welcome, no toast), BTN-070 (`/settings`, toast TXT-BOT-075 in the new language), state machine
  `04` §3.2, `tb` §6.2 (`tb:226–236`).
- Rules: BR-BOT-013 (welcome shows the two other languages), BR-BOT-014 (re-render, menu switch, later replies; toast
  only from `/settings`), BR-BOT-015 (codes).
- Per-chat command menu inferred (`tb:91–92`, `04` §1 note 1); EN descriptions captured, UZ not (Q-BOT-014); Mini App
  path unknown (Q-BOT-043). ENT-059 (Telegram-side chat state) and `06` §4.2 row `users.bot_commands_locale`.

## Implementation

1. Tests first (`php artisan make:test --pest Bot/LanguageSwitchTest`).
2. `php artisan make:class Services/Telegram/LanguageSwitcher`: `switch(User, string $locale)` → settings service
   `patch(['locale' => …])` (internal codes `ru` / `uz` / `en`, CF-006) → `syncCommandMenu(User)`.
3. `syncCommandMenu`: if `users.bot_commands_locale` differs from the locale, `setMyCommands` with scope
   `{type: chat, chat_id: <telegram id>}` and the command list of that locale (`BotCommandList::for($locale)`, the same
   source KV-TG-056 uses for the default scopes), then store the locale. A `ChatUnreachable` marks the chat (KV-TG-021)
   and stops.
4. Welcome callback `k1:lg:<code>` (`LanguageCallback`): switch, then `EditMessage` of the same welcome in the new
   language with fresh counters (KV-TG-014 renderer), no toast (BR-BOT-014).
5. `/settings` row (KV-TG-045) calls the same switcher, then re-renders the panel and toasts TXT-BOT-075 in the new
   language.
6. `php artisan make:listener Telegram/SyncBotCommandsOnLocaleChange --event=Identity/SettingsChanged` (queued on
   `telegram`): when `locale` is among the changed keys and the change did not come from the bot, call
   `syncCommandMenu` (Q-BOT-043: legacy behaviour unknown; HOMI keeps bot and app consistent — spec-tested).
7. If KV-DB-007 has not added `users.bot_commands_locale`, add it here with an additive migration
   (`php artisan make:migration add_bot_commands_locale_to_users_table`).

## Files

- `backend/app/Services/Telegram/{LanguageSwitcher,BotCommandList}.php`, `backend/app/Telegram/Handlers/LanguageCallback.php` (new)
- `backend/app/Listeners/Telegram/SyncBotCommandsOnLocaleChange.php` (new)
- `backend/database/migrations/<date>_add_bot_commands_locale_to_users_table.php` (only if missing)
- `backend/tests/Feature/Bot/LanguageSwitchTest.php` (new)

## API contract

Callback `k1:lg:<ru|uz|en>`. Bot API: `editMessageText`, `setMyCommands {commands, scope: {type: "chat", chat_id}}`,
`answerCallbackQuery` (silent on the welcome, toast on `/settings`).

## Business rules

- Kept: BR-BOT-013, BR-BOT-014, BR-BOT-015 (at the legacy API boundary `uz` ↔ `uz_Latn`, handled by the settings
  service).
- DEV-036 affects the command list content (no `/ping` in the public menu) — applied through `BotCommandList` once
  approved (KV-TG-056, KV-TG-019).

## Acceptance criteria

- Pressing `🇺🇿 Oʻzbekcha` on a Russian welcome edits the same `message_id` into the Uzbek welcome whose language row is
  `🇷🇺 Русский` · `🇬🇧 English`, with no toast.
- `setMyCommands` is called once with the chat scope and the Uzbek list; a second switch to the same language calls it
  not at all.
- The next `/help` reply is in Uzbek.
- A Mini App `PUT /api/settings {"locale":"en"}` leads to one `setMyCommands` with the English list.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `send('/start')->press('🇺🇿 Oʻzbekcha')` | `expectEdit` same message, Uzbek welcome; `answerCallbackQuery` without text; `setMyCommands` scope chat, uz list |
| 2 | then `press('🇷🇺 Русский')` | Russian welcome again (`tb:236`), commands back to ru |
| 3 | `send('/settings')->press('🇬🇧 English')` | panel in English, toast `Saved ✅` (via KV-TG-045) |
| 4 | settings changed from the Mini App to `en` | listener calls `setMyCommands` once with the en list |
| 5 | `setMyCommands` answers `403` | chat marked unreachable; locale still saved |
| 6 | press a language button on a welcome sent before the cut-over (legacy data) | catch-all alert TXT-BOT-039 |

## Edge cases

- The user's Telegram UI language differs from the bot language: the per-chat scope wins over the default per-language
  commands (Bot API scope precedence); documented.
- Per-chat scopes set by the legacy bot persist after the cut-over; resetting them is KV-TG-057.
- Users who never switch keep the default menu for their client language (KV-TG-056 sets default and `language_code`
  variants).

## Security

- SEC-REQ-011 (callback parsed by the codec; only the presser's own settings change), SEC-REQ-014.
- No personal data beyond the locale.

## Definition of done

Tests green (`make ci-backend`), F-LOCALE-004 parity-gate row updated (Q-BOT-043 marked spec-tested), PR reviewed by the
other developer.
