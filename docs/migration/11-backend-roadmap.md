# 11 — Backend roadmap

Part of the kvadro² → HOMI migration audit (rules, labels, ID scheme and the migration policy:
[`README.md`](README.md)). Milestone IDs are those of [`13-dependency-graph.md`](13-dependency-graph.md) §1; the task
format is [`tasks/README.md`](tasks/README.md).

- **Status:** wave 2 (2026-11-09). Plan only — no application code exists for any task below. Every architecture
  choice is the `PROPOSED` option of [`10-target-architecture.md`](10-target-architecture.md) §3; every deviation
  `DEV-…` is `PROPOSED` ([`09`](09-feature-parity-matrix.md) §4.2) and every "defect fix without a DEV" (`09` §4.3) is
  `APPROVED` by the migration policy.
- **Scope of this document:** the backend milestones M0–M8. M0–M3 and the database track are detailed down to task
  files; M4, M6 and M7 list the features their tasks must cover (task numbers KV-BE-1NN (100–199), written by another
  session); M5 belongs to the telegram track (`KV-TG-…`), M8 to the database and QA tracks.
- **Numbering:** `KV-BE-001…099` = backend tasks of M0–M3 (51 used); KV-BE-1NN (100–199) = M4, M6, M7 (to be written);
  `KV-DB-001…099` = database track (37 used; KV-DB-001…031 keep the numbers and titles of the candidates in
  [`14-data-migration-plan.md`](14-data-migration-plan.md) §8, KV-DB-032…037 are new). QA tasks `KV-QA-…` are defined
  in [`15-testing-strategy.md`](15-testing-strategy.md) §6. Other tracks are referenced by the feature, API, decision or
  HANDOFF task they deliver, never by a guessed number.
- **Owner:** every `KV-BE` task and the schema `KV-DB` tasks belong to the development track (second developer);
  production-track (first developer) steps are marked **[PT]** inside the task files
  ([`docs/handoff/parallel-work.md`](../handoff/parallel-work.md) §1).

## 1. Ground rules for every backend task

1. **Adapters over shared services** (`10` §4.1): the legacy surface (`routes/legacy.php`, `App\Http\Controllers\Legacy`,
   `App\Http\Serializers\Legacy`) only translates; business rules live once in `app/Services/<Module>` and
   `app/Domain/<Module>` so the bot (M5) and `/api/v1` (M9) reuse them. Pest `arch()` tests enforce the rules of `10` §4.2.
2. **Byte parity on the legacy surface** (`08` §1): bare JSON, `{"detail": "<string>"}` errors, strict keys always
   present, integer listing ids, arrays never `null`, no empty `200`, `Cache-Control: private, no-store`. Every
   endpoint is proven by the fixture-driven contract harness of KV-QA-004 with the golden fixtures of KV-QA-002.
3. **Expected outputs follow `15` §1.4:** an `APPROVED` defect fix is asserted now; a `PROPOSED` DEV is implemented
   behind configuration where it changes legacy behaviour and its test is written as `->todo('DEV-NNN PROPOSED')`;
   behaviour that legacy never exposed is **spec-tested** and says so in the test name.
4. **HOMI conventions** (`CLAUDE.md`): files from `php artisan make:* --no-interaction`; new models with factory and
   seeder; Pest feature tests first; `vendor/bin/pint --dirty --format agent`; PHPStan level 7 (`composer types:check`);
   `make ci-backend` green; one task = one branch and one PR of roughly ≤ 400 changed lines (generated files excluded).
5. **Owner-scoped by construction** (SEC-REQ-014): per-user records are loaded through the owner relation; a foreign id
   answers exactly like an unknown id.
6. **No new dependencies.** Every task below uses installed packages (Laravel 13, Sanctum, Horizon, Pennant, Telescope,
   `laravel/ai`, `intervention/image`, Pest). PostGIS SQL is written through the query builder (`selectRaw`,
   `whereRaw` with bindings), not a PostGIS package. Things that do need approval are named where they appear:
   the PostGIS CI image (DEC-23, KV-QA-001 / KV-DB-005), a response validator for the legacy OpenAPI document (DEC-23,
   optional — KV-QA-004 works without it). Each is "PROPOSED — needs first developer approval (dependency change)"; `symfony/yaml` as a direct dependency if the legacy OpenAPI document of KV-BE-012/013 is linted as YAML (today it
   arrives only transitively through `laravel/ai`; the fallback is a JSON document).
7. **Secrets and data:** synthetic fixtures only (`15` §1.7), no `.env` reads, new env keys announced in the PR and added
   to `backend/.env.example` in a separate small PR (shared file); besides the names of `17` §4 these tasks propose
   `ERASURE_SUBJECT_KEY` (erasure ledger HMAC, KV-DB-007, KV-BE-049, KV-BE-050) and `TELEGRAM_SUPPORT_BOT_USERNAME`
   (KV-BE-022, already listed in `17` §4).

## 2. Milestone overview

| ID | Milestone | Backend content | Tasks | Depends on | Unlocks | Blocking decisions |
| -- | --------- | --------------- | ----- | ---------- | ------- | ------------------ |
| **M0** | Decisions and foundations | ADRs (compatibility surface, numbers + cursors, money, PostGIS, ADR-0014 photos); Media ownership fix; legacy route group with `{detail}` renderer; `initData` verifier and `tma` guard; access gate; legacy limiters; log redaction; identity schema; legacy OpenAPI document | KV-BE-001…013; KV-DB-004, KV-DB-005, KV-DB-007 | DEC answers for CF-001…003, CF-005, CF-014 | everything | DEC-01, DEC-09, DEC-10, DEC-11, DEC-23, DEC-25 |
| **M1** | Core data model and reference data | Geo dictionaries and aliases; listings with `number`; publications, history, photos, translations; personal lists; radar and delivery tables; derived data; partitions; domain value objects; filter normaliser; number resolver; gazetteer; exchange rates | KV-BE-014…019; KV-DB-006, 008…011, 032…035 | M0 | M2–M7 | DEC-09, DEC-10, DEC-11; Q-DATA-028…030, Q-API-020, Q-API-054 |
| **M2** | Mini App read path | Server display formatter; `GET /api/bot`, `/api/meta`, `/api/cities`, feed, count, flow, map, listing details; signed `/media`; `/call`; phone quota; owner badges | KV-BE-020…037 | M1 | M3, M4, S1 | DEC-19, DEC-26; Q-API-010, Q-API-011, Q-API-022, Q-API-035, Q-API-042 |
| **M3** | Per-user features | Favourites, history, hidden, blocked authors, «Скрытое», votes and reports, found survey, settings, share, translation (LLM gateway with masking), retention ADR, erasure procedure | KV-BE-038…050 | M2 | S1 | DEC-03, DEC-12; HANDOFF T1 (Bot API client); Q-API-036…040, Q-API-048 |
| **M4** | Radars and delivery | to be detailed (§7) | KV-BE-1NN (100–199) | M2 (+ M5 webhook for delivery) | S1 | DEC-20; Q-BOT-002, Q-BOT-003, Q-BOT-017 |
| **M5** | Telegram bot | telegram track (§8) | `KV-TG-…` | M1 (M4 for radar features) | S1 | DEC-05, DEC-17, DEC-24; Q-BOT-017 |
| **M6** | Ingestion pipeline | to be detailed (§9) | KV-BE-1NN (100–199); KV-DB-029 | M1 | fresh data after S2 | DEC-02, DEC-03; OPQ-1 |
| **M7** | Landing/SEO data, analytics, retention | to be detailed (§10) | KV-BE-1NN (100–199); KV-DB-028 | M1, M6 | S1 | DEC-08, DEC-12, DEC-14, DEC-15, DEC-26, DEC-30 |
| **M8** | Data migration and rehearsals | database + QA tracks (§11) | KV-DB-001…003, 012…027, 029…031, 036, 037; KV-QA-018 | M1–M7, legacy dump | **S2** | DEC-13, DEC-18; Q-DATA-001…005 |
| **M9** | New HOMI frontends | frontend track; v1 adapters over the M2–M3 services (§12) | — | M2 contracts | **S4** | DEC-06, DEC-22 |

## 3. M0 — Decisions and foundations

**Goal.** The decisions that shape every table and route are written as ADRs and sent for approval; the existing Media
defect is closed; a request to `/api/*` on a legacy host is authenticated by `tma`, passes the access gate and the
legacy limiters, and every failure is rendered in the legacy `{detail}` dialect — before any endpoint exists.

**Features.** F-COMPAT-001, F-COMPAT-002 (limiters), F-ACCESS-001, F-ACCESS-002, F-ACCESS-003, F-ADMIN-001 (P1,
commands only), F-MEDIA-001 (ownership and image-safety prerequisites), F-MAP-002 (PostGIS prerequisite).

**Tasks.**

| ID | Title | Cx | Features | Depends on | Status | Scope |
| -- | ----- | -- | -------- | ---------- | ------ | ----- |
| KV-BE-001 | [ADR: kvadro² compatibility surface](tasks/backend/KV-BE-001-compatibility-surface-adr.md) | S | F-COMPAT-001, F-ACCESS-001, F-LOCALE-001, F-LOCALE-003 | CF-001, CF-002, CF-006, CF-017, CF-018, CF-020; DEC-01 | TODO | One ADR (next free number; 0014 is reserved for T4): scope, legacy hosts, `{detail}` dialect and status table (`10` §4.7), `tma` second credential on legacy routes only, `uz_Latn` mapping, server-side formatting, hand-written legacy OpenAPI, limiter classes, sunset rule (DEC-01) |
| KV-BE-002 | [Media ownership fix (SEC-026, SEC-027)](tasks/backend/KV-BE-002-media-ownership-fix.md) | M | F-MEDIA-001 | — | TODO | `media_file_references` (owner type + id) separate from the content-addressed `media_files`; `MediaFilePolicy` on `show`/`destroy` (`MediaController.php:46-60`); object deleted only when the last reference goes; owner type in upload prefixes and in the reference; second-actor tests (SEC-REQ-016) |
| KV-BE-003 | [Media uploader: dimensions checked before decoding (SEC-028)](tasks/backend/KV-BE-003-media-dimension-check.md) | S | F-MEDIA-001 | — | TODO | Read image header dimensions (`getimagesize`) and a pixel cap before `intervention/image` decodes (`HashedUploader.php:50-58`); pixel-flood tests |
| KV-BE-004 | [ADR-0014 extension: listing photos and signed legacy URLs](tasks/backend/KV-BE-004-adr-0014-listing-photos.md) | S | F-MEDIA-001, F-LISTING-002 | KV-BE-002; CF-012; HANDOFF T4 | TODO | ADR-0014 (written in T4) gains: third-party listing photos private, JPEG 800/480 legacy renditions, HMAC-signed `/media/{number}/{n}(.s).jpg?e&s` (SEC-REQ-024), `X-Accel-Redirect`, erasure with reference counting (SEC-REQ-025) |
| KV-BE-005 | [Legacy route group, host binding and the `{detail}` renderer](tasks/backend/KV-BE-005-legacy-route-group.md) | M | F-COMPAT-001 | KV-BE-001 (draft agreed) | TODO | `routes/legacy.php` registered in `bootstrap/app.php` (`then:`), `config/legacy.php` (`LEGACY_SURFACE_ENABLED`, `LEGACY_APP_HOSTS`, `LEGACY_SITE_HOSTS`), host middleware, `legacy` middleware group (no-store, no CORS), `LegacyExceptionRenderer` before `ApiExceptionRenderer`, `LegacyController::json()` (no empty `200`), unknown `/api/*` on legacy hosts → `404 {"detail":"Not Found"}`, `405`, `config/cors.php` paths narrowed to `api/v1/*` (SEC-REQ-032), `arch()` rules |
| KV-BE-006 | [Telegram `initData` verifier](tasks/backend/KV-BE-006-initdata-verifier.md) | M | F-ACCESS-001 | KV-QA-003 (signer) | TODO | `TelegramInitDataVerifier` per SEC-REQ-001 (parse once, duplicate keys, 4 KB cap, data-check-string, `WebAppData` key, `hash_equals`), `auth_date` window SEC-REQ-002 (`TELEGRAM_INITDATA_MAX_AGE` 86 400 s until Q-API-002), fingerprint for logs (SEC-REQ-003); shared with HANDOFF T6 |
| KV-BE-007 | [`tma` guard and Telegram user resolution](tasks/backend/KV-BE-007-tma-guard-user-resolution.md) | M | F-ACCESS-001, F-ACCESS-003 | KV-BE-005, KV-BE-006, KV-DB-007 | TODO | `auth:tma` request guard on the legacy group only; `UserResolver` creates users race-safely without names (CF-015, SEC-REQ-036), profile flags and account-age estimate (BR-API-007), random analytics id, default settings; empty `tma ` → `401 unauthorized` logged at info (LB-API-001); `Bearer` on legacy and `tma` on v1 → `401` (SEC-REQ-004) |
| KV-BE-008 | [Log and Telescope redaction](tasks/backend/KV-BE-008-log-redaction.md) | S | F-ACCESS-001, F-PRIVACY-004 | — | TODO | Monolog processor redacting `Authorization`, `initData`, `tgWebAppData`, bot-token pattern, webhook secret, phones (SEC-REQ-047, SEC-REQ-013); Telescope hidden headers/parameters and job-payload filter; `TELESCOPE_ENABLED` in `.env.example` (SEC-034, LB-API-020) |
| KV-BE-009 | [Access gate (closed-beta reasons)](tasks/backend/KV-BE-009-access-gate.md) | M | F-ACCESS-002 | KV-BE-007, KV-DB-007 | TODO | `AccessGate` service (states `private`, `invite`, `full`, `blocked`, `join`, granted), `config/access.php` (`ACCESS_MODE`, `ACCESS_MAX_SEATS`), owner list in `access_grants`, middleware on every protected legacy route (SEC-REQ-006) and a guard method for bot handlers; five reason strings byte-identical (BR-API-011); DEV-001 `PROPOSED` |
| KV-BE-010 | [Legacy rate limiters and trusted proxies](tasks/backend/KV-BE-010-legacy-rate-limits.md) | M | F-COMPAT-002 | KV-BE-005, KV-BE-007 | TODO | Named limiters for every legacy route class of SEC-REQ-027 keyed by user (anonymous: IP), `429 {"detail":"rate_limited"}` + `Retry-After`, legacy group outside the `api` 120/min limiter, trusted-proxy configuration **[PT input]**, 30-request radar-tab burst passes (CF-018) |
| KV-BE-011 | [Access administration commands](tasks/backend/KV-BE-011-access-admin-commands.md) | S | F-ADMIN-001 | KV-BE-009 | TODO | `php artisan access:grant|block|unblock|owner|invite|seats` (invite tokens stored hashed, audit log line without Telegram ids) until ARM exists (GAP-020, GAP-023) |
| KV-BE-012 | [Legacy OpenAPI document, part 1](tasks/backend/KV-BE-012-legacy-openapi-part1.md) | M | F-COMPAT-001 | KV-BE-001 | TODO | `docs/api/kvadro-legacy.openapi.yaml` (CF-020): shared models of `08` §1.8 with strict keys as `required` + nullable, error body, `FilterQuery`; API-001…API-010; RES-001, RES-002, RES-005 |
| KV-BE-013 | [Legacy OpenAPI document, part 2](tasks/backend/KV-BE-013-legacy-openapi-part2.md) | M | F-COMPAT-001 | KV-BE-012 | TODO | API-011…API-034 (radar endpoints included so M4 has the frozen contract), `204` rules of BR-API-020, document lint step without new dependencies |

Database track in M0: [KV-DB-004](tasks/database/KV-DB-004-id-money-decisions.md) (ADRs for public numbers, keyset
cursors and money), [KV-DB-005](tasks/database/KV-DB-005-postgis.md) (PostGIS ADR and enablement),
[KV-DB-007](tasks/database/KV-DB-007-identity-schema.md) (identity schema — pulled forward from M1 because the `tma`
guard and the access gate need it).

**Exit criteria.**

- ADR drafts for CF-001 (with CF-002, CF-006, CF-017, CF-018, CF-020), CF-003 + CF-004, CF-005, CF-014 and the
  ADR-0014 photo section are in review; accepted ones are merged (a still-open decision is listed with its DEC id in
  `session-handoff.md`, never assumed).
- SEC-026, SEC-027, SEC-028 closed: the new second-actor tests pass and the existing 28 media cases stay green.
- On a legacy host, `/api/<anything>` answers in the `{detail}` dialect only (`401`, `403 <reason>`, `404`, `405`,
  `422`, `429`, `500`); on `api.*` the same path is refused; `/api/v1/*` still answers the ADR-0007 envelope.
- The negative-authentication table of `16` §5.1 and `15` §3.2 rows 1–10 pass on a test-only legacy route.
- Every access state × a test-only protected route returns the expected status; `blocked` reaches nothing.
- A log/Telescope capture across an auth failure contains no `initData`, token or phone pattern.
- PostGIS is available locally and in CI (if DEC-23 approves the image); `migrate:fresh` runs on PostgreSQL 18.

**Risks.** ADR review latency on the first developer (mitigation: drafts first, code behind
`LEGACY_SURFACE_ENABLED`); PostGIS refused on the shared server (fallback CF-014 option B degrades the lasso and
nearest-neighbour medians — record before M1); the legacy `auth_date` window is unknown (Q-API-002) — HOMI starts at
86 400 s and never shortens below the measured value; the real edge (Cloudflare kept or not, DEC-16) decides the
trusted-proxy list and therefore limiter keys; renderer ordering (a legacy error wrapped in the ADR-0007 envelope
would read as `detail = null` in the old client).

**Blocking decisions and questions.** DEC-01 (freeze and sunset, needed for ADR acceptance), DEC-09 (PostGIS on
`5.45.127.98`), DEC-10 and DEC-11 (money; numbers and cursors), DEC-23 (PostGIS CI image), DEC-25 (access mode value at
S2 — configuration only); Q-API-002, Q-API-003, Q-API-005, Q-API-006, Q-API-001.

## 4. M1 — Core data model and reference data

**Goal.** Every table the read path, the per-user features, radars and the data migration need exists as reviewed
migrations with factories and seeders; reference data for the six cities resolves every legacy code; the shared domain
objects (numbers, locale, money, the 25-key filter) and the daily CBU rate exist.

**Features.** F-FILTER-001 (normaliser), F-LOCALE-001 (locale mapping), F-PIPELINE-004 (gazetteer foundations),
F-PIPELINE-007 (rate), F-LISTING-001 and F-SHARE-002 (numbers and aliases); schema for F-SETTINGS-001, F-LISTING-006,
F-MEDIA-001, F-FAV-001, F-HISTORY-001, F-HIDE-001…003, F-REPORT-001, F-OWNER-002, F-DELIVERY-005 and the radar features
of M4.

**Tasks.**

| ID | Title | Cx | Features | Depends on | Status | Scope |
| -- | ----- | -- | -------- | ---------- | ------ | ----- |
| KV-BE-014 | [Domain value objects and enums](tasks/backend/KV-BE-014-domain-value-objects.md) | M | F-LOCALE-001, F-LISTING-001, F-FILTER-001 | KV-DB-004 | TODO | `ListingNumber`, `LocaleCode` (`uz_Latn` ↔ `uz`, Telegram `language_code` per DEV-020 `PROPOSED`), `UsdAmount`/`Money` (integer cents), enums with TitleCase keys: `LegacyDeal` ↔ (`Deal`, `RentPeriod`), `PropertyType`, `OwnerFilter`, `ListingStatus`, `MedianTone`, `MapTone`, `ReportReason`, `NearbyKind`, `AccessState`, `Theme`, `Currency` |
| KV-BE-015 | [Gazetteer service and dictionary code resolution](tasks/backend/KV-BE-015-gazetteer-service.md) | M | F-PIPELINE-004, F-FILTER-004, F-ONBOARD-001 | KV-DB-006, KV-DB-034, KV-BE-014 | TODO | `Gazetteer` (cities, districts, zones, metro, quarters, renovations, appliances) resolving aliases on input and emitting the legacy API code on output (LB-DATA-001), localised names with `ru` fallback, cached and flushed on seed |
| KV-BE-016 | [`SearchFilters` value object, normaliser and canonical hash](tasks/backend/KV-BE-016-search-filters-normaliser.md) | L | F-FILTER-001, F-FILTER-006 | KV-BE-014, KV-BE-015 | TODO | The 25-key model with one normaliser/validator for legacy, v1 and bot (SEC-REQ-017): enums per deal (BR-API-028/029), ranges, polygon 3–40, `zone` → `zones` (LB-API-028), `toLegacyArray()` with all 25 keys (LB-API-005), canonical hash without `posted_days`; DEV-004, DEV-005, DEV-017, DEV-025 `PROPOSED` behind config |
| KV-BE-017 | [Legacy filter query parsing and form-request base](tasks/backend/KV-BE-017-legacy-filter-query.md) | M | F-FILTER-001, F-COMPAT-001 | KV-BE-016, KV-BE-005 | TODO | `LegacyFilterRequest`: repeated keys (BR-API-025), `+` spaces, booleans only `=true`, tri-state `furnished`, literal `undefined`, `polygon` string, `limit`/`sort`/`cursor`; `failedValidation` → `422 {"detail":"invalid_<field>"}`; Q-API-007 probe set never `500` |
| KV-BE-018 | [Listing number resolver and alias redirect](tasks/backend/KV-BE-018-listing-number-resolver.md) | S | F-LISTING-001, F-SHARE-002 | KV-DB-008, KV-BE-014 | TODO | `ListingNumberResolver`: number → listing through `listing_aliases` (chains flattened at write, BR-API-048, BR-DATA-019); positive integers < 2^53 only; unknown, foreign-to-nobody and malformed numbers → one not-found path |
| KV-BE-019 | [Exchange rates: CBU fetch, `RateService`, staleness alert](tasks/backend/KV-BE-019-exchange-rates.md) | M | F-PIPELINE-007, F-FILTER-006, F-SETTINGS-004 | KV-DB-011, KV-DB-004 (money ADR) | TODO | `rates:fetch` command + queued job on `default`, scheduled 09:30 and 12:00 Asia/Tashkent with hourly retry (`10` §4.11), `RateService::usdUzs(date)`, alert when the latest rate is > 2 days old; `CBU_RATES_URL`, `RATE_STALE_AFTER_HOURS`; `Http::fake` tests; Q-API-054 |

Database track in M1: [KV-DB-006](tasks/database/KV-DB-006-geo-dictionaries.md),
[KV-DB-008](tasks/database/KV-DB-008-listings-schema.md), [KV-DB-009](tasks/database/KV-DB-009-radar-delivery-schema.md),
[KV-DB-010](tasks/database/KV-DB-010-personal-lists-schema.md), [KV-DB-011](tasks/database/KV-DB-011-derived-data-schema.md),
[KV-DB-032](tasks/database/KV-DB-032-listing-history-schema.md),
[KV-DB-033](tasks/database/KV-DB-033-listing-photos-translations-schema.md),
[KV-DB-034](tasks/database/KV-DB-034-gazetteer-seeds.md), [KV-DB-035](tasks/database/KV-DB-035-partition-manager.md) (§13).

**Exit criteria.**

- `php artisan migrate:fresh --seed` runs on PostgreSQL 18 + PostGIS; every new model has a factory and a seeder;
  the KV-QA-005 coverage dataset can be built on top.
- Every legacy code and SEO slug of the six cities resolves through `dictionary_code_aliases` (test), and the legacy
  API code comes back out unchanged.
- The `SearchFilters` normaliser passes the Q-API-007 probe set of SEC-REQ-017 (`422` or normalised, never `500`) and
  returns all 25 keys for every input; its canonical hash ignores `posted_days`.
- A listing number allocated by the sequence is above every preserved and alias number (`14` §3, V-RI-9 on synthetic
  data); an alias number resolves to its survivor.
- `rates:fetch` stores a rate from a faked CBU response; a stale rate raises the operator alert.

**Risks.** Reference data without the legacy dump: names, codes and city flags come from `$KVADRO_ROOT/docs/*`, the
parity mocks and the SEO slugs (`03b` §2.2); mock values are shape examples, not values (`15` §1.3 O4) — the seeds are
marked `spec` and reconciled by KV-DB-015 at R1. The partition design of `listing_views` conflicts with its
`(user_id, listing_id)` upsert key (`10` §4.9 vs `06` §4.2) — KV-DB-010 records the choice. Number-sequence gaps
depend on legacy growth (Q-DATA-002).

**Blocking decisions and questions.** DEC-09, DEC-10, DEC-11; Q-DATA-028…030 (dictionary sources), Q-API-012 (code
formats), Q-API-020 (gazetteer), Q-API-026 (city zooms), Q-API-054 (CBU endpoint and rounding); LB-DATA-010 (history
cap, with DEV-003).

## 5. M2 — Mini App read path (P0)

**Goal.** The unchanged legacy Mini App boots, searches, shows the map and opens listings on HOMI: `GET /api/bot`,
`/api/meta`, `/api/cities`, `/api/feed`, `/api/feed/count`, `/api/feed/flow`, `/api/map`, `/api/listings/:id`,
`/api/listings/:id/call`, signed `/media` and `/call/<token>` are byte-compatible with `08`.

**Features.** F-ONBOARD-001, F-ONBOARD-002 (meta part), F-ONBOARD-003 (cities part), F-FEED-001, F-FILTER-001,
F-FILTER-003, F-FILTER-004, F-FILTER-005, F-FILTER-006, F-FILTER-007, F-MAP-001, F-MAP-002, F-MAP-003, F-LISTING-001,
F-LISTING-002, F-LISTING-004, F-LISTING-006, F-LISTING-007, F-CONTACT-001, F-CONTACT-002, F-SHARE-002, F-OWNER-002,
F-MEDIA-001, F-MEDIA-002 (`meta.tiles`), F-MEDIA-003, F-TMA-002, F-LOCALE-001, F-LOCALE-003, F-COMPAT-002 (count/flow
cache), F-SETTINGS-004 (display currency in strings), F-ACCESS-002 (reasons on meta), F-ANALYTICS-002 (P1,
`meta.analytics`).

**Tasks.**

| ID | Title | Cx | Features | Depends on | Status | Scope |
| -- | ----- | -- | -------- | ---------- | ------ | ----- |
| KV-BE-020 | [Server display catalogues and the money/price formatter](tasks/backend/KV-BE-020-money-price-formatter.md) | L | F-LOCALE-003, F-FILTER-006, F-SETTINGS-004 | KV-BE-014, KV-BE-019; KV-QA-006 | TODO | `backend/lang/{ru,uz,en}` catalogues (same keys, plural forms), `LegacyDisplayFormatter::price()` per locale × currency (` · ` parts, `(…)`, `/мес`), UZS round-first rule (LB-APP-011 fix), number grouping per locale, `down_payment`; shared money fixture of KV-QA-006; Q-API-022 spec-tested |
| KV-BE-021 | [Time, age, distance and title formatters](tasks/backend/KV-BE-021-time-distance-formatters.md) | M | F-LOCALE-003, F-LISTING-006, F-LISTING-007 | KV-BE-020 | TODO | `age` (`<prefix> · <when>`, Asia/Tashkent days, BR-API-072, BR-API-150), ISO-8601 `Z` timestamps (BR-API-151), one distance formatter (DEV-019 `PROPOSED`), `title`/`short_title`, `status_text`, `market` labels, `facts[].label/value` vocabulary |
| KV-BE-022 | [API-003 `GET /api/bot`](tasks/backend/KV-BE-022-api-bot.md) | S | F-TMA-002, F-ACCESS-002 | KV-BE-005, KV-BE-010 | TODO | Anonymous `{"username", "support"}` from config (`TELEGRAM_BOT_USERNAME`, `TELEGRAM_SUPPORT_BOT_USERNAME`), ignores any `Authorization` (BR-API-009, SEC-REQ-005), IP limiter |
| KV-BE-023 | [Listing search predicates and per-user exclusions](tasks/backend/KV-BE-023-listing-search-predicates.md) | L | F-FILTER-001, F-MAP-002, F-HIDE-001, F-HIDE-002, F-FEED-001 | KV-BE-016, KV-DB-008, KV-DB-010; KV-DB-005 (polygon) | TODO | `ListingSearchService::query(SearchFilters, User)`: every key of BR-API-026…037 on active listings, polygon `ST_Covers` on `geography` (PostGIS), hidden listings and blocked authors excluded server-side (LB-API-041), takedowns and opted-out channels never shown (BR-DATA-022); one query object shared by feed, count, flow, map and (M4) matching |
| KV-BE-024 | [`below_median` predicate and market availability rule](tasks/backend/KV-BE-024-below-median-filter.md) | S | F-FILTER-007 | KV-BE-023, KV-BE-016, KV-DB-011 | TODO | `median_delta ≤ +0.10` (`07` C-08; Q-API-011 spec-tested) from `listing_market`; availability by city `median` flag, deal and type (BR-API-064; DEV-052 `PROPOSED`) |
| KV-BE-025 | [Owner badge resolver](tasks/backend/KV-BE-025-owner-badges.md) | S | F-OWNER-002 | KV-DB-008, KV-DB-010 | TODO | `is_owner` from `owner_status`; `owner_verified` = author phone HMAC (or the transitional `owner_verifications.legacy_hash` of KV-DB-010; LB-DATA-005, DEV-011 `PROPOSED`) matches a verification, < 3 distinct flats, no realtor mark (BR-API-108, BR-API-109); badge priority data for previews (BR-API-111, C-09) |
| KV-BE-026 | [Listing photo store, legacy renditions and signed photo URLs](tasks/backend/KV-BE-026-listing-photo-store.md) | M | F-MEDIA-001, F-LISTING-002 | KV-BE-002, KV-BE-004, KV-DB-033 | TODO | `ListingPhotoStore` (the existing private media disk `media.disks.private` / `MEDIA_PRIVATE_DISK`, which `10` §4.15 calls `media_private`; EXIF stripped by re-encoding, reference via `listing_photos`), `BuildLegacyRenditions` job on `media` (JPEG 800 / 480, no upscaling), `SignedPhotoUrl` (`e` = midnight UTC 24–48 h ahead, `s` = 32 hex of HMAC over number, `n`, `e`; key rotation; SEC-REQ-024, BR-API-055, BR-API-152) |
| KV-BE-027 | [RES-001 / RES-002 legacy media route](tasks/backend/KV-BE-027-legacy-media-route.md) | M | F-MEDIA-001, F-LISTING-002 | KV-BE-026, KV-BE-005, KV-BE-010 | TODO | `GET /media/{number}/{n}.jpg` and `.s.jpg` on both legacy hosts: signature, expiry, listing status on every request, one uniform `404` (LB-API-023 fix), `X-Accel-Redirect` to the internal location **[PT/INF: nginx]**, `Cache-Control: public, max-age=86400`, `ETag`, `nosniff`; IP limiter |
| KV-BE-028 | [`ListingPreview` legacy serializer](tasks/backend/KV-BE-028-listing-preview-serializer.md) | M | F-FEED-001, F-LOCALE-003, F-OWNER-002 | KV-BE-020, KV-BE-021, KV-BE-025, KV-BE-026, KV-DB-010 | TODO | Every key of `08` §1.8 `ListingPreview`; strict keys always present (`id` integer, `favorite`, `photos_preview`, `metro_km`, `center_km`, `median_delta`); relative signed photo URLs; batched per-user flags (`favorite`, `viewed`) without N+1; enum outputs inside the legacy dictionary (LB-API-006) |
| KV-BE-029 | [`MetaService` and API-001 `GET /api/meta`](tasks/backend/KV-BE-029-api-meta.md) | L | F-ONBOARD-001, F-ONBOARD-002, F-ACCESS-002, F-LOCALE-001, F-SETTINGS-004, F-MEDIA-002, F-ANALYTICS-002 | KV-BE-009, KV-BE-010, KV-BE-015, KV-BE-019, KV-BE-020, KV-DB-007, KV-DB-011 | TODO | The union of all `MetaResponse` fields; the only route returning the five `403` reasons; `locale_chosen`/`city_chosen` derived (LB-API-018); `usd_uzs`; `analytics` from config + `users.analytics_distinct_id` (DEC-26); `max_subscriptions`; `bot_username`; `tiles` from `MAP_TILES_URL`; directories cached per locale (`zoom < 11` = region, LB-API-051) |
| KV-BE-030 | [API-002 `GET /api/cities`](tasks/backend/KV-BE-030-api-cities.md) | M | F-FILTER-004, F-ONBOARD-003, F-FILTER-006 | KV-BE-015, KV-BE-023, KV-BE-010, KV-DB-011 | TODO | One `CityStats` per `meta.cities` code with `counts` (three keys, zeros not missing), `presets` and `typical` in USD (BR-API-154); cached; DEV-023 `PROPOSED` (daily rent in counts) |
| KV-BE-031 | [API-004 `GET /api/feed` with keyset cursor and sorts](tasks/backend/KV-BE-031-api-feed.md) | M | F-FEED-001, F-FILTER-003, F-FILTER-001 | KV-BE-017, KV-BE-023, KV-BE-028; KV-DB-004 (cursor ADR) | TODO | Keyset cursor (sort key + `number`, base64url, validated, CF-004), `limit=20` capped, sorts `new`/`cheap`/`expensive`/`deal`/`center`/`ppm` (BR-API-024, Q-API-010 spec-tested), `next_cursor: null` as the only end (LB-API-004), no duplicates across pages |
| KV-BE-032 | [API-005 `GET /api/feed/count` and API-006 `GET /api/feed/flow`](tasks/backend/KV-BE-032-api-feed-count-flow.md) | M | F-FILTER-005, F-COMPAT-002 | KV-BE-023, KV-BE-016, KV-BE-021, KV-BE-010 | TODO | `{count}` and `{week, days, options[]}` with `days ≥ 1` (LB-API-007), options carrying full 25-key filters and codes (BR-API-040, LB-API-036); Redis cache by normalised filter hash + locale for 30–60 s (LB-API-052); `FlowEstimator` placed in the Radar module so M4 extends it |
| KV-BE-033 | [API-007 `GET /api/map`](tasks/backend/KV-BE-033-api-map.md) | M | F-MAP-001, F-MAP-002 | KV-BE-023, KV-BE-020, KV-BE-010 | TODO | `{points[{id, lat, lon, label, tone, priced, usd}], total}`; labels only from digits and the fixed currency format (SEC-REQ-018, LB-API-008 fix); map tone set (BR-API-061); listings without coordinates absent; `total ≥ points.length` (Q-API-015) |
| KV-BE-034 | [`ListingDetails` legacy serializer](tasks/backend/KV-BE-034-listing-details-serializer.md) | L | F-LISTING-001, F-LISTING-004, F-LISTING-006, F-LISTING-007, F-CONTACT-002 | KV-BE-028, KV-DB-032, KV-DB-011 | TODO | `facts` (unique keys), `nearby` whitelist (`park`/`school`, unique, LB-API-010), `stats`, `history` (strict `price_usd`, `change_pct`), `author`, `sources[]`, `original_*`, `post_deleted`, `offers`, all `median_*` keys (LB-API-009), `phone` ⇒ `call_url` (LB-API-016), `contact_url` allow-list (SEC-REQ-019) |
| KV-BE-035 | [Phone-disclosure quota](tasks/backend/KV-BE-035-phone-disclosure-quota.md) | S | F-CONTACT-001, F-LISTING-001 | KV-BE-007, KV-DB-007 | TODO | `ContactDisclosure` counts distinct listing numbers per user per Tashkent day (details with `phone`, call links); soft threshold → `phone`, `phone_display`, `call_url` = `null` (shape kept); hard threshold → review flag (SEC-REQ-028; thresholds DEC-19; DEV-007 `PROPOSED` keeps phones on legacy routes) |
| KV-BE-036 | [API-008 `GET /api/listings/:id`](tasks/backend/KV-BE-036-api-listing-details.md) | M | F-LISTING-001, F-MAP-003, F-SHARE-002, F-HISTORY-001 | KV-BE-018, KV-BE-034, KV-BE-035, KV-BE-010 | TODO | Alias → survivor with its own `id` (BR-API-048); `?preview=1` = exactly `ListingPreview` (LB-API-012); unknown/foreign/malformed → `404 {"detail":"Not Found"}`; withdrawn listing per Q-API-023 (spec); full `GET` records the view (Q-API-035 spec); limiter 120/min + quota |
| KV-BE-037 | [Call links: API-009 and RES-005 `/call/<token>`](tasks/backend/KV-BE-037-call-links.md) | M | F-CONTACT-001, F-MEDIA-003 | KV-BE-034, KV-BE-035, KV-BE-005 | TODO | `CallLinkService` (signed token: number, requesting user, expiry; TTL 10 min + skew, SEC-REQ-026), `{"url": "/call/<token>"}`, no-JS page with `tel:` (Laravel web route on the Mini App origin, not Inertia — ADR-0002), headers `noindex`, `no-store`, `no-referrer`, CSP `default-src 'none'`; expiry page; token for listing A never shows B |

**Exit criteria.**

- The contract harness (KV-QA-004) reports API-001…API-009 green against their golden fixtures (KV-QA-002), RES-001,
  RES-002 and RES-005 green against the `08` tests; no strict key missing, every listing id a JSON integer.
- Consistency (`15` §3.7 #1, #2, #10): the feed id set equals the map id set plus listings without coordinates, `count`
  equals the number of items reachable through pagination, `cities.counts` equals `feed/count` with default filters,
  every money number except `price` is USD.
- Security rows: `15` §3.1 #10–#12 and #14, §3.8 #6–#8 and #10, SEC-REQ-018 label test, SEC-REQ-019 URL test.
- p95 of feed, count and map measured on the coverage dataset (KV-QA-020) and inside the 15 s client budget with the
  count/flow cache warm.
- Read-only reference-client scenarios of KV-QA-011 pass on staging when the runner is approved; until then the gate
  item G10 stays open.

**Risks.** Server strings must match the legacy client byte for byte while the only oracle for values is invented mock
data (Q-API-022) — golden fixtures are spec-tested until the approved recording (`15` §1.6) or the dump (R1) gives
real values; no real listings exist before M6/M8, so the read path is proven on synthetic data; count and flow run on
every filter change (250/500 ms debounce) — the cache and the partial indexes of KV-DB-008 carry the load; an enum the
old dictionary lacks white-screens the old client (LB-APP-002) — KV-QA-007 enum-safety tests gate it; the medians
behind `median_*`, `below_median` and `sort=deal` are produced by M6, so M2 serializes whatever `listing_market` holds
(null-safe) and the M2 tests seed it.

**Blocking decisions and questions.** DEC-19 (quota thresholds), DEC-26 (PostHog project for `meta.analytics`), DEC-07
(legacy artefacts — infrastructure, needed for reference-client runs); Q-API-010, Q-API-011, Q-API-015, Q-API-016,
Q-API-022, Q-API-023, Q-API-035, Q-API-042, Q-API-047, Q-API-053 (tiles hosting), Q-APP-001 (JPEG kept until answered).

## 6. M3 — Per-user features (P0)

**Goal.** Every personal action of the legacy Mini App works on HOMI with server-side idempotency and owner-scoped
lookups: favourites, history, hidden listings, blocked authors and «Скрытое», reports and votes, the «Нашли жильё?»
answers, settings, sharing, translation; and one deletion procedure erases a user everywhere.

**Features.** F-FAV-001, F-HISTORY-001, F-HIDE-001, F-HIDE-002, F-HIDE-003, F-REPORT-001, F-REPORT-003 (P1),
F-DELIVERY-007 (API part), F-SETTINGS-001, F-SETTINGS-004, F-SETTINGS-005, F-ONBOARD-002 and F-ONBOARD-003 (settings
part), F-LOCALE-001, F-SHARE-001, F-LISTING-005, F-PRIVACY-004, F-PRIVACY-002.

**Tasks.**

| ID | Title | Cx | Features | Depends on | Status | Scope |
| -- | ----- | -- | -------- | ---------- | ------ | ----- |
| KV-BE-038 | [Favourites: API-011 toggle and API-029 list](tasks/backend/KV-BE-038-favourites.md) | M | F-FAV-001 | KV-BE-028, KV-DB-010, KV-BE-018 | TODO | `PersonalListService::toggleFavorite` serialised per (user, listing) with an atomic lock and the composite key (LB-API-039 for the legacy toggle, SEC-REQ-015), `{"favorite": bool}`; whole list with `next_cursor: null` (BR-API-023; DEV-003 `PROPOSED`); bot-facing `setFavorite(state)` for M5 |
| KV-BE-039 | [View history: API-030 and API-031](tasks/backend/KV-BE-039-view-history.md) | S | F-HISTORY-001 | KV-BE-036, KV-DB-010 | TODO | List most recent first (the view itself is recorded by KV-BE-036) with `next_cursor: null`, `DELETE` → `204`, cap behind config (DEV-003 / LB-DATA-010 `PROPOSED`), `viewed` flag source |
| KV-BE-040 | [Hidden listings: API-012 and API-013](tasks/backend/KV-BE-040-hidden-listings.md) | S | F-HIDE-001 | KV-BE-018, KV-DB-010 | TODO | Idempotent upsert / delete per (user, listing) (LB-API-043), `204`, excluded at once from feed/count/flow/map (KV-BE-023), undo of a `fraud` hide (BR-API-104) |
| KV-BE-041 | [Blocked authors: API-014 and API-015](tasks/backend/KV-BE-041-blocked-authors.md) | M | F-HIDE-002 | KV-BE-018, KV-DB-010, KV-DB-008 | TODO | Author = phone (HMAC) else source channel (BR-DATA-028); entry with a public `number` (CF-003); `{"listing_ids": [int…], "label": "<masked phone or @channel>"}` (BR-API-098); idempotent; `DELETE` by listing → `204` |
| KV-BE-042 | [«Скрытое»: API-026, API-027, API-028](tasks/backend/KV-BE-042-hidden-management.md) | M | F-HIDE-003 | KV-BE-040, KV-BE-041, KV-BE-028 | TODO | `{listings: ListingPreview[], authors: [{id, kind, label, count}]}` both always arrays; `DELETE /api/hidden/:id` by author entry `number`, owner-scoped (a listing id or another user's entry → `404`); `DELETE /api/hidden` clears both lists, radar hide rules untouched (Q-API-037 spec; DEV-034 `PROPOSED`) |
| KV-BE-043 | [Votes and reports: API-016](tasks/backend/KV-BE-043-votes-reports.md) | L | F-REPORT-001, F-REPORT-003 | KV-BE-040, KV-DB-010, KV-DB-032 | TODO | `VoteService`: reasons `rented`, `agent`, `wrong_data`, `fraud`; one row per (user, listing, reason); `200 {"hidden": bool}` for every reason (LB-API-015 fix); voter-side hide for `rented`/`fraud`; weighted distinct-voter thresholds for global effects with audit trail and kill switch (SEC-REQ-045, BR-API-106; DEV-010 `PROPOSED`); threshold events for M6; audit table `vote_decisions` created here |
| KV-BE-044 | [Found survey: API-032 and API-033](tasks/backend/KV-BE-044-found-survey.md) | S | F-DELIVERY-007 | KV-DB-010 | TODO | `FoundSurveyService` with the closed literal sets (BR-DATA-032), `where` attached to the user's latest `elsewhere` answer, `204`; `ask_found` decision stays with M4 (Q-API-030) |
| KV-BE-045 | [Settings: API-024 and API-025](tasks/backend/KV-BE-045-settings.md) | M | F-SETTINGS-001, F-SETTINGS-004, F-SETTINGS-005, F-ONBOARD-002, F-ONBOARD-003, F-LOCALE-001 | KV-BE-014, KV-BE-015, KV-DB-007 | TODO | `SettingsService` (one profile record, `*_chosen_at`); legacy `PUT` with PATCH semantics returning the full 8-key object (LB-API-049); `uz_Latn` ↔ `uz`; `quiet`/`digest` strings ↔ structured columns and the bot-observed preset sets (`07` C-03, LB-API-050); `SettingsChanged` event for the bot command locale (M5) |
| KV-BE-046 | [Share: API-017 prepared inline messages](tasks/backend/KV-BE-046-share.md) | M | F-SHARE-001 | KV-BE-036; HANDOFF T1 Bot API client | BLOCKED (needs the Bot API client of HANDOFF T1) | `ShareService` via `savePreparedInlineMessage` for the requesting user (Q-API-044 spec), message with `startapp=l_<number>` button, `{"id": "…"}`, cached per (user, listing, locale) until expiry (LB-API-046 fix), 20/h limiter, Bot API failure → non-2xx so the client falls back |
| KV-BE-047 | [LLM gateway with PII masking and spend controls](tasks/backend/KV-BE-047-llm-gateway-pii-masking.md) | M | F-PRIVACY-004, F-LISTING-005 | — (provider: DEC-03) | TODO (real provider BLOCKED by DEC-03) | `PiiMasker` (phones in local formats, `@handles`, `t.me/` links, e-mails, card-like numbers → stable placeholders, SEC-REQ-042) inside one `LlmGateway` over `laravel/ai` (config published with an env default provider), delimited untrusted input and schema-validated output (SEC-REQ-043), per-environment daily cap + Pennant kill switch, audit rows without raw text in an `llm_calls` table created here (SEC-REQ-044) |
| KV-BE-048 | [Translation: API-010](tasks/backend/KV-BE-048-translation.md) | M | F-LISTING-005 | KV-BE-047, KV-DB-033, KV-BE-018, KV-BE-045 | BLOCKED (DEC-03) | `TranslationService`: profile locale target, cache per (listing, locale) in `listing_translations`, `{"text": "…"}` within the 15 s budget, 30/h limiter with cache hits free, URLs/phones/handles stripped from output, `ru` target refused, purged text → `404` (DEV-008 `PROPOSED` for the v1 GET) |
| KV-BE-049 | [ADR: data retention and deletion](tasks/backend/KV-BE-049-retention-deletion-adr.md) | S | F-PRIVACY-002, F-PRIVACY-003 | CF-019; DEC-12 | TODO | One ADR answering OPQ-5 with the legacy promises as baseline (`10` §3.19): redaction before storage, every purge scheduled, one deletion procedure, backups ≈ 2 weeks **[PT]**, PostHog erase, erasure ledger keyed by HMAC |
| KV-BE-050 | [`ErasureService`: one deletion procedure](tasks/backend/KV-BE-050-erasure-service.md) | L | F-PRIVACY-002 | KV-BE-049, KV-DB-007, KV-DB-009, KV-DB-010, KV-DB-033, KV-BE-047 | TODO | Confirmation-free service (the bot asks, M5): deletes or anonymises every user-linked row in one transaction, revokes tokens, records `erasure_requests` by HMAC subject, queues the PostHog person deletion (fake in tests), raises `UserErased`; a registry of erasable tables that later modules must extend and a test that fails on an unregistered `user_id` column (SEC-REQ-039) |
| KV-BE-051 | [Owner listing lifecycle: publish, statuses, limits and moderation](tasks/backend/KV-BE-051-owner-listing-lifecycle.md) | L | F-OWNER-005, F-OWNER-006 | KV-BE-018, KV-BE-025, KV-BE-050 | TODO | Register entry of the owner cabinet (DEC-69, DEC-70): publish with the automatic checks and post-moderation (DEC-73, DEC-77), statuses and their effects, limits, `held` and `withdrawn` by votes and the operators' commands, the switch `OWNER_CABINET_ENABLED` (DEC-81); built by the Wave 1 packages WP-84 and WP-89 |

**Exit criteria.**

- The contract harness reports API-010…API-017, API-024…API-033 green (API-017 and API-010 with the faked Bot API and
  LLM); `15` §3.4 #3–#5 and #9, §3.6 #1, #5 and #12 pass on PostgreSQL (KV-QA-008).
- IDOR matrix rows `15` §3.1 #4–#8 pass for every M3 route (KV-QA-015 generates them from the route list).
- Erasure: a factory user with every relation of M1 → after `ErasureService` a database-wide scan finds no row and no
  `jsonb` payload with the user's id or Telegram id; the PostHog fake received one deletion.
- No PII in LLM calls: the provider fake never receives an unmasked pattern from the SEC-REQ-042 corpus.

**Risks.** Toggle races and double taps (BR-API-003) — locks plus unique keys, tested on PostgreSQL; vote thresholds
that relabel private owners (SEC-REQ-045) — weighted, configurable, kill switch, audit; LLM cost and latency —
cache, quota, kill switch, 15 s timeout; the erasure procedure must keep up with tables added by M4, M5, M7 — the
registry test fails a PR that adds an unregistered personal table; share depends on the T1 client.

**Blocking decisions and questions.** DEC-03 (LLM vendor, legal basis Q-SEC-006), DEC-12 (retention ADR), HANDOFF T1
(Bot API client for share); Q-API-025, Q-API-029, Q-API-030, Q-API-036…040, Q-API-044, Q-API-048, Q-SEC-016 (votes of
erased users); DEV-003, DEV-008, DEV-010, DEV-034 `PROPOSED`.

## 7. M4 — Radars and delivery (to be detailed: KV-BE-1NN (100–199))

**Goal (from `13`).** Subscription CRUD, relax, flow estimate; matching; instant, digest and quiet hours in
`Asia/Tashkent`; the delivered-card log; Telegram send-rate limits.

**Features the tasks must cover (`09`).** P0: F-RADAR-001, F-RADAR-002, F-RADAR-003, F-RADAR-004, F-RADAR-005,
F-RADAR-006, F-RADAR-008, F-DELIVERY-001, F-DELIVERY-002, F-DELIVERY-003, F-DELIVERY-004, F-DELIVERY-005,
F-DELIVERY-006, F-DELIVERY-007 (the `ask_found` decision and the bot poll; the API part is KV-BE-044), F-HIDE-004
(radar hide rules, server part), F-FILTER-006 (radar price bounds, DEV-006), F-FILTER-005 (relax options of radar
mutations; the flow endpoint is KV-BE-032). P1: F-DELIVERY-008 (service-news broadcasts). P2 with backend work:
F-RADAR-007 (flow only). Endpoints API-018…API-023.

**Inputs from M0–M3.** KV-DB-009 (radar and delivery tables), KV-DB-035 (partitions), KV-BE-016 (filters and
hash), KV-BE-023 (one search predicate for matching), KV-BE-032 (`FlowEstimator`), KV-BE-020/021 (card and digest
texts), KV-BE-009 (gate guard for bot actions), KV-BE-013 (frozen contract of API-018…API-023), KV-BE-050 (erasure
registry entries for radars and deliveries). Needs from M5: the Bot API client and `my_chat_member` →
`users.bot_chat_state` for `409 no_chat`.

**Blocking.** DEC-20, Q-BOT-002, Q-BOT-003, Q-BOT-012, Q-BOT-017, Q-BOT-033, Q-BOT-034, Q-API-030; DEV-005, DEV-006,
DEV-009, DEV-031, DEV-033, DEV-034 `PROPOSED`.

**Exit criteria (for the detailing session).** API-018…API-023 green in the contract harness; `15` §3.4 #1–#2,
§3.5 #1–#4, §3.6 #2–#3 and #6–#9, §3.10 #1–#4 pass; the re-send dry-run of `14` §6.5 returns zero rows on synthetic
data. **Risks.** Delivery behaviour was never observed (`04` §5): spec-tested until the human recording of `15` §1.6;
fan-out volume unknown (active-radar count) — measure on staging; Telegram `429` storms — pacing and circuit breaker
(SEC-REQ-029).

## 8. M5 — Telegram bot (telegram track)

Owned by the telegram track (`KV-TG-…`; HANDOFF T1 extended per `10` §9). Features: F-BOT-001…F-BOT-013, F-BOT-015
(P0), F-BOT-014 (P1), F-ONBOARD-004, F-ONBOARD-005, F-OWNER-001, F-FAV-002, F-REPORT-002, F-HIDE-004 (bot UI),
F-SETTINGS-006, F-LOCALE-004, F-PRIVACY-001 (bot `/privacy`), F-PRIVACY-002 (the «Удалить мои данные» button),
F-RADAR-008 (chat reachability), F-SEO-010 and F-LANDING-005 (payload parser and attribution).

Backend services the bot consumes from this roadmap: `TelegramInitDataVerifier` (KV-BE-006), `UserResolver`
(KV-BE-007), `AccessGate::forBot()` (KV-BE-009), the display formatter (KV-BE-020, KV-BE-021), `PersonalListService`
(KV-BE-038, KV-BE-040, KV-BE-041), `VoteService` (KV-BE-043), `SettingsService` (KV-BE-045), `ErasureService`
(KV-BE-050), `LlmGateway` (KV-BE-047, free-text queries), identity tables with `bot_chat_state`,
`bot_commands_locale` and `user_attributions` (KV-DB-007), `owner_verifications` (KV-DB-010).

## 9. M6 — Ingestion pipeline (to be detailed: KV-BE-1NN (100–199))

**Goal (from `13`).** Channel reading (CF-007 decision), intake (HANDOFF T2), LLM extraction, normalisation, geo,
dedup, statuses, medians and market comparison, translation pre-warm.

**Features the tasks must cover.** P0: F-PIPELINE-001, F-PIPELINE-002, F-PIPELINE-003, F-PIPELINE-004 (enrichment —
the gazetteer foundation is KV-BE-015 / KV-DB-006 / KV-DB-034), F-PIPELINE-005 (medians → `listing_market`, which M2
already serializes), F-PIPELINE-006 (status machine, «Объявление снято» events, post deletion), F-LISTING-004 and
F-LISTING-007 (market comparison and nearby data), F-MEDIA-001 (photo copy through `ListingPhotoStore`, KV-BE-026,
SEC-REQ-023), F-OWNER-002 (owner flags at ingestion through KV-BE-025), F-PRIVACY-004 (extraction through
`LlmGateway`, KV-BE-047). P1: F-ADMIN-002 (takedowns and channel opt-outs). Database: KV-DB-029.

**Blocking.** DEC-02, DEC-03, OPQ-1 (Q-API-019), Q-API-011, Q-API-017, Q-API-020, Q-API-021, Q-SEC-007; CF-007, CF-016.

**Exit criteria (for the detailing session).** A collector or in-repo reader payload becomes a published listing with
geo, dedup, medians and photos; withdrawal edits delivered cards; freshness measured against the legacy baseline
(CF-007 data item 2). **Risks.** No pusher exists today (CF-007); extraction quality versus Gemini parity needs the
golden set from the dump; dedup thresholds unknown (OPQ-1) — every merge reversible and logged.

## 10. M7 — Landing/SEO data, analytics, retention (to be detailed: KV-BE-1NN (100–199))

**Features the tasks must cover.** P0: F-ANALYTICS-001 (API-034), F-ANALYTICS-003 (action log), F-PRIVACY-003
(retention purges, with KV-DB-028). P1: F-ANALYTICS-002 (server capture, PostHog person deletion used by KV-BE-050),
F-ANALYTICS-004, F-PIPELINE-008, F-LANDING-003, F-LANDING-007 (RES-015 CSP reports), F-MEDIA-004, F-SEO-001…F-SEO-012
(public statistics API, CSV RES-018, sitemap data RES-019; pages are frontend work).

**Blocking.** DEC-08, DEC-12, DEC-14, DEC-15, DEC-26, DEC-30; Q-API-045, Q-API-046, Q-API-049, Q-API-050, Q-API-051,
Q-SEO-001, Q-SEO-002.

**Exit criteria (for the detailing session).** API-034 green (`204`, empty `tma` silent, bounded body); every
retention rule of SEC-REQ-038 has a time-travel test; landing data files keep their paths and shapes; the 1 008 SEO URLs
answer from the public statistics API (`15` §3.9). **Risks.** SEO pages have no legacy artefact to serve and sit on the
S2 critical path (`10` §3.10, DEC-15 contingency); PostHog continuity needs the distinct-id map (ENT-006).

## 11. M8 — Data migration and rehearsals (database + QA tracks)

KV-DB-001…003 (blockers owned by the product owner and the first developer — **start them now**, they are on the
critical path of `13` §2), KV-DB-012…027, KV-DB-029…031, KV-DB-036, KV-DB-037; QA: KV-QA-018 (validator tests), the
parity gate (KV-QA-023). Exit = the go/no-go of `14` §7.6 and `18` for S2. Blocking: DEC-13, DEC-18, DEC-29;
Q-DATA-001…005, Q-DATA-043, Q-SYS-002, Q-SYS-005.

## 12. M9 and the `/api/v1` adapters

S1 and S2 need only the legacy surface. The v1 adapters over the same services (`10` §4.5: bootstrap, feed, listing,
lists, settings, radars) are built for the new Mini App after DEC-06 decides its shape and are planned with the
frontend roadmap (`12`); they are not numbered here. T6 (`POST /api/v1/auth/telegram`) reuses KV-BE-006.

## 13. Database track

| ID | Title | Milestone | Cx | Depends on | Status |
| -- | ----- | --------- | -- | ---------- | ------ |
| [KV-DB-001](tasks/database/KV-DB-001-legacy-schema-counts.md) | Obtain the legacy schema and counts | M8 (start now) | S | Q-DATA-001, Q-DATA-002 (product owner) | BLOCKED (legacy DB not available, Q-SYS-002) |
| [KV-DB-002](tasks/database/KV-DB-002-sample-profiling.md) | Profile a sanitised sample | M8 | M | KV-DB-001; Q-DATA-003 | BLOCKED (KV-DB-001) |
| [KV-DB-003](tasks/database/KV-DB-003-legal-basis.md) | Legal basis and data-handling agreement | M8 (start now) | S | DEC-13; Q-DATA-004, Q-DATA-005, Q-DATA-044 | BLOCKED (product owner + lawyer) |
| [KV-DB-004](tasks/database/KV-DB-004-id-money-decisions.md) | Record the identifier and money decisions for migrated entities | M0 | M | CF-003, CF-004, CF-005, CF-016; DEC-10, DEC-11 | TODO |
| [KV-DB-005](tasks/database/KV-DB-005-postgis.md) | Enable PostGIS in HOMI environments | M0 | M | CF-014; DEC-09, DEC-23; KV-QA-001 | TODO (staging/production BLOCKED by DEC-09) |
| [KV-DB-006](tasks/database/KV-DB-006-geo-dictionaries.md) | Geo dictionaries and code aliases | M1 | L | KV-DB-005; Q-DATA-028…030 | TODO |
| [KV-DB-007](tasks/database/KV-DB-007-identity-schema.md) | Identity schema | M0 | M | KV-DB-004; CF-015 | TODO |
| [KV-DB-008](tasks/database/KV-DB-008-listings-schema.md) | Listings schema | M1 | L | KV-DB-004, KV-DB-005, KV-DB-006 | TODO |
| [KV-DB-009](tasks/database/KV-DB-009-radar-delivery-schema.md) | Radar and delivery schema | M1 | L | KV-DB-007, KV-DB-008, KV-DB-035 | TODO |
| [KV-DB-010](tasks/database/KV-DB-010-personal-lists-schema.md) | Personal lists schema | M1 | M | KV-DB-007, KV-DB-008 | TODO |
| [KV-DB-011](tasks/database/KV-DB-011-derived-data-schema.md) | Derived-data schema | M1 | M | KV-DB-008 | TODO |
| [KV-DB-012](tasks/database/KV-DB-012-import-area.md) | Import area | M8 | M | KV-DB-001, KV-DB-003 | BLOCKED (KV-DB-001, KV-DB-003) |
| [KV-DB-013](tasks/database/KV-DB-013-migration-framework.md) | Migration framework | M8 | L | KV-DB-007…011 (code); KV-DB-012 (runs) | TODO (synthetic data first) |
| [KV-DB-014](tasks/database/KV-DB-014-load-identity.md) | Load users, settings, access, attribution, analytics ids | M8 | M | KV-DB-007, KV-DB-013 | BLOCKED (legacy schema) |
| [KV-DB-015](tasks/database/KV-DB-015-load-dictionary-aliases.md) | Load dictionaries mapping | M8 | M | KV-DB-006, KV-DB-013 | BLOCKED (legacy schema) |
| [KV-DB-016](tasks/database/KV-DB-016-load-listings.md) | Load listings, aliases, authors, statuses, takedowns | M8 | L | KV-DB-008, KV-DB-015 | BLOCKED (legacy schema) |
| [KV-DB-017](tasks/database/KV-DB-017-migrate-photos.md) | Migrate photos | M8 | L | KV-DB-016, KV-BE-026; Q-DATA-026 | BLOCKED (media access) |
| [KV-DB-018](tasks/database/KV-DB-018-load-radars.md) | Load radars and hide rules | M8 | L | KV-DB-009, KV-DB-015, KV-BE-016 | BLOCKED (legacy schema) |
| [KV-DB-019](tasks/database/KV-DB-019-load-deliveries.md) | Load delivered cards and pending deliveries | M8 | M | KV-DB-016, KV-DB-018; Q-DATA-013, Q-DATA-014 | BLOCKED (legacy schema) |
| [KV-DB-020](tasks/database/KV-DB-020-load-personal-lists.md) | Load personal lists, votes, verifications, answers | M8 | M | KV-DB-010, KV-DB-016 | BLOCKED (legacy schema) |
| [KV-DB-021](tasks/database/KV-DB-021-rebuild-derived-data.md) | Rebuild derived data and compare | M8 | M | KV-DB-011, KV-DB-016, KV-DB-017, KV-BE-019; M6 medians | BLOCKED (M6, dump) |
| [KV-DB-022](tasks/database/KV-DB-022-validation-suite.md) | Validation suite | M8 | L | KV-DB-013 | TODO (synthetic data first) |
| [KV-DB-023](tasks/database/KV-DB-023-delta-extraction.md) | Delta extraction | M8 | M | KV-DB-013; Q-DATA-043 | BLOCKED (Q-DATA-043) |
| [KV-DB-024](tasks/database/KV-DB-024-rehearsal-r1.md) | Rehearsal R1 | M8 | M | KV-DB-014…022, KV-DB-036, KV-DB-037 | BLOCKED (dump, legal basis) |
| [KV-DB-025](tasks/database/KV-DB-025-rehearsals-r2-r3.md) | Rehearsals R2 and R3 | M8 | M | KV-DB-023, KV-DB-024 | BLOCKED (KV-DB-024) |
| [KV-DB-026](tasks/database/KV-DB-026-cutover-runbook.md) | Cut-over and rollback runbook | M8 | M | KV-DB-025; `18` | BLOCKED (KV-DB-025) |
| [KV-DB-027](tasks/database/KV-DB-027-erasure-during-window.md) | Erasure handling during the window | M8 | M | KV-DB-014, KV-BE-050; Q-DATA-042 | BLOCKED (legacy schema) |
| [KV-DB-028](tasks/database/KV-DB-028-retention-jobs.md) | Retention jobs in HOMI | M7 | M | KV-DB-008, KV-DB-009, KV-BE-049 | TODO |
| [KV-DB-029](tasks/database/KV-DB-029-link-publications-intake.md) | Link migrated publications to the new ingestion | M6/M8 | M | KV-DB-016; CF-007, CF-016; HANDOFF T2 | BLOCKED (DEC-02, intake contract) |
| [KV-DB-030](tasks/database/KV-DB-030-owner-reverification.md) | Owner re-verification campaign | M8 (after S2) | S | KV-DB-020; DEC-29 | BLOCKED (DEC-29) |
| [KV-DB-031](tasks/database/KV-DB-031-decommission-record.md) | Decommission and destruction record | M8 (after S3) | S | KV-DB-026; Q-DATA-044 | BLOCKED (rollback window) |
| KV-DB-032 | [Publications, price events, status events and takedowns schema](tasks/database/KV-DB-032-listing-history-schema.md) | M1 | M | KV-DB-008 | TODO |
| KV-DB-033 | [Listing photos and translations schema](tasks/database/KV-DB-033-listing-photos-translations-schema.md) | M1 | S | KV-DB-008, KV-BE-002 | TODO |
| KV-DB-034 | [Gazetteer seeds: metro, quarters, city centres, boundaries import](tasks/database/KV-DB-034-gazetteer-seeds.md) | M1 | M | KV-DB-006, KV-DB-005; Q-API-020 | TODO |
| KV-DB-035 | [Monthly partition manager](tasks/database/KV-DB-035-partition-manager.md) | M1 | S | KV-QA-001 | TODO |
| KV-DB-036 | [Load publications and price history](tasks/database/KV-DB-036-load-publications-history.md) | M8 | M | KV-DB-016, KV-DB-032 | BLOCKED (legacy schema) |
| KV-DB-037 | [Business-level and API-level validation checks](tasks/database/KV-DB-037-business-validation-checks.md) | M8 | M | KV-DB-022, M2 and M3 endpoints | BLOCKED (dump, test account P14) |

KV-DB-016 and KV-DB-022 of `14` §8 are split so each task fits one session: publications and history move to
KV-DB-036, the business and API-level checks of `14` §6.4–§6.5 to KV-DB-037. KV-DB-008 keeps the listing core; the
publication, price-event, status-event and takedown tables move to KV-DB-032, photos and translations to KV-DB-033.
KV-DB-034 and KV-DB-035 are new. Scope notes found while writing the files: KV-DB-016 also loads `source_channels` (no other
loader exists); KV-DB-021 also loads the exchange-rate history (ENT-041, load-order step 1 of `14` §7.3, through
KV-BE-019's backfill); KV-DB-013 defines the read-only `legacy_import` connection (blank env keys) that KV-DB-012
provisions on staging and production; KV-DB-006 seeds every district the bot lists (`06` ENT-043), not only the 17
with SEO slugs; `listing_views` stays unpartitioned (KV-DB-010) although `10` §4.9 proposes partitions — a decision for
the developer.

## 14. Cross-track needs

| Need | From | Used by |
| ---- | ---- | ------- |
| PostgreSQL run of the Feature suite, `Feature/Pgsql` group, PostGIS image (DEC-23) | KV-QA-001 | KV-DB-005 onwards; every race, geo and `jsonb` test |
| Golden fixtures and model shapes; contract harness | KV-QA-002, KV-QA-004 | every M2/M3 endpoint task |
| `initData` signer, update factory, fake Bot API | KV-QA-003 | KV-BE-006, KV-BE-007, KV-BE-046 |
| Coverage dataset seeder | KV-QA-005 | M2 consistency tests |
| Shared time and money fixtures | KV-QA-006 | KV-BE-019, KV-BE-020, KV-BE-021, KV-BE-045 |
| Enum-safety key list | KV-QA-007 | KV-BE-014, KV-BE-028, KV-BE-034 |
| Concurrency kit | KV-QA-008 | KV-BE-007, KV-BE-038, KV-BE-043, KV-BE-050 |
| Local legacy host aliases `kvadro.homi.loc`, `kvadro-app.homi.loc` (`17` §3.1) and the internal `X-Accel-Redirect` location (`17` §3.2) | infrastructure track (development side, `infra/local`) | KV-BE-005, KV-BE-027 |
| Trusted-proxy list of the real edge (DEC-16) | production track | KV-BE-010 |
| Bot API client (`TelegramClient`) | HANDOFF T1 (telegram track) | KV-BE-046 |
| `users.bot_chat_state` maintained from `/start` and `my_chat_member` | telegram track (F-RADAR-008, F-BOT-012) | KV-BE-009 (`join`) |
| Legacy Mini App artefacts served with their CSP (F-TMA-001, DEC-07) | infrastructure track | M2/M3 reference-client runs |
| PMTiles hosting with `Range` and CORS (F-MEDIA-002, Q-API-053) | infrastructure track **[PT]** | KV-BE-029 (`meta.tiles`) |

## 15. Execution order

1. KV-BE-002 — close the existing Media defect first: it is live code, independent of every decision, and
   listing photos (KV-BE-026) build on its reference model.
2. KV-BE-001 — the compatibility ADR draft goes to the first developer early; review latency is the critical path.
3. KV-DB-004 — the numbers, cursors and money ADR drafts (DEC-10, DEC-11) for the same review round.
4. KV-DB-005 — the PostGIS ADR draft and the local/CI enablement request (DEC-09, DEC-23).
5. KV-BE-006 — the `initData` verifier: pure code, no decision needed, unblocks the guard and HANDOFF T6.

Then KV-BE-005 → KV-DB-007 → KV-BE-007 → KV-BE-008 → KV-BE-009 → KV-BE-010 → KV-BE-003, and in parallel the
non-engineering requests KV-DB-001 and KV-DB-003 (product owner). M1 starts when KV-DB-004 and KV-DB-005 are accepted.

## 16. Coverage

### 16.1 P0/P1 features with backend work in M0–M3

| Pri | Feature | Covered by | Remainder outside M0–M3 |
| --- | ------- | ---------- | ----------------------- |
| P0 | F-ACCESS-001 | KV-BE-001, KV-BE-006, KV-BE-007, KV-BE-008 | — |
| P0 | F-ACCESS-002 | KV-BE-009, KV-BE-029, KV-BE-022, KV-DB-007 | `join` live behaviour needs `bot_chat_state` from M5 |
| P0 | F-ACCESS-003 | KV-DB-007, KV-BE-007 | — |
| P0 | F-COMPAT-001 | KV-BE-001, KV-BE-005, KV-BE-012, KV-BE-013, KV-BE-017 | — |
| P0 | F-COMPAT-002 | KV-BE-010, KV-BE-032 | — |
| P0 | F-ONBOARD-001 | KV-BE-029, KV-BE-015 | — |
| P0 | F-ONBOARD-002 | KV-BE-029, KV-BE-045 | — |
| P0 | F-ONBOARD-003 | KV-BE-030, KV-BE-045 | — |
| P0 | F-ONBOARD-005 | KV-DB-007 (`user_attributions`) | payload parser and `/start` in M5 |
| P0 | F-FEED-001 | KV-BE-023, KV-BE-028, KV-BE-031 | — |
| P0 | F-FILTER-001 | KV-BE-016, KV-BE-017, KV-BE-023 | — |
| P0 | F-FILTER-003 | KV-BE-031 | — |
| P0 | F-FILTER-004 | KV-BE-030, KV-BE-015 | — |
| P0 | F-FILTER-005 | KV-BE-032 | relax options of radar mutations in M4 |
| P0 | F-FILTER-006 | KV-BE-016, KV-BE-019, KV-BE-020, KV-BE-029, KV-BE-030 | radar bounds in the entered currency (DEV-006) in M4 |
| P0 | F-FILTER-007 | KV-BE-024 | medians produced in M6 |
| P0 | F-MAP-001 | KV-BE-033 | — |
| P0 | F-MAP-002 | KV-BE-023, KV-DB-005 | — |
| P0 | F-MAP-003 | KV-BE-036 | — |
| P0 | F-LISTING-001 | KV-BE-018, KV-BE-034, KV-BE-035, KV-BE-036 | — |
| P0 | F-LISTING-002 | KV-BE-004, KV-BE-026, KV-BE-027, KV-BE-034 | — |
| P0 | F-LISTING-004 | KV-BE-034 (serialization), KV-DB-011 | comparison values computed in M6 |
| P0 | F-LISTING-005 | KV-BE-047, KV-BE-048, KV-DB-033 | — |
| P0 | F-LISTING-006 | KV-BE-034, KV-BE-021, KV-DB-032 | publications written by M6 |
| P0 | F-LISTING-007 | KV-BE-034, KV-BE-021 | nearby and distances computed in M6 |
| P0 | F-CONTACT-001 | KV-BE-035, KV-BE-037 | — |
| P0 | F-CONTACT-002 | KV-BE-034 | — |
| P0 | F-SHARE-001 | KV-BE-046 | — |
| P0 | F-SHARE-002 | KV-BE-018, KV-BE-036 | — |
| P0 | F-FAV-001 | KV-BE-038 | — |
| P0 | F-HISTORY-001 | KV-BE-039, KV-BE-036 | — |
| P0 | F-HIDE-001 | KV-BE-040, KV-BE-023 | exclusion in radar matching in M4 |
| P0 | F-HIDE-002 | KV-BE-041, KV-BE-023 | exclusion in radar matching in M4 |
| P0 | F-HIDE-003 | KV-BE-042 | — |
| P0 | F-REPORT-001 | KV-BE-043 | — |
| P1 | F-REPORT-003 | KV-BE-043 | — |
| P0 | F-OWNER-002 | KV-BE-025, KV-BE-028 | flags at ingestion in M6 |
| P0 | F-DELIVERY-007 | KV-BE-044 | `ask_found` and the bot poll in M4/M5 |
| P0 | F-SETTINGS-001 | KV-BE-045, KV-DB-007 | — |
| P0 | F-SETTINGS-004 | KV-BE-045, KV-BE-020, KV-BE-029 | — |
| P0 | F-SETTINGS-005 | KV-BE-045 | delivery timing in M4 |
| P0 | F-PRIVACY-002 | KV-BE-049, KV-BE-050 | bot button in M5 |
| P0 | F-PRIVACY-004 | KV-BE-047, KV-BE-008 | extraction calls in M6 |
| P0 | F-LOCALE-001 | KV-BE-014, KV-BE-029, KV-BE-045 | — |
| P0 | F-LOCALE-003 | KV-BE-020, KV-BE-021 | — |
| P0 | F-TMA-002 | KV-BE-022 | — |
| P0 | F-MEDIA-001 | KV-BE-002, KV-BE-003, KV-BE-004, KV-BE-026, KV-BE-027, KV-DB-033 | photo copy at ingestion in M6 |
| P0 | F-MEDIA-002 | KV-BE-029 (`meta.tiles`) | PMTiles hosting: infrastructure track |
| P0 | F-MEDIA-003 | KV-BE-037 | — |
| P0 | F-PIPELINE-004 | KV-DB-006, KV-DB-034, KV-BE-015 | enrichment in M6 |
| P0 | F-PIPELINE-007 | KV-BE-019, KV-DB-011 | conversion at ingestion in M6 |
| P1 | F-ANALYTICS-002 | KV-BE-029, KV-BE-007, KV-DB-007 | server capture and person deletion in M7 |
| P1 | F-ADMIN-001 | KV-BE-011 | ARM screens in M9 |

### 16.2 P0/P1 features whose backend work lies outside M0–M3

| Milestone | Features |
| --------- | -------- |
| M4 | F-RADAR-001…F-RADAR-006, F-RADAR-008, F-DELIVERY-001…F-DELIVERY-006, F-HIDE-004 (P0); F-DELIVERY-008 (P1) |
| M5 | F-BOT-001…F-BOT-013, F-BOT-015, F-ONBOARD-004, F-OWNER-001, F-FAV-002, F-REPORT-002, F-SETTINGS-006, F-LOCALE-004 (P0); F-BOT-014, F-LANDING-005 (P1) — on top of the M0–M3 services listed in §8 |
| M6 | F-PIPELINE-001, F-PIPELINE-002, F-PIPELINE-003, F-PIPELINE-005, F-PIPELINE-006 (P0); F-ADMIN-002 (P1) |
| M7 | F-ANALYTICS-001, F-ANALYTICS-003, F-PRIVACY-003 (P0); F-ANALYTICS-004, F-PIPELINE-008, F-LANDING-003, F-LANDING-007, F-MEDIA-004, F-SEO-001…F-SEO-012 (P1) |

### 16.3 P0/P1 features without backend work (justified)

| Pri | Feature | Why no backend task |
| --- | ------- | ------------------- |
| P0 | F-TMA-001 | Serving the unchanged legacy Mini App artefacts with their CSP is nginx and artefact-manifest work (infrastructure track, DEC-07, SEC-REQ-030) |
| P0 | F-PRIVACY-001 | Policy texts: the bot `/privacy` command (M5) and `privacy.html` (landing, frontend track); the backend contributes only the retention ADR (KV-BE-049) |
| P1 | F-LANDING-001, F-LANDING-004, F-LANDING-006, F-LANDING-009 | Landing pages and routing in `frontend/landing` (CF-010) |
| P1 | F-SUPPORT-001 | Deferred to the product owner (DEC-21, GAP-026) |

No P0 or P1 feature with backend work in M0–M3 is left without a task.

### 16.4 Counts

| Milestone | KV-BE tasks (S / M / L) | KV-DB tasks (S / M / L) | Total |
| --------- | ----------------------- | ----------------------- | ----: |
| M0 | 13 (5 / 8 / 0) | 3 (0 / 3 / 0) | 16 |
| M1 | 6 (1 / 4 / 1) | 9 (2 / 4 / 3) | 15 |
| M2 | 18 (4 / 10 / 4) | — | 18 |
| M3 | 14 (4 / 7 / 3) | — | 14 |
| M7 | — | 1 (0 / 1 / 0) | 1 |
| M8 (incl. KV-DB-029, M6/M8) | — | 24 (4 / 15 / 5) | 24 |
| **Total** | **51 (14 / 29 / 8)** | **37 (6 / 23 / 8)** | **88** |

No task is `XL`. Blocked at writing time: KV-BE-046 (HANDOFF T1), KV-BE-048 (DEC-03) and the M8 tasks waiting for the
legacy dump or a decision (see the status column of §13).
