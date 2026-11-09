# KV-DB-027 — Erasure handling during the window

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PRIVACY-002, F-ANALYTICS-002 |
| Dependencies | KV-DB-014, KV-BE-050; Q-DATA-042 |

## Goal

A user who asked legacy to delete their data between the dump and the freeze is never present in HOMI: the replay list
is taken in without storing raw Telegram ids, matching users are excluded at extract and deleted from anything the bulk
load already wrote, the erasure ledger blocks any later re-import, and rehearsal copies holding them are destroyed.

## Legacy reference

- `14` §7.9 (between the dump and the freeze: the owner provides erased Telegram ids or keyed hashes since `W1`; HOMI
  excludes them at extract and deletes loaded rows; rehearsal copies destroyed; during the freeze: buffered bot
  updates; after the cut-over: HOMI handles erasures incl. the retained legacy dump and the PostHog person), §4.1 row
  "Erasure at extract", §4.2 row "Erasure", §2 row ENT-007 (migrate pending + replay), §6.3 V-RI-10.
- Rules: BR-DATA-031, BR-API-128, BR-API-129; ENT-007; Q-DATA-042 (what legacy erasure deletes), Q-API-048,
  Q-SEC-016 (votes of erased users).
- `18` §8.3 (erasures processed by HOMI must be replayed on legacy after a rollback).

## Implementation

1. Read `.ai/agents/security-reviewer.md` and `.claude/skills/laravel-queues/`.
2. Agree the replay-list format with the owner: preferred = HMAC-SHA-256 of the Telegram id under a key HOMI hands over
   for this purpose; acceptable = a list of raw ids delivered through the agreed encrypted channel **[PT]**, hashed in
   memory on the import host and never written in clear.
3. `php artisan make:command --no-interaction Migration/ErasureReplayCommand` (`migration:erasure-replay
   --list=<path>`): for each subject, (a) insert an `erasure_requests` row (`subject_hash`, `source = 'legacy_replay'`,
   `requested_at` from the list), (b) if a HOMI user matches, call `ErasureService` (KV-BE-050) — the same procedure as
   a user-initiated deletion, including the PostHog person deletion job, (c) add the subject to the extract filter so
   later runs exclude it.
4. Extract filter: the identity, radar, personal-list and delivery steps (KV-DB-014 … KV-DB-020) join `legacy_stage`
   rows against the ledger hashes and exclude matches with reason `erased`.
5. Import legacy pending erasure requests (ENT-007) with their status; pending PostHog deletions are re-queued.
6. Rehearsal copies: the command prints the list of copy locations that held a now-erased subject (from the run
   registry) so the production track destroys or re-creates them **[PT]**; the destruction is recorded with the run.
7. Order in the freeze window: delta load (KV-DB-023) → erasure replay → fast validation (KV-DB-022 V-RI-10).

## Files

- `backend/app/Console/Commands/Migration/ErasureReplayCommand.php` (new)
- `backend/app/Services/Migration/ErasureLedger.php` (new; HMAC lookups for the extract filter)
- `backend/tests/Feature/Migration/ErasureReplayTest.php` (new, `pgsql` group)

## API contract

An erased user's next Mini App launch is a first contact: `GET /api/meta` (API-001) creates a fresh user without any
migrated settings, radars or lists; `GET /api/favorites` returns `{items: [], next_cursor: null}`.

## Business rules

BR-DATA-031 and BR-API-129 (deleted from the database at once), BR-API-128 and BR-DATA-021 (PostHog person deletion);
votes of erased users per the KV-BE-049 ADR (Q-SEC-016). No DEV.

## Acceptance criteria

- A test erasure placed between dump and freeze disappears from every HOMI table after the replay (database-wide scan
  for the user id and Telegram id finds nothing) and V-RI-10 returns zero.
- A re-run of the bulk load after the replay does not re-import the subject.
- No raw Telegram id from the replay list is stored in any table, log or report.

## Tests

- `replay list of HMAC subjects creates erasure_requests and deletes the loaded user everywhere`.
- `raw-id list is hashed in memory; no raw id persists` (scan of tables and the log capture).
- `extract filter excludes erased subjects on the next run` (re-run writes nothing for them).
- `pending legacy erasure imported and its PostHog deletion re-queued` (fake).
- `V-RI-10 fails on a planted erased subject and passes after replay` (with KV-QA-018).
- `replay is idempotent: the same list twice changes nothing the second time`.

## Edge cases

- The subject never reached HOMI (erased before `W1` dump filter): ledger row only.
- The subject starts the bot again after the cut-over: a new user is created; old data does not come back (ledger
  blocks re-import, not new consent).
- Legacy rollback after the point of no return: HOMI-processed erasures are exported for replay on legacy (KV-DB-026).

## Security

SEC-REQ-039 (one deletion procedure, erasure ledger keyed by HMAC), SEC-REQ-041 (replay list through the agreed
channel, destroyed after use), SEC-REQ-047 (no raw ids in logs); the erasure-log key is a per-environment secret
(SEC-REQ-034).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4), docs and the feature rows in 09
updated, PR reviewed by the other developer. The replay was exercised in R2 and the copy-destruction records exist.
