# KV-DB-032 — Publications, price events, status events and takedowns schema

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-LISTING-006, F-PIPELINE-003, F-PIPELINE-006, F-CONTACT-002, F-ADMIN-002, F-DELIVERY-006 |
| Dependencies | KV-DB-008 |

## Goal

The listing history tables split off from the KV-DB-008 candidate exist: `listing_publications` (one row per channel
post, natural key `(channel_id, post_id)`), `listing_price_events` (the price timeline behind `history[]`),
`listing_status_events` (state changes and their cause) and `takedown_requests` (author and channel removals that must
never come back).

## Legacy reference

- ENT-025 (publication, `06:631-652`), ENT-026 (history event, `06:653-671`), ENT-034 (status, `06:832-848`), ENT-037
  (takedown, `06:866-875`); mapping `06` §4.2 lines 1240-1241, 1247, 1250.
- `ListingDetails.history[] {at, channel (no @), url, text?, kind? (published|price_down|price_up), price_usd!,
  change_pct!}`, `stats {days_listed, publications, channels, views?}`, `sources[] {url, handle}!`, `original_url`,
  `post_deleted`, `status_text` (`08` §1.8).
- BR-API-047, BR-API-049, BR-API-065 … BR-API-069, BR-DATA-020 (publication key), BR-DATA-022 (takedowns never
  reappear), BR-DATA-024 (history keys always present), BR-DATA-030 (ISO UTC `Z`).
- Migration rules `14` §4.2 rows "Publication", "History event", "Takedown"; V-SUM pattern for publications
  (`channel handle:post_id:listing number`, `14` §6.2).
- Open: Q-API-019 (merge), Q-API-023 (withdrawn listing response), Q-DATA-045 (publication keys for new ingestion).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 3, 5, 6, 7) and `.ai/agents/listing-matching-engineer.md`
   (merges re-point publications).
2. `php artisan make:model ListingPublication -mfs --no-interaction`: `id` ULID, `listing_id` FK, `channel_id` FK
   `source_channels`, `post_id bigint`, `url`, `published_at`, `text` (nullable — purged at 90 days),
   `price_amount bigint`, `price_currency char(3)`, `deleted_at` (post deleted at the source); unique
   `(channel_id, post_id)`; index `(listing_id, published_at)`.
3. `php artisan make:model ListingPriceEvent -mfs --no-interaction`: `id` bigint identity, `listing_id`, `at`,
   `kind` (`published`, `price_down`, `price_up`), `channel_id` nullable, `url` nullable, `price_usd_cents bigint`
   nullable, `change_pct numeric(6,2)` nullable; index `(listing_id, at)`; idempotency key unique
   `(listing_id, at, kind)` so re-ingesting the same change twice writes one row (`15` §3.5 #5).
4. `php artisan make:model ListingStatusEvent -mfs --no-interaction`: `id`, `listing_id`, `from_status`,
   `to_status`, `cause` (`source_deleted`, `votes_rented`, `takedown`, `merge`, `expired`, `operator`, `legacy`),
   `actor` (system / user id / admin id as text, never a Telegram id), `at`; BRIN on `at` (append-only, rule 6).
5. `php artisan make:model TakedownRequest -mfs --no-interaction`: `id` ULID, `scope` (`listing`, `author`,
   `channel`), `listing_id`, `author_id`, `channel_id` (one set per scope; check constraint), `requested_via`
   (`support_bot`, `email`, `arm`, `legacy`), `requested_at`, `processed_at`, `processed_by`; index on each target.
6. Factories (`ListingPublication` states `deleted()`, `uzs()`; `ListingPriceEvent` states `priceDown()`,
   `priceUp()`), seed a short synthetic timeline per seeded listing.
7. Pint, PHPStan, tests.

## Files

- `backend/database/migrations/<ts>_create_listing_publications_table.php`, `…_create_listing_price_events_table.php`,
  `…_create_listing_status_events_table.php`, `…_create_takedown_requests_table.php` (new)
- `backend/app/Models/{ListingPublication,ListingPriceEvent,ListingStatusEvent,TakedownRequest}.php`; `Listing` gains
  `publications()`, `priceEvents()`, `statusEvents()`
- `backend/database/factories/*`, `backend/database/seeders/ListingHistorySeeder.php`
- `backend/tests/Feature/Database/ListingHistorySchemaTest.php`

## API contract

n/a for endpoints — the tables must produce `history[]` with `at` (ISO-8601 UTC `Z`), `channel` (display handle
without `@`), `url` (`https://t.me/<channel>/<post>`), `kind`, `price_usd`, `change_pct` (keys always present),
`stats.days_listed` (from `first_seen_at`), `stats.publications`, `stats.channels`, `sources[]` (`{url, handle}`),
`original_url`, `post_deleted` and `status_text` inputs for API-008 (`08` §1.8).

## Business rules

Keep BR-API-049, BR-API-067 (deleted post → `post_deleted: true`), BR-DATA-020 (a publication belongs to exactly one
listing), BR-DATA-022, BR-DATA-024. DEV-014 (`PROPOSED`, Asia/Tashkent display of history dates) affects only
formatting; storage stays UTC (ADR-0006).

## Acceptance criteria

- A second publication with the same `(channel_id, post_id)` is rejected (re-ingestion attaches, never duplicates).
- The same price change recorded twice yields one event.
- A takedown row targets exactly one of listing, author or channel.
- Deleting is never the path for listings (stubs stay); status events are append-only (no update path in the model).

## Tests

- `ListingHistorySchemaTest`: `it('rejects a duplicate channel post')`, `it('records one price event per change')`,
  `it('requires exactly one takedown target')`, `it('keeps publication text nullable for the 90-day purge')`,
  `it('orders history by at')`.
- `pgsql` group: BRIN on `listing_status_events.at` exists; `(listing_id, published_at)` used by the details query
  (EXPLAIN on synthetic data).

## Edge cases

- Reposts of the same flat in another channel: another publication row on the same listing.
- A merge moves publications to the survivor; the unique key prevents duplicates after re-pointing.
- `change_pct` with more than two decimals or above ±9 999.99: rounded / capped by the writer, never an overflow error.
- A source post whose `post_id` is unknown for migrated rows: derived from the URL (`14` §4.2).

## Security

SEC-REQ-038 (publication `text` and `url` purged with the listing PII after 90 days; status events keep no text),
SEC-REQ-040 (takedowns block re-ingestion), SEC-REQ-019 (URLs stored as received, allow-listed on output), no Telegram
ids in `actor`.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note in the PR.
