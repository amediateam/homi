# KV-DB-008 — Listings schema

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-LISTING-001, F-FEED-001, F-FILTER-001, F-FILTER-003, F-FILTER-006, F-MAP-001, F-MAP-002, F-SHARE-002, F-HIDE-002, F-OWNER-002, F-PIPELINE-003, F-PIPELINE-004 |
| Dependencies | KV-DB-004, KV-DB-005, KV-DB-006 |

## Goal

The listing core exists: `listings` with the preserved public `number`, `listing_aliases`, `listing_authors`,
`source_channels`, the number sequence and the feed/search indexes, plus the FK from the existing
`source_listings.listing_id`. Scope note: the candidate in `14` §8 also listed publications, price events, status
events and takedown requests — they moved to KV-DB-032; photos and translations moved to KV-DB-033, so each task fits
one session.

## Legacy reference

- ENT-023 (listing, `06:560-616`), ENT-024 (alias, `06:617-627`), ENT-028 (location, `06:690-713`), ENT-029
  (attributes, `06:714-738`), ENT-030 (author, `06:739-755`), ENT-034 (status, `06:829-845`), ENT-040 (channel,
  `06:890-910`); mapping `06` §4.2 lines 1238-1240, 1243; forced design `06` §4.3 items 1–3, 5, 7, 8.
- Ids: BR-DATA-002, BR-DATA-019, BR-API-048, LB-API-011; sequences and gaps `14` §3; V-RI-1, V-RI-2, V-RI-8, V-RI-9
  (`14` §6.3).
- Money and deal: BR-DATA-008, BR-API-153, BR-API-156 (`down_payment`), LB-DATA-019 (`price_basis`), CF-005, CF-016.
- Location: BR-API-050, BR-API-051, BR-DATA-036, LB-DATA-020 (`district_source`), `.ai/agents/postgis-geo-engineer.md`
  rules 11–14.
- Authors and owners: BR-DATA-005, BR-DATA-028, BR-API-108, BR-API-109; channels and opt-outs BR-API-043,
  BR-DATA-022; owner hashtags BR-API-046.
- PII: BR-API-065, BR-DATA-006 (90-day erase), LB-DATA-009 (phones encrypted + HMAC).
- HOMI: `backend/database/migrations/2026_11_08_171043_create_source_listings_table.php:24` (`listing_id` ULID, no
  FK), `…171042_create_sources_table.php`.
- Open: Q-DATA-002 (gap sizing), Q-DATA-017 (author key), Q-DATA-023 (source currency), Q-DATA-038 (views counter).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 1–3, 5–8, 11–14), `.claude/skills/laravel-database-optimization/`,
   the accepted ADRs of KV-DB-004 and KV-DB-005.
2. `php artisan make:model SourceChannel -mfs --no-interaction`: `id` bigint identity, `telegram_id bigint` unique
   nullable, `handle` (lower-cased match key, unique), `display_handle`, `title`, `city_id` FK nullable,
   `owner_hashtags text[]` (pgsql; json fallback), `is_new_build_channel`, `opted_out_at`, `collector_source_id` FK
   `sources`, timestamps.
3. `php artisan make:model ListingAuthor -mfs --no-interaction`: `id` bigint identity, `kind` (`phone`, `source`),
   `phone_hmac bytea` unique nullable, `phone_encrypted text` nullable (encrypted cast with a dedicated key),
   `channel_id` FK nullable, `realtor_mark_at`, `realtor_mark_source` (`votes`, `legacy`, `operator`),
   `distinct_flats int` default 0; check constraint: `kind = 'phone'` ⇒ `phone_hmac` not null, `kind = 'source'` ⇒
   `channel_id` not null.
4. Migration `create_listings_number_sequence` (pgsql): `CREATE SEQUENCE listings_number_seq START 1`; the real start
   value is set after the final delta (`14` §3 SQL) by the migration runbook, never by this migration.
5. `php artisan make:model Listing -mfs --no-interaction` (`HasUlids`): columns of the fixed design —
   `number bigint unique not null` default `nextval('listings_number_seq')` on pgsql (SQLite: application-assigned
   in the factory); `deal` (`sale`, `rent`), `rent_period` (`long`, `daily`, null), `property_type`; `price_amount
   bigint`, `price_currency char(3)`, `price_usd_cents bigint`, `exchange_rate_id` (FK added in KV-DB-011),
   `price_basis`, `price_kind` (`down_payment`, null); `rooms`, `area_total numeric(8,2)`, `land_area_sotka`,
   `floor`, `floors_total`, `market` (`new`, `secondary`), `renovation_type_id`, `furnished`, `appliances text[]`,
   `tenant_only`, `pets_policy`, `deposit`, `commission`, `conditions`; `location geography(Point,4326)`,
   `geo_radius_m`, `city_id`, `district_id`, `district_source` (`polygon`, `landmark`, `text`, `legacy_unknown`),
   `quarter_id`, `place_id`, `metro_station_id` (FKs to KV-DB-034 tables added there), `metro_km`, `center_km`;
   `title_source`, `summary`, `original_text`, `language`; `phone_encrypted`, `author_id`, `contact_url`,
   `contact_paid`; `owner_status` (`owner`, `agent`, `unknown`), `video`, `post_deleted`; `status` (`active`,
   `withdrawn`, `rented`, `sold`, `taken_down`, `merged`), `withdrawn_at`, `pii_purged_at`, `first_seen_at`,
   `last_published_at`, `views_count`; timestamps. `fillfactor 85` (update-heavy, rule 3).
6. `php artisan make:model ListingAlias -mfs --no-interaction`: `alias_number bigint` PK, `listing_id` FK
   (ULID), `merged_at`, `reason`; trigger-free invariant enforced by a check in the service and V-RI-2 (an alias
   number is never a live listing number).
7. Indexes in separate migrations with `$withinTransaction = false` and `CREATE INDEX CONCURRENTLY`, each with the
   query it serves in a comment (rule 6): GiST on `location`; partial `(city_id, deal, rent_period, first_seen_at
   desc, number desc) WHERE status = 'active'` (default feed); partial `(city_id, deal, rent_period, price_usd_cents,
   number) WHERE status = 'active'` (`cheap`/`expensive`, price filters); GIN on `appliances`; `(author_id)`,
   `(status, withdrawn_at)` (90-day purge).
8. Additive FK `source_listings.listing_id → listings.id` with `NOT VALID` then `VALIDATE CONSTRAINT` (rule 1).
9. Factories: `Listing` states `rentLong()`, `rentDaily()`, `sale()`, `withdrawn()`, `takenDown()`, `merged()`,
   `withoutLocation()`, `uzsPosted()`, `downPayment()`; `ListingAuthor` states `phone()`, `source()`; seeders create a
   small synthetic set (no real phones: `+998 00 …`, `15` §1.7).
10. `ListingNumberSequenceTest` documents the runbook SQL by executing it on synthetic data (pgsql group).

## Files

- `backend/database/migrations/<ts>_create_source_channels_table.php`, `…_create_listing_authors_table.php`,
  `…_create_listings_number_sequence.php`, `…_create_listings_table.php`, `…_create_listing_aliases_table.php`,
  `…_add_listings_indexes.php`, `…_add_listing_fk_to_source_listings.php` (new)
- `backend/app/Models/{Listing,ListingAlias,ListingAuthor,SourceChannel}.php`; `SourceListing` gains `listing()`
- `backend/database/factories/*`, `backend/database/seeders/ListingSeeder.php`
- `backend/tests/Feature/Database/ListingSchemaTest.php`, `backend/tests/Feature/Pgsql/ListingSchemaPgsqlTest.php`,
  `backend/tests/Feature/Pgsql/ListingNumberSequenceTest.php`

## API contract

n/a for endpoints — the columns must produce every `ListingPreview` and `ListingDetails` field of `08` §1.8 that is not
derived elsewhere: `id` (= `number`, JSON integer), `price` source data, `price_kind`, `rooms`, `area_total`,
`floor`, `floors_total`, `pets_ok`, `is_owner`, `video`, `lat`/`lon` (from `location`), `metro_km`, `center_km`,
`deal_type`, `market_code`, `geo_radius_m`, `author {kind, label, count}`, `contact_url`, `contact_paid`, `summary`,
`original_text`, `post_deleted`, `phone` (decrypted only by the details service). Market fields come from KV-DB-011,
history/sources from KV-DB-032, photos from KV-DB-033.

## Business rules

Keep BR-DATA-002 (numbers unique, never reused), BR-DATA-019 (aliases resolve), BR-DATA-020 (publication key — table in
KV-DB-032), BR-DATA-022 (opted-out channels never reappear), BR-DATA-028 (author = phone else channel), BR-DATA-036,
BR-API-156. Apply LB-DATA-009, LB-DATA-019, LB-DATA-020 (defect fixes, `APPROVED`). DEV-007 (`PROPOSED`, no raw phone
in v1) does not change the schema: the encrypted phone is needed for the call page either way.

## Acceptance criteria

- A listing gets a number from the sequence; a number equal to an alias number is rejected by the service guard and
  detected by V-RI-2.
- After running the `14` §3 `setval` on synthetic data, the next number is above every live and alias number (V-RI-9).
- The feed query `WHERE status='active' AND city_id=? AND deal=? AND rent_period=? ORDER BY first_seen_at DESC, number
  DESC LIMIT 21` uses the partial index (EXPLAIN in the pgsql group).
- `source_listings.listing_id` references `listings.id`.
- No plaintext phone column exists anywhere in the listing tables.

## Tests

- `ListingSchemaTest` (SQLite): factories for every state; `it('rejects a duplicate number')`, `it('requires phone_hmac
  for phone authors and channel for source authors')`, `it('stores money as integer cents with a currency')`,
  `it('keeps rent_period null for sale')`.
- `ListingSchemaPgsqlTest` (`pgsql`): GiST and partial indexes valid; EXPLAIN of the default feed, `cheap` sort, a
  polygon query (`ST_Covers`) and an `appliances @>` query shows index use on 5 000 synthetic rows; `location` is
  `geography(Point,4326)`; `migrate:rollback` works.
- `ListingNumberSequenceTest` (`pgsql`): 50 concurrent inserts get unique numbers (`15` §3.6 #10, with KV-QA-008);
  `setval` per `14` §3 places the sequence above `max(number)` and `max(alias_number)` (V-RI-9).

## Edge cases

- Listings without coordinates (`location` null) stay searchable by district and are absent from the map.
- Merged tombstones (`status = merged`, no content) reserve numbers whose survivor is missing (`14` §4.2 "Alias").
- `price_usd_cents` null for "price on request" (`priced: false` on the map).
- Handles differing only in case map to one channel (Telegram usernames are case-insensitive).

## Security

SEC-REQ-036 (phones only encrypted + HMAC with a per-environment pepper, `PHONE_ENCRYPTION_KEY`,
`PHONE_HMAC_PEPPER` — `17` §4), SEC-REQ-038 (`withdrawn_at`, `pii_purged_at` support the 90-day purge),
SEC-REQ-040 (opt-outs). Seeds use synthetic numbers only (SEC-REQ-041).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist with EXPLAIN plans pasted; data-impact
note (new FK on `source_listings`) in the PR.
