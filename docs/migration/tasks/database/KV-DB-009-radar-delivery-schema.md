# KV-DB-009 — Radar and delivery schema

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-RADAR-001, F-RADAR-002, F-RADAR-003, F-RADAR-004, F-RADAR-005, F-HIDE-004, F-DELIVERY-001, F-DELIVERY-004, F-DELIVERY-005, F-DELIVERY-006 |
| Dependencies | KV-DB-007, KV-DB-008, KV-DB-035 |

## Goal

The radar and delivery tables exist so M4 (radars and delivery), M3 (erasure, `DELETE /api/hidden` leaving radar
rules untouched) and M8 (radar and delivered-card migration) can be built: `radars` with a preserved public number,
canonical 25-key filters and their structured copy, `radar_hide_rules`, `radar_deliveries`, the monthly-partitioned
`bot_listing_messages` and `radar_pending_items`.

## Legacy reference

- ENT-008 (radar, `06:280-334`), ENT-009 (hide rule, `06:335-353`), ENT-010 (delivered-card log, `06:354-380`),
  ENT-011 (pending delivery, `06:381-390`); mapping `06` §4.2 lines 1223-1226; forced design `06` §4.3 items 1, 2, 6.
- `Subscription {id, active, mode, filters (25 keys), hidden?}` and `SubscriptionMutationResult` (`08` §1.8);
  `SearchFilters` keys (`08` §1.7).
- BR-DATA-009 (25 keys), BR-DATA-010 (limit, `no_chat`), BR-DATA-012 (active/paused, instant/digest), BR-DATA-016
  (delivered once, addressable by `(chat_id, message_id)`), BR-API-076, BR-API-091, LB-DATA-002 (USD bounds),
  LB-DATA-004 (`zone` → `zones`), LB-DATA-006 (hide-rule scope), LB-DATA-011 (twin radars), LB-DATA-017 (`relaxed`
  analytics only).
- Migration rules: `14` §3 (radar `number`, `radars_number_seq`), §4.2 radar and delivered-card rows; V-SUM-3,
  V-SUM-4, V-RI-3, V-RI-4.
- Open: Q-BOT-017 / Q-DATA-041 (ids in callbacks), Q-DATA-013, Q-DATA-014 (delivered log and pending queue shapes),
  Q-API-014 (`posted_days` in matching).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 1, 3–7, 17), the KV-DB-004 and KV-DB-005 ADRs, KV-DB-035.
2. Migration `create_radars_number_sequence` (pgsql): `radars_number_seq`, start set by the runbook (`14` §3).
3. `php artisan make:model Radar -mfs --no-interaction` (`HasUlids`): `number bigint unique not null` default
   `nextval('radars_number_seq')` (pgsql), `user_id` FK cascade, `active`, `mode` (`instant`, `digest`), `filters_v1
   jsonb` (canonical 25-key object returned verbatim by legacy routes), structured copies `city_id`, `deal`,
   `rent_period`, `types text[]`, `district_ids bigint[]`, `zones text[]`, `area geography(Polygon,4326)`,
   `rooms_min`, `rooms_max`, `price_min bigint`, `price_max bigint`, `price_currency char(3)` (DEV-006 `PROPOSED`),
   `area_min`, `area_max`, `near_metro`, `below_median`, `owner`, `tenant`, `pets`, `pets_only`, `furnished`,
   `market`, `floor_not_first`, `floor_not_last`, `renovation text[]`, `appliances text[]`, `filters_hash bytea`
   with unique `(user_id, filters_hash)` (DEV-009 `PROPOSED` relies on it), `entry` (`filters`, `empty`, `few`,
   `prompt`), `relax_code`, `paused_at`, timestamps. SQLite fallback: array/geography columns as json/text, the
   structural tests run in the `pgsql` group.
4. Check constraint (pgsql): `(SELECT count(*) FROM jsonb_object_keys(filters_v1)) = 25` is not allowed in a CHECK
   (subquery), so add a `CHECK (jsonb_typeof(filters_v1) = 'object')` plus the V-RI-3 query as a test and a model
   `saving` guard that refuses a filter object without exactly the 25 keys.
5. Indexes (`CONCURRENTLY`, comments with the served query): GiST on `area`; partial `(active, mode) WHERE active`;
   `(user_id, created_at)`; GIN on `district_ids` and `types` for matching (M4 confirms with EXPLAIN).
6. `php artisan make:model RadarHideRule -mfs --no-interaction`: `radar_id` FK cascade, `kind` (`channel`,
   `district`, `author`), `channel_id`, `district_id`, `author_id` (exactly one set by kind, check constraint),
   `raw_value` (unresolved legacy value, `14` §4.2), `created_at`; unique `(radar_id, kind, channel_id, district_id,
   author_id)`. User-wide scope (DEV-034 `PROPOSED`) would add a nullable `user_id` scope later — note in the model.
7. `php artisan make:model RadarDelivery -mfs --no-interaction`: `user_id`, `listing_id`, `first_radar_id`
   nullable, `first_delivered_at`; unique `(user_id, listing_id)` — the "only new" dedup set (BR-DATA-016).
8. `php artisan make:model BotListingMessage -mfs --no-interaction`: parent table `PARTITION BY RANGE (sent_at)`
   (pgsql; plain table on SQLite) with `chat_id bigint`, `message_id bigint`, `user_id`, `listing_id`,
   `legacy_listing_number bigint` nullable, `radar_id` nullable, `origin` (`radar`, `starter`, `digest`, `fav`,
   `share`), `sent_at`, `state` (`sent`, `edited_withdrawn`, `deleted`), `edited_at`; unique `(chat_id, message_id,
   listing_id, sent_at)` (the partition key must be part of unique keys); index `(listing_id)` per partition for the
   «Объявление снято» fan-out; initial partitions created by `db:partitions:ensure bot_listing_messages` (KV-DB-035)
   in the migration's `up()`.
9. `php artisan make:model RadarPendingItem -mfs --no-interaction`: `user_id`, `radar_id`, `listing_id`,
   `matched_at`, `release_at` (computed in Asia/Tashkent by M4), `released_at`; unique `(user_id, listing_id)` while
   unreleased (partial unique `WHERE released_at IS NULL`).
10. Factories with states (`paused()`, `digest()`, `withPolygon()`, `legacyZone()` for migration tests) and a
    `RadarFactory` that always writes a valid 25-key `filters_v1` (default object of `08` §1.7).

## Files

- `backend/database/migrations/<ts>_create_radars_number_sequence.php`, `…_create_radars_table.php`,
  `…_create_radar_hide_rules_table.php`, `…_create_radar_deliveries_table.php`,
  `…_create_bot_listing_messages_table.php`, `…_create_radar_pending_items_table.php`, `…_add_radar_indexes.php`
- `backend/app/Models/{Radar,RadarHideRule,RadarDelivery,BotListingMessage,RadarPendingItem}.php`
- `backend/database/factories/*`, `backend/database/seeders/RadarSeeder.php`
- `backend/tests/Feature/Database/RadarSchemaTest.php`, `backend/tests/Feature/Pgsql/RadarSchemaPgsqlTest.php`

## API contract

n/a for endpoints — the columns must produce `Subscription.id` (= `number`, JSON integer), `active`, `mode`,
`filters` (all 25 keys, arrays non-null, `posted_days: null` per DEV-005 `PROPOSED`, prices in integer USD on legacy
routes), `hidden` (count of hide rules, BR-API-091) for API-018…API-023, and the delivered-card addresses
`(chat_id, message_id)` the bot edits (BOT-062).

## Business rules

Keep BR-DATA-009, BR-DATA-010, BR-DATA-012, BR-DATA-016, BR-API-076, BR-API-091. Apply LB-DATA-002 (bounds with
currency), LB-DATA-004, LB-DATA-017 (`relax_code` analytics only) — defect fixes `APPROVED`. DEV-004, DEV-005,
DEV-006, DEV-009, DEV-033, DEV-034 are `PROPOSED`; the schema supports both outcomes (unique hash present; scope
column addable).

## Acceptance criteria

- A radar cannot be saved with a `filters_v1` that lacks any of the 25 keys (model guard; V-RI-3 query returns zero
  on seeded data).
- Two radars of one user with the same `filters_hash` are rejected by the unique index.
- `radar_deliveries` rejects a second row for the same (user, listing).
- `bot_listing_messages` is partitioned by month on PostgreSQL and inserts route to the right partition; a message
  can be found by `listing_id` across partitions.
- Deleting a user cascades radars, hide rules, deliveries, pending items and delivered messages (erasure,
  SEC-REQ-039).

## Tests

- `RadarSchemaTest` (SQLite): `it('rejects filters without 25 keys')`, `it('rejects twin radars by hash')`,
  `it('allows the same hash for two users')`, `it('enforces one hide-rule target per kind')`, `it('dedups
  deliveries per user and listing')`, `it('cascades every radar table on user delete')`.
- `RadarSchemaPgsqlTest` (`pgsql`): `area` is `geography(Polygon,4326)` with a valid GiST index;
  `bot_listing_messages` partitions exist for the current and next months; an insert for a month without a
  partition fails loudly (the scheduler of KV-DB-035 prevents it); V-RI-3 and V-RI-4 queries return zero on seeds;
  `radars_number_seq` `setval` above `max(number)` (V-RI-9).

## Edge cases

- Legacy radar ids that are strings (`14` §3): new `number` + `legacy_id_map` (KV-DB-018).
- Polygon radars with self-intersections: stored as the convex hull by the loader (`14` §4.2), `ST_IsValid` checked.
- A delivered card whose listing is later merged: `listing_id` re-pointed, `legacy_listing_number` keeps the original.
- Pending items for a deleted radar: cascade, never released.

## Security

SEC-REQ-014 (radars are loaded through the owner relation by number — unique `number` plus `user_id` index),
SEC-REQ-015 (unique hash and limit checked under a lock by M4), SEC-REQ-038 (delivered-card log kept until the
listing's purge — partition drops only through KV-DB-028), SEC-REQ-039 (cascades). No message texts are stored.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note (partitioned table,
scheduler dependency) in the PR.
