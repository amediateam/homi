# KV-INF-017 — Staging bot, BotFather settings and webhook

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | S |
| Feature IDs | F-BOT-001, F-BOT-012 |
| Dependencies | KV-INF-015 (staging `hook.staging.homi.uz` with a public certificate), KV-INF-016 (staging legacy Mini App origin), KV-TG-056 (`telegram:profile sync`), KV-TG-001…KV-TG-003 (webhook pipeline deployed on staging); CF-009; Q-BOT-019, Q-BOT-020, Q-BOT-022 |

## Goal

The staging bot behaves like `@KvadroAppBot` for every check of S1: its Main Mini App and menu button open the
unchanged legacy Mini App on `kvadro-app.staging.homi.uz`, its profile carries copies of the legacy texts in ru, uz
and en, and its webhook points at `https://hook.staging.homi.uz/telegram/webhook` with its own secret. Serves stage
**S1** (`18` §2) and `17` §15 item 2.

## Legacy reference

- Bot settings to copy: `04` §1 table (display name, description TXT-BOT-001, picture TXT-BOT-002, short description
  TXT-BOT-003, commands TXT-BOT-005, menu button TXT-BOT-004, Main Mini App, privacy URL, inline off), BOT-001…BOT-010.
- Per-environment bot and Mini App URL: `17` §2 (staging column); `initData` is bound to the bot token
  (`$KVADRO_ROOT/docs/about.md:408-413`, SEC-REQ-001), so the staging Mini App must be opened from the staging bot.
- Sticker and picture `file_id`s belong to one bot (`04` §1 note 2, Q-BOT-022) — staging needs its own copies.
- Ownership rule: staging and production bots and their webhooks belong to the production track
  (`docs/handoff/parallel-work.md` §7); `telegram:webhook` refuses staging (KV-TG-005).

## Implementation

1. Confirm which of the three existing HOMI bots is the staging bot (`.ai/memory/current-state.md`) and that its owner
   account is the team account named by the first developer (`17` §2 "Owner account"). Record the bot username in
   `docs/infrastructure/environments.md` (staging row; name only, no token).
2. Put `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (≥ 32 random characters from the
   Telegram alphabet, SEC-REQ-008), `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_MINIAPP_URL`, `TELEGRAM_SUPPORT_BOT_USERNAME`,
   `TELEGRAM_UPDATES_ENCRYPTION_KEY` into the staging server `.env` from the vault. Run the secret inventory check of
   KV-INF-004 (`php artisan security:check`, names only) afterwards.
3. BotFather (manual, team account): Main Mini App URL and Mini App domain = the staging legacy-app host; privacy
   policy URL = the staging privacy page; inline mode off; description picture and avatar from the source files of
   Q-BOT-022 (test copies). These items cannot be set through the Bot API.
4. On the staging server run `php artisan telegram:profile sync --dry-run` (KV-TG-056), review the diff, then run it
   without `--dry-run`: descriptions, short descriptions and command lists per `language_code`, menu button
   «Открыть» → `web_app` with the staging URL. **Needs first developer approval** (staging bot change).
5. Register the webhook from the staging server with the server-side script of KV-INF-030
   (`infra/server/telegram/set-webhook.sh`, token read from the environment file, never echoed): URL, `secret_token`,
   `allowed_updates` = `message`, `callback_query`, `my_chat_member`, `max_connections` from config,
   `drop_pending_updates=true` (staging only). **Needs first developer approval** each time (`docs/handoff/parallel-work.md`
   §7).
6. Record the `getWebhookInfo`, `getMyCommands` (default, `ru`, `uz`, `en`) and `getChatMenuButton` outputs (without
   the token) in `docs/infrastructure/deployment.md` § "Staging bot".
7. Development track supplies: KV-TG-056 (profile sync with dry-run), KV-TG-005's refusal stays in place, KV-TG-059
   (scheduled `getWebhookInfo` health check) to watch the webhook.

## Files

- `docs/infrastructure/environments.md` (staging bot row — production-owned rows)
- `docs/infrastructure/deployment.md` § "Staging bot" (new section)
- `infra/server/telegram/set-webhook.sh` (shared with KV-INF-030; created there if it does not exist yet)
- staging server `.env` (outside the repository)

## API contract

Bot API calls from the staging server only: `setWebhook`, `getWebhookInfo`, `setMyCommands`, `setMyDescription`,
`setMyShortDescription`, `setChatMenuButton` (through KV-TG-056). Inbound: `POST https://hook.staging.homi.uz/telegram/webhook`
with `X-Telegram-Bot-Api-Secret-Token`.

## Business rules

- CF-009 option A: each environment has its own bot, Mini App URL and webhook; staging never shares the production
  token or secret (SEC-REQ-034).
- BR-BOT-015 locale codes and the per-language command menus (BOT-007) are reproduced on staging.
- No DEV: staging carries the legacy texts; DEV-036 (no `/ping` in the menu) applies once approved.

## Acceptance criteria

- `getWebhookInfo` on staging: `url` = the staging hook URL, `has_custom_certificate=false`, `allowed_updates` =
  the three types, no `last_error_date` after a `/start`.
- Opening the Main Mini App from the staging bot loads the legacy client from the staging legacy-app host and
  `GET /api/meta` answers 200 with `initData` signed by the staging token.
- `getMyCommands` per `language_code` matches the KV-TG-056 source texts.
- The staging token, secret and encryption key differ from local and production (checklist entry signed by the first
  developer, SEC-REQ-034).

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `getWebhookInfo` (server script, token not printed) | staging URL, `pending_update_count` 0 after idle, no error fields |
| 2 | `/start` from a test account | welcome arrives; one row in staging `telegram_updates` |
| 3 | `curl -s -o /dev/null -w '%{http_code}' -X POST https://hook.staging.homi.uz/telegram/webhook` without the header | `403` |
| 4 | Menu button and Main Mini App on Telegram iOS, Android, Desktop | open `kvadro-app.staging.homi.uz` |
| 5 | `php artisan telegram:profile sync --dry-run` after the sync | empty diff |
| 6 | KV-QA-022 staging smoke list (bot part) | passes |

## Edge cases

- Per-chat command scopes set while testing persist at Telegram for the test accounts (`04` §1 note 1); reset them with
  KV-TG-057 before each rehearsal if a test changed them.
- A token re-issue for the staging bot invalidates every open staging `initData`: testers reopen the Mini App.
- Two people testing at once share the staging bot; rehearsal windows are announced in the team chat.

## Security

SEC-REQ-008 (secret strength, rotation), SEC-REQ-012 (staging uses its own bot), SEC-REQ-034 (separate secrets per
environment), SEC-REQ-047 (no token in logs or in the recorded outputs). Only test accounts use the staging bot; no
real user data reaches staging outside the controls of `14` §1.2.

## Definition of done

Checks of the Tests section recorded in `docs/infrastructure/deployment.md`, G9 evidence for F-BOT-001 and F-BOT-012
noted in the parity-gate row, `17` §15 item 2 ticked by the first developer, the development track informed in the
PR (no repository code changes besides docs and the script).
