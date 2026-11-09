# KV-DB-026 — Cut-over and rollback runbook

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (KV-DB-025) |
| Owner | Backend (track: development) with DevOps (track: production) |
| Complexity | M |
| Feature IDs | Technical migration task — S2 for every P0 feature; bot and delivery parts F-BOT-012, F-DELIVERY-005, F-PRIVACY-002 |
| Dependencies | KV-DB-025; `18` |

## Goal

The S2 cut-over and both rollback paths exist as one step-by-step runbook with exact commands, owners, timings and
checkpoints, plus the two exports a rollback needs (buffered update list; HOMI-side writes since the point of no
return); the runbook has been dry-run on staging including a rollback before the point of no return.

## Legacy reference

- `14` §7.6 (cut-over sequence T−14 d … GO + 24 h), §7.7 (point of no return), §7.8 (rollback before and after the
  point of no return, export of `favorites`, `radars`, `user_settings`, `hidden_listings`, `blocked_authors`,
  `listing_votes`, `found_answers`, erasure requests), §7.9 (erasures during the window).
- `18` §6 (S2 runbook table with owners PO, PT, DEV, LO), §7 (one-way doors: token rotation, decommissioning), §8.1 and
  §8.2 (rollback steps), §8.3 (what cannot be rolled back), §9 (communication), §10 (monitoring window).
- Decisions: DEC-05, DEC-15, DEC-16, DEC-17, DEC-18; questions Q-SEC-001, Q-SEC-017, Q-SYS-001.

## Implementation

1. Write `docs/migration/runbooks/s2-cutover.md`: one row per step of `18` §6 with the exact command (artisan,
   `curl` to the Bot API with the token taken from the vault at run time — never written in the runbook), owner,
   expected output, checkpoint, and the abort condition that jumps to the rollback section.
2. Write `docs/migration/runbooks/s2-rollback.md`: `18` §8.1 and §8.2 as steps with commands and owners; the erasure
   replay on legacy after a rollback is mandatory (`18` §8.3).
3. `php artisan make:command --no-interaction Migration/ExportBufferedUpdatesCommand`: lists `telegram_updates` rows
   received since T0 as `update_id`, type and timestamp only (no payload) for the legacy operator.
4. `php artisan make:command --no-interaction Migration/ExportPostCutoverWritesCommand --since=<point-of-no-return>`:
   writes per entity of `14` §7.8 the rows created or changed after the point of no return, keyed by Telegram id and
   legacy listing number (the format the legacy operator can re-apply by hand), encrypted at rest, delivered through
   the agreed channel **[PT]**; erasure requests are exported as their HMAC subjects plus a separate, minimal list
   handed over out of band.
5. Operational switches used by the runbook, checked to exist (owned by other tasks, named by feature): legacy-surface
   maintenance mode for mutations (F-COMPAT-001), send cap and `notifications` pause (F-DELIVERY-002), `telegram` queue
   pause (F-BOT-012).
6. Dry-run the runbook on staging inside R2 (with the rollback) and R3 (without); fold every correction back.
7. Agree the communication templates of `18` §9 and the war-room roster of `18` §10 with the product owner (text owned
   by the product owner; this task only references them).

## Files

- `docs/migration/runbooks/s2-cutover.md` (new)
- `docs/migration/runbooks/s2-rollback.md` (new)
- `backend/app/Console/Commands/Migration/{ExportBufferedUpdatesCommand,ExportPostCutoverWritesCommand}.php` (new)
- `backend/tests/Feature/Migration/RollbackExportsTest.php` (new)

## API contract

n/a for the runbook itself; its smoke steps call the legacy routes listed in `18` §5.2 and expect the `08` shapes.

## Business rules

BR-DATA-031 (erasures replayed in every direction), BR-DATA-016 (no re-send: deliveries resume only with the send cap),
BR-API-008 (`initData` bound to the token: one reopen after rotation is expected).

## Acceptance criteria

- Every step of `18` §6 and §8 has a command or a manual action with an owner, an expected result and a checkpoint.
- The runbook contains no secret value, token, real id or phone.
- The dry-run on staging (R2 with rollback, R3 without) completed with recorded timings and every correction merged.
- The two export commands produce files without message texts, names or phones (except where the legacy operator needs
  a Telegram id to re-apply a write, which the PO approved in DEC-18).

## Tests

- `buffered update export lists ids and types only` (no payload field in the output).
- `post-cutover export contains only rows changed after the given instant` (frozen clock).
- `post-cutover export covers every entity of 14 §7.8` (coverage list in the test).
- `erasure requests exported as HMAC subjects`.
- Runbook dry-run evidence from KV-DB-025.

## Edge cases

- Failure between T0.3 (token revoked) and GO: rollback hands the new token to the legacy operator through the vault
  (`18` §7, DEC-05).
- SEO gate failed but everything else passed: DEC-15 contingency steps (proxy SEO paths to the legacy origin ≤ 14 days).
- Rollback after the point of no return: fix-forward is the default; the export is produced even if not used.

## Security

SEC-REQ-012 (token custody and rotation), SEC-REQ-034 (secrets only from the vault at run time), SEC-REQ-039 (erasure
replay after rollback), SEC-REQ-041 (exports encrypted, handed over through the agreed channel, destroyed after use);
every production step **[PT]** with explicit approval (ADR-0011).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed
by the other developer. Dry-run on staging including a rollback before the point of no return recorded; runbook signed
by the developer, the first developer and the product owner.
