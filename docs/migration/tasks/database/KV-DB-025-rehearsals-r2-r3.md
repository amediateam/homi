# KV-DB-025 — Rehearsals R2 and R3

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (KV-DB-024) |
| Owner | Backend (track: development) with DevOps (track: production) |
| Complexity | M |
| Feature IDs | Technical migration task — the S1 exit for every P0 feature (`09` §2.1); bot cut-over parts: F-BOT-012, F-DELIVERY-005 |
| Dependencies | KV-DB-023, KV-DB-024 |

## Goal

Two end-to-end rehearsals on staging prove the cut-over: R2 runs the whole switch with a fresh dump, a simulated delta,
the staging bot, the frozen legacy Mini App build, and a rollback before the point of no return; R3 (dress) repeats it
without the rollback, with the final runbook and the people who will run S2, inside 80 % of the window budget.

## Legacy reference

- `14` §7.4 rows R2 and R3 (exit: all §6 checks pass; freeze-window steps within budget; R3 ≤ 80 % of the window),
  §7.6 (cut-over sequence), §7.7 (point of no return), §7.8 (rollback), §7.9 (erasure during the window).
- `18` §4 (R2 switch rehearsal: `deleteWebhook`, BotFather `/revoke`, `setWebhook` with `drop_pending_updates=false`,
  buffered updates with the queue paused, DNS simulated by switching the staging aliases, rollback §8.1), §5.1 (S1 exit
  criteria), §5.2 (in-window GO), §6 (runbook), "To verify in R2" in §13 (pending updates across a token revocation).
- Decisions: DEC-05 (token rotation), DEC-17 (pending updates), DEC-18 (rollback window); `14` P12 (staging bot,
  staging Mini App URL, separate PostHog project).

## Implementation

1. **[PT]** Fresh full dump at `W1`, restored into the staging import database; bulk load and validation as in R1.
2. Simulate legacy activity after `W1` on the stage copy (scripted inserts, updates, deletes per entity) and run
   `migration:delta` (KV-DB-023) and the erasure replay (KV-DB-027).
3. Run the switch steps of `18` §6 on staging in order with the staging bot **[PT, approval for every webhook change]**:
   pause `telegram`, send cap 0, `deleteWebhook`, token revocation, `setWebhook` (`drop_pending_updates=false`,
   `allowed_updates` = `message`, `callback_query`, `my_chat_member`), buffered updates stored with contacts redacted,
   alias switch of `kvadro.staging.homi.uz` / `kvadro-app.staging.homi.uz`.
4. Fast validation subset and go/no-go with timings; then the parity runs against staging (reference-client scenarios
   when the runner is approved, landing scenarios, SEO comparison) and the bot checks of `18` §5.1.
5. **R2 only:** execute the rollback before the point of no return (`18` §8.1): export buffered update ids and types,
   alias back, `setWebhook` back with the new token, legacy (simulated) unfrozen, HOMI tables truncated; record timings.
6. **R2 only:** answer the "To verify in R2" items of `18` §13 (pending updates across a revocation; bot message
   deletion limits) and adjust the runbook order (T0.3 before T0.1 if needed).
7. **R3:** fresh dump ≤ 72 h before S2, the final runbook (KV-DB-026) executed by the S2 crew without rollback; the
   measured window must be ≤ 80 % of the budget.
8. After each rehearsal: report (timings, check results, incidents), runbook corrections, destruction of the copies
   **[PT]**.

## Files

- `docs/migration/rehearsals/R2-summary.md`, `docs/migration/rehearsals/R3-summary.md` (new, redacted summaries)
- `docs/migration/runbooks/s2-cutover.md` (corrections, owned by KV-DB-026)

## API contract

After the switch steps, staging answers the in-window smoke set of `18` §5.2 with `initData` signed by the **rotated**
staging token: `GET /api/meta` `200`, feed, a listing, a signed photo, a call link, radar create and delete; an
`initData` signed with the pre-rotation token gets `401 {"detail":"unauthorized"}` (SEC-REQ-012).

## Business rules

BR-DATA-016 (no re-send after the switch: dry-run zero rows), BR-DATA-031 (erasures replayed), BR-API-008 (`initData`
bound to the token). DEV entries apply per their state; the rehearsal never approves a DEV.

## Acceptance criteria

- R2 and R3 each pass every zero-tolerance check of `14` §6.6 and the re-send dry-run returns zero rows.
- Buffered updates are processed exactly once after the queue is resumed (R3) or exported and discarded (R2 rollback).
- R2's rollback restores the pre-switch state within the measured time; R3's total window ≤ 80 % of the budget.
- The `18` §5.1 table can be filled with evidence from R2 and R3 (the S1 exit is signed outside this task).

## Tests

- Validation suite (KV-DB-022) and business checks (KV-DB-037) on R2 and R3 data.
- Webhook dedup and contact redaction on buffered updates (`15` §3.3 #4, #10) on staging.
- Delivery pacing and re-send dry-run against the staging bot with the send cap (`18` §5.1 Bot row).

## Edge cases

- Token revocation drops pending updates (to verify): runbook reorders T0.3 before T0.1 with < 1 min gap.
- The delta exceeds the budget: switch the affected table to a full re-dump or extend the window (product owner).
- A parity scenario fails only with migrated data: fix forward and repeat R2 before R3.

## Security

SEC-REQ-012 (token rotation rehearsed; old `initData` refused), SEC-REQ-037 (buffered updates redacted), SEC-REQ-041
(copies destroyed after each rehearsal); staging never touches the production bot, DNS or data; every staging webhook
change approved by the first developer **[PT]**.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed
by the other developer. R2 and R3 reports reviewed by the developer, the first developer and the product owner; runbook
corrections merged; destruction records exist.
