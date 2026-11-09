# KV-INF-030 — Cut-over runbook automation and dry runs

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: production — first developer approves), with the product owner (GO decision) and the developer (data and application steps) |
| Complexity | M |
| Feature IDs | F-BOT-012 (and every P0 feature through the S2 switch) |
| Dependencies | KV-TG-060 (cut-over switches: pause update processing, send cap, ordered drain, buffered-update export), KV-TG-059 (webhook health command), KV-INF-028 (rehearsal environment), KV-INF-022, KV-INF-023; KV-DB-026 (data runbook, `14` §8); DEC-17, DEC-18; `18` §6, §8 |

## Goal

The S2 runbook of `18` §6 exists as a numbered, scripted checklist where every machine step is one command with a
recorded output, every human step has an owner and a sign-off line, and the whole sequence — including the rollback of
`18` §8.1 — has been dry-run in R2 (with rollback) and R3 (without) on staging within the freeze-window budget.

## Legacy reference

- Runbook `18` §6 (T−14 d … GO + 72 h), point of no return `18` §7, rollback `18` §8.1–§8.3, communication `18` §9,
  monitoring window `18` §10; data part `14` §7.6–§7.8; questions resolved by R2: pending updates across `/revoke`,
  bot deletion limits (`18` §4, §13).
- Webhook facts: one receiver per bot, `drop_pending_updates=false` keeps updates queued at Telegram
  (`04` §6.3 item 7, DEC-17, Q-SEC-017).

## Implementation

1. `infra/production/runbooks/s2-cutover.md`: the `18` §6 table expanded into steps with: id, T-time, owner, exact
   command or action, expected output, abort criterion, sign-off cell. Application commands come from the development
   track: `php artisan telegram:intake pause|resume|status` and `php artisan delivery:cap <n>|off` (KV-TG-060), the
   buffered-update export (ids and types only, `18` §8.1 step 1), `php artisan telegram:health` (KV-TG-059), the
   migration and validation commands (KV-DB-026).
2. `infra/production/runbooks/s2-rollback.md`: `18` §8.1 steps with commands; §8.2 decision tree; the list of §8.3
   effects that need the product owner's acceptance before S2.
3. `infra/server/runbook.sh <env> <step-id>`: runs the machine steps of the runbook with logging (timestamp, step,
   exit code, output excerpt without secrets) to a run log kept in the production notes; refuses production unless
   `RUNBOOK_APPROVED_BY` names the first developer for that run.
4. Webhook steps use the Bot API from the production server only (T0.4 `setWebhook` with URL, `secret_token`,
   `allowed_updates` = `message`, `callback_query`, `my_chat_member`, `max_connections`, `drop_pending_updates=false`;
   T0.5 `getWebhookInfo`) — the token is read from the server `.env`, never printed. **Every production webhook call
   needs first developer approval** (ADR-0011); the switch itself is KV-INF-031.
5. Dry runs: R2 on staging with the staging bot, including a rollback before the point of no return; R3 without
   rollback, with the people who will run S2; each run timed per step; the freeze window must stay ≤ 80 % of the budget
   (`18` §4).
6. Communication templates of `18` §9 (ru, uz, en) attached to the runbook; sent by the legacy operator before T0 and
   by HOMI (KV-TG-055) only if the window overruns.

## Files

- `infra/production/runbooks/s2-cutover.md`, `infra/production/runbooks/s2-rollback.md` (new, production-owned)
- `infra/server/runbook.sh` (new)

## API contract

Bot API from the server: `deleteWebhook` (legacy operator, T0.1), `setWebhook`, `getWebhookInfo`; HOMI commands listed
in step 1.

## Business rules

`18` §1 principles (one side changes at a time, rehearsed first, one explicit point of no return, no silent loss);
BR-BOT-101 / BR-DATA-016 (no re-sends) checked by the re-send dry-run before GO.

## Acceptance criteria

- R2 completed with rollback; R3 completed; both with per-step timings and no step without an owner.
- Buffered updates during R2 processed exactly once and in order (KV-TG-060 drain report).
- The pending-updates-across-`/revoke` question answered and T0.3's position fixed in the runbook.
- The product owner signed the §8.3 list.

## Tests

| # | Rehearsal check | Expected |
| - | --------------- | -------- |
| 1 | `runbook.sh staging T-30m` | update processing paused, send cap 0, outputs logged |
| 2 | staging `deleteWebhook drop_pending_updates=false`, send 10 test updates, `setWebhook` | 10 rows in `telegram_updates`, 0 processed while paused |
| 3 | `runbook.sh staging GO+5m` | the 10 updates processed once, in `update_id` order per chat |
| 4 | rollback drill before GO + 5 min | staging bot back on the "legacy" receiver stand-in, HOMI rows exported (ids/types only) |
| 5 | `runbook.sh production T0.4` without `RUNBOOK_APPROVED_BY` | refused |

## Edge cases

- Telegram drops updates older than 24 h; a freeze window longer than that loses them — the budget stays far below.
- A token revocation that drops queued updates (if R2 shows it) moves T0.3 before T0.1 with < 1 minute between them.
- DNS propagation lag: proxied Cloudflare records switch by origin change; unproxied records need the TTL lowered at
  T−48 h (KV-INF-032).

## Security

SEC-REQ-012 (rotation in the runbook), SEC-REQ-034 (secrets never printed), SEC-REQ-048 (incident runbook rehearsed);
run logs contain no tokens, phones or update payloads.

## Definition of done

Runbooks merged on the production track's branch, R2 and R3 records attached, `18` §5.1 Operations row signed,
KV-DB-026 cross-referenced, the product owner's GO criteria (`18` §5.2) attached to the runbook.
