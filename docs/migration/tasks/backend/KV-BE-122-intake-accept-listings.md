# KV-BE-122 — `IntakeAcceptService` and `POST /api/v1/intake/listings`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PIPELINE-001 |
| Dependencies | KV-BE-121; HANDOFF T2 (this task is the accept half of T2); existing tables `sources`, `source_listings`, `intake_requests`, `intake_events`; KV-DB-008 (FK `source_listings.listing_id`) |

## Goal

A collector (and the in-repo reader through the same service) can hand HOMI a batch of 1–100 listing payloads: each is
validated per record, the raw payload is stored before any processing, `source_listings` is upserted by
`(source, external_id)`, an `Idempotency-Key` replay returns the stored first response, and processing is queued on
`ingest` after commit — the HTTP answer is `202` with HOMI ids and per-record outcomes.

## Legacy reference

- Legacy acquisition: 217 public channels (BR-API-042); new listings ~1 050 a day (`01` §1, `10` §4.10 sizing).
- Target: ADR-0009 decisions 1–4, 7; HANDOFF T2 "Result" and "Done when"; `10` §4.9 "Intake: raw payload,
  `source_listings` upsert and idempotency row in one transaction; processing jobs dispatched `afterCommit()`";
  `15` §3.4 #10 (same event or idempotency key twice → one listing, first response replayed).
- HOMI code: `backend/database/migrations/2026_11_08_171043_create_source_listings_table.php`,
  `…171044_create_intake_requests_table.php`, `…171045_create_intake_events_table.php`, `backend/app/Models/Source.php`,
  `backend/app/Models/IntakeRequest.php`, `backend/app/Models/IntakeEvent.php`, limiter `intake`
  (`backend/app/Providers/AppServiceProvider.php:69`).

## Implementation

1. Read `.ai/agents/intake-pipeline-engineer.md` (rules 1–5, 8, 9, 15), `.claude/skills/laravel-best-practices/`,
   `.claude/skills/laravel-queues/`, `.claude/skills/scramble-development/`, ADR-0007 and `docs/api/intake.md`
   (KV-BE-121). Write the Pest tests first.
2. `php artisan make:class Services/Intake/IntakeAcceptService --no-interaction`:
   `accept(Source $source, list<array> $records, ?string $idempotencyKey): IntakeAcceptResult`.
   - With a key: look up `intake_requests (source_id, idempotency_key)`; a hit with the same request hash returns the
     stored response; a hit with a different body hash → `422` `idempotency_key_reused`.
   - Per record (agent rule 4, one `try/catch` each): validate against payload v2 (`IntakePayload::fromArray`), reject
     with a reason code (`invalid_<field>`, `channel_opted_out` — checked against `source_channels.opted_out_at` when
     the channel is known, `phone_opted_out` through KV-BE-138 when present, `schema_version_unsupported`); accepted →
     upsert `source_listings` (`INSERT … ON CONFLICT (source_id, external_id) DO UPDATE … WHERE source_version IS
     DISTINCT FROM`, agent rule 5 / postgis rule 5) and insert one `intake_events` row (`event_type` `created` or
     `updated`, `payload` raw jsonb, `schema_version`, `source_version`, `status` `received`).
   - Same `content_hash` as the last stored event of that listing → outcome `duplicate`, no new event (agent rule 3).
   - A record whose `source_version` is lower than the stored one → stored with `status` `stale` (kept for audit, never
     processed), outcome `stale`.
   - Everything for the batch in one transaction; `ProcessIntakeEvent` (KV-BE-124) dispatched per accepted event with
     `->afterCommit()` on `config('intake.queue')`.
   - Write `intake_requests` (counts received / accepted / duplicates / stale / rejected, duration, response body)
     — the import log of agent rule 5; failure rate > 1 % → warning log, > 5 % → `IntakeSourceDegraded` event
     (metric in KV-BE-142).
3. `php artisan make:request Api/V1/Intake/StoreIntakeListingsRequest --no-interaction`: envelope-level validation only
   (`listings` array 1–`batch_max`, body ≤ `max_body_bytes` → `413` in the envelope); records are validated by the
   service so one bad record never fails the batch.
4. `php artisan make:controller Api/V1/Intake/IntakeListingController --no-interaction` (extends `ApiController`):
   `store()` → `202 {success, data: {request_id, results: [{external_id, id, outcome, errors?}]}}`.
5. Routes in `routes/api.php` under `v1/intake` with `auth:sanctum`, `ability:intake:write`, `throttle:intake`
   (shared file — announce in the PR). The token's `Source` is the actor (`$request->user()` is a `Source`).
6. `php artisan make:resource Api/V1/Intake/IntakeResultResource --no-interaction`; Scramble picks up the endpoint
   (`docs/api/openapi.json` regenerated if T3 exists).
7. `arch()` rule: `App\Services\Intake` never imports `App\Models\Listing` writers (Listings is reached through events
   and KV-BE-134 only).

## Files

- `backend/app/Services/Intake/IntakeAcceptService.php`, `backend/app/Domain/Intake/IntakeAcceptResult.php`,
  `backend/app/Events/Intake/IntakeSourceDegraded.php` (new)
- `backend/app/Http/Controllers/Api/V1/Intake/IntakeListingController.php`,
  `backend/app/Http/Requests/Api/V1/Intake/StoreIntakeListingsRequest.php`,
  `backend/app/Http/Resources/Api/V1/Intake/IntakeResultResource.php` (new); `backend/routes/api.php`
- additive migration if needed: `add_request_hash_and_counts_to_intake_requests_table`
- `backend/tests/Feature/Intake/IntakeListingAcceptTest.php`, `backend/tests/Feature/Intake/IntakeIdempotencyTest.php`
  (new)

## API contract

- `POST /api/v1/intake/listings` — headers `Authorization: Bearer <intake token>`, `Idempotency-Key` (recommended,
  ≤ 128 chars); body `{"listings": [IntakePayload v2, …]}` (1–100).
- `202 {"success": true, "data": {"request_id": "<ulid>", "results": [{"external_id": "…", "id": "<source_listing
  ulid>", "outcome": "accepted|duplicate|stale|rejected", "errors": {"field": ["code"]}?}]}}`.
- `401` no token; `403` token without `intake:write`; `413` body too large; `422` envelope invalid (0 or > 100
  records, `idempotency_key_reused`); `429` with `Retry-After` from the `intake` limiter. Replay → the stored body and
  status, byte-identical.

## Business rules

- ADR-0009 §3 (raw stored before normalisation), BR-DATA-020 (identity by channel + post id, carried in the payload),
  BR-DATA-022 (opted-out channels never reappear — refused at the door), CF-016 demand posts accepted and stored.
- Defect fixes: none (new capability).

## Acceptance criteria

- One invalid record in a batch of 10 → 9 accepted, 1 rejected with a reason, `intake_requests` counts match.
- The same request with the same `Idempotency-Key` twice → one set of rows, the second response equals the first.
- No `ProcessIntakeEvent` job is dispatched when the transaction rolls back.
- An opted-out channel's post is rejected and no `source_listings` row is created.

## Tests

- `IntakeListingAcceptTest`: `no_token_is_401`, `token_without_intake_write_is_403`, `empty_batch_is_422`,
  `batch_of_101_is_422`, `body_over_5mb_is_413`, `valid_batch_returns_202_with_ids`, `one_bad_record_does_not_fail_batch`,
  `raw_payload_stored_before_processing`, `jobs_dispatched_after_commit` (`Queue::fake`, `afterCommit`),
  `same_content_hash_is_duplicate_without_event`, `lower_source_version_is_stale`, `opted_out_channel_rejected`,
  `demand_post_accepted_and_flagged`, `limiter_returns_429_with_retry_after`, `failure_rate_over_5_percent_raises_event`.
- `IntakeIdempotencyTest`: `replay_returns_stored_response` (`15` §3.4 #10), `reused_key_with_other_body_is_422`,
  `concurrent_same_key_creates_one_request` (`pgsql` group, KV-QA-008 kit), `same_external_id_in_two_batches_upserts_once`.

## Edge cases

- Two records with the same `external_id` in one batch: the later `source_version` wins; the earlier gets `stale`.
- A record that is valid but whose `channel.handle` is unknown: accepted; the channel is created inactive-for-review by
  KV-BE-126 (never auto-published from an unknown channel unless the source is `telegram_uz`/`datahub_uz` with trust).
- A replay arriving while the first request is still running: the second waits on the advisory lock of the key and
  then replays.
- Very long text: truncated at the cap with a `text_truncated` flag, never rejected.

## Security

- SEC-REQ-027 (`intake` limiter per token), SEC-REQ-036 and SEC-REQ-047 (raw phones never logged; rejected-record logs
  carry the first 500 characters of the payload with phones masked by `PiiMasker`, KV-BE-047), SEC-REQ-023 (media URLs
  validated against the host allowlist before they are stored), SEC-REQ-040 (opt-outs). Tokens are per source per
  environment (ADR-0009 §2).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), Scramble export updated (if T3 has landed), `docs/api/intake.md`
matches the behaviour, `09` row F-PIPELINE-001 updated, PR reviewed by the other developer; shared files
(`routes/api.php`) announced in the PR.
