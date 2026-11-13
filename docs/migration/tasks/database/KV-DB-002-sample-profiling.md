# KV-DB-002 — Profile a sanitised sample

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (KV-DB-001) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | Technical migration task — the transformation rules of `14` §4 need real enum values, code spellings, null rates and defect counts (`14` §1.1 P3; rehearsal R0 of `14` §7.4). Unblocks the data of F-FILTER-001, F-RADAR-002, F-SETTINGS-005, F-LISTING-001, F-PIPELINE-004, F-OWNER-001 |
| Dependencies | KV-DB-001; Q-DATA-003 |

## Goal

A profiling report of the owner-masked sample (≤ 1 000 rows per table, Telegram ids and phones replaced by consistent
fakes, texts truncated) is committed under `docs/migration/data/`, closing the `U` (unknown) fields of `06` and giving
every `06` §5.1 risk row a measured count; the same masked sample becomes the R0 input of every load task.

## Legacy reference

- Q-DATA-003 (sample), and through it Q-DATA-006 … Q-DATA-049 column questions; `06` §5 data-quality risks (encodings,
  code spellings, naive timestamps, price bases).
- LB-DATA-001 (code spellings), LB-DATA-003 (`posted_days`), LB-DATA-004 (`zone` radars), LB-DATA-007 (`tenant` on
  daily radars), LB-DATA-011 (twin radars), LB-DATA-012 (duplicate hides/votes), LB-DATA-019 (price bases),
  LB-DATA-020 (district source) — each needs a measured count.
- `14` §1.2 (personal-data handling), §6.6 (change budget reviewed after R1 — the sample gives the first estimate).

## Implementation

1. Read `14` §1.2, §4 and `.ai/agents/postgis-geo-engineer.md`; agree the masking script with the owner (KV-DB-003 rules):
   Telegram ids → consistent fake 64-bit ids, phones → `+998 00 …` fakes with a consistent mapping, texts truncated to 40
   characters, analytics ids → fake random strings.
2. **[PT]** The owner runs the masking script and hands over the masked sample through the agreed channel; it is stored
   outside the repository (local PostgreSQL database `legacy_sample`, never in CI artefacts), marked sanitised by a
   `_sanitised` marker table that the import commands check (SEC-REQ-041).
3. Create `scripts/migration/profile_sample.sql` (repository, no data): per table and column — null rate, distinct count,
   top 20 values for low-cardinality columns, min/max for numbers and timestamps, pattern classes for codes
   (`[a-z_]+` vs `[a-z-]+`), JSON key sets of `jsonb` columns.
4. Add the defect counters of `06` §5.1: radars with `zone`, radars with `posted_days` not null, radars with keys invalid
   for their deal (BR-API-028/029), twin radars per user (same canonical filters without `posted_days`), duplicate
   (user, listing) rows in favourites/hidden/votes, listings whose `price_usd` basis is unclassifiable, naive timestamp
   columns, Uzbek apostrophe variants.
5. Run the script on the sample; write `docs/migration/data/legacy-profile-<date>.md` with the results (counts and value
   lists only — no row content beyond dictionary codes).
6. Update `06`: `U` fields resolved, statuses upgraded, new `LB-DATA-…` items for defects not yet listed (each with a
   DEV or defect row requested in `09`).
7. Record the expected change-rule volumes per rule of `14` §4.2 (input for the change budget of `14` §6.6).

## Files

- `scripts/migration/profile_sample.sql` (new; queries only)
- `docs/migration/data/legacy-profile-<date>.md` (new)
- `docs/migration/06-database-schema.md`, `docs/migration/14-data-migration-plan.md` (facts) — docs PR

## API contract

n/a — profiling only. The value lists found feed the golden fixtures of KV-QA-002 (enum sets of `08` §1.7–§1.8).

## Business rules

Measures, without changing anything: BR-DATA-009 (25-key filters), BR-DATA-011 (filter consistency), BR-DATA-014
(quiet/digest encodings), BR-DATA-015 (`uz_Latn`), BR-DATA-017 (per-user sets), BR-DATA-019/020 (aliases,
publications), BR-DATA-024 (history keys), BR-DATA-025 (photo numbering from 0).

## Acceptance criteria

- Every table of KV-DB-001 has a profile section; every `06` field marked `U` is either resolved or has a reason.
- Each LB-DATA item listed above has a measured count (or "not present in the sample").
- The report contains no Telegram id, phone, name or listing text — only codes, counts and value classes.
- The masked sample is stored outside the repository and its location and deletion date are recorded in the report.

## Tests

- `scripts/migration/profile_sample.sql` runs on an empty copy of the KV-DB-001 schema without errors (all counts 0).
- A grep of the report for phone patterns and 9+ digit runs returns nothing.
- Spot check recorded in the report: three counters re-computed by hand on the sample agree with the script.

## Edge cases

- The masking script breaks referential consistency (different fakes for the same Telegram id in two tables): the
  profile flags orphan counts and the sample is re-requested.
- Tables too large for 1 000-row sampling to show rare defects (twin radars): ask for targeted counts on the full
  database instead (aggregate queries only).
- Mixed-script names (Cyrillic and Latin Uzbek) and NUL characters in texts: counted, fixed later by the text rule of
  `14` §4.1.

## Security

- SEC-REQ-041: only the masked sample is used locally; it is deleted after R0 and the deletion is recorded.
- SEC-REQ-036: the profile reports value classes, never personal values.
- No PII in logs: the profiling script runs in `psql`, output reviewed before commit.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: R0 inputs (the masked sample) available to the
load tasks, the profile reviewed by the developer, `06`/`14` updated with the confirmed facts.
