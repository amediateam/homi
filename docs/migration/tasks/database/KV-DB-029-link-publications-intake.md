# KV-DB-029 — Link migrated publications to the new ingestion

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-02, intake contract) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-001, F-PIPELINE-003, F-LISTING-006 |
| Dependencies | KV-DB-016; CF-007, CF-016; HANDOFF T2 |

## Goal

After the cut-over, a post that the new ingestion receives for a channel post already known from the migration (same
channel, same post id) updates the migrated listing — same ULID, same public `number` — instead of creating a
duplicate; and collector data wins over the migrated `kvadro_legacy` provenance on conflict.

## Legacy reference

- `14` §2.1 option C (hybrid: migrate for identity and history; new publications attach by `(channel, post_id)` and by
  HOMI dedup, without changing ids), §1.1 P11, §4.2 rows "Listing" (`source_listings` row for source `kvadro_legacy`)
  and "Publication" (unique `(channel_id, post_id)`).
- `10` CF-007 (option C recommended, DEC-02), CF-016 (`sources` stay collectors; `source_channels`,
  `listing_publications`; intake payload carries `channel`, `post_id`, `posted_at`, raw text, `rent_period`; a
  `kvadro_legacy` source with the lowest trust weight).
- Rules: BR-DATA-020 (a publication is identified by (channel, post id) and belongs to one listing), BR-DATA-019,
  BR-API-049; Q-DATA-045 (who ingests after the cut-over and how payloads carry channel + post id), Q-DATA-025.
- HOMI today: `backend/database/migrations/2026_11_08_171042…171045_*` (intake tables), `backend/config/intake.php`.

## Implementation

1. Read `.ai/agents/intake-pipeline-engineer.md`, `.ai/agents/listing-matching-engineer.md`,
   `docs/api/intake-sources.md`.
2. Confirm with the intake contract (HANDOFF T2, `docs/api/intake.md`) that every listing event carries `channel`
   (handle or Telegram channel id) and `post_id`; add the requirement to that document's PR if missing (CF-016).
3. In the M6 ingestion entry (`ListingIngestService`, named by feature F-PIPELINE-003), add a first resolution step:
   `(source_channels by handle/id, post_id)` → existing `listing_publications` row → its listing; only when no row
   exists does dedup run. Implement it as `PublicationLocator` (`make:class --no-interaction`) used by that service.
4. When a migrated listing is matched: upsert the collector's `source_listings` row pointing at the same `listing_id`;
   keep the `kvadro_legacy` row; field conflicts resolved by `sources.trust_weight` (lowest for `kvadro_legacy`).
5. Seed the `kvadro_legacy` source with the lowest trust weight in `SourceSeeder` (coordinated with the M6 task that
   corrects the collector list — `geo_uz` removal is not done here).
6. Backfill check command `migration:check-publication-keys`: counts migrated publications without a `post_id`
   (unmatchable) and reports them; they fall back to dedup.

## Files

- `backend/app/Services/Listings/PublicationLocator.php` (new)
- `backend/app/Services/Listings/ListingIngestService.php` (changed — owned by M6; one call added)
- `backend/database/seeders/SourceSeeder.php` (`kvadro_legacy` row)
- `backend/app/Console/Commands/Migration/CheckPublicationKeysCommand.php` (new)
- `backend/tests/Feature/Listings/MigratedPublicationLinkTest.php` (new)

## API contract

Intake: `POST /api/v1/intake/*` per `docs/api/intake.md` (T2) — the HOMI id returned for a migrated post is the existing
listing's id. Legacy surface: the same `number` keeps answering `GET /api/listings/:id` (API-008) and its `history`
gains the new publication.

## Business rules

BR-DATA-020, BR-DATA-019, BR-API-049 (new publication feeds history and counters), BR-DATA-002 (numbers never change).
No DEV.

## Acceptance criteria

- A collector payload for a migrated post updates the existing listing (same ULID and `number`) in a staging test.
- A payload for an unknown post of a migrated channel creates a new listing or is merged by dedup — never matched by
  channel alone.
- No duplicate `(channel_id, post_id)` row is ever created (unique constraint + test).

## Tests

- `payload with known channel and post id attaches to the migrated listing`.
- `same payload twice is idempotent` (one publication row, one history event).
- `kvadro_legacy fields lose to collector fields on conflict; provenance rows kept`.
- `channel matched by handle case-insensitively and by telegram id`.
- `migrated publication without post_id reported by the check command`.

## Edge cases

- Channel renamed after the migration: match by Telegram channel id first, handle second.
- Post edited with a new price: a `price_down`/`price_up` event on the migrated listing (M6 rules).
- Post deleted at the source: `post_deleted` on the migrated listing (BR-API-067).
- Migrated listing already merged (alias): the publication resolves to the survivor.

## Security

SEC-REQ-023 (photo URLs from collector payloads fetched safely — M6), SEC-REQ-040 (opted-out channels never re-ingest
migrated posts); no PII in the check report.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed
by the other developer. The staging test with a collector payload for a migrated post is recorded in the R2 report.
