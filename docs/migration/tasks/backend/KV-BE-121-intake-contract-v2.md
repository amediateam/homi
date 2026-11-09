# KV-BE-121 — Intake payload v2: raw posts, channel and post id, `rent_period`, sources

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-001, F-PIPELINE-003 |
| Dependencies | KV-BE-120 (draft agreed); HANDOFF T2 (this task is the contract half of T2, extended per `10` §9); CF-016 |

## Goal

The intake contract that every source uses is written down and enforced by configuration: `docs/api/intake.md`
(schema version 2) describes a listing payload that carries the raw post (`channel`, `post_id`, `posted_at`, raw text,
photo URLs, forward origin) next to optional collector-parsed hints, the deal mapping with `rent_period`, demand posts,
and the source registry `homi_channels`, `telegram_uz`, `datahub_uz`, `kvadro_legacy` — without the `geo.uz` premise.

## Legacy reference

- Publication identity: a publication is (channel, post id) and belongs to one listing; reposts attach to the same
  listing (BR-DATA-020, BR-API-049, `$KVADRO_ROOT/docs/about.md:157`); `sources[].handle`, `history[].channel` and the
  SEO deep link `l_<id>-seo-<channel>-<post>` need handle + post id (BR-SEO-026, `06` §4.2 `listing_publications`).
- Deal: legacy `rent_long` / `rent_daily` / `sale` (`08` §1.7); HOMI intake has `sale`, `rent`, `buy`, `rent_wanted`
  without a period (`backend/config/intake.php:22`) — CF-016, `06` §4.3 item 3.
- Prices: UZS posts converted at the CBU rate (BR-DATA-008, BR-SEO-023); collector USD values rest on placeholder rates
  (`docs/api/intake-sources.md`, ADR-0009 "Contract principles").
- Phones: E.164 behind a PII gate, hashed with HOMI's key (ADR-0009; DEV-011 for owner hashes).
- `14` §2.1 option C (`kvadro_legacy` lowest trust, attach by `(channel, post_id)`), Q-DATA-045.

## Implementation

1. Read ADR-0009, `docs/api/intake-sources.md`, `.ai/agents/intake-pipeline-engineer.md` (rules 2, 3, 8, 9),
   `.claude/skills/scramble-development/` (the endpoints are documented by Scramble once KV-BE-122 exists) and the
   KV-BE-120 ADR draft.
2. Write `docs/api/intake.md` (new; HANDOFF T2 deliverable) — sections: authentication (`intake:write` token per source
   per environment), idempotency (`Idempotency-Key` + `(source_code, external_id)` + `content_hash`), batch limits,
   payload v2, events, errors (ADR-0007 envelope), reconciliation, onboarding checklist (agent rule 12).
3. Payload v2 table (field, type, required, example), at least:
   - identity: `external_id` (≤ 64), `source_version` (monotonic int), `content_hash` (sha256 hex over the normalised
     payload), `event_id` (UUIDv7 from the source), `trace_id`;
   - `post`: `channel {handle, telegram_id?, title?}`, `post_id` (int), `post_url`, `posted_at` (ISO-8601 with offset),
     `edited_at?`, `text` (raw, ≤ 16 000 chars), `forward_from {channel_handle, post_id}?`, `media[] {type, url,
     sha256?, phash?, order}`, `grouped_id?` (album);
   - `hints` (optional, never trusted as final): `deal`, `rent_period` (`long`, `daily`), `property_type`, `price
     {amount_minor, currency, price_type}`, `rooms`, `area_total_m2`, `floor`, `floors_total`, `district_slug`,
     `landmark`, `lat`, `lng`, `contacts[] {phone_e164?, role}`, `language`;
   - `kind`: `offer` (default) or `demand` (`buy`, `rent_wanted` → stored, never published, CF-016).
4. `backend/config/intake.php`: `schema_version` → `2` with `accepted_schema_versions` `[1, 2]` (v1 stays accepted for
   collectors that only send hints), `deal_types` + `rent_periods` (`long`, `daily`), `kinds`, text and media caps,
   `max_body_bytes` (5 MB), `batch_max` 100 (agent rule 9 allows 500; HANDOFF T2 fixed 100), the photo host allowlist
   key used by KV-BE-127.
5. `php artisan make:enum Enums/Intake/IntakeKind --no-interaction` and `Enums/Intake/RentPeriod` if KV-BE-014 has not
   created `Listings\RentPeriod` (reuse it when it exists).
6. `SourceSeeder` (existing file): add `homi_channels` (trust 1.00) and `kvadro_legacy` (trust 0.10, lowest); remove
   the `geo_uz` row from the seed list (an existing row in a database is kept, flagged `inactive`) — CF-007 correction;
   wire `SourceSeeder` into `DatabaseSeeder` (HANDOFF T2 note). Add an `active` boolean to `sources` only if KV-DB-008
   did not (additive migration, `php artisan make:migration add_active_to_sources_table --no-interaction`).
7. `php artisan make:class Domain/Intake/IntakePayload --no-interaction` (readonly DTO built from a validated array,
   `fromArray()`/`toArray()`, `contentHash()` canonical JSON with sorted keys) — the single shape KV-BE-122 and the
   in-repo reader (KV-BE-125) both produce.
8. JSON fixtures `backend/tests/Fixtures/intake/homi_channels/*.json` (10 representative synthetic posts: rent long,
   rent daily, sale with down payment, UZS price, album, repost, demand post, no price, edited post, deleted post) —
   agent rule 11.

## Files

- `docs/api/intake.md` (new)
- `backend/config/intake.php`, `backend/database/seeders/SourceSeeder.php`, `backend/database/seeders/DatabaseSeeder.php`
- `backend/app/Domain/Intake/IntakePayload.php`, `backend/app/Enums/Intake/IntakeKind.php` (new)
- `backend/tests/Fixtures/intake/homi_channels/*.json`, `backend/tests/Unit/Intake/IntakePayloadTest.php`,
  `backend/tests/Feature/Intake/SourceSeederTest.php` (new)

## API contract

Contract document only; the endpoints are implemented by KV-BE-122 and KV-BE-123:
`POST /api/v1/intake/listings` (batch 1–100 of payload v2), `POST /api/v1/intake/listings/{id}/events`,
`GET /api/v1/intake/listings/{id}`; envelope per ADR-0007; `202` with HOMI ids; `409` never used for replays (replay
returns the stored first response).

## Business rules

- BR-DATA-020 (publication = (channel, post id)), BR-API-049 (publications feed history and counters), BR-DATA-008
  (USD computed by HOMI), CF-016 mapping (`rent` + `long` → `rent_long`, `rent` + `daily` → `rent_daily`, `rent`
  without period → `rent_long` with a `period_inferred` flag recorded on the event).
- Demand posts are never published (no legacy counterpart, CF-016).

## Acceptance criteria

- `docs/api/intake.md` lists every field with type, requirement and example, and the rejection codes per field.
- `IntakePayload::contentHash()` is stable under key order and whitespace changes and differs when text, price or
  media change.
- `php artisan db:seed` creates `homi_channels`, `telegram_uz`, `datahub_uz`, `kvadro_legacy` and no new `geo_uz` row.

## Tests

- `IntakePayloadTest`: `content_hash_ignores_key_order`, `content_hash_changes_with_text`, `rent_with_daily_period_maps_to_rent_daily`,
  `rent_without_period_maps_to_rent_long_and_flags_inference`, `demand_kind_round_trips`, `v1_payload_still_parses`.
- `SourceSeederTest`: `seeds_four_sources_with_trust_order` (`kvadro_legacy` lowest), `existing_geo_uz_row_is_kept_inactive`,
  `seeder_is_idempotent`.
- Fixture self-test: every file under `tests/Fixtures/intake/homi_channels/` parses into `IntakePayload`.

## Edge cases

- A post edited at the source after acceptance: same `(channel, post_id)`, new `content_hash`, new `source_version`.
- An album (several messages with one `grouped_id`) is one post: the reader merges it before sending.
- A post with several lots (`segment_index` in `telegram.uz`): `external_id` carries the segment; publications stay
  unique by `(channel, post_id)` only for single-lot posts — the contract says multi-lot posts are `demand`-like
  "not published" until a product decision (no legacy evidence of multi-lot cards).
- Phone sent raw in `hints.contacts` by a v1 collector: hashed on the way in, warning logged without the number (agent
  rule 8).

## Security

- SEC-REQ-036 (minimisation: raw phones only behind the PII gate, never logged), SEC-REQ-047 (logging), SEC-REQ-023
  (photo URLs only from the allowlist), SEC-REQ-040 (opt-outs block re-ingestion — the contract names the rejection
  code `channel_opted_out`). No real channel handles or phones in fixtures (`15` §1.7).

## Definition of done

Tests green (`make ci-backend`), `docs/api/intake.md` reviewed by the first developer (it is the contract external
collectors will implement), `09` rows F-PIPELINE-001 and F-PIPELINE-003 updated, PR reviewed by the other developer;
the shared-file change (`DatabaseSeeder`) announced in the PR.
