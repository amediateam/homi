# ADR-0009: Listing ingestion — HOMI owns the data, collectors push

- Status: Accepted (2026-11-08, after the `telegram.uz` audit — see `docs/api/intake-sources.md`; the field-level contract is written in Phase 3 as `docs/api/intake.md` + OpenAPI)
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D9 and Q16)
- Source: `docs/ai/reports/phase-0.md` §5, §14; datahub.uz / telegram.uz overviews (read-only subagents)

## Context

`docs/about.md` describes HOMI as an aggregator of Telegram-channel listings. Collection does **not** live in this repository:

- `telegram.uz` — Laravel 13 + MadelineProto; reads Telegram channels, has intra-source dedup, identity resolution and a REST API (`/v1/*`); a partner API is listed as planned.
- `geo.uz` — Laravel 13; web sources (OLX, Uybor, Uysot, Birbir, Realt24, Elbozor …).
- `datahub.uz` — Laravel 13 + PostGIS; the team's dedup/canonicalisation platform (raw → normalise → listing clusters → properties, confidence bands). Its intake, normaliser and matcher are not built yet (plan P9–P12), it has no export/webhook/outbox and no consumer API today; service-token abilities (`ingest_write`, `search_read`, `export_read`) exist but no route uses them. Its own docs forbid external access to the database (PII/RLS).

Facts about `telegram.uz` relevant to the contract (read-only audit, 2026-11-08): it already stores what HOMI needs — `listings` (public_id, posted_at, deal_type, property_type, price/currency/USD, rooms, area, floor, district_id, landmark, PostGIS `geom`, quality_score, duplicate_group_id, attributes/field_confidence jsonb), `listing_contacts` (raw phone + HMAC `phone_numbers`), `media_files` (file_unique_id, sha256, phash, path, disk `public`|`s3`). It exposes a token-gated `GET /api/public/v1/listings` (keys `tk_live_*`, ability `listings:read`, approved listings only, tenant metering) whose resource currently omits phones, photos and the source post id. Runs on PostgreSQL; both collectors sit on a private LAN with self-signed TLS.

Options considered: HOMI pulls from `telegram.uz`; HOMI reads a shared DB/replica; HOMI waits for datahub canon; collectors push into HOMI. The developer chose the push model: **HOMI keeps its own listings database and the collectors push into it.**

## Decision

1. **Intake API inside HOMI** (module *Intake*), served on `api.homi.uz` under `/api/v1/intake/*`:
   - `POST /api/v1/intake/listings` — batch of 1–100 listings (create or update by `(source_code, external_id)`), returns `202` with HOMI ids per item;
   - `POST /api/v1/intake/listings/{id}/events` — lifecycle events from the source (price changed, marked rented/sold, deleted at source, photos added);
   - `GET /api/v1/intake/listings/{id}` — reconciliation (what HOMI stored, status, dedup cluster).
2. **Auth**: one Sanctum token per collector per environment with ability `intake:write` (ADR-0003); tokens never shared across environments; per-token rate limits.
3. **Idempotency**: `Idempotency-Key` header per request plus a unique `(source_code, external_id)` per listing; replays return the original result. Every accepted payload is stored raw (`jsonb`, with `schema_version`) before normalisation, so re-processing never needs the collector again.
4. **Processing is asynchronous** (`ingest` queue, Horizon): normalisation → geo resolution → dedup heuristics (phone hash, text shingles, photo hashes) → publish → stats/radar. The HTTP response never waits for it.
5. **Photos**: the collector sends public URLs or object keys in `homi-tmp`; HOMI's Media module copies/derives variants into `homi-public`. Original Telegram file ids are kept as references only.
6. **Trust and precedence**: each source has a trust weight; when `datahub.uz` canon becomes available it pushes through the same API with `property_hint` fields and the highest trust, and HOMI's own dedup defers to it. No HOMI code reads another project's database.
7. **Contract**: part of the OpenAPI spec (ADR-0007), with a collector onboarding guide in `docs/api/intake.md`. Retry/outbox is the collector's responsibility; HOMI guarantees idempotent acceptance.
8. `hook.homi.uz` is reserved for **third-party** webhooks (Telegram Bot API, future payment providers); first-party collectors use the API host.

## Consequences

- Work outside this repo: `telegram.uz` and `geo.uz` need a push client/outbox; coordinated via task contracts shared with those projects (the developer owns them).
- HOMI's schema includes `sources`, `listing_sources`, `intake_events` (raw payloads) and dedup cluster tables; migrations designed in Phase 3+ with the first payload.
- Cross-source deduplication is HOMI's job until datahub delivers canonical properties.
- Rate/volume estimates and backfill strategy (historical listings) are open and decided with the collector owners.

## Alternatives considered

- Pull from `telegram.uz` `/v1` — rejected: HOMI would depend on polling and on each collector's availability; the collector already knows when data changes.
- Shared PostgreSQL / read replica of datahub — rejected: hard coupling to a schema that is being redesigned (datahub DB v2).
- Wait for datahub canon as the only source — rejected: not built yet; HOMI can start with raw-source pushes and switch trust later.

## Contract principles fixed by the `telegram.uz` audit (details in `docs/api/intake-sources.md`)

- The public `telegram.uz` API cannot feed HOMI (no text, phones, media, geo, `updated_since`; only `listings:read`), so the push model is also the only workable one — not just the preferred one.
- `external_id` = collector's `public_id`; HOMI enforces `(source_code, external_id)` uniqueness and orders events by `source_version` (collector `updated_at`).
- Event types: `created`, `updated`, `withdrawn`, `duplicate_changed`, `media_added`; the collector emits them when a listing is **publishable** (after dedup/contacts/media), not at parse time.
- Prices arrive as minor units + currency; HOMI computes UZS/USD with its own rates (collector USD values rest on placeholder rates).
- Text (`description`) and media come from the collector's raw post; HOMI copies media bytes by URL into `homi-public`, derives WebP variants and dimensions, and verifies `sha256`.
- Phones arrive as E.164 behind an explicit PII gate; HOMI hashes with its own key (collector HMACs are opaque). Owner/realtor roles and confidences are carried through.
- Geo arrives as district slug (+ optional lat/lng, landmark); HOMI's Geo module owns regions/cities and the mapping.

## Open items (Phase 3)

- Field-level schema, versioning (`schema_version`) and OpenAPI for `/api/v1/intake/*`.
- Photo size limits and the `homi-tmp` pre-upload path for collectors that cannot serve URLs.
- Backfill of the existing approved pool and rate/volume estimates (with the `telegram.uz` owner).
- Whether user feedback ("already rented") flows back to collectors — default no.
