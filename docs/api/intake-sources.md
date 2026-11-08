# Intake sources — reference for the collector contract

Purpose: what the external collectors actually store and expose today, so the HOMI intake contract (ADR-0009, Phase 3 `docs/api/intake.md`) is designed against facts. Source: read-only audits on 2026-11-08 of `telegram.uz` (`$TELEGRAMUZ_ROOT/backend`), `datahub.uz` and `geo.uz` (overview only). Live databases were **not** queried; env values were not read. Items under "Unverified" are claims from code reading only.

## `telegram.uz` (Telegram-channel collector) — primary first source

Stack: Laravel 13.16 / PHP 8.5 / MadelineProto 8.7, PostgreSQL (`telegram_db`, PostGIS + pgvector + FTS), Redis + Horizon. Subversion working copy (rev 10, 505 locally modified paths — the working tree is the truth). Laravel app lives in `backend/`.

### Data model (facts)

- `listings` — **range-partitioned by `posted_at`**, PK `(id, posted_at)`; `public_id` ULID (26) set at parse (no unique index); `channel_id`, `raw_post_id`, `segment_index` (multi-lot posts → N listings, UNIQUE `(raw_post_id, posted_at, segment_index)`); `moderation_status` enum `pending|needs_review|auto_approved|approved|rejected|spam`; `lifecycle_status` enum `active|published|sold|rented|stale|withdrawn|archived` (`published`/`stale` never set by code); `deal_type` varchar `sale|rent|buy|rent_wanted`; `property_type` varchar `apartment|house|land|commercial` (no `room`); `price numeric(15,2)` in **major units**, `currency` enum `UZS|USD|EUR`, `price_type` enum `fixed|from|range|negotiable_no_price|on_request`, `is_negotiable`, `rent_period` free varchar, `price_usd_current/at_post`, `price_per_sqm_usd`; `area_total/living numeric(8,2)`, `area_land_sotka`; `rooms`, `floor`, `floors_total`; `condition`, `building_type` free varchar; `has_furniture/has_appliances`; `district_id`, `landmark` varchar, `geom geography(Point,4326)` (lon/lat); `phones jsonb` (E.164 cache); `lang_detected`; `quality_score int 0–100`; `min_confidence`; `parse_method`; `duplicate_group_id`; `attributes jsonb`, `field_confidence jsonb`; `search_text`, `search_vector`; `reviewed_by/at`, `reject_reason`; `tenant_id` (not populated for new rows — global pool). **No `title`/`description` columns** — text lives only in `raw_posts.raw_data` (message/caption).
- `raw_posts` (partitioned): `channel_id`, `message_id`, `posted_at`, `edit_date`, `content_hash`, `raw_data jsonb`, `deleted_at`, author fields; UNIQUE `(channel_id, message_id, posted_at)`; `raw_post_revisions` keep diffs.
- `channels`: `tg_id` (MTProto id), `username`, `title`, `trust_score`, `category_id`, `subscribers_count`, counters. Post URL is built (`t.me/{username}/{id}` or `t.me/c/…`), not stored.
- `listing_contacts` (partitioned): `phone_id` → `phone_numbers` (`e164`, `e164_hmac` HMAC-SHA256 hex keyed by `PHONE_HMAC_KEY` — **opaque to HOMI**), `raw_value`, `role owner|agent|agency|unknown`, `extraction_source text|caption|ocr|entity|username|manual`, `is_primary`, `is_masked`, `confidence`, `contact_username`; `contact_identity` (ULID, `identity_type agent|agency|owner|unknown`).
- `media_files`: `file_unique_id` (Telegram), `sha256`, `phash` (16-hex dHash), `type photo|video`, `path telegram/media/{sha2}/{sha256}.{jpg|mp4}`, `disk public|s3`, OCR fields. Pivot `post_media(raw_post_id, posted_at, media_file_id, order_index)` joins the **raw post**, not the listing. **No thumbnails/variants, no width/height**; `path`/`sha256` may be NULL until the async download finishes.
- Dedup: `duplicate_groups(master_listing_id, members_count, status)`, `duplicate_group_members(match_score)`, `merge_candidates`, `listing_embeddings vector(1024)`. Weights (`config/dedup.php`): embedding .28, phash .22, geo .15, phone .10, price .10, area .10, rooms .05; `auto_merge_score .78` (needs a pHash anchor), `candidate_score .62`, geo 300 m, price tol 5 %, area tol 3 %, pHash Hamming ≤ 6, 7-day window — marked provisional in the code comments.
- Geo: `districts(name_ru, name_uz, slug, aliases jsonb)` — **12 Tashkent districts only**, no regions table; `landmarks` — 14 metro stations with approximate coordinates; `geom` is the matched landmark centroid or NULL. `exchange_rates` seeded with placeholder rates (USD values unreliable).

### Public API (facts)

`GET /api/public/v1/listings` and `/listings/{public_id}` — `auth:sanctum` + `ability:listings:read` + tenant metering + `throttle:api` (60/min per tenant, daily plan caps 100/5000/50000). Keys `tk_live_*` (the only ability is `listings:read`; no write/export ability). Returns only approved/auto-approved rows and only market fields: `public_id, posted_at, deal_type, property_type, price{price, currency, price_usd_current, price_type, is_negotiable}, area_total, area_living, rooms, floor, floors_total, condition, district{slug, name_ru}, landmark, lifecycle_status`. **No phones, media, text, geo, channel/post URL, quality or dedup fields; no `updated_since`; cursor pagination (`cursor`, page size `SEARCH_PAGE_SIZE` default 20).** OpenAPI via Scramble for `api/public/*` only. ⇒ polling the public API cannot feed HOMI.

### Lifecycle and events (facts)

- Auto-approval at parse (`DraftAssembler`: `min_confidence ≥ PARSING_AUTO_APPROVE_MIN_CONFIDENCE`, default 0.7) → `auto_approved`, else `needs_review`; manual `approve|reject|spam|lifecycle` via `ListingModerator`. Pipeline: `IngestRawPostJob → ParseListingJob → ResolveContactIdentityJob → ResolveDuplicatesJob`; `DownloadMediaJob → OcrMediaJob` re-triggers dedup; `SoftDeletePostsJob` sets `withdrawn` when the Telegram message is deleted.
- Events: `RawPostIngested`, `ListingParsed`, `MediaOcrCompleted` only. **No `ListingApproved`, no price-change, no delete event, no `Listing` observer.** Edits re-run parsing (60 s debounce) and overwrite fields; by code reading, a reparse re-assigns `moderation_status` from the new draft (would undo a manual decision — unverified).
- Outbound code that exists (trigger-driven, tenant-scoped): `WebhookChannel` (JSON POST, `X-Signature` sha256 HMAC of body, `X-Idempotency-Key`, no-redirect SSRF guard), `DeliverNotificationJob` + `ResilientExternalCall` (60-min retry window, backoff 30/120/600/1800 s), `QueueResilience` circuit breaker, `notification_deliveries` ledger. Nothing pushes "every approved listing".

### What `telegram.uz` must add to push to HOMI (work outside this repo)

1. A listing-level event emitted when a listing is **publishable**: from `ListingModerator::approve` and at the end of `ResolveDuplicatesJob` / `OcrListingEnricher` for `auto_approved` rows (`ListingParsed` is too early — dedup, contacts, media, OCR not done).
2. Update/withdraw events: lifecycle change, reparse, `SoftDeletePostsJob`, duplicate-group change, late media download.
3. A listing-level outbox/ledger with a per-listing version, a `PushListingToHomiJob` on its own queue/supervisor, HOMI URL + token config, and a backfill command for the existing approved pool.
4. A payload builder that exposes what no API exposes today: post text (from `raw_posts.raw_data`), media URLs + `sha256`/`phash`, contacts with a PII gate for raw phones, channel/post reference, quality and dedup data. Reuse `WebhookChannel`'s signing/idempotency and `ResilientExternalCall`.
5. Guard: a reparse must not downgrade a manual `approved`/`rejected` (verify the suspected overwrite first).

### Intake payload draft (one listing) — source mapping

Legend: ✔ available · ⚙ derivable with small code · ✖ missing today.

| Group | Field | Type | Source | |
|---|---|---|---|---|
| identity | `source_code` | string | constant `telegram_uz` | ⚙ |
| | `external_id` | string | `listings.public_id` (stable per raw post + segment; add a unique index there) | ✔ |
| | `source_version` | int | `listings.updated_at` as a monotonic stamp | ⚙ |
| | `channel{tg_id, username, title, category, trust_score, subscribers_count}` | object | `channels` | ✔ |
| | `message_id`, `segment_index`, `post_url` | int, int, string | `raw_posts.message_id`, `listings.segment_index`, `PostLinkBuilder::source` | ✔/⚙ |
| timestamps | `posted_at`, `source_edited_at`, `first_seen_at`, `updated_at`, `approved_at`, `deleted_at` | ISO-8601 | `listings.posted_at`, `raw_posts.edit_date`, `listings.created_at/updated_at/reviewed_at`, `raw_posts.deleted_at` | ✔ |
| classification | `deal_type`, `property_type`, `rooms`, `area_total_m2`, `area_living_m2`, `area_land_sotka`, `floor`, `floors_total`, `condition`, `building_type`, `has_furniture`, `has_appliances`, `rent_period` | enums / numbers / free text | `listings.*` (`condition`, `building_type`, `rent_period` are free text — HOMI normalises) | ✔ |
| price | `amount_minor` | int | `round(price × 100)` | ⚙ |
| | `currency`, `price_type`, `is_negotiable`, `usd_at_post`, `usd_current`, `price_per_sqm_usd` | | `listings.*` (USD based on placeholder rates) | ✔ |
| | `price_max` (ranges) | int | — | ✖ |
| location | `district{slug, name_ru, name_uz}` | object | `districts` (Tashkent only) | ✔ |
| | `lat`, `lng` | float | `ST_Y/ST_X(geom)` — landmark centroid, mostly NULL | ⚙ |
| | `landmark` | string | `listings.landmark` | ✔ |
| | `region_code`, `address` | | — | ✖ |
| text | `description` | string | `raw_posts.raw_data` message + caption (contains phones/usernames) | ⚙ |
| | `language` | string | `lang_detected` | ✔ |
| | `title` | string | — (HOMI generates) | ✖ |
| contacts[] | `phone_e164` (gated), `role`, `is_primary`, `is_masked`, `confidence`, `extraction_source`, `telegram_username`, `seller{identity_id, identity_type}` | | `listing_contacts`, `phone_numbers.e164`, `contact_identity`; `e164_hmac` is useless to HOMI (foreign key) → HOMI hashes with its own key | ⚙ |
| media[] | `type`, `url`, `object_key`, `disk`, `sha256`, `phash`, `order` | | `media_files` via `post_media.order_index`; `url = Storage::disk(disk)->url(path)` | ✔/⚙ |
| | `width`, `height`, `bytes`, `mime` | | — (HOMI derives on copy) | ✖ |
| quality | `quality_score`, `min_confidence`, `field_confidence`, `parse_method`, `review_reasons`, `duplicate{group_key, master_external_id, members_count, match_score}` | | `listings.*`, `attributes.review_reasons`, `duplicate_groups` (give a stable key, not the internal id) | ✔/⚙ |
| status | `moderation_status`, `lifecycle_status`, `reject_reason` | enums | `listings.*` | ✔ |

Implications for HOMI's side of the contract: accept `price` as minor units + currency and compute UZS/USD with HOMI's own rates; treat `district` as a slug to map onto HOMI's Geo module (which will have regions and all cities); copy media bytes by URL into `homi-public` and derive WebP variants + dimensions; hash phones with HOMI's key; keep `source_code + external_id` unique; version by `source_version`; accept events `created|updated|withdrawn|duplicate_changed|media_added`.

## `datahub.uz` (dedup/canon platform) — later, higher-trust source

Laravel 13.8 / PHP 8.5, PostgreSQL 18 (`datahub_db`), PostGIS; Vue SPA; SVN. Pipeline `raw_document → raw_listing → listing → property` with `listing_cluster`, `match`, `field_provenance`, `canonical_change_log`; confidence bands > 0.95 auto-merge, 0.70–0.95 review. **Intake, normaliser, matcher and dedup assembly are not built** (plan P9–P12); canon tables hold demo data only. Exposure: internal SPA API (`/api/v1`, Sanctum cookies), `GET /api/v1/listings` (masked, PII-free); no export/webhook/outbox; service-token abilities `ingest_write|search_read|export_read` exist with no routes. Phones only on `agent`/`agent_account` (raw + HMAC, RLS/masking). Its docs forbid external DB access. ⇒ datahub becomes a pusher later, sending `property`-level records with `property_hint`/cluster data through the same HOMI intake.

## `geo.uz` (web-source collector) — not audited yet

Laravel 13, own `content_db`; sources OLX, Uybor, Uysot, Birbir, Realt24, Elbozor. Audit before onboarding as a second pusher (Phase 3+).

## Unverified (telegram.uz)

Live row counts/partitions; whether most `geom` are NULL; env values (bucket/URL/disk) and production hostname; whether reparse really overwrites manual moderation; where `landmark` text is extracted (likely LLM/OCR); whether `tenant_id` is populated for new rows; allowed values for `rent_period/condition/building_type`; Scramble output shape.
