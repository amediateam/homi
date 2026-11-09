# KV-DB-036 — Load publications and price history

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-LISTING-006, F-PIPELINE-003, F-CONTACT-002 |
| Dependencies | KV-DB-016, KV-DB-032 |

## Goal

Every legacy publication (channel, post id, link, time, text, price) and every price-history event is loaded into
`listing_publications` and `listing_price_events` against the migrated survivor listings, so the price history,
`sources`, the counters (days listed, publications, channels) and future ingestion matching all work on migrated data.

## Legacy reference

- `14` §2 rows ENT-025 (publication, mandatory: price history, counters, sources, natural key for matching new
  ingestion) and ENT-026 (history event, migrate: the price timeline cannot be re-read for deleted posts); §3 row
  "Publication" (natural key `(channel_id, post_id)`); §4.2 rows "Publication" and "History event"; §7.3 step 3.
- Rules: BR-DATA-020 (one publication per (channel, post id), one listing), BR-DATA-024 (`price_usd` and `change_pct`
  always present; `kind` ∈ {`published`, `price_down`, `price_up`}; `at` ISO UTC), BR-API-049, BR-DATA-006 (texts of
  listings withdrawn > 90 days are not extracted).
- Questions: Q-DATA-025 (publication keys, per-publication text and price), Q-DATA-035 (zone of naive timestamps).
- Split from KV-DB-016 so each load step fits one session (`11` §13).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (idempotent upserts, batching) and `.claude/skills/testing-best-practices/`.
2. `php artisan make:class --no-interaction Services/Migration/Steps/PublicationsStep` and `PriceEventsStep`, run by
   the KV-DB-013 driver after the listing, alias and channel steps (`migration:load publications`).
3. Publications: resolve the channel by Telegram id, else lower-cased handle (`source_channels`, KV-DB-016 loads
   channels); take `post_id` from the stored column or parse it from the `t.me/<channel>/<id>` URL; re-point the
   listing through aliases to the survivor; upsert on `(channel_id, post_id)`; when two legacy rows collide on the key,
   keep the one attached to the survivor and record the other as `duplicate`.
4. Texts and prices: copy `text` only for listings inside the retention window (`14` §4.1 "Retention at extract");
   price → `price_amount` + `price_currency` where legacy kept the source amount (Q-DATA-023), else USD cents only.
5. History events: copy `at` (converted to UTC per Q-DATA-035), `kind`, channel, url, `price_usd` → cents,
   `change_pct` as `numeric(6,2)`; events of merged listings re-pointed to the survivor in time order.
6. Counters: no stored counter is copied blindly — the M2 serializer derives days listed, publications and channels from
   these rows; a comparison with legacy `stats` values is part of KV-DB-037.
7. Fingerprint for validation: `channel handle:post_id:listing number` (`14` §6.2, implemented in KV-DB-022).

## Files

- `backend/app/Services/Migration/Steps/{PublicationsStep,PriceEventsStep}.php` (new)
- `backend/tests/Feature/Migration/LoadPublicationsTest.php` (new, `pgsql` group)

## API contract

Migrated listings answer `GET /api/listings/:id` (API-008) with `history[]` entries `{at, channel (no @), url, text?,
kind, price_usd, change_pct}` (strict keys present, `at` ISO-8601 with `Z`), `sources[]` = `{url, handle}` for each
publication channel, and `stats.publications` / `stats.channels` equal to legacy.

## Business rules

BR-DATA-020, BR-DATA-024, BR-API-049, BR-DATA-006, BR-API-151 (UTC `Z`). DEV-014 (Tashkent display of dates) is a
client concern and `PROPOSED`; storage stays UTC.

## Acceptance criteria

- The publication fingerprint (`handle:post_id:number`) is equal on both sides after exclusions; no duplicate
  `(channel_id, post_id)` exists.
- Every history event of a migrated listing is present with both strict keys; `change_pct` rounds exactly as legacy.
- A second run writes zero rows; restart resumes after the last committed batch.

## Tests

- `post id parsed from the t.me URL when the column is missing`.
- `colliding publication keys keep the survivor's row and count a duplicate`.
- `publication of a merged listing attached to the survivor`.
- `text dropped for a listing withdrawn more than 90 days before the run start`.
- `history event price and change_pct converted to cents and numeric(6,2)`.
- `naive timestamps converted with the configured zone` (Q-DATA-035 value from run config).
- `re-run writes nothing`.

## Edge cases

- Channel handle changed in legacy (same Telegram id): one `source_channels` row, both handles as aliases.
- Publication without a recognisable post id: loaded with `post_id = null`, excluded from matching, reported for
  KV-DB-029.
- Price events with `change_pct` out of range (legacy rounding issues): kept, flagged in `migration_changes`.

## Security

SEC-REQ-036 and SEC-REQ-038 (publication texts follow the 90-day rule), SEC-REQ-019 (stored URLs restricted to
`https://t.me/…`; anything else nulled with a change row), no texts in reports.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4), docs and the feature rows in 09
updated, PR reviewed by the other developer. R1 reports the publication fingerprint equal and the change volumes of
this step.
