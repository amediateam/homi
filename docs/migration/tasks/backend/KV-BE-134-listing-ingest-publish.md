# KV-BE-134 — `ListingIngestService`: publish, publications, price history, authors, events

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PIPELINE-003, F-LISTING-006, F-OWNER-002 |
| Dependencies | KV-BE-131, KV-BE-132, KV-DB-008, KV-DB-032, KV-BE-025, KV-BE-018 (`ListingNumberAllocator`); KV-DB-029 (attach to migrated publications) |

## Goal

A normalised, geo-resolved draft becomes (or updates) a canonical listing in one transaction: the publication
`(channel, post_id)` is attached to exactly one listing, a new listing gets a public `number` from the sequence, the
price timeline records `published` / `price_down` / `price_up` with `change_pct`, the author is resolved by phone HMAC or
channel, counters (days listed, publications, channels) stay right, and `ListingPublished` / `ListingPriceChanged` are
raised after commit for radars, medians and landing data.

## Legacy reference

- BR-API-049 (each publication — channel, link `t.me/<channel>/<id>`, time, text, price — feeds the price history
  `published`/`price_down`/`price_up` and the counters days / publications / channels), BR-DATA-020 (a publication is
  `(channel, post id)` and belongs to one listing), BR-DATA-024 (history entries always carry `price_usd` and
  `change_pct`; `kind` closed set; `at` ISO UTC), BR-DATA-002 (listing ids positive integers never reused),
  BR-DATA-028 (author = phone else source channel), BR-API-069 (`status_text`), BR-APP-068 (stats display), ENT-023,
  ENT-025, ENT-026, ENT-030.
- `14` §2.1 option C and §3 (numbers above the legacy maximum; new publications attach to migrated listings by
  `(channel, post_id)`), CF-003, CF-016 (demand posts never published).
- `15` §3.5 #5 (price change re-ingested twice → one history event), §3.6 #10 (50 concurrent number allocations).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` rules 1, 3, 5, `.ai/agents/listing-matching-engineer.md` (merges come
   later — this service never merges), KV-BE-018, KV-DB-008, KV-DB-032, KV-DB-029. Tests first (`pgsql` group for
   concurrency, KV-QA-008 kit).
2. `php artisan make:class Services/Listings/ListingIngestService --no-interaction`:
   `ingest(NormalisedListing $draft, GeoResult $geo, SourceListing $sl): IngestOutcome` in one transaction with a
   per-publication advisory lock (`hashtext(channel_id || ':' || post_id)`):
   1. Find the publication by `(channel_id, post_id)` (migrated ones included, KV-DB-029) → its listing; else by
      `source_listings.listing_id`; else create a listing (`number` from `ListingNumberAllocator::next()`).
   2. Refuse to publish: demand posts (stored on `source_listings` only), channels `pending`/`rejected`/opted-out
      (KV-BE-126), phones on the opt-out list (KV-BE-138), listings `taken_down` (never reactivated, BR-DATA-022).
   3. Upsert `listing_publications` (`url = https://t.me/<handle>/<post_id>`, `published_at = posted_at`, text, price).
   4. Price timeline (`listing_price_events`, unique `(listing_id, at, kind)`): first publication → `published`
      with `price_usd`; later publication or edit with a different `price_usd_cents` → `price_down` / `price_up` with
      `change_pct = round((new − old) / old × 100, 2)`; equal price → no event. Comparisons only within the same
      `price_basis` (a down payment is never compared with a total price).
   5. Listing fields: attributes from the draft by source precedence (a lower-trust source never overwrites a value
      set by a higher-trust one); `first_seen_at` = min over publications; `last_published_at` = max; `status`
      `active` (a withdrawn, non-purged, non-taken-down listing re-posted within 90 days is reactivated:
      `withdrawn_at = null`, status event `cause = republished`).
   6. Author: `listing_authors` by `phone_hmac` (kind `phone`) else by channel (kind `source`); `distinct_flats`
      recomputed for the author (count of distinct active listings) — input of the owner badge (KV-BE-025, ≥ 3 flats
      → no «Хозяин ✓»); `owner_status` from KV-BE-128.
   7. `source_listings.listing_id` set; `ingest_runs` outcome.
   8. After commit: `ListingPublished` (new or reactivated) or `ListingUpdated`; `ListingPriceChanged` when a price
      event was written; KV-BE-127 photo copy dispatched for new media.
3. Counters: `stats.days_listed` = Tashkent days since `first_seen_at` (computed on read by KV-BE-034),
   `publications` = count of publications, `channels` = distinct channels — maintained columns
   `publications_count`, `channels_count` on `listings` (additive migration) updated in the same transaction.
4. Title and summary: `title_source` = deal + rooms + type data for the display formatter (KV-BE-021); `summary` from
   extraction; `original_text` = the raw text of the newest publication (purged at 90 days by KV-DB-028).
5. `ListingNumberAllocator` concurrency: numbers from `nextval` only (never `max()+1`), gaps allowed.

## Files

- `backend/app/Services/Listings/ListingIngestService.php`, `backend/app/Domain/Listings/IngestOutcome.php`,
  `backend/app/Services/Ingest/Stages/Publish.php` (body) (new)
- `backend/app/Events/Listings/{ListingPublished,ListingUpdated,ListingPriceChanged}.php` (new, if not created by M4)
- migration `add_publication_counters_to_listings_table`
- `backend/tests/Feature/Listings/ListingIngestServiceTest.php`, `backend/tests/Feature/Pgsql/Listings/ListingIngestConcurrencyTest.php` (new)

## API contract

n/a (internal). Effects are visible through API-004 (`ListingPreview`), API-008 (`history`, `stats`, `sources`,
`author`) and the intake reconciliation read (KV-BE-123).

## Business rules

- BR-API-049, BR-DATA-020, BR-DATA-024, BR-DATA-002, BR-DATA-028, BR-DATA-022 (taken-down never back), CF-016,
  BR-API-108 / BR-API-109 inputs (author flats count, realtor mark) for the owner badge.
- DEV-014 `PROPOSED` (Tashkent time in history display) is a formatter concern; stored `at` is UTC.

## Acceptance criteria

- Re-ingesting the same post (same text, same price) changes nothing and raises no event.
- Re-ingesting a price change twice writes exactly one `price_down`/`price_up` row (`15` §3.5 #5).
- 50 concurrent ingests of different posts allocate 50 unique numbers above every preserved and alias number
  (`15` §3.6 #10).
- A post `(channel, post_id)` already present from the migration updates that listing (same ULID, same number).
- A demand post never creates a listing.

## Tests

- `ListingIngestServiceTest`: `creates_listing_with_sequence_number`, `same_publication_twice_no_change`,
  `price_drop_writes_price_down_with_change_pct`, `price_change_reingested_twice_one_event`,
  `different_basis_not_compared`, `repost_in_second_channel_attaches_publication_when_matched_later` (with KV-BE-135 fake),
  `migrated_publication_attached_not_duplicated` (KV-DB-029 case), `demand_post_not_published`,
  `taken_down_listing_never_reactivated`, `withdrawn_listing_reposted_within_90_days_reactivated`,
  `lower_trust_source_does_not_overwrite`, `author_by_phone_hmac_else_channel`, `distinct_flats_recomputed`,
  `counters_publications_and_channels`, `events_dispatched_after_commit_only`.
- `ListingIngestConcurrencyTest` (`pgsql`): `fifty_concurrent_allocations_unique_and_above_aliases`,
  `same_publication_concurrently_one_listing`.

## Edge cases

- An edit of a post that changes the deal (rent → sale): treated as a new listing? No — the publication stays with
  its listing; the deal change is recorded as `deal_changed` for review (killer-word logic of KV-BE-135 would refuse a
  merge across deals).
- A post deleted at the source before processing: published, then KV-BE-137 applies `post_deleted`.
- Price removed in an edit: no price event; the last known price stays with `price_unverified`.
- A migrated `kvadro_legacy` listing and a new collector post with conflicting attributes: the collector wins
  (`14` §2.1 option C).

## Security

- SEC-REQ-036 (phones only encrypted + HMAC), SEC-REQ-040 (phone and channel opt-outs checked inside the transaction),
  SEC-REQ-015 (race-safe upserts), SEC-REQ-047.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), `09` rows F-PIPELINE-003, F-LISTING-006 and F-OWNER-002 updated, PR
reviewed by the other developer; the events are announced in the PR for the M4 and M7 consumers.
