# KV-BE-124 — `ProcessIntakeEvent` state machine and the ingest job chain

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-001, F-PIPELINE-002, F-PIPELINE-003 |
| Dependencies | KV-BE-122, KV-BE-123 |

## Goal

Every stored intake event moves through one explicit state machine (`received → processing → processed | rejected |
failed`, plus `stale` and `deferred`) driven by `ProcessIntakeEvent` on the `ingest` queue, which runs the fixed
pipeline order — pre-parse → extraction → normalisation → geo → publish → dedup → photos — as small chained steps with
defined retries, so a poison payload never blocks a queue and any event can be re-processed from its raw payload.

## Legacy reference

- Pipeline order of the legacy system (`02` §8, §18: extraction per new post, dedup, geocoding, photo download,
  `$KVADRO_ROOT/docs/about.md:167-178`); HOMI order from ADR-0009 decision 4 (normalisation → geo → dedup → publish →
  stats/radar) and `10` §4.10 (`ProcessIntakeEvent`, `ResolveGeo`, `MatchDuplicates`, `PublishListing` on `ingest`;
  `ExtractListingFields` on `llm`; `CopyListingPhoto` on `media`).
- `15` §3.5 (event reprocessing), `15` §3.6 #10 (concurrent number allocation happens in KV-BE-134).

## Implementation

1. Read `.ai/agents/intake-pipeline-engineer.md` (rules 4, 6, 10, 15), `.claude/skills/laravel-queues/`,
   `.claude/skills/configuring-horizon/`. Tests first.
2. `php artisan make:enum Enums/Intake/IntakeEventStatus --no-interaction`: `Received`, `Processing`, `Processed`,
   `Rejected`, `Failed`, `Stale`, `Deferred` (deferred = waiting for the LLM budget or kill switch to return).
3. `php artisan make:job Intake/ProcessIntakeEvent --no-interaction` (`ShouldQueue`, `ShouldBeUnique` by event id,
   queue `ingest`, `tries` 3, `backoff` [10, 60, 300], `timeout` 120): claims the row atomically
   (`UPDATE … SET status='processing' WHERE id=? AND status IN ('received','deferred')`), skips anything else.
4. Steps as invokable pipeline stages (`app/Services/Ingest/Stages/*`, `make:class`), each idempotent and each writing
   its output to an `ingest_runs` row (`event_id`, `stage`, `status`, `output jsonb`, `error_code`, `duration_ms`) so a
   retry resumes after the last completed stage:
   1. `PreParse` (KV-BE-128) — deterministic fields, phones → HMAC + encrypted, owner hashtags, demand detection;
   2. `Extract` (KV-BE-129) — dispatches `ExtractListingFields` on `llm` and returns; the LLM job re-dispatches
      `ProcessIntakeEvent` for the next stage (no worker waits on the LLM);
   3. `Normalise` (KV-BE-131); 4. `ResolveGeo` (KV-BE-132); 5. `Publish` (KV-BE-134, raises `ListingPublished`);
   6. `MatchDuplicates` (KV-BE-135, after publish so the card is visible at once — a later merge redirects);
   7. `FetchPhotos` (KV-BE-127, `media` queue, does not block publication; listings publish with `photos: []` until
      copied).
   Lifecycle events (`withdrawn`, `post_deleted`, `media_added`, `duplicate_changed`) skip to the matching stage
   (KV-BE-137, KV-BE-127, KV-BE-135).
5. Poison handling: a validation failure in any stage → `rejected` with `error_code`, no retry; an exception →
   retries, then `failed` (Horizon failed jobs keep the payload, agent rule 6); a `rejected`/`failed` event never blocks
   newer events of the same listing (they are processed independently by version).
6. `php artisan make:command Intake/ReprocessEvents --no-interaction` → `intake:reprocess {--event=} {--source=}
   {--status=failed} {--since=} {--from-stage=}`: resets selected events to `received` and re-dispatches, in chunks of
   500; dry-run by default.
7. `ingest_runs` migration (`php artisan make:migration create_ingest_runs_table --no-interaction`), monthly partitions
   via KV-DB-035 or a 30-day prune (`Prunable`), BRIN on `created_at` (postgis rule 6).
8. Horizon: `supervisor-ingest` exists; add `supervisor-llm` only if KV-BE-047 has not (shared file, announce in the
   PR).

## Files

- `backend/app/Jobs/Intake/ProcessIntakeEvent.php`, `backend/app/Enums/Intake/IntakeEventStatus.php`,
  `backend/app/Services/Ingest/IngestPipeline.php`, `backend/app/Services/Ingest/Stages/*.php` (stage contracts; the
  stage bodies are filled by KV-BE-127…KV-BE-137), `backend/app/Models/IngestRun.php` (new)
- `backend/app/Console/Commands/Intake/ReprocessEvents.php` (new); migration `create_ingest_runs_table`
- `backend/tests/Feature/Ingest/ProcessIntakeEventTest.php`, `backend/tests/Feature/Ingest/ReprocessEventsTest.php` (new)

## API contract

n/a (internal jobs). `intake:reprocess` options as above; output counts only.

## Business rules

- ADR-0009 §3–§4 (raw first, asynchronous processing, re-processing never needs the collector), BR-API-044 («без
  догадок»: a failed extraction leaves fields empty instead of guessing), CF-016 (demand posts stop after `PreParse`
  with status `processed`, outcome `demand_stored`).

## Acceptance criteria

- An event is processed by exactly one worker even when its job is dispatched twice.
- A stage exception on attempt 1 and success on attempt 2 completes the event without repeating completed stages.
- A payload that fails validation in `Normalise` ends `rejected` after one attempt; the batch and other events are
  unaffected.
- `intake:reprocess --status=failed --dry-run` lists without changing; without `--dry-run` it re-queues.

## Tests

- `ProcessIntakeEventTest`: `claims_row_once_under_double_dispatch`, `runs_stages_in_fixed_order` (stage fakes record
  order), `resumes_after_last_completed_stage`, `validation_error_rejects_without_retry`, `exception_retries_then_fails`,
  `demand_post_stops_after_preparse`, `lifecycle_event_skips_to_status_stage`, `stale_event_never_processed`,
  `llm_stage_does_not_block_worker` (`Queue::fake` asserts `ExtractListingFields` on `llm`),
  `deferred_event_resumes_when_budget_returns`, `photos_do_not_block_publication`.
- `ReprocessEventsTest`: `dry_run_changes_nothing`, `reprocess_failed_requeues_in_chunks`, `from_stage_skips_earlier_stages`.

## Edge cases

- An `updated` event arrives while the `created` event of the same listing is still in `Extract`: the newer one waits
  (per-listing `WithoutOverlapping` middleware keyed by `source_listing_id`) and then supersedes the older output.
- LLM kill switch on (KV-BE-047): `Extract` returns "no extraction"; the event continues with pre-parse fields only and
  is marked for re-extraction (`deferred_extraction` flag) — ingestion continues (SEC-REQ-044).
- Horizon restart mid-stage: the `processing` row older than the job timeout is reclaimed by a scheduled
  `intake:reclaim-stuck` (every 5 min) back to `received`.

## Security

- SEC-REQ-044 (degrade without extraction), SEC-REQ-047 (stage errors logged with event id and code, never payload
  text or phones), SEC-REQ-038 (`ingest_runs.output` holds no raw text; it is pruned with the event's PII).

## Definition of done

Tests green (`make ci-backend`), the job graph documented in `docs/api/intake.md` (processing section), Horizon change
announced, `09` rows F-PIPELINE-001…003 updated, PR reviewed by the other developer.
