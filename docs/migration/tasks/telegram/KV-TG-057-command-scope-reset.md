# KV-TG-057 — Reset of per-chat command menus and menu buttons

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development); staging runs by the production track; production runs need first developer approval |
| Complexity | S |
| Feature IDs | F-BOT-001, F-BOT-002 |
| Dependencies | KV-TG-056 (desired command lists), KV-TG-050 (pacer), KV-TG-017 (per-chat scope on language change, `users.bot_commands_locale`); Q-BOT-014, Q-BOT-020 |

## Goal

Command menus and menu buttons that the legacy bot may have set per chat survive the backend switch at Telegram
(ENT-059). When HOMI changes the command set (for example `/ping` leaving the menu, DEV-036) or the menu-button URL
(S4, S6), a paced, resumable job brings every chat to HOMI's state. A one-chat helper is also used after a data
deletion (KV-TG-049).

## Legacy reference

- `04` §1 note 1 (per-chat scopes probably set on language change, BOT-007, BOT-025), `04` §6.3 item 5, ENT-059
  (`06` §2: inventory and reset plan; `users.bot_commands_locale` in `06` §4.2).
- Open: Q-BOT-014 (do per-chat scopes exist), Q-BOT-020 (menu button per chat).
- DEV-036 compatibility note: "Per-chat command menus set by the legacy bot must be reset"; `18` §8.3 row "Per-chat state
  HOMI changed at Telegram"; `18` §12.1 (S4 canary uses per-chat menu buttons).

## Implementation

1. Read `04` §1, `18` §6 and §12.1. Tests first (`php artisan make:test --pest Bot/CommandScopeResetTest`).
2. `php artisan make:class Telegram/Profile/ChatCommandScope` with `reset(int $chatId, ?string $locale)`:
   `deleteMyCommands(scope = BotCommandScopeChat(chat_id))`, then, if HOMI keeps per-chat lists (KV-TG-017),
   `setMyCommands` for that chat in the user's locale from `config/telegram_profile.php`; and
   `setChatMenuButton(chat_id, MenuButtonDefault)` so the chat falls back to the bot default. Stores
   `users.bot_commands_locale` and `users.bot_commands_synced_version`.
3. `php artisan make:job Telegram/ResetChatCommandScopes` (queue `notifications`, `PaceTelegramSends`): processes users
   in chunks of 100 whose `bot_commands_synced_version` is lower than `telegram_profile.version`; resumable by that
   column; unreachable chats (`403`) are marked and skipped.
4. `php artisan make:command Telegram/CommandScopesCommand` → `telegram:commands status|reset [--user=] [--dry-run]`:
   `status` prints counts per version; `reset` dispatches the job. Production: refused unless
   `TELEGRAM_PROFILE_SYNC_ALLOWED=true` for the run and `--approved` (needs first developer approval); never run at S2
   (profile unchanged, `18` §6) — it runs after an approved command-set change.
5. Before planning a full production run, the bot owner checks one test chat with `getMyCommands(scope chat)` (closes
   Q-BOT-014); if legacy never used per-chat scopes, only users whose scope HOMI itself set need the job.
6. `bot_commands_synced_version` column: additive migration here if the identity schema (KV-DB-007) does not add it.

## Files

- `backend/app/Telegram/Profile/ChatCommandScope.php`, `backend/app/Jobs/Telegram/ResetChatCommandScopes.php`,
  `backend/app/Console/Commands/Telegram/CommandScopesCommand.php` (new)
- `backend/database/migrations/*_add_bot_commands_synced_version_to_users.php` (only if missing)
- `backend/tests/Feature/Bot/CommandScopeResetTest.php` (new)

## API contract

Bot API: `deleteMyCommands`, `setMyCommands` and `getMyCommands` with `BotCommandScopeChat`, `setChatMenuButton` with
`chat_id`. Artisan commands as in step 4.

## Business rules

- Kept: BR-BOT-014 (the command menu follows the user's language) — the reset restores the list in the stored locale.
- Applies DEV-036 (`PROPOSED`) to chats that still hold the legacy list.
- No user-visible message is sent.

## Acceptance criteria

- After the job, every reachable chat's scope matches the desired list for its locale (sampled by `getMyCommands` in
  the test fake) and its menu button is the default.
- The job is paced (KV-TG-050), resumable, and a second run makes no calls for synced users.
- Production execution is impossible without the explicit switch and approval flag.

## Tests

| # | Case (`FakeBotApi`) | Expected |
| - | ------------------- | -------- |
| 1 | `ChatCommandScope::reset(chat, 'ru')` | `deleteMyCommands(scope chat)`, `setMyCommands(scope chat, ru list)`, `setChatMenuButton(default)` in order |
| 2 | 250 users at version 1, profile version 2 | 3 jobs; all users at version 2; ≤ global rate per second |
| 3 | job interrupted after 120 users and restarted | continues with the remaining 130; no repeated calls |
| 4 | fake answers `403` for one chat | user marked unreachable, skipped, the rest continue |
| 5 | `telegram:commands reset` with `APP_ENV=production`, no switch | refused, no calls |
| 6 | `telegram:commands status` | counts per version, no ids printed |
| 7 | user erased (KV-TG-049) | helper reset called once for that chat |

## Edge cases

- A user switches language while the job runs: KV-TG-017 sets the scope and the version; the job skips them.
- Telegram answers `400 chat not found` for chats that never started the bot: marked done (nothing to reset).
- S4 canary (`18` §12.1) sets per-chat menu buttons for a cohort; resetting those chats is part of the canary rollback,
  using the same helper.

## Security

- SEC-REQ-029 (paced bulk calls), SEC-REQ-047 (counts only in logs), ADR-0011 (production changes approved).

## Definition of done

Tests green (`make ci-backend`), staging dry run recorded by the production track, parity-gate cells of F-BOT-001 and
F-BOT-002 updated (Q-BOT-014 answer recorded), `09` rows updated, PR reviewed by the other developer.
