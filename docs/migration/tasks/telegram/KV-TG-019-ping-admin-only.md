# KV-TG-019 — `/ping`: `pong` for everyone, details for admins only

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-002 |
| Dependencies | KV-TG-006 (router); DEV-036 (`PROPOSED`); DEC-22 (ARM roles — until then an env list of admin Telegram ids); KV-TG-056 (public command list without `/ping`) |

## Goal

`/ping` keeps answering everyone, but only admins see the database state and the PostGIS version; the command leaves the
public command menu. This fixes the information disclosure of the legacy command.

## Legacy reference

- BOT-021, TXT-BOT-085 `🏓 pong · БД: ок · PostGIS: 3.5.2` (`tb:871–877`), in the public menu as «Проверка связи»
  (`tb:105`), BR-BOT-102.
- Questionable decision LB-BOT-027 → DEV-036 (`09` §4.2): removed from the command menu; `pong` for everyone, details
  only for admins; per-chat menus set by legacy must be reset (KV-TG-057).
- Security: SEC-007, SEC-REQ-011 ("`/ping` answers `pong` to everyone and details only to admins").

## Implementation

1. Tests first (`php artisan make:test --pest Bot/PingCommandTest`).
2. `config/telegram.php` → `admin_user_ids` from `TELEGRAM_ADMIN_USER_IDS` (comma-separated Telegram ids; add to
   `backend/.env.example`, announce for KV-INF-003). Replaced by the ARM role check once DEC-22 and the ARM roles exist.
3. `php artisan make:class Telegram/Handlers/PingCommand`:
   - non-admin → `bot.ping.public` (`🏓 pong`, new wording under DEV-036);
   - admin → TXT-BOT-085 format: `select 1` → `БД: ок` / `bot.ping.db_error`; `postgis_lib_version()` when the
     extension exists (KV-INF-005, KV-INF-018), otherwise `PostGIS: —`; optionally the `telegram` queue size from
     Horizon's repository (admin-only diagnostics).
4. The non-admin answer never contains versions, timings or error details regardless of DEV-036's state: SEC-REQ-011 is
   a security requirement. DEV-036's approval governs the menu removal and the exact public wording; if the developer
   rejects DEV-036, the `security-reviewer` must accept the disclosure in writing before any detail is shown to
   non-admins.
5. `/ping` is not part of `BotCommandList` for any locale once DEV-036 is approved (KV-TG-056); the command still works
   when typed.

## Files

- `backend/app/Telegram/Handlers/PingCommand.php` (new)
- `backend/config/telegram.php`, `backend/.env.example`, `backend/lang/{ru,uz,en}/bot.php` (`ping.*`)
- `backend/tests/Feature/Bot/PingCommandTest.php` (new)

## API contract

Inbound `/ping`; outbound one `sendMessage` (plain text).

## Business rules

- BR-BOT-102 changes for non-admins under DEV-036 (`PROPOSED`); admins keep the legacy reply TXT-BOT-085.
- SEC-REQ-011 applies unconditionally.

## Acceptance criteria

- A non-admin gets exactly `🏓 pong` (or the approved wording) — no `БД`, no `PostGIS`, no version digits.
- An admin listed in config gets `🏓 pong · БД: ок · PostGIS: <version>` on PostgreSQL with PostGIS, `PostGIS: —`
  without it.
- A database failure shows the error marker only to admins and never a stack trace.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `conversation(user: 'A')->send('/ping')`, A not admin | `🏓 pong`; output matches no `\d+\.\d+` |
| 2 | admin id configured, same command | text in TXT-BOT-085 format with `БД: ок` |
| 3 | admin, PostGIS absent (SQLite suite) | `PostGIS: —` |
| 4 | admin, database query throws | `bot.ping.db_error`, no exception text |
| 5 | `TELEGRAM_ADMIN_USER_IDS` empty | everyone is non-admin |
| 6 | `getMyCommands` fixture after KV-TG-056 with DEV-036 approved | no `ping` entry |

## Edge cases

- An admin who is also an ordinary user: the same chat, details shown; the id list is the only switch.
- Per-chat menus set by the legacy bot still list `/ping` until KV-TG-057 resets them.

## Security

- SEC-007, SEC-REQ-011; admin ids are configuration (not secret) but are never echoed in replies or logs.
- The review checklist of the `security-reviewer` covers admin detection.

## Definition of done

Tests green (`make ci-backend`), DEV-036 state recorded in the F-BOT-002 parity-gate row, env key announced, PR reviewed
by the other developer.
