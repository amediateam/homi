# KV-INF-031 — Production bot token rotation and webhook switch

| Field | Value |
| ----- | ----- |
| Status | TODO (needs DEC-05, DEC-17 and the signed S1 exit) |
| Owner | DevOps (track: production — first developer approves), with the product owner (bot owner in BotFather) and the legacy operator (T0.1) |
| Complexity | S |
| Feature IDs | F-BOT-012 (and F-ACCESS-001 — `initData` is signed with the bot token) |
| Dependencies | KV-INF-014 (custody), KV-INF-030 (runbook and rehearsals), KV-INF-015 (production hook host), KV-TG-001 … KV-TG-003 (pipeline live on production), KV-TG-060 (processing paused); DEC-05, DEC-17, Q-SEC-017; `18` §6 T0.1–T0.5, §7, §8.1 step 3 |

## Goal

At S2, `@KvadroAppBot` receives its updates on `https://hook.homi.uz/telegram/webhook` with HOMI's secret, under a
freshly reissued token that only HOMI's production vault holds; no update is lost or processed twice, and the old token
is dead.

## Legacy reference

- CF-009 option A (`10` §3.9): `@KvadroAppBot` becomes HOMI's production bot; one `setWebhook`; token revoked and
  reissued at the switch.
- SEC-022, SEC-REQ-012 (rotation; acceptance: `getWebhookInfo` shows the HOMI URL, the pre-rotation token gets `401`,
  `initData` signed with the old token fails), SEC-REQ-008 (secret header).
- Runbook `18` §6 rows T0.1 (legacy `deleteWebhook drop_pending_updates=false`), T0.3 (BotFather `/revoke`, vault,
  `.env`, `config:cache`, `horizon:terminate`), T0.4 (`setWebhook`), T0.5 (`getWebhookInfo`, buffered updates stored
  while processing stays paused), GO + 30 min (BotFather settings unchanged), `18` §7 (rotation is a one-way door).

## Implementation

1. Preconditions (checked in the runbook): S1 exit signed; KV-INF-030 R2/R3 done; production hook host answers 403 to
   unsigned posts; update processing paused (`telegram:intake pause`) and send cap 0 (`delivery:cap 0`).
2. T0.1 — the legacy operator stops its receiver with `deleteWebhook` and `drop_pending_updates=false` (updates wait at
   Telegram).
3. T0.3 — the bot owner runs `/revoke` in BotFather (first developer present); the new token goes straight into the
   production vault and the production `.env` (`TELEGRAM_BOT_TOKEN`); `php artisan config:cache`; `php artisan
   horizon:terminate`. If R2 showed that queued updates are lost on revocation, this step runs before T0.1 with less
   than a minute between them.
4. T0.4 — from the production server: `setWebhook` with `url` = `https://hook.homi.uz/telegram/webhook`,
   `secret_token` = a new random secret (also set as `TELEGRAM_WEBHOOK_SECRET`), `allowed_updates` = `message`,
   `callback_query`, `my_chat_member`, the configured `max_connections`, `drop_pending_updates=false` (DEC-17).
   **Needs first developer approval for this exact call.**
5. T0.5 — `getWebhookInfo`: URL = HOMI, no `last_error_date`, `pending_update_count` falling; buffered updates arrive
   in `telegram_updates` (contacts redacted before storage, KV-TG-003) while processing stays paused until GO + 5 min.
6. Verification of the dead token: one `getMe` with the old token from the server → `401` (recorded, token not printed).
7. Rollback (§8.1 step 3): `setWebhook` back to the legacy receiver with the **new** token handed to the legacy operator
   through the vault (the old token is dead), `drop_pending_updates=false`.

## Files

- none in the repository beyond the runbook entries of KV-INF-030; the vault and the server `.env` change.

## API contract

Bot API from the production server: `setWebhook`, `getWebhookInfo`, `getMe`; BotFather `/revoke` by the bot owner.

## Business rules

BR-BOT-011 and every user-visible bot rule are unchanged by the switch; BotFather settings (descriptions, commands,
menu button, Main Mini App URL `https://app.kvadro.app/`) are **not** changed at S2 (`18` §6 GO + 30 min check).

## Acceptance criteria

- `getWebhookInfo` shows the HOMI URL, `allowed_updates` as listed, no error; the old token answers `401`.
- `initData` signed with the old token is refused by the legacy surface (SEC-REQ-012 acceptance), the `401` spike
  decays within 2 hours (`18` §5.4).
- Buffered updates processed exactly once after the point of no return (drain report of KV-TG-060).

## Tests

| # | Check (production, approved session) | Expected |
| - | ------------------------------------ | -------- |
| 1 | `getWebhookInfo` (via `php artisan telegram:health`) | url `https://hook.homi.uz/telegram/webhook`, no `last_error_date` |
| 2 | `getMe` with the pre-rotation token | `401 Unauthorized` |
| 3 | count of `telegram_updates` received between T0.4 and GO + 5 min vs processed after | equal, no duplicates |
| 4 | `getMyCommands` per `language_code`, `getChatMenuButton` default | identical to the frozen dump of KV-INF-014 |
| 5 | grep server logs for the token pattern | no match |

## Edge cases

- `setWebhook` fails (certificate, DNS): abort before GO, rollback §8.1 — the legacy operator gets the new token.
- Telegram retries updates HOMI answered non-2xx: impossible by design after the durable insert (KV-TG-002); the
  monitor alerts on any non-2xx.
- A second rotation is needed (leak, rollback): repeat steps 3–6; open `initData` sessions reload once more.

## Security

SEC-022, SEC-REQ-012, SEC-REQ-013 (token never in logs), SEC-REQ-034; only the bot owner and the first developer touch
the token; the development track never sees it.

## Definition of done

Switch executed in the S2 window with every check recorded in the runbook log, `17` §15 item 12 ticked by the first
developer, the product owner's GO recorded, the legacy operator confirmed its receiver is off.
