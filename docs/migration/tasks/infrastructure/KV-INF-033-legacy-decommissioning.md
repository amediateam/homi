# KV-INF-033 — Legacy decommissioning and destruction records

| Field | Value |
| ----- | ----- |
| Status | TODO (starts at S2 + 72 h when the product owner closes the rollback window, DEC-18) |
| Owner | DevOps (track: production — first developer approves), with the product owner and the legacy operator |
| Complexity | S |
| Feature IDs | Technical migration task — stage S3 (`18` §2, §11): the legacy system and every copy of its personal data are gone, which the privacy promises (F-PRIVACY-002, F-PRIVACY-003) require |
| Dependencies | KV-INF-031, KV-INF-032 (switch done), KV-INF-026 (HOMI backups healthy); KV-DB-031 (destruction record, `14` §8), KV-DB-030 (owner-hash window); DEC-18 (rollback window), DEC-21 (support bot), Q-SEC-011, Q-DATA-044 |

## Goal

After the rollback window closes, the legacy backend and bot receiver are stopped, the legacy database, the final dump,
rehearsal and import databases, transfer buckets and media copies are destroyed with dated records, every secret the
legacy operator held is rotated or revoked, and the records needed as a parity baseline are kept.

## Legacy reference

- `18` §11 (decommissioning steps 1–6), `18` §7 (decommissioning is a one-way door), §8.4 (no rollback to legacy after
  S3); `14` §7.9 (destruction), SEC-019 (backups on a team computer), SEC-REQ-041 (dump handling and the record of who
  held it), Q-SEC-011, Q-DATA-044.
- Privacy promises: deleted data gone from backups in about two weeks (BR-BOT-094); legacy backups age out on the
  legacy side, confirmed by the operator.

## Implementation

1. GO + 72 h review (`18` §10): the product owner closes the rollback window (or extends it); the decision is recorded.
2. The legacy operator stops the legacy backend, bot receiver and jobs; the legacy origin stops answering (after the SEO
   contingency of DEC-15 ends, if it was used).
3. Destruction (with KV-DB-031): legacy database, final dump, rehearsal databases, the import database
   (`legacy_raw`, `legacy_stage`), transfer buckets, media copies; each with date, method, executor, witness — recorded
   in the production notes and summarised (no data) in `docs/migration/data/` if the product owner agrees.
4. Legacy backups: the operator confirms in writing when the last legacy backup ages out (≈ 2 weeks) and that no copy
   remains on personal devices (SEC-019).
5. Secrets: rotate or revoke the LLM key, PostHog personal key, Cloudflare tokens, registrar and DNS access, and any
   key the legacy operator held (`18` §11 step 3); confirm the old bot token is dead (KV-INF-031).
6. `@KvadroSupportBot`: migrated, kept by the legacy operator, or retired per DEC-21; links in bot texts follow.
7. Keep: the frozen spec, artefact manifests, the SEO archive, rehearsal reports (numbers only) as the parity baseline.
8. Owner-hash window (KV-DB-030) continues on its own schedule; the legacy hashes are deleted at its end.

## Files

- production notes (outside the repository); optional summary `docs/migration/data/decommissioning-record.md` (no data)

## API contract

n/a.

## Business rules

BR-BOT-094, BR-BOT-093 and the erasure replay rule (`18` §8.3 "Erasure requests processed by HOMI … must be replayed on
legacy after a rollback") — after S3 there is no legacy left to replay to.

## Acceptance criteria

- Every item of `18` §11 steps 1–6 has a dated record with an executor.
- The legacy origin no longer answers; `kvadro.app` and `app.kvadro.app` traffic is 100 % HOMI.
- No credential held by the legacy operator still works (spot checks recorded).
- The parity baseline records exist and are referenced from `docs/migration/`.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | request to the legacy origin address (allowed machine) | no answer / refused |
| 2 | old LLM / PostHog personal / Cloudflare tokens (spot check by the holder) | rejected |
| 3 | destruction record review against `14` §7.9 and KV-DB-031 | every copy listed and destroyed |
| 4 | operator's written confirmation of legacy backup expiry | present, dated |

## Edge cases

- The product owner extends the rollback window: everything waits; HOMI keeps running.
- The legacy operator cannot prove destruction of a copy: escalate to the product owner (legal, Q-SEC-005); record the
  residual risk.
- Support bot retained by the legacy operator: its takedown-request flow keeps feeding HOMI's ARM through the agreed
  channel (DEC-21).

## Security

SEC-019, SEC-REQ-041 (handling record), SEC-REQ-034 (rotated secrets), SEC-022 (token).

## Definition of done

`18` §11 records complete and signed by the product owner and the first developer, KV-DB-031 closed, `17` §15 item 14
ticked, S3 declared in `18`'s stage tracking by the product owner.
