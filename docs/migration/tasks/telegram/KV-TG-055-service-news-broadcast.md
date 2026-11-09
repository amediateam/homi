# KV-TG-055 — Service-news broadcasts

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development); every staging run by the production track, every production run needs first developer approval and the product owner's text |
| Complexity | M |
| Feature IDs | F-DELIVERY-008 |
| Dependencies | KV-TG-050 (pacer), KV-TG-045 (`service_news` opt-in), KV-TG-021 (reachability); ARM broadcast screen of F-ADMIN-001 / GAP-023 later (roles DEC-22); `broadcasts`, `broadcast_recipients` (ENT-013 — no KV-DB task covers them, so the migration is here); Q-BOT-004 |

## Goal

The team can send a service-news message in ru / uz / en to every reachable user who did not opt out, safely: a dry run
with the recipient count, a second confirmation, paced and resumable sending, per-recipient status, and an opt-out that
takes effect immediately. The same mechanism serves the cut-over notices (`18` §9) and the owner re-verification
campaign (KV-DB-030, `14` §8).

## Legacy reference

- Outbound step BOT-084 (never observed), text TXT-BOT-088 (content unknown), opt-out BTN-072 (`📰 Новости сервиса`,
  `04` §3.14), sender tool unknown (`$KVADRO_ROOT/docs/about.md:585`, Q-BOT-004).
- Rules: BR-BOT-080 (bot-only setting), BR-API-148, BR-BOT-007 (the bot writes on its own only for pushes, digests,
  news, the poll).
- Security: SEC-023 (admin operations without visible tooling), SEC-REQ-046 (broadcasts need a second confirmation and
  go through pacing), SEC-REQ-029; telegram-bot-engineer rule 8 (chunks ≤ 100, ≤ 25 msg/s, per-recipient status).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md` rule 8, `16` §4.12, `18` §9. Tests first
   (`php artisan make:test --pest Delivery/BroadcastTest`).
2. Migration (`php artisan make:migration create_broadcasts_tables`): `broadcasts (id ulid, audience, texts jsonb {ru, uz,
   en}, created_by, dry_run_count, confirm_token_hash, confirmed_by, confirmed_at, status, created_at)` and
   `broadcast_recipients (broadcast_id, user_id, status pending|sent|blocked|failed|skipped, message_id, attempted_at)`,
   unique `(broadcast_id, user_id)`. Models with factories (`php artisan make:model Broadcast -f`).
3. `App\Services\Delivery\BroadcastService`:
   - `draft(audience, texts)` validates texts: Telegram HTML allow-list only, every link `https` on the allow-list
     (SEC-REQ-019), ≤ 4 096 characters after escaping, all three locales present;
   - audiences: `service_news` (users with `service_news = true`, reachable, not blocked by the access gate, not
     erased) and `owners_reverify` (verified owners with a legacy hash, DEC-29); new audiences only by code review;
   - `dryRun()` stores the count and returns a one-time confirmation token (hash stored);
   - `confirm(token, by)` — a different operator than the creator when ARM roles exist (DEC-22); until then the
     artisan path requires the token and an explicit `--i-understand` flag;
   - `start()` materialises `broadcast_recipients` in chunks and dispatches `SendBroadcastBatch` jobs of ≤ 100
     recipients on `notifications` (paced, KV-TG-050).
4. `php artisan make:job Delivery/SendBroadcastBatch`: per recipient re-check the opt-out and reachability at send time
   (`skipped`), send the text in the recipient's locale, record `sent` + `message_id` / `blocked` (`403` →
   `ChatUnreachable`) / `failed`; resumable — a restarted job skips non-`pending` rows.
5. Operator commands until ARM exists: `php artisan telegram:broadcast draft --audience= --ru= --uz= --en=`,
   `telegram:broadcast dry-run <id>`, `telegram:broadcast confirm <id> --token=`, `telegram:broadcast status <id>`,
   `telegram:broadcast pause|resume <id>`. All refuse to `start` on `APP_ENV=production` unless
   `TELEGRAM_BROADCAST_ENABLED=true` was set for the run by the production track (needs first developer approval).
6. Never sent: the message body is not logged; status counts only.

## Files

- `backend/database/migrations/*_create_broadcasts_tables.php`, `backend/app/Models/{Broadcast,BroadcastRecipient}.php`,
  `backend/database/factories/*` (new)
- `backend/app/Services/Delivery/BroadcastService.php`, `backend/app/Jobs/Delivery/SendBroadcastBatch.php`,
  `backend/app/Console/Commands/Telegram/BroadcastCommand.php` (new)
- `backend/.env.example` (`TELEGRAM_BROADCAST_ENABLED`, default `false`; shared file, announced)
- `backend/tests/Feature/Delivery/BroadcastTest.php` (new)

## API contract

No public HTTP endpoint (the ARM API comes with F-ADMIN-001). Bot API `sendMessage` (HTML). Artisan commands as in
step 5.

## Business rules

- Kept: BR-BOT-080, BR-API-148, BR-BOT-007.
- Spec (legacy tool unknown, Q-BOT-004): dry run, second confirmation, audiences, resumability.
- No DEV.

## Acceptance criteria

- A broadcast reaches only users with `service_news = true` who are reachable, active and not erased; a user who opts
  out after `start` but before their turn is skipped.
- Without a valid confirmation token nothing is sent.
- A 10 000-recipient broadcast stays under the pacer rate and can be paused and resumed without duplicates.
- Production start is impossible without the production-track switch.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | 5 users: 3 opted in, 1 opted out, 1 blocked the bot | dry run count 3; sends to 3 |
| 2 | `start` without `confirm` | refused; nothing sent |
| 3 | `confirm` with a wrong token | refused |
| 4 | opted-in user switches `Не присылать` while the batch is queued | recipient `skipped` |
| 5 | fake answers `403` for one recipient | `blocked`, `ChatUnreachable`; others continue |
| 6 | job killed after 40 of 100 sends, then retried | 60 more sends, no duplicate |
| 7 | text with `<script>` or an `http://` link | `draft` refused |
| 8 | locales: user `uz` | receives the `uz` text |
| 9 | 10 000 recipients (KV-QA-020 performance case) | ≤ 25 msg/s, completes, every row final |
| 10 | `APP_ENV=production`, switch off | `start` refused with the approval message |

## Edge cases

- Users without a stored locale get `ru` (KV-TG-007 resolution).
- A cut-over notice must go out while normal deliveries are capped (`18` §6): the send cap of KV-TG-060 has a
  `broadcast` exemption flag set explicitly by the operator for that broadcast only.
- Legacy users who opted out before migration keep the opt-out (KV-DB-014 loads `service_news`, Q-BOT-040).

## Security

- SEC-REQ-046 (second confirmation, audit of who created and confirmed), SEC-REQ-029 (pacing), SEC-REQ-019 and
  SEC-REQ-020 (links and HTML), SEC-REQ-047 (no texts or ids in logs).
- Review by the `security-reviewer` agent (mass messaging is an abuse vector).

## Definition of done

Tests green (`make ci-backend`), performance case recorded, parity-gate cells of F-DELIVERY-008 updated (Q-BOT-004
answered by specification), `09` row updated, the operator procedure added to `docs/infrastructure/telegram-webhook.md`,
PR reviewed by the other developer and the first developer (production switch).
