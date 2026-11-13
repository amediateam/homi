# KV-BE-165 — Retention and erasure registry for the M4, M6 and M7 tables

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); log and backup retention **[PT]** |
| Complexity | M |
| Feature IDs | F-PRIVACY-003, F-PRIVACY-002 |
| Dependencies | KV-DB-028 (listing PII purge, partition drops), KV-BE-050 (erasure registry and scan), KV-BE-049 (retention ADR, DEC-12), KV-BE-150 (`user_action_log`); tables of KV-BE-047, KV-BE-125, KV-BE-135, KV-BE-136, KV-BE-153, KV-BE-156, KV-BE-110 |

## Goal

Every table the M4, M6 and M7 tasks add has a written, scheduled and time-travel-tested retention rule or an explicit
"kept, because" entry, and every one of them that holds a user link is in the erasure registry — so the `/privacy`
promises hold for the whole HOMI schema, not only for the tables KV-DB-028 already purges.

## Legacy reference

- Public promises `$KVADRO_ROOT/docs/about.md:264-275` (`/privacy`: action log 180 days without texts; withdrawn
  listings 90 days, then phone, text, photos erased; «Удалить мои данные» immediately, backups about two weeks; PostHog
  deletion) and the photo-copy promise «до 30 дней» (LB-LND-012, `PRV:66`).
- Rules: BR-API-065, BR-API-125, BR-API-129, BR-DATA-004, BR-DATA-006, BR-DATA-031, BR-BOT-093, BR-BOT-094;
  OPQ-5 answered by CF-019 (`10` §3.19).
- Requirements: SEC-REQ-038 (one Pest time-travel test per rule), SEC-REQ-039 (erasure covers every user-linked
  table), SEC-REQ-044 (LLM audit rows without raw text; Q-SEC-010), SEC-REQ-047.
- Already covered elsewhere (not repeated here): listing PII purge, `bot_listing_messages` of purged listings,
  partition drops of `user_action_log` and `bot_listing_messages`, legacy owner hashes (KV-DB-028); `telegram_updates`
  14-day prune (telegram track, KV-TG-003); erasure procedure and the initial registry (KV-BE-050).
- Open: Q-SEC-010 (audit trail vs the 90-day erase), Q-SEC-016 (votes of erased users), Q-DATA-042.

## Implementation

1. Read the KV-BE-049 ADR, the KV-DB-028 and KV-BE-050 tasks, `.ai/agents/security-reviewer.md`,
   `.claude/skills/laravel-queues/`.
2. `config/retention.php` — a registry parallel to `config/erasure.php`: per table `{column, age, action:
   delete|null_columns|drop_partition, columns?, reason}` or `{kept: "<reason>"}`. Entries added by this task (values
   `PROPOSED` in the KV-BE-049 ADR, adjustable there):
   - `llm_calls`: delete after 180 days (KV-BE-047 note; holds masked-input hashes and outputs only).
   - Matching review candidates (KV-BE-135): delete 90 days after resolution; unresolved rows of purged listings
     deleted with the purge.
   - Merge shadow log (KV-BE-136): `null_columns` on the revert payload 30 days after `revertable_until`; ids, reason
     codes and confidence kept while the alias exists (the redirect needs them; no PII).
   - Collector raw page cache and fetch logs (KV-BE-125), if stored: delete after 7 days (raw HTML contains phones);
     `collector_cursors`: kept (channel and post ids only).
   - `intake_requests` (idempotency ledger, KV-BE-122): delete after 30 days (collectors never replay older keys —
     stated in `docs/api/intake.md`).
   - Raw `intake_events` of posts never published (demand posts, rejected records): payload text and phone fields
     redacted 90 days after `received_at` (they have no withdrawal date, so KV-DB-028's rule never reaches them).
   - `radar_pending_items` (KV-DB-009, released by the planner of KV-BE-110): delete 30 days after `released_at`.
   - `csp_report_counters` (KV-BE-153): delete after 30 days.
   - Landing snapshots (KV-BE-156): 30-day cap enforced by `landing:prune-snapshots`; registered here as a file rule
     so the policy test sees it.
   - `erasure_requests`: kept (HMAC subject only; needed to replay legacy erasures and refuse re-import, ENT-007).
   - `seo_slices`, `price_index_points`, `market_medians`, `listing_market`: kept (aggregates, no personal data).
3. `php artisan make:command Privacy/PurgeOperationalData --no-interaction` (`privacy:purge-operational`): walks the
   registry, deletes in 10 000-row batches by indexed age columns (never one huge `DELETE`), logs counts per table,
   records a metric; scheduled daily 04:30 `Asia/Tashkent` with `onOneServer()->withoutOverlapping()`.
4. Policy test `RetentionRegistryTest` (`pgsql`): introspects every table of the schema and fails when a table has
   neither a retention rule, a KV-DB-028 rule, nor a `kept` reason — so later modules cannot add an unbounded table.
5. Erasure registry entries in `config/erasure.php` for every user-linked table added by M4, M6 and M7 that KV-BE-050
   does not list: `user_action_log` (delete — if KV-BE-150 has not added it), the reviewer / operator columns of the
   matching review and takedown tables (`anonymise`), any per-user table M4 adds beyond KV-DB-009 (checked by the
   KV-BE-050 scan). The KV-BE-050 `ErasureRegistryTest` and the database-wide scan must stay green.
6. Horizon failed-job retention: `horizon.trim.failed` ≤ 7 days and a test that M4/M6/M7 job payloads carry ids only
   (no phone, text or Telegram id serialised) — `PROPOSED` config change in a shared file, announced in the PR.
7. **[PT]** application logs 30 days and Telescope entries 48 h where enabled (SEC-REQ-038), backups ≤ 14 days — the
   production track confirms in the runbook; this task lists them in the PR for review.

## Files

- `backend/config/retention.php` (new), `backend/config/erasure.php` (entries), `backend/config/horizon.php` (`trim`)
- `backend/app/Console/Commands/Privacy/PurgeOperationalData.php` (new); `backend/routes/console.php`
- `backend/tests/Feature/Privacy/{OperationalRetentionTest,JobPayloadPrivacyTest}.php`,
  `backend/tests/Feature/Pgsql/RetentionRegistryTest.php` (new)

## API contract

n/a.

## Business rules

- Kept: BR-API-125, BR-DATA-004 (180 days), BR-API-065, BR-DATA-006 (90 days), BR-API-129, BR-DATA-031 (deletion),
  the 30-day photo-copy promise (LB-LND-012).
- No DEV; the retention values above are `PROPOSED` in the KV-BE-049 ADR (DEC-12) and adjustable there.

## Acceptance criteria

- For each rule: data at `age − 1 s` is untouched and at `age + 1 s` is gone (or redacted) after `schedule:run`.
- `RetentionRegistryTest` fails on a new table without a rule or reason and passes on the current schema.
- The erasure scan of KV-BE-050 finds no user-linked row after erasure, including the M4/M6/M7 tables.
- No M4/M6/M7 job payload in `failed_jobs` contains a phone pattern, listing text or Telegram id.

## Tests

- `OperationalRetentionTest`: one time-travel test per rule — `llm_calls_deleted_after_180_days`,
  `resolved_match_candidates_deleted_after_90_days`, `merge_revert_payload_nulled_30_days_after_window_ids_kept`,
  `collector_page_cache_deleted_after_7_days`, `intake_requests_deleted_after_30_days`,
  `unpublished_intake_payload_redacted_after_90_days`, `released_pending_items_deleted_after_30_days`,
  `csp_counters_deleted_after_30_days`, `landing_snapshot_rule_registered_and_enforced`, each with `± 1 s` around the
  boundary and one run at 19:00 UTC (Tashkent midnight) to prove instant-based ages; `second_run_is_noop`;
  `batches_of_10000`.
- `RetentionRegistryTest` (`pgsql`): schema introspection vs both registries.
- `JobPayloadPrivacyTest`: serialised payloads of the M4/M6/M7 jobs (dataset) contain ids only.
- KV-QA-017 rows: retention and deletion scans include these tables.

## Edge cases

- A table appears in both registries (retention and erasure): both apply; erasure is immediate, retention is the
  ceiling.
- A purge batch fails half-way: each batch is its own transaction; the next run continues.
- Clock skew between web and worker hosts: ages compare database `now()` with stored `timestamptz`.
- Q-SEC-010 answered with a longer audit trail: only `llm_calls` changes (config), outputs stay without raw text.

## Security

- SEC-REQ-038, SEC-REQ-039, SEC-REQ-044, SEC-REQ-047; Q-SEC-010, Q-SEC-016 recorded in the PR.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (`15` §4) for F-PRIVACY-003 (remaining
rules) and the registry part of F-PRIVACY-002, the retention table of the KV-BE-049 ADR updated, docs and the feature
rows in `09` updated, PR reviewed by the other developer and the security reviewer.
