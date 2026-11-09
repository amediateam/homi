# KV-DB-016 — Load listings, aliases, authors, statuses, takedowns

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-LISTING-001, F-SHARE-002, F-PIPELINE-003, F-PIPELINE-006, F-HIDE-002, F-ADMIN-002 |
| Dependencies | KV-DB-008, KV-DB-015 |

## Goal

Every legacy listing that may still be shown or referenced is in HOMI's `listings` with its legacy id preserved as
`number`, merged ids resolve through `listing_aliases`, authors are rebuilt in `listing_authors` with encrypted phones
and keyed HMACs, statuses and takedowns are carried over, channels are in `source_channels`, and each listing has its
provenance row in `source_listings` for the `kvadro_legacy` source — so V-CNT-3, V-SUM-1, V-RI-1, V-RI-2, V-RI-7 and
V-RI-8 pass. **Scope note:** this task is narrowed from `14` §8: publications and price-history events moved to
KV-DB-036.

## Legacy reference

- ENT-023, ENT-024, ENT-028, ENT-029, ENT-030, ENT-034, ENT-037, ENT-040 (`06` §2.4–§2.5); scope `14` §2 and §2.1
  (option C hybrid, `PROPOSED`: migrate for identity and history); load order `14` §7.3 steps 1 (channels) and 3.
- Ids `14` §3: `listings.number` = legacy id, `listing_aliases.alias_number` = legacy merged id, tombstones, author
  `legacy_key` mapped, channel natural keys `handle` / `telegram_id`; sequences after the final delta (`14` §3 SQL).
- Rules `14` §4.1 (time, text, labels, codes, money, coordinates, phones, retention/erasure/takedown at extract) and
  §4.2 rows Listing, Alias, Author, Channel, Takedown.
- Questions: Q-DATA-017, Q-DATA-022, Q-DATA-023, Q-DATA-024, Q-DATA-028, Q-DATA-033, Q-DATA-038; Q-API-019 (merge rules).
- Defects: LB-DATA-009 (raw third-party phones), LB-DATA-013 (single-vote realtor marks), LB-DATA-019 (price bases),
  LB-DATA-020 (district source). `$KVADRO_ROOT/docs/about.md:425-440` (listing ids must survive).

## Implementation

1. Read `14` §2.1, §3, §4, `06` §4.2–§4.3, `.ai/agents/postgis-geo-engineer.md` (rules 5, 11–17) and
   `.ai/agents/listing-matching-engineer.md` (aliases, survivor rules); replace the `<legacy_…>` placeholders.
2. `ChannelLoader` (`make:class Services/Migration/Loaders/ChannelLoader --no-interaction`): `source_channels` by
   `telegram_id` or lower-cased `handle` (display handle kept), `city_id` via aliases, owner hashtags, new-build flag,
   **opt-outs copied** (BR-DATA-022), `collector_source_id` = the `kvadro_legacy` source (seeded by KV-DB-008).
3. `AuthorLoader`: authors from listing phones and source channels; phone normalised to E.164 `+998` + 9 digits (invalid →
   `null` + change row) and written only as `phone_encrypted` (dedicated key) + `phone_hmac` (HMAC-SHA-256, HOMI pepper)
   — the plaintext never lands in a column; realtor marks and distinct-flat counts copied with
   `realtor_mark_source = 'legacy'`; `legacy_key` → id in `legacy_id_map`.
4. `ListingLoader`: new ULID `id` (deterministic per legacy id via the map on re-runs), `number` = legacy id; `deal_type`
   → `deal` + `rent_period` (`rent_long` → `rent`/`long`, `rent_daily` → `rent`/`daily`, `sale` → `sale`); price →
   `price_usd_cents` (`round(x*100)`), `price_kind`, `price_basis` derived from deal, `price_kind` and legacy unit fields,
   unclassifiable → `price_basis = null` + flag (LB-DATA-019); source amount/currency only where legacy stored them
   (never synthesise UZS); `is_owner` tri-state → `owner_status` (`owner`/`agent`/`unknown`), `owner_verified` not stored;
   location `ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography`, outside the Uzbekistan box → `null` + change row,
   district via aliases with `district_source = 'legacy_unknown'`, place/quarter/metro via aliases, `metro_km`,
   `center_km`, `geo_radius_m` copied; status mapped to the HOMI enum, `withdrawn_at`, `pii_purged_at`; `views_count`
   (Q-DATA-038), `first_seen_at`, `last_published_at` in UTC; `post_deleted`.
5. Extract-time retention: listings with `withdrawn_at + 90 days < run start` lose phone, `original_text`, `summary` and
   photos at extract (BR-DATA-006); taken-down listings load as `taken_down` stubs without text, phone or photos.
6. `SourceListingLoader`: one `source_listings` row per listing for source `kvadro_legacy` (`external_id` = legacy id,
   `status` from the listing, `listing_id` = the new ULID).
7. `AliasLoader`: flatten chains (`a → b → c` ⇒ `a → c`, `b → c`); aliases pointing at missing listings → tombstone
   listing row (`status = merged`, no content) so the number stays reserved; an alias number is never a live `number`.
8. `TakedownLoader`: `takedown_requests` copied (KV-DB-032 table); the listing is forced to `taken_down` regardless of
   other status.
9. After the final delta (driver step 9): `setval('listings_number_seq', greatest(max(number), max(alias_number)) +
   :listing_number_gap, false)` with the gap from KV-DB-001 growth (≥ 7 days of legacy creations).
10. Run on R0; attach counts, exclusions by reason and change volumes per rule to the PR.

## Files

- `backend/app/Services/Migration/Loaders/{ChannelLoader,AuthorLoader,ListingLoader,SourceListingLoader,AliasLoader,TakedownLoader}.php`
- `backend/app/Console/Commands/Migration/AdvanceNumberSequences.php` (or a driver step) for step 9
- `backend/tests/Feature/Migration/Listings/*Test.php`, `backend/tests/Fixtures/Migration/stage_listings.sql`

## API contract

For the same listing number, HOMI's legacy routes must reproduce the legacy output (`14` §6.4 API-level sample of 300
ids, allowed differences: `call_url` token, photo signatures, `median_*` within tolerance, `stats.views`): API-008
`GET /api/listings/:id` returns `id` = the same JSON integer; a merged id returns the survivor with its own `id`
(BR-API-048); `status_text`, `post_deleted`, `author {kind, label, count}`, `is_owner` as legacy; API-001…API-007 counts
per city and deal equal legacy `GET /api/cities` `counts` at the frozen moment (`14` §6.1).

## Business rules

- Kept: BR-DATA-002 (integer ids never reused), BR-DATA-019 (merged ids resolve), BR-DATA-006 (90-day erase),
  BR-DATA-022 (takedowns and opt-outs never reappear), BR-DATA-028 (author = phone else channel), BR-DATA-036 (WGS 84 +
  radius), BR-DATA-008 (USD values as cents).
- Defect fixes (`APPROVED`, `09` §4.3): LB-DATA-019 (explicit `price_basis`), LB-DATA-020 (`district_source`).
- Storage design, not a behaviour change: raw author phones (LB-DATA-009) land only as `phone_encrypted` + `phone_hmac`
  (`14` §4.1 "Phones", ADR-0009); whether legacy routes keep returning `phone` is DEV-007 (`PROPOSED`, KV-BE-034/035).
- `PROPOSED` (behind a run-config flag, volumes reported): recomputing realtor marks under the new threshold (DEV-010,
  LB-DATA-013) is **not** done by default — marks are copied with `source = 'legacy'`.

## Acceptance criteria

- V-CNT-3 (listings by deal, term, status) equals the same grouping on `legacy_stage`; V-SUM-1 (count, sum of numbers,
  sum of `price_usd_cents`) equal; V-RI-1, V-RI-2, V-RI-7, V-RI-8 return zero; V-RI-9 true after step 9.
- No HOMI column contains a plaintext phone; every author phone is `phone_encrypted` + `phone_hmac`.
- Opted-out channels and taken-down listings are absent from feed/map queries of KV-BE-023 on the loaded data.
- A re-run writes zero rows; V-CNT-1 balances with reasons `orphan`, `purged`, `taken_down_stub`, `invalid`, `erased`.

## Tests

`backend/tests/Feature/Migration/Listings/` (`pgsql` group with PostGIS, synthetic stage, KV-QA-001):
- `ListingNumberPreservedTest` — legacy id 104512 → `number` 104512, ULID stable across re-runs.
- `DealMappingTest` dataset: `rent_long`, `rent_daily`, `sale` → (`deal`, `rent_period`).
- `PriceBasisTest` dataset: per month, per day, total sale, down payment, unclassifiable → flag.
- `CoordinatesTest` — `[lat, lon]` → geography point in `(lon lat)` order; point in Kazakhstan → `null` + change row.
- `RetentionAtExtractTest` — withdrawn 91 days before run start → no text, phone, photos; 89 days → kept (time travel).
- `TakedownStubTest`, `OptOutChannelTest` — stubs only; opted-out channel copied with `opted_out_at`.
- `AliasFlattenTest` — chain `a → b → c` flattened; alias to a missing listing → tombstone row; V-RI-1/V-RI-2 zero.
- `PhoneMinimisationTest` — a full-table scan of text columns finds no `+998` plaintext; HMAC equal for equal phones.
- `SequenceAdvanceTest` — after step 9 a new listing gets a number above every number and alias number (V-RI-9).
- `ListingsRerunTest` — zero writes; V-SUM-1 equal across runs.

## Edge cases

- A legacy id reused by legacy itself (should not happen, Q-DATA-022): the run fails with both rows reported.
- Listings referenced only by user data (favourites of a deleted listing): loaded as tombstones if an alias or a
  delivered card needs the number (decided per V-RI-5 orphan counts, KV-DB-020).
- `exchange_rate_id` of migrated listings stays `null` (the legacy conversion rate is unknown, Q-DATA-023/Q-DATA-034);
  conversions are reproducible only from the rate history rebuilt with the derived data (KV-DB-021).
- Merge reversibility unknown (Q-API-019): aliases are loaded as given; no unmerge.

## Security

- SEC-REQ-036 (author phones encrypted + HMAC, never returned raw by v1), SEC-REQ-038 (90-day erase at extract),
  SEC-REQ-040 (takedowns and opt-outs carried), SEC-REQ-041 (handling, sanitised marker).
- Reports and logs never contain phones, texts or Telegram ids — only numbers, counts and hashes.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: R0 run on the masked sample green, the run report
reviewed by the developer, `06`/`14` updated with the confirmed facts (Q-DATA-022 … Q-DATA-024 closed or narrowed).
