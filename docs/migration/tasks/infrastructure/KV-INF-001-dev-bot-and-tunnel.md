# KV-INF-001 — Dev bot per developer and the tunnel live check

| Field | Value |
| ----- | ----- |
| Status | TODO (the tunnel part waits for DEC-24) |
| Owner | DevOps (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-012 |
| Dependencies | KV-TG-005 (`telegram:webhook` command for the dev bot); DEC-24 (HTTPS tunnel tool — needs first developer approval); KV-INF-002 (legacy Mini App alias for the dev bot's Main Mini App URL) |

## Goal

Each developer has an own dev bot whose token, username, webhook secret and Mini App URL live only in their local
`backend/.env`, and a written, repeatable procedure to point that bot at the local stack through an approved HTTPS
tunnel for live checks. Nobody shares a dev bot, and nothing local ever talks to the staging or production bot.

## Legacy reference

- One receiver per bot (webhook or `getUpdates`): `04` §1 row "Webhook", `$KVADRO_ROOT/docs/about.md:408-411`.
- `initData` is bound to the bot token, so each environment needs its own bot and Main Mini App URL: `17` §2,
  `$KVADRO_ROOT/docs/about.md` §8.4, BR-API-008.
- Dev bot settings column of `17` §2 (Main Mini App URL through the tunnel, webhook with `Host: hook.homi.loc`,
  `allowed_updates` of CF-019, profile texts copied by `telegram:profile sync`).
- HOMI rules: `docs/handoff/parallel-work.md` §7 (own dev bot, staging/production bots belong to the production
  track), `HANDOFF.md` §4 T1 "live check" and §5 (dev bot token created by the developer), `10` §6 row "Bot", DEC-24.

## Implementation

1. Read `docs/handoff/parallel-work.md` §6–§7, `HANDOFF.md` T1 and `17` §2. Nothing here needs production access.
2. Write `docs/infrastructure/telegram-webhook.md` §"Local dev bot" (the file is created by KV-TG-005; this task adds
   the operator part): create the bot in BotFather from the developer's own account, name pattern
   `homi_dev_<initials>_bot` (any free name), never reuse a staging or production token; generate the webhook secret
   locally (`openssl rand -hex 32`, the Telegram alphabet allows hex); put `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_MINIAPP_URL` into `backend/.env` only.
3. Tunnel procedure (only after DEC-24 names the tool; until then the section says "no live check — tests use the fake
   Bot API of KV-QA-003"): the tunnel forwards `https://<tunnel host>/telegram/webhook` to `https://hook.homi.loc` with
   the `Host: hook.homi.loc` header (the route is host-bound, KV-TG-001); `TELEGRAM_WEBHOOK_URL` = tunnel URL;
   `php artisan telegram:webhook set`; `telegram:webhook info` shows no `last_error_date`; `telegram:webhook delete`
   when done. Any tunnel binary is **PROPOSED — needs approval (dependency change)**.
4. Mini App live check (optional): the dev bot's Main Mini App URL and menu button point at the tunnel host that
   forwards to `https://kvadro-app.homi.loc/` (KV-INF-002); set by the developer in BotFather or by
   `php artisan telegram:profile sync` (KV-TG-056) — local `.env` only.
5. Add a `make dev-check` probe in `scripts/dev/check.sh` (section "telegram"): WARN when the four keys are blank,
   FAIL when `TELEGRAM_BOT_USERNAME` matches a name listed as staging/production in the gitignored
   `.ai/local.env` deny list (names only, optional), PASS otherwise; never print values.
6. Note in `.ai/memory/known-issues.md`-style wording inside the doc: Telegram cannot reach `.loc`; without the tunnel
   only the fake Bot API is available.

## Files

- `docs/infrastructure/telegram-webhook.md` (section "Local dev bot and live check"; file owned by KV-TG-005)
- `docs/infrastructure/local-development.md` (link from "Commands" and "What `dev-check` verifies")
- `scripts/dev/check.sh` (telegram probe)

## API contract

n/a — no HTTP endpoint changes; the procedure uses Bot API `setWebhook` / `getWebhookInfo` / `deleteWebhook` through
the KV-TG-005 command for the dev bot only.

## Business rules

- CF-009: one bot per environment, one webhook per bot; dev and staging bots are used for everything before S2.
- `docs/handoff/parallel-work.md` §7: a shared dev bot is forbidden (webhook overwrites, cross-delivered updates).

## Acceptance criteria

- A developer following the doc on a clean machine gets `telegram:webhook info` reporting the tunnel URL and zero
  pending errors after sending `/start` to the dev bot (after DEC-24).
- `make dev-check` shows a `telegram` section with no values printed in any branch.
- The doc contains no token, secret, chat id or machine path.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `make dev-check` with blank Telegram keys | `WARN  telegram: dev bot not configured` |
| 2 | `make dev-check` with the four keys set | `PASS  telegram: dev bot keys present` |
| 3 | `make dev-check 2>&1 \| grep -c '<the configured token>'` | `0` |
| 4 | `APP_ENV=staging php artisan telegram:webhook set` (KV-TG-005 refusal) | non-zero exit, nothing sent |
| 5 | Live: `/start` to the dev bot through the tunnel (after DEC-24) | one row in `telegram_updates`, job processed |

## Edge cases

- Two developers on one machine (worktrees) still use two bots and two `.env` files.
- The tunnel host changes on every start for some tools: the doc says to re-run `telegram:webhook set` each time.
- A developer who forgets `telegram:webhook delete` leaves updates queued at Telegram for 24 h; harmless for a dev bot.

## Security

- SEC-REQ-034 (separate secrets per environment, never shared); SEC-REQ-012 (production token never on a laptop);
  SEC-REQ-013 (no token in logs or check output).
- The tunnel exposes only `hook.homi.loc`'s `/telegram/*` path; the local vhost already answers 404 elsewhere
  (`infra/local/nginx/hook.homi.conf`).

## Definition of done

Doc section and probe merged; `make ci-backend` unaffected; `make dev-check` green on both developer machines (WARN
allowed until a dev bot exists); DEC-24 recorded in the doc when answered; PR reviewed by the other developer.
