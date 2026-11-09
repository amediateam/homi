# KV-BE-123 — Intake lifecycle events, reconciliation read and `intake:token`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); token issuance in staging/production **[PT]** |
| Complexity | M |
| Feature IDs | F-PIPELINE-001, F-PIPELINE-006 |
| Dependencies | KV-BE-122 |

## Goal

A source can report what happened to a listing after it was pushed — `updated`, `withdrawn` (rented, sold, deleted at
the source), `duplicate_changed`, `media_added`, `post_deleted` — and HOMI applies those events in `source_version`
order whatever order they arrive in; a source can read back what HOMI stored for reconciliation; and an operator can
issue a scoped, expiring intake token for a source.

## Legacy reference

- Withdrawal and deletion: BR-API-065, BR-API-067 (`post_deleted: true`), BR-API-069 (`status_text`), BR-DATA-006
  (90-day clock starts at withdrawal), `$KVADRO_ROOT/docs/about.md:181-185`.
- ADR-0009 decision 1 (`POST /api/v1/intake/listings/{id}/events`, `GET /api/v1/intake/listings/{id}`), "Contract
  principles" (event types `created`, `updated`, `withdrawn`, `duplicate_changed`, `media_added`; order by
  `source_version`); HANDOFF T2 "out-of-order events"; `backend/config/intake.php:20` (`event_types`).
- `15` §3.5 #5 (price change re-ingested twice → one history event).

## Implementation

1. Read `.ai/agents/intake-pipeline-engineer.md` (rules 2–4, 14, 15) and the KV-BE-122 service. Tests first.
2. `config/intake.php`: add `post_deleted` to `event_types` and the withdrawal reasons `rented`, `sold`, `deleted`,
   `expired` (payload `{reason}`), documented in `docs/api/intake.md`.
3. `IntakeAcceptService::acceptEvent(Source, SourceListing, array $event, ?string $idempotencyKey)`:
   - `event_id` unique per source (`intake_events` gets a unique `(source_id, event_id)` — additive migration,
     `CONCURRENTLY` index); a replayed `event_id` → `200 {"duplicate": true}` and no work;
   - store the event raw with `status` `received`; if its `source_version` ≤ the listing's applied version it is stored
     `stale` and not processed (out-of-order older event); if it is newer than the next expected event, it is processed
     now (events carry full state, not deltas — `updated` replaces hints, `withdrawn` is terminal until a newer
     `updated` re-activates);
   - `source_listings.source_version` and `status` updated in the same transaction; `ProcessIntakeEvent` dispatched
     `afterCommit()`.
4. `php artisan make:controller Api/V1/Intake/IntakeEventController --no-interaction` (`store`) and
   `IntakeListingController@show` for reconciliation: what HOMI stored (`external_id`, `source_version`, `status`,
   `listing_id`, public `number` when published, `dedup.survivor_number` when merged, last event outcome, `photos`
   count) — no phones, no text.
5. `php artisan make:command Intake/IssueIntakeToken --no-interaction` → `intake:token {source} --expires=90d`:
   creates a Sanctum token on the `Source` with ability `intake:write` only and an expiry, prints it once, never logs
   it; refuses `--env=production` unless `--confirm-production` is passed **[PT]**; `--revoke-all` revokes the
   source's tokens.
6. Route `POST v1/intake/listings/{sourceListing}/events` and `GET v1/intake/listings/{sourceListing}` scoped to the
   token's source (a listing of another source → `404`, SEC-REQ-014 pattern).

## Files

- `backend/app/Services/Intake/IntakeAcceptService.php` (`acceptEvent`)
- `backend/app/Http/Controllers/Api/V1/Intake/IntakeEventController.php`,
  `backend/app/Http/Requests/Api/V1/Intake/StoreIntakeEventRequest.php`,
  `backend/app/Http/Resources/Api/V1/Intake/SourceListingResource.php` (new); `IntakeListingController@show`
- `backend/app/Console/Commands/Intake/IssueIntakeToken.php` (new)
- migration `add_event_id_unique_to_intake_events_table`; `backend/config/intake.php`; `docs/api/intake.md`
- `backend/tests/Feature/Intake/IntakeEventTest.php`, `IntakeReconciliationTest.php`, `IssueIntakeTokenTest.php` (new)

## API contract

- `POST /api/v1/intake/listings/{id}/events` — body `{"event_id": "<uuidv7>", "event_type": "updated|withdrawn|
  duplicate_changed|media_added|post_deleted", "source_version": int, "occurred_at": iso, "payload": {…}}` →
  `202 {"success": true, "data": {"outcome": "accepted|stale"}}`; replayed `event_id` → `200 {"success": true, "data":
  {"duplicate": true}}`; foreign or unknown id → `404`; `422` envelope for invalid events.
- `GET /api/v1/intake/listings/{id}` → `200 {"success": true, "data": SourceListingResource}`.
- Auth and limiter as KV-BE-122.

## Business rules

- BR-API-065 / BR-DATA-006 (withdrawal starts the 90-day clock — applied by KV-BE-137), BR-API-067 (`post_deleted`),
  ADR-0009 ordering by `source_version`. User feedback does not flow back to collectors (ADR-0009 open item, default
  no).

## Acceptance criteria

- Events `v3, v1, v2` arriving in that order leave the listing in the state of `v3`; `v1` and `v2` are stored `stale`.
- A replayed `event_id` changes nothing and answers `200 duplicate`.
- A token from source A cannot read or post events for a listing of source B (`404`).
- `intake:token` prints a token once; the database holds only Sanctum's hash; the token works only on intake routes.

## Tests

- `IntakeEventTest`: `withdrawn_event_queues_processing`, `out_of_order_older_event_is_stale`,
  `newer_updated_after_withdrawn_reactivates`, `replayed_event_id_is_duplicate`, `price_change_reingested_twice_one_event`
  (`15` §3.5 #5, with KV-BE-134), `foreign_source_listing_is_404`, `unknown_event_type_is_422`,
  `post_deleted_event_sets_flag_path` (job faked).
- `IntakeReconciliationTest`: `shows_status_version_and_number`, `merged_listing_shows_survivor_number`,
  `response_contains_no_phone_or_text`.
- `IssueIntakeTokenTest`: `token_has_only_intake_write`, `token_expires`, `production_requires_confirm_flag`,
  `revoke_all_revokes`.

## Edge cases

- `withdrawn` for a listing that HOMI already merged into a survivor: the publication of this source is marked
  withdrawn; the survivor stays active while another publication is active (KV-BE-137 decides).
- `duplicate_changed` from `telegram.uz`: recorded as a hint for KV-BE-135 (never a merge on its own).
- `media_added` after the photos were purged (90 days): ignored with outcome `stale`.
- Clock skew: `occurred_at` in the future → accepted, ordering still by `source_version`.

## Security

- SEC-REQ-014 (source-scoped lookups), SEC-REQ-027 (limiter), SEC-REQ-034 (per-environment tokens), SEC-REQ-047 (token
  never logged, command output not captured in logs).

## Definition of done

Tests green (`make ci-backend`), `docs/api/intake.md` updated for events and reconciliation, `09` rows F-PIPELINE-001
and F-PIPELINE-006 updated, PR reviewed by the other developer.
