# KV-DB-024 — Rehearsal R1

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (dump, legal basis) |
| Owner | Backend (track: development) with DevOps (track: production) |
| Complexity | M |
| Feature IDs | Technical migration task — first full-data run for every migrated feature (F-ACCESS-003, F-SETTINGS-001, F-FAV-001, F-HISTORY-001, F-HIDE-001 … F-HIDE-003, F-REPORT-001, F-RADAR-001, F-DELIVERY-005, F-LISTING-001, F-LISTING-006, F-MEDIA-001, F-OWNER-002) |
| Dependencies | KV-DB-014…022, KV-DB-036, KV-DB-037 |

## Goal

The full production dump is restored into the isolated import database on staging and loaded end to end into the
staging HOMI database; every step is timed, every transformation rule's change volume is counted, the validation
suite runs, and the developer reviews a data-quality report that also updates `06` with the confirmed legacy facts.

## Legacy reference

- `14` §7.4 row R1 (full production dump, staging, production-grade controls P4 and P5, exit: report reviewed, `06`
  updated), §6.6 change budget ("an unexpected rule volume stops the rehearsal"), §7.1 tooling, §7.3 load order, §1.2
  personal-data handling.
- `18` §4 row R1 (legacy Mini App artefacts on `kvadro-app.staging.homi.uz` against the HOMI legacy surface, opened from
  the staging bot; landing mirror on `kvadro.staging.homi.uz`; smoke scenarios pass; timings recorded).
- Blockers: `14` §1.1 P1–P5, P9, P12; Q-DATA-001 … Q-DATA-005, Q-DATA-026, Q-DATA-050; DEC-13.

## Implementation

1. **[PT]** Receive the encrypted dump through the agreed channel (KV-DB-003), record its SHA-256 in `migration_runs`,
   restore it into the import database (`legacy_raw`) with the read-only role (KV-DB-012).
2. Build `legacy_stage` from `legacy_raw` with the extract filters of `14` §4.1 (erasure list, 90-day retention,
   takedown stubs) — the extract scripts of KV-DB-014 … KV-DB-020, KV-DB-036.
3. Run the KV-DB-013 driver into an empty staging HOMI schema (`migrate:fresh` on staging is a **[PT]** action with
   explicit approval) in the `14` §7.3 order; the photo copy (KV-DB-017) runs in parallel from step 3 on.
4. Run `migration:rebuild-derived` and the comparisons (KV-DB-021), then `migration:validate` (KV-DB-022) and the
   business and API checks that are possible without production access (KV-DB-037; production-side samples only with
   the P14 test account and approval).
5. Fill the timing table per step (`step | rows | duration | rows/s | peak DB load | notes`) and the change-volume table
   per rule from `migration_changes`.
6. Smoke on staging (`18` §4 R1): staging bot → legacy Mini App artefacts → meta, feed, a listing, a signed photo,
   favourites of a sampled migrated test user (staging impersonation only), a call link.
7. Write the R1 report (counts, timings, change volumes, check results, data-quality findings) to the rehearsal record
   location agreed with the production track (not in the repository); commit only a redacted summary:
   `docs/migration/rehearsals/R1-summary.md` with numbers and decisions, no ids or texts.
8. Update `06` with the facts the real schema proved (a separate docs PR) and close the `U` fields and Q-DATA items it
   answers.
9. **[PT]** Destroy the restored copies after the report is accepted (`14` §1.2) and record it.

## Files

- `docs/migration/rehearsals/R1-summary.md` (new, redacted summary only)
- `docs/migration/06-database-schema.md` (updated in a follow-up docs PR with confirmed facts)
- No application code beyond fixes found during the run (each fix is its own PR)

## API contract

The staging legacy surface answers the smoke requests of step 6 with migrated data: API-001, API-004, API-008,
API-029, API-009 and RES-001 with the shapes of `08` and the strict keys present.

## Business rules

All BR-DATA rules exercised by the steps; change volumes per DEV-gated rule (DEV-003, DEV-004, DEV-009, DEV-010,
DEV-017) are reported for the developer's decision, never applied silently.

## Acceptance criteria

- Every zero-tolerance check of `14` §6.6 passes or has a recorded root cause and a fix PR before R2.
- The timing table covers every step and the total bulk-load duration is known.
- The change-volume table is reviewed and signed by the developer (no unexplained rule volume).
- `06` lists the confirmed facts; every Q-DATA item R1 answered is closed in its owning document.
- Destruction of the R1 copies is recorded.

## Tests

- The KV-DB-022 suite and KV-DB-037 checks run against R1 data (results in the report).
- A second load of the same R1 stage into an empty schema yields identical fingerprints (repeatability, `14` §7.2).
- Smoke checklist of `18` §4 R1 executed and recorded.

## Edge cases

- Dump larger than expected (Q-DATA-050): photo copy runs in parallel and may exceed R1; record and plan R2 capacity.
- Unresolvable dictionary codes: run error by design (`14` §4.1 "Codes") — fix the alias table (KV-DB-015), re-run.
- Naive timestamps in an unexpected zone (Q-DATA-035): stop, fix the time rule, re-run.

## Security

SEC-REQ-041 (dump only on production-track infrastructure, never on laptops, in CI artefacts or agent context);
SEC-REQ-036 (no PII in reports or the committed summary); staging uses the staging bot and a separate PostHog project
(`14` P12); access to the import database is audited **[PT]**.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed
by the other developer. The R1 report is reviewed by the developer and the first developer, `06` is updated, and the
destruction record exists.
