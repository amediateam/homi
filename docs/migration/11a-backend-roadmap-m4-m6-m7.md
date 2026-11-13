# 11a — Backend roadmap: M4 radars and delivery, M6 ingestion pipeline, M7 landing/SEO data, analytics, retention

Part of the kvadro² → HOMI migration audit (rules, labels, ID scheme and the migration policy:
[`README.md`](README.md)). Companion of [`11-backend-roadmap.md`](11-backend-roadmap.md), which details M0–M3 and the
database track and leaves M4, M6 and M7 to this document. Milestone IDs are those of
[`13-dependency-graph.md`](13-dependency-graph.md) §1; the task format is [`tasks/README.md`](tasks/README.md).

- **Status:** wave 2 (2026-11-09). Plan only — no application code exists for any task below. Architecture choices are
  the `PROPOSED` options of [`10-target-architecture.md`](10-target-architecture.md) §3 and §4; every deviation `DEV-…`
  is `PROPOSED` ([`09`](09-feature-parity-matrix.md) §4.2); every defect fix without a DEV (`09` §4.3) is `APPROVED` by
  the migration policy.
- **Numbering:** KV-BE-100…119 = M4 (12 used), KV-BE-120…149 = M6 (24 used), KV-BE-150…199 = M7 (17 used). Numbers are
  stable; gaps are reserved for splits.
- **Owner:** development track (second developer); production-track steps are marked **[PT]** inside the task files
  ([`docs/handoff/parallel-work.md`](../handoff/parallel-work.md) §1).
- **Ground rules:** `11` §1 applies unchanged (adapters over shared services, byte parity on the legacy surface, expected
  outputs per `15` §1.4, HOMI conventions, owner-scoped by construction, no new dependencies, synthetic data only).

## 1. Boundaries with the other tracks

| Area | Owner | What this roadmap provides |
| ---- | ----- | -------------------------- |
| Radar CRUD, relax, starter lists, matching, the delivered set, delivery planning (what is due when) | backend, M4 | `RadarService`, `RadarMatcher`, `DeliveryLedger`, `DeliveryPlanner`, `DuePendingItems`, lifecycle listeners |
| Sending cards and digests, Telegram send pacing (global and per-chat rate, `retry_after`, circuit breaker), withdrawal edits, service-news broadcasts, the bot poll | telegram track (`11b` §1, M5.8) | consumes `DeliveryDue`, `DuePendingItems`, `DeliveryLedger::claim`, `DeliveredMessages::forListing`, `FoundAskPolicy`; the card renderer and `CardSender` are KV-TG-022 |
| Chat reachability (`users.bot_chat_state` from `/start` and `my_chat_member`) | telegram track (F-RADAR-008, `11b` M5.3) | `ChatReachability` reads it for `409 no_chat` (KV-BE-100) |
| Channel reading, intake, extraction, normalisation, geo, dedup, statuses, medians, translation pre-warm | backend, M6 | the pipeline up to a published listing and its `listing_market` row |
| Landing data files, SEO aggregates and the public statistics API, CSV, sitemap data, events, action log, PostHog, retention of the M4/M6/M7 tables | backend, M7 | data and endpoints; the landing and SEO pages themselves are `frontend/landing` (CF-010, `12`) |
| Tables of identity, radars, deliveries, listings, history, photos, derived data, partitions, retention of listing PII | database track (KV-DB-…) | used as inputs; KV-DB-028 owns the 90-day listing purge and partition drops |

"Telegram send-rate limiting" is listed under M4 in `13` §1. It is implemented once, by the telegram track's pacer,
because every outbound Bot API call (cards, digests, edits, broadcasts, wizard replies) must share the same budget
(SEC-REQ-029); M4 contributes the per-radar overflow rule of DEC-20 inside the planner (KV-BE-110).

## 2. Milestone overview

| ID | Milestone | Backend content | Tasks | Depends on | Unlocks | Blocking decisions |
| -- | --------- | --------------- | ----- | ---------- | ------- | ------------------ |
| **M4** | Radars and delivery | Radar service and legacy API-018…API-023; starter, relax options, hide rules; inverse matching and the match job; delivered set and re-send dry-run; quiet hours, digest slots and the planner; lifecycle listeners and erasure entries | KV-BE-100…111 | M2 (search predicates, flow), M3 (personal lists, settings, erasure) | S1; the bot's delivery group (M5.8) | DEC-20; Q-API-030, Q-API-031, Q-API-033, Q-API-034, Q-BOT-002, Q-BOT-003, Q-BOT-012, Q-BOT-028, Q-BOT-033, Q-DATA-013…015 |
| **M6** | Ingestion pipeline | Acquisition and LLM ADRs; intake v2 accept layer (HANDOFF T2 extended); ingest orchestration; in-repo channel reader and channel registry; photos; pre-parser and LLM extraction with the benchmark; normalisation, geo, nearby; publish, dedup, merge; statuses and takedowns; medians and market comparison; translation pre-warm; observability; the `telegram.uz` side-by-side run | KV-BE-120…143; KV-DB-029 | M1 (schema, gazetteer, rates), KV-BE-047 (LLM gateway), KV-BE-026 (photo store) | fresh data after S2; medians for M2 fields and M7 | DEC-02, DEC-03, DEC-09; OPQ-1 (Q-API-019), Q-API-011, Q-API-017, Q-API-020, Q-API-021, Q-SEC-007, Q-DATA-045 |
| **M7** | Landing/SEO data, analytics, retention | Action log and `POST /api/events`; PostHog capture and person deletion; CSP reports; landing `live.json`, pins and snapshots; SEO slices, place statistics, cards, interlinking, public statistics API, sitemap data; rent index, sale prices, CSV; retention and erasure entries for the new tables; `stats.js` | KV-BE-150…166; KV-DB-028 | M1, M6 (medians, statuses), M3 (erasure) | S1 (landing data, events), S2 (SEO pages from HOMI) | DEC-08, DEC-12, DEC-14, DEC-15, DEC-26, DEC-30; Q-API-045, Q-API-046, Q-API-049…051, Q-LND-010, Q-SEO-001…003, Q-SEO-008, Q-SEO-013, Q-DATA-032 |

## 3. M4 — Radars and delivery

**Goal.** The legacy Mini App's radar tab and the bot share one radar model on HOMI: create, edit, pause, resume, mode,
unhide, delete and relax answer byte-compatibly with `409 no_chat` before any change and the limit of 10; every new
listing is matched against every active radar with the user's exclusions; each match becomes exactly one planned
delivery in `Asia/Tashkent` time (instant, held for the end of quiet hours, or the next digest hour) that the bot sends
once and can edit later.

**Features.** P0: F-RADAR-001…F-RADAR-006, F-RADAR-008, F-DELIVERY-001…F-DELIVERY-007 (server parts), F-HIDE-004
(server part), F-FILTER-005 (relax options of radar mutations), F-FILTER-006 (radar bounds, DEV-006),
F-SETTINGS-005 (delivery timing), F-PRIVACY-002 (M4 tables). P2: F-RADAR-007 (flow only, already KV-BE-032).

**Inputs from M0–M3.** KV-DB-009 (radar and delivery tables), KV-DB-007 (`bot_chat_state`), KV-DB-035 (partitions),
KV-BE-016 (filters and hash), KV-BE-023 (one search predicate), KV-BE-032 (`FlowEstimator`), KV-BE-021 (labels),
KV-BE-009 (gate for bot actions), KV-BE-013 (frozen contract of API-018…API-023), KV-BE-044 (found answers),
KV-BE-045 (quiet and digest settings), KV-BE-050 (erasure registry), KV-QA-004/006/008 (harness, time fixtures,
concurrency kit).

**Tasks (execution order inside the milestone: §6).**

| ID | Title | Cx | Features | Depends on | Status | Scope |
| -- | ----- | -- | -------- | ---------- | ------ | ----- |
| KV-BE-100 | [`RadarService` core: create-or-reactivate, update, limit under lock, `no_chat` first](tasks/backend/KV-BE-100-radar-service-core.md) | M | F-RADAR-002, F-RADAR-003, F-RADAR-008, F-FILTER-006 | KV-DB-009 (radar tables, number sequence), KV-DB-007 (`users.bot_chat_state`), KV-BE-016 (`SearchFilters`, canonical hash), KV-BE-014 (enums), KV-QA-008 (concurrency kit); chat reachability of F-RADAR-008 maintained by the telegram track (`my_chat_member`, `/start`); decisions DEV-005, DEV-006, DEV-009, DEV-031 `PROPOSED`; Q-DATA-015 | TODO | One service for all adapters; per-user advisory lock; `no_chat` first; active-radar limit 10 (Q-DATA-015); twin hash; 25-key `filters_v1` + structured columns; DEV-005/006/009 behind config |
| KV-BE-101 | [`Subscription` legacy serializer and API-018 `GET /api/subscriptions`](tasks/backend/KV-BE-101-api-subscriptions-list.md) | S | F-RADAR-001 | KV-BE-100, KV-BE-106 (`hidden` count), KV-BE-005 (legacy route group), KV-BE-007 (`tma` guard), KV-BE-013 (frozen contract of API-018…API-023), KV-QA-002 / KV-QA-004 (fixtures, harness); Q-API-013, Q-API-032 | TODO | Bare `Subscription[]`; `number` as integer id; 25 keys re-normalised on read (`zone` → `zones`); `types` valid per deal; batched `hidden` |
| KV-BE-102 | [Starter selection, radar relax options and `relaxed` hints](tasks/backend/KV-BE-102-radar-starter-and-options.md) | M | F-RADAR-002, F-RADAR-006, F-DELIVERY-005, F-FILTER-005 | KV-BE-100 (`RadarMutation`), KV-BE-109 (delivered set, `unseen`), KV-BE-032 (`FlowEstimator`), KV-BE-023 (search query with per-user exclusions), KV-BE-021 (rate and label strings); Q-API-033, Q-API-034, Q-API-031 | TODO | Starter (create: last 3 days, edit: not received, resume: unseen, Q-API-033); relax options `district`/`price_more`/`rooms`/`owners`/`below_median` with counts; `relaxed` always `[]`+ |
| KV-BE-103 | [API-019 `POST` and API-020 `PUT /api/subscriptions`](tasks/backend/KV-BE-103-api-subscriptions-create-update.md) | M | F-RADAR-002, F-RADAR-003, F-RADAR-008 | KV-BE-100, KV-BE-101, KV-BE-102, KV-BE-017 (legacy request parsing), KV-BE-010 (`radar` limiter), KV-QA-004 (harness); Q-API-031, Q-API-034 | TODO | Form requests over the shared normaliser; `SubscriptionMutationResult`; `409 no_chat` / `subscription_limit` / `duplicate`; owner-scoped `PUT` |
| KV-BE-104 | [API-021 `PATCH` and API-022 `DELETE /api/subscriptions/:id`, `ask_found`](tasks/backend/KV-BE-104-api-subscriptions-patch-delete.md) | M | F-RADAR-004, F-RADAR-005, F-DELIVERY-007, F-HIDE-004 | KV-BE-100, KV-BE-101, KV-BE-102 (resume starter), KV-BE-106 (unhide), KV-BE-044 (`FoundSurveyService`, answers); Q-API-030, Q-API-031, Q-DATA-015 | TODO | Exactly one of five bodies; resume starter; unhide; `DELETE` → `200 {ask_found}`; `FoundAskPolicy` shared with the bot poll (Q-API-030) |
| KV-BE-105 | [API-023 `POST /api/subscriptions/:id/relax`](tasks/backend/KV-BE-105-api-subscriptions-relax.md) | S | F-RADAR-006 | KV-BE-102 (`RelaxCode`, `RadarRelaxOptions`, `StarterSelector::forRelax`), KV-BE-103 (controller, routes), KV-BE-100 (`update` under lock, `no_chat`); Q-API-034 | TODO | Stateless `RelaxCode` validation, `no_chat` first, `{starter}`; flow codes refused |
| KV-BE-106 | [Radar hide rules service and the `hidden` count](tasks/backend/KV-BE-106-radar-hide-rules.md) | M | F-HIDE-004, F-RADAR-004 | KV-DB-009 (`radar_hide_rules`), KV-BE-100, KV-BE-041 (author identity for `author` rules), KV-BE-023 (search predicates); DEV-033, DEV-034 `PROPOSED`; Q-API-032, Q-BOT-028, Q-DATA-012 | TODO | Channel/district (author behind config) rules per radar; `hidden` = active matches excluded by rules; `clearAll`; DEV-033/034 behind config (Q-BOT-028) |
| KV-BE-107 | [Inverse matching predicate: the radars one listing matches](tasks/backend/KV-BE-107-radar-match-predicate.md) | L | F-DELIVERY-001, F-HIDE-001, F-HIDE-002 | KV-BE-023 (forward predicate, the reference semantics), KV-BE-016 (`SearchFilters`), KV-DB-009 (structured radar columns, GiST/GIN indexes), KV-DB-005 (PostGIS), KV-QA-001 (PostgreSQL + PostGIS tests), KV-QA-005 (coverage dataset); DEV-005, DEV-006 `PROPOSED`; Q-API-014, Q-API-027 | TODO | Indexed radar query per listing; one clause class per filter used in both directions; forward/inverse equivalence property test; p95 ≤ 50 ms on 10 000 radars |
| KV-BE-108 | [`MatchListingAgainstRadars`: triggers, exclusions, idempotent fan-in](tasks/backend/KV-BE-108-radar-match-job.md) | M | F-DELIVERY-001, F-HIDE-004 | KV-BE-107 (`RadarMatcher`), KV-BE-109 (delivered set, eligibility), KV-BE-106 (hide rules), KV-BE-110 (`DeliveryPlanner`), KV-BE-009 (`AccessGate::forBot`); `ListingPublished` from KV-BE-134; DEC-20; Q-API-027, Q-BOT-033, Q-BOT-012 | TODO | `radar` queue; unique per listing; bulk exclusions (hidden, blocked, hide rules, delivered, access, reachability); one radar per user; price-change trigger behind config |
| KV-BE-109 | [Delivered set («only new»), merge re-pointing and the re-send dry-run](tasks/backend/KV-BE-109-delivery-ledger.md) | M | F-DELIVERY-005 | KV-DB-009 (`radar_deliveries`, `bot_listing_messages`, `radar_pending_items`), KV-BE-018 (alias → survivor); used by KV-BE-102, KV-BE-108, KV-BE-136 and the telegram track's senders (KV-TG-022 `CardSender`); Q-API-031, Q-DATA-013 | TODO | `claim` per (user, listing) for radar origins; claim-time eligibility; alias re-pointing for merges; `radar:resend-dry-run` (`14` §6.5) |
| KV-BE-110 | [Quiet hours, digest slots and the `DeliveryPlanner`](tasks/backend/KV-BE-110-delivery-planner.md) | M | F-DELIVERY-002, F-DELIVERY-003, F-DELIVERY-004, F-SETTINGS-005 | KV-DB-009 (`radar_pending_items`), KV-BE-045 (quiet and digest settings, `SettingsChanged`), KV-QA-006 (time fixtures and clock helpers); DEC-20 (instant cap); Q-BOT-002, Q-BOT-003, Q-DATA-014 | TODO | `QuietWindow` `[start, end)` and `DigestSchedule` in Asia/Tashkent; `release_at` per item; `DeliveryDue`; re-plan on settings change; DEC-20 cap switch |
| KV-BE-111 | [Radar and delivery listeners: withdrawal, deletion, chat loss, erasure registry](tasks/backend/KV-BE-111-radar-lifecycle-listeners.md) | S | F-DELIVERY-006, F-PRIVACY-002, F-RADAR-008 | KV-BE-050 (`ErasureService` and its table registry), KV-BE-109 (`DeliveryLedger`), KV-BE-110 (pending items); `ListingWithdrawn` from KV-BE-137 (create the event class here if M4 lands first); `ChatUnreachable` from the telegram track (F-RADAR-008); Q-BOT-012, Q-BOT-031 | TODO | Pending items dropped on withdrawal/pause/delete/chat loss; `DeliveredMessages::forListing` for the withdrawal edit; erasure registry entries for the M4 tables |

**Exit criteria.**

- The contract harness (KV-QA-004) reports API-018…API-023 green against their golden fixtures; every `filters` object
  has 25 keys and every result an array `relaxed`.
- `15` §3.4 #1–#2 and #6, §3.5 #1 (planning and claim half), §3.6 #2–#3 and #6–#9, §3.7 #3, #6 and #9, §3.10 #1–#4 and
  #11 pass on PostgreSQL; §3.5 #2–#4 (digest retry, `429`, `403`) pass together with the telegram track's sender.
- The forward/inverse equivalence test (KV-BE-107) passes on the KV-QA-005 dataset; `radar:resend-dry-run` returns zero
  rows on synthetic migrated data (`14` §6.5).
- An erased factory user with radars, hide rules, deliveries, pending items and message rows leaves nothing behind.

**Risks.** Delivery behaviour was never observed (`04` §5): the planner rules are spec-tested until the human recording
of `15` §1.6 or the dump answers Q-BOT-002/Q-BOT-003/Q-DATA-014; fan-out volume (active radars) is unknown — measured on
staging (KV-QA-020), chunked jobs; the dedup scope (user vs radar, Q-API-031) changes what "only new" means — user scope
chosen because a per-radar scope would re-send across radars; two directions of one filter semantics can drift —
one clause class per predicate and the equivalence property test; Telegram `429` storms are absorbed by the
telegram track's pacer, not here.

**Blocking decisions and questions.** DEC-20 (instant cap — none at S2); Q-API-014, Q-API-027, Q-API-030, Q-API-031,
Q-API-032, Q-API-033, Q-API-034, Q-BOT-002, Q-BOT-003, Q-BOT-012, Q-BOT-028, Q-BOT-030, Q-BOT-033, Q-DATA-013,
Q-DATA-014, Q-DATA-015; DEV-005, DEV-006, DEV-009, DEV-021, DEV-031, DEV-033, DEV-034 `PROPOSED`.

## 4. M6 — Ingestion pipeline

**Goal.** A post from one of the ~217 public channels — read by HOMI's isolated reader now (CF-007 option C), by
`telegram.uz` later after a side-by-side run — enters through the intake API, is masked and extracted (Gemini by
default, provider behind `laravel/ai`), normalised to HOMI's dictionaries and USD, placed on the map with district,
metro and centre distances, merged with its duplicates reversibly, published with its photos and price history, and
priced against the district and the 12/15 nearest comparable listings — with statuses, takedowns and opt-outs that never
let a removed listing come back.

**Features.** P0: F-PIPELINE-001…F-PIPELINE-007, F-LISTING-004 and F-LISTING-007 (values), F-LISTING-006
(publications), F-MEDIA-001 (photo copy at ingestion), F-OWNER-002 (flags at ingestion), F-PRIVACY-004 (masking in
extraction), F-DELIVERY-006 (the withdrawal event). P1: F-ADMIN-002 (takedowns, channel opt-outs), F-LISTING-005
(pre-warm). Database: KV-DB-029 (attaching new posts to migrated publications).

**Inputs from M0–M3.** KV-DB-005, KV-DB-006, KV-DB-008, KV-DB-011, KV-DB-032, KV-DB-033, KV-DB-034 (schema, gazetteer,
history, photos, derived data); KV-BE-014, KV-BE-015, KV-BE-018, KV-BE-019 (value objects, gazetteer, numbers, rates);
KV-BE-024, KV-BE-025 (`below_median` rule, owner badges); KV-BE-026, KV-BE-003 (photo store, dimension check);
KV-BE-043 (vote thresholds); KV-BE-047, KV-BE-048 (LLM gateway, translation); HANDOFF T2 (intake accept layer — taken
over and extended by KV-BE-121…123 per `10` §9).

**Tasks (execution order: §6).**

| ID | Title | Cx | Features | Depends on | Status | Scope |
| -- | ----- | -- | -------- | ---------- | ------ | ----- |
| KV-BE-120 | [ADRs: listing acquisition after the migration (CF-007) and LLM data-processing rules](tasks/backend/KV-BE-120-acquisition-llm-adrs.md) | S | F-PIPELINE-001, F-PIPELINE-002 | CF-007, CF-016; DEC-02 (acquisition), DEC-03 (LLM vendor and legal basis, Q-SEC-006); Q-SEC-007 (legal basis for third-party phones and photos) | TODO (acceptance BLOCKED by DEC-02 and DEC-03) | Two ADR drafts are in review: "Listing acquisition after the migration" (supersedes the collector set of ADR-0009, removes the `geo.uz` premise, allows the isolated in-repo reader of CF-007 option C, adds raw-post intake and the deal mapping of CF-016) and … |
| KV-BE-121 | [Intake payload v2: raw posts, channel and post id, `rent_period`, sources](tasks/backend/KV-BE-121-intake-contract-v2.md) | M | F-PIPELINE-001, F-PIPELINE-003 | KV-BE-120 (draft agreed); HANDOFF T2 (this task is the contract half of T2, extended per `10` §9); CF-016 | TODO | The intake contract that every source uses is written down and enforced by configuration: `docs/api/intake.md` (schema version 2) describes a listing payload that carries the raw post (`channel`, `post_id`, `posted_at`, raw text, photo URLs, forward … |
| KV-BE-122 | [`IntakeAcceptService` and `POST /api/v1/intake/listings`](tasks/backend/KV-BE-122-intake-accept-listings.md) | L | F-PIPELINE-001 | KV-BE-121; HANDOFF T2 (this task is the accept half of T2); existing tables `sources`, `source_listings`, `intake_requests`, `intake_events`; KV-DB-008 (FK `source_listings.listing_id`) | TODO | A collector (and the in-repo reader through the same service) can hand HOMI a batch of 1–100 listing payloads: each is validated per record, the raw payload is stored before any processing, `source_listings` is upserted by `(source, external_id)`, an … |
| KV-BE-123 | [Intake lifecycle events, reconciliation read and `intake:token`](tasks/backend/KV-BE-123-intake-events-reconciliation.md) | M | F-PIPELINE-001, F-PIPELINE-006 | KV-BE-122 | TODO | A source can report what happened to a listing after it was pushed — `updated`, `withdrawn` (rented, sold, deleted at the source), `duplicate_changed`, `media_added`, `post_deleted` — and HOMI applies those events in `source_version` order whatever order … |
| KV-BE-124 | [`ProcessIntakeEvent` state machine and the ingest job chain](tasks/backend/KV-BE-124-ingest-orchestration.md) | M | F-PIPELINE-001, F-PIPELINE-002, F-PIPELINE-003 | KV-BE-122, KV-BE-123 | TODO | Every stored intake event moves through one explicit state machine (`received → processing → processed | rejected | failed`, plus `stale` and `deferred`) driven by `ProcessIntakeEvent` on the `ingest` queue, which runs the fixed pipeline order — pre-parse … |
| KV-BE-125 | [Collectors: reader of public channel pages](tasks/backend/KV-BE-125-public-channel-reader.md) | L | F-PIPELINE-001 | KV-BE-120 (acquisition ADR), KV-BE-122 (`IntakeAcceptService`), KV-BE-126 (channel registry); DEC-02; CF-007 data items 1, 2, 4 | TODO (code and fixture tests now; live reading BLOCKED by DEC-02 and the production-track reachability test) | An isolated `Collectors` module reads the public web preview of each active channel (`https://t.me/s/<handle>`) on a schedule, turns new and edited posts into intake payloads v2 (source `homi_channels`) and hands them to `IntakeAcceptService` — the same … |
| KV-BE-126 | [Channel registry, channel-list import and channel opt-outs](tasks/backend/KV-BE-126-channel-registry-opt-outs.md) | M | F-PIPELINE-001, F-ADMIN-002 | KV-DB-008 (`source_channels`), KV-BE-122; Q-API-017, Q-DATA-033 | TODO (real channel list BLOCKED by Q-API-017 / Q-DATA-033 — product owner) | HOMI knows which channels it reads and how to treat them: the ~217 legacy channels are imported with handle, Telegram id, city, owner hashtags and new-build flag; |
| KV-BE-127 | [Post photo fetching under SEC-REQ-023 and perceptual hashes](tasks/backend/KV-BE-127-post-photo-fetcher.md) | M | F-MEDIA-001, F-PIPELINE-003 | KV-BE-026 (`ListingPhotoStore`), KV-BE-003 (header dimension check), KV-BE-124 (`FetchPhotos` stage) | TODO (copying third-party photos in production BLOCKED by Q-SEC-007 legal basis) | Photos referenced by an intake payload are copied into HOMI's private listing-photo store safely — https only, host allowlist, no private addresses, no redirects, size and pixel caps, re-encoded without EXIF — numbered from 0 per listing, rendered into the … |
| KV-BE-128 | [Deterministic pre-parser: phones, owner hashtags, demand posts, price hints](tasks/backend/KV-BE-128-rules-preparser-owner-flag.md) | M | F-PIPELINE-002, F-OWNER-002, F-PRIVACY-004 | KV-BE-124 (`PreParse` stage), KV-BE-047 (`PiiMasker` patterns), KV-BE-025 (owner badge inputs) | TODO | Before any LLM call, a deterministic parser extracts what rules can decide reliably: the author's phone numbers (normalised to E.164, stored encrypted and as a keyed HMAC, never in plain text and never sent to the LLM), Telegram contact handles, the owner … |
| KV-BE-129 | [`ListingExtractor`: LLM extraction, schema validation, budget fallback](tasks/backend/KV-BE-129-llm-listing-extractor.md) | L | F-PIPELINE-002, F-PRIVACY-004 | KV-BE-047 (`LlmGateway`, `PiiMasker`, spend cap, kill switches), KV-BE-128 (masked text, hints); DEC-03 | TODO (real provider BLOCKED by DEC-03; everything runs on the `laravel/ai` fake until then) | The masked post text becomes structured listing fields through one versioned prompt and a strict JSON schema: price, currency and basis, deal and rent period, property type, rooms, area, floor, floors, renovation, furniture, appliances, conditions … |
| KV-BE-130 | [Extraction golden set and benchmark command](tasks/backend/KV-BE-130-extraction-benchmark.md) | M | F-PIPELINE-002 | KV-BE-129; DEC-03, Q-SYS-002; `14` §1.2 (handling of production data) | TODO (harness and synthetic set now; the real golden set BLOCKED by Q-SYS-002 — legacy data; real-provider runs BLOCKED by DEC-03) | Any parser (rules + LLM of KV-BE-128/129 with a given provider and prompt version, or a collector's parsed hints) can be scored reproducibly against a golden set of post text → expected fields: per-field accuracy, null-correctness («без догадок»), cost and … |
| KV-BE-131 | [Normalisation: deal and rent period, price basis, USD conversion, dictionary codes](tasks/backend/KV-BE-131-listing-normaliser.md) | M | F-PIPELINE-004, F-PIPELINE-007 | KV-BE-129 (extraction output), KV-BE-015 (gazetteer, aliases), KV-BE-019 (`RateService::usdUzs(date)`), KV-BE-014 (enums, `Money`) | TODO | Pre-parse hints, LLM output and collector hints are reconciled into one normalised listing draft with HOMI's types: `deal` + `rent_period`, property type, price as amount + currency + `price_usd_cents` at the CBU rate of the post date, an explicit price … |
| KV-BE-132 | [`GeoResolver`: point, uncertainty, district, zone, metro and centre distances](tasks/backend/KV-BE-132-geo-resolver.md) | L | F-PIPELINE-004, F-LISTING-007 | KV-DB-005 (PostGIS), KV-DB-006 (cities, districts, zones), KV-DB-034 (metro, quarters, places, boundaries), KV-BE-015, KV-BE-131; Q-API-020 | TODO (PostGIS in staging/production BLOCKED by DEC-09; local and CI per KV-DB-005 / KV-QA-001) | Every normalised listing gets a location the rest of HOMI can trust: a WGS 84 point with an uncertainty radius (`geo_radius_m`) measured from the most specific place named in the post, the city, the district (with `district_source`), the zone membership … |
| KV-BE-133 | [Nearby parks and schools per listing](tasks/backend/KV-BE-133-nearby-places.md) | S | F-LISTING-007 | KV-BE-132, KV-DB-034 (`pois`); Q-API-020, Q-SEO-015 | TODO (POI data import BLOCKED by Q-SEO-015 licences — synthetic POIs until then) | Each located listing has at most one nearest park and one nearest school (with the 2024 rating where known), with the distance measured from the listing's anchor, ready for `ListingDetails.nearby` and the SEO quarter pages — `kind` limited to `park` and … |
| KV-BE-134 | [`ListingIngestService`: publish, publications, price history, authors, events](tasks/backend/KV-BE-134-listing-ingest-publish.md) | L | F-PIPELINE-003, F-LISTING-006, F-OWNER-002 | KV-BE-131, KV-BE-132, KV-DB-008, KV-DB-032, KV-BE-025, KV-BE-018 (`ListingNumberAllocator`); KV-DB-029 (attach to migrated publications) | TODO | A normalised, geo-resolved draft becomes (or updates) a canonical listing in one transaction: the publication `(channel, post_id)` is attached to exactly one listing, a new listing gets a public `number` from the sequence, the price timeline records … |
| KV-BE-135 | [`DuplicateMatcher`: killer words, tiers, price gate, review queue](tasks/backend/KV-BE-135-duplicate-matcher.md) | L | F-PIPELINE-003 | KV-BE-134 (published listings), KV-BE-127 (photo dHash); Q-API-019 (OPQ-1) | TODO (thresholds `PROPOSED` until Q-API-019 / OPQ-1 and the golden set; `pg_trgm` in staging/production needs the production track **[PT]**) | After a listing is published or updated, a deterministic-first matcher looks for the same flat among recent active listings and decides per candidate: merge automatically only on deterministic evidence (confidence ≥ 95, shadow-logged and reversible), send … |
| KV-BE-136 | [`MergeService` and `UnmergeService`: survivor, aliases, re-pointing, shadow log](tasks/backend/KV-BE-136-merge-unmerge.md) | L | F-PIPELINE-003, F-LISTING-001 | KV-BE-135, KV-BE-018 (`ListingAliasWriter`, resolver), KV-DB-008, KV-DB-010 (personal lists), KV-BE-109 (delivered-set re-pointer); Q-API-019 | TODO (survivor rule `PROPOSED` until Q-API-019) | Two listings found to be one flat become one card in one transaction: a survivor is chosen by a fixed rule, the other listing's number becomes an alias that keeps resolving to the survivor, its publications, price points, personal-list rows and … |
| KV-BE-137 | [Listing status machine, post deletion and `ListingWithdrawn`](tasks/backend/KV-BE-137-listing-status-machine.md) | M | F-PIPELINE-006, F-DELIVERY-006 | KV-BE-134, KV-DB-032 (`listing_status_events`), KV-BE-043 (`RentedThresholdReached`); Q-API-023, Q-BOT-031 | TODO | Every change of a listing's state goes through one `ListingStatusMachine` with an explicit transition table, an audit row per transition and an event after commit: withdrawals from the source (rented, sold, deleted), deleted source posts (`post_deleted`), … |
| KV-BE-138 | [Takedowns and the phone opt-out list](tasks/backend/KV-BE-138-takedowns.md) | M | F-ADMIN-002, F-PIPELINE-006 | KV-BE-137, KV-DB-032 (`takedown_requests`), KV-BE-026 (`ListingPhotoStore::erase`), KV-BE-126 (channel opt-out); Q-SEC-007 | TODO (SLA value BLOCKED by Q-SEC-007) | An author's request removes their listing (by post link, listing number or phone) from every surface at once and keeps it gone: the listing becomes `taken_down`, its photos and landing snapshots are erased, delivered cards are queued for the «Объявление … |
| KV-BE-139 | [District and city medians for rent and sale](tasks/backend/KV-BE-139-district-medians.md) | M | F-PIPELINE-005 | KV-DB-011 (`market_medians`), KV-BE-134 (publications, price basis); Q-API-021, Q-DATA-031, Q-SEO-018 | TODO | Every hour HOMI recomputes the «обычная цена» of each district (or city without districts) × rooms for long-term rent and sale with exactly the legacy rules — 60-day window, one flat counted once, channel caps, outlier and basis exclusions, a minimum of 8 … |
| KV-BE-140 | [Near medians and the per-listing market comparison (`listing_market`, tones)](tasks/backend/KV-BE-140-market-comparison.md) | L | F-PIPELINE-005, F-LISTING-004 | KV-BE-139 (district/city medians), KV-BE-132 (anchor points, house class), KV-BE-024 (`below_median` reads `median_delta`); Q-API-011, Q-API-021, Q-SEO-018 | TODO (tone thresholds `PROPOSED` until Q-API-021; PostGIS per DEC-09) | Every active listing has an up-to-date market comparison in `listing_market`: the «near» median of the 12 nearest comparable listings (sale: 15 nearest, per m²) within 5 km of the place named in the listing, falling back to the district when fewer than 8 … |
| KV-BE-141 | [Source-language detection and translation pre-warm](tasks/backend/KV-BE-141-translation-prewarm.md) | S | F-LISTING-005 | KV-BE-048 (`TranslationService`), KV-BE-134 (published listings); DEC-03 | TODO (pre-warm stays off until DEC-03 and a cost decision) | Each published listing records the language of its source text (`ru`, `uz` Latin, `uz` Cyrillic, `en`, mixed), so the translation offer and cache can skip pointless calls (no translation of a text that is already in the target language), and an optional, … |
| KV-BE-142 | [Ingestion freshness, parse-failure and LLM-cost metrics](tasks/backend/KV-BE-142-ingest-observability.md) | S | F-PIPELINE-001, F-PIPELINE-002 | KV-BE-124 (ingest states, `ingest_runs`), KV-BE-129 (LLM calls); CF-007 data item 2 | TODO | The team can see whether ingestion keeps the legacy promise of fresh listings «within minutes» and what it costs: per-source and per-channel freshness, post-to-publish latency, parse and rejection rates, LLM tokens and cost per day, reader errors — … |
| KV-BE-143 | [Side-by-side run of `telegram.uz` against the in-repo reader and the source switch](tasks/backend/KV-BE-143-telegram-uz-side-by-side.md) | M | F-PIPELINE-001 | KV-BE-125 (in-repo reader), KV-BE-123 (intake events and reconciliation); GAP-027, DEC-02; Q-DATA-045 | BLOCKED (GAP-027: `telegram.uz` has no push to HOMI and is not confirmed in production; DEC-02) | When `telegram.uz` can push, HOMI compares it with its own reader on the same channel list for a fixed period — coverage, freshness, field agreement and duplicate behaviour — in shadow mode (nothing from the shadow source is published), produces a report … |

**Exit criteria.**

- A collector payload and an in-repo reader post (fixtures) both become a published listing with district, metro and
  centre distances, photos (legacy renditions), owner flag, dedup decision, `listing_market` row and price history;
  replaying the same request or event changes nothing (`15` §3.4 #10, §3.5 #5–#6).
- A withdrawal or takedown removes the listing from feed, map, radar matching and landing data and raises the event the
  bot's withdrawal edit consumes (`15` §3.5 #7); an opted-out channel or phone never reappears (SEC-REQ-040).
- District medians and per-listing comparisons follow BR-API-057…BR-API-063 on fixtures with small samples, channel caps
  and outliers; on migrated data they match the legacy snapshot within the `14` §6.6 tolerance (KV-DB-021).
- The LLM path holds SEC-REQ-042…044: the injection and PII corpora pass, the provider fake never sees an unmasked
  pattern, and with the spend cap reached ingestion continues without extraction.
- Freshness (minutes from channel post to published listing) is measured and compared with the legacy baseline
  (CF-007 data item 2) before the active source can be switched to `telegram.uz`.

**Risks.** No pusher exists today (CF-007; GAP-027) — the in-repo reader is the critical path and depends on public
channel pages staying readable from the production host (CF-007 data item 4, **[PT]** reachability test); HTML layout
changes break the reader — fixtures per page shape and a parse-failure alert; extraction parity with legacy Gemini needs
the golden set from the dump (Q-SYS-002) — until then synthetic fixtures; dedup thresholds are unknown (OPQ-1,
Q-API-019) — auto-merge only at ≥ 95 with a shadow log, everything else to review, every merge reversible; median tone
thresholds unknown (Q-API-021) — spec values behind config; LLM cost — daily cap and kill switch; the legal basis for
copying phones and photos (Q-SEC-007) gates production runs.

**Blocking decisions and questions.** DEC-02 (acquisition), DEC-03 (LLM vendor and legal basis), DEC-09 (PostGIS);
Q-API-011, Q-API-017, Q-API-018, Q-API-019, Q-API-020, Q-API-021, Q-DATA-033, Q-DATA-045, Q-SEC-007, Q-SEO-006,
Q-SEO-019; CF-007, CF-016.

## 5. M7 — Landing/SEO data, analytics, retention

**Goal.** The legacy landing keeps its live numbers, pins and photo snapshots at the same paths and shapes, produced by
HOMI; the 1 008 SEO pages of the new landing app get every number, card, link and sitemap entry from one public
statistics API built from one data snapshot per refresh; the Mini App's events, the action log (180 days, no texts) and
PostHog (random distinct ids, person deletion) work as the privacy text promises; and every retention rule is a
scheduled, time-travel-tested job.

**Features.** P0: F-ANALYTICS-001, F-ANALYTICS-003, F-PRIVACY-003 (with KV-DB-028), F-PRIVACY-002 (M6/M7 tables and the
PostHog erase). P1: F-ANALYTICS-002, F-ANALYTICS-004, F-PIPELINE-008, F-LANDING-003, F-LANDING-007 (RES-015), F-MEDIA-004,
F-SEO-001…F-SEO-012 (data and API; the pages are frontend work).

**Inputs.** M1 schema (KV-DB-011 `seo_slices`, `price_index_points`, `salary_references`; KV-DB-035 partitions;
KV-DB-007 `analytics_distinct_id`); M6 medians, statuses, takedowns and photos (KV-BE-134, KV-BE-138…KV-BE-140);
KV-BE-023/032 (counts and flow for the landing sheet); KV-BE-026 (signed photo URLs); KV-BE-049/050 (retention ADR,
erasure).

**Tasks (execution order: §6).**

| ID | Title | Cx | Features | Depends on | Status | Scope |
| -- | ----- | -- | -------- | ---------- | ------ | ----- |
| KV-BE-150 | [`user_action_log` partitions and the `ActionLogger`](tasks/backend/KV-BE-150-action-log.md) | M | F-ANALYTICS-003 | KV-DB-035 (partition manager), KV-DB-007 (users); retention drop by KV-DB-028; DEC-12 (retention ADR, KV-BE-049) | TODO | One append-only action log records "what was pressed and when, without texts" for the Mini App (API-034) and the bot, in monthly partitions that are dropped after 180 days; |
| KV-BE-151 | [API-034 `POST /api/events`](tasks/backend/KV-BE-151-api-events.md) | M | F-ANALYTICS-001 | KV-BE-150, KV-BE-005, KV-BE-007, KV-BE-010 (and KV-BE-152 for the PostHog forward; Q-API-045, Q-API-046) | TODO | The legacy Mini App's fire-and-forget telemetry from both producers (React `fetch` with `keepalive` and the boot `XMLHttpRequest`) is accepted on the legacy surface with `204`, bounded (8 KB body, per-user limiter), stored through the allow-list of … |
| KV-BE-152 | [PostHog server capture and person deletion](tasks/backend/KV-BE-152-posthog-server.md) | M | F-ANALYTICS-002, F-PRIVACY-002 | KV-BE-050 (`PersonEraser` contract, `RequestPostHogPersonDeletion` job), KV-BE-151; KV-BE-007 (random `analytics_distinct_id`); DEC-26, Q-API-046, Q-SEC-006 | TODO (production keys BLOCKED by DEC-26) | HOMI talks to PostHog in exactly two ways, both under the user's random distinct id and never under a Telegram id: server-side capture of the allow-listed product events (API-034 forward, bot events if enabled), and the person deletion that «Удалить мои … |
| KV-BE-153 | [RES-015 `POST /api/csp-report`](tasks/backend/KV-BE-153-csp-report.md) | S | F-LANDING-007 | KV-BE-005 (legacy route group, site hosts); DEC-08 (CSP of the new landing); Q-API-050 | TODO | The `report-uri /api/csp-report` of the landing, privacy and SEO pages keeps working on `kvadro.app` after the cut-over: browser CSP reports (legacy `report-uri` and the newer Reporting API format) are accepted anonymously, bounded, sampled and stored only … |
| KV-BE-154 | [Landing `live.json` builder and publication](tasks/backend/KV-BE-154-landing-live-json.md) | M | F-LANDING-003, F-PIPELINE-008 | KV-BE-023 (search predicate), KV-BE-032 (`FlowEstimator`), KV-BE-140 (`listing_market` tones and deltas); KV-BE-026 (signed media not used here); Q-API-051, Q-LND-002, Q-LND-007 | TODO | HOMI regenerates `data/live.json` with exactly the legacy path and shape the unchanged landing reads (counters, lock-screen pushes, filter-sheet footer, radar tile), from HOMI's own listings, on the observed legacy schedule, written atomically to public … |
| KV-BE-155 | [Landing `pins-rent.json` and `pins-sale.json` builder](tasks/backend/KV-BE-155-landing-pins-json.md) | M | F-LANDING-003, F-PIPELINE-008 | KV-BE-154 (builder, publisher, command), KV-BE-139 (district medians), KV-BE-140 (`listing_market`), KV-BE-156 (snapshots); Q-API-051, Q-LND-010 | TODO | HOMI regenerates `data/pins-rent.json` and `data/pins-sale.json` with the legacy path and shape the unchanged landing reads (live price map, demo feed, radar collage, savings block), with district medians only (the point medians that the legacy client … |
| KV-BE-156 | [Landing photo snapshots from the media pipeline](tasks/backend/KV-BE-156-landing-snapshots.md) | M | F-MEDIA-004 | KV-BE-026 (`ListingPhotoStore`), KV-BE-138 (takedown events), KV-BE-002 (reference counting); DEV-012 (`PROPOSED`) | TODO | The landing's pin photos `img/snap/<id>.webp` keep their public paths for the unchanged legacy landing, but every file is a derived variant of a listing photo held by the media pipeline, exists only while the listing is a current pin, is deleted at once on … |
| KV-BE-157 | [SEO slice catalogue and slice aggregates](tasks/backend/KV-BE-157-seo-slice-catalogue.md) | L | F-SEO-001, F-SEO-002, F-SEO-005, F-SEO-008 | KV-DB-011 (`seo_slices`), KV-BE-015 (gazetteer, slugs), KV-BE-139 (district and city medians); KV-DB-006 / KV-DB-034 (places); DEC-30, Q-SEO-002, Q-SEO-008, Q-SEO-016, Q-SEO-001 | TODO | One language-independent catalogue lists every SEO slice the legacy site serves (336 per language: section × city × district | quarter | station | by-owner × rooms, plus the hubs and the special pages), and an hourly job materialises each slice's numbers — … |
| KV-BE-158 | [Quarter, metro and owner statistics and the district rank](tasks/backend/KV-BE-158-seo-place-statistics.md) | L | F-SEO-002, F-SEO-003, F-SEO-004 | KV-BE-157 (catalogue, aggregator, `stats jsonb`), KV-BE-140 (near medians, `median_near_class`), KV-BE-133 (nearby schools and parks); KV-DB-034 (quarters, metro, schools with rating); Q-SEO-006, Q-SEO-015, Q-SEO-016, Q-SEO-018 | TODO | The place-specific blocks of the SEO pages have their numbers: quarter pages («Где это», near prices in usual houses, schools with rating, neighbouring quarters), the metro hub and station pages («у метро» within about 1 km, landmarks with flat counts and … |
| KV-BE-159 | [Public statistics API for the landing app](tasks/backend/KV-BE-159-public-statistics-api.md) | M | F-SEO-001, F-SEO-002, F-SEO-003, F-SEO-004, F-SEO-005, F-SEO-009, F-SEO-012 | KV-BE-157, KV-BE-158, KV-BE-160, KV-BE-164 (and KV-BE-161, KV-BE-163 for the index and sitemap reads); CF-010, DEC-15, DEC-14 | TODO | The `frontend/landing` SEO renderer (CF-010) gets everything it needs for the 1 008 pages from one read-only `/api/v1` surface: the place dictionary with names, cases and slugs, path resolution (slice, canonical and alternates, index flag, 404 data), the … |
| KV-BE-160 | [SEO slice cards: sorts, badges, signed photos, deep links](tasks/backend/KV-BE-160-seo-slice-cards.md) | M | F-SEO-007, F-SEO-010 | KV-BE-157 (slice keys and predicates), KV-BE-026 (`SignedPhotoUrl`), KV-BE-140 (`listing_market`); KV-BE-020, KV-BE-021 (display formatter); Q-SEO-016, Q-SEO-007 | TODO | Each SEO slice gets up to 24 listing cards per sort (`new`, `cheap`, `expensive`, `below`) with the legacy card content — price, parameters, place, age, «Хозяин» and «на N% дешевле рынка» badges, a signed photo and the Mini App deep link … |
| KV-BE-161 | [Rent index and sale price series with frozen history](tasks/backend/KV-BE-161-price-index-series.md) | L | F-SEO-006 | KV-DB-011 (`price_index_points`, `salary_references`), KV-BE-134 (first-seen dates, last prices), KV-BE-019 (CBU rate); migrated published rows by KV-DB-021; Q-SEO-013, Q-DATA-032, Q-SEO-014, Q-API-054 | TODO | HOMI computes the Tashkent rent index (monthly and weekly medians of new listings per room count, the 2-room district table with month-over-month change, rent in salaries) and the sale price series (per m² and per room count by district), publishes only … |
| KV-BE-162 | [RES-018 CSV exports](tasks/backend/KV-BE-162-csv-exports.md) | S | F-SEO-006 | KV-BE-161; archived legacy CSVs at cut-over (Q-SEO-013); Q-SEO-009 | TODO | The two public CSV files that external articles cite keep their paths, columns and bytes: `/arenda/indeks/kvadro-rent-index.csv` and `/prodazha/ceny/kvadro-sale-prices.csv` are regenerated from `price_index_points` after each index run, byte-identical to … |
| KV-BE-163 | [RES-019 sitemap data source](tasks/backend/KV-BE-163-sitemap-data.md) | S | F-SEO-008 | KV-BE-157 (slices, `indexable`, `lastmod_at`); KV-BE-159 (serving); DEC-30, Q-SEO-002, Q-SEO-003, Q-SEO-001 | TODO | The landing app renders `/sitemap.xml` from one backend list: the landing pages ×3, `privacy.html` and every indexable SEO page in three languages, each with a data-based `lastmod` and its ru/uz/en and `x-default` alternates — thin and sorted pages never … |
| KV-BE-164 | [Interlinking blocks data](tasks/backend/KV-BE-164-seo-interlinking.md) | S | F-SEO-011 | KV-BE-157 (catalogue, counts, `indexable`); KV-BE-158 (neighbouring quarters and stations); DEV-050 (`PROPOSED`), Q-SEO-017 | TODO | Every SEO slice carries its link blocks as data — other room counts of the place, the other districts, the district's quarters, nearby stations, the other sections of the same place, all cities, and the by-owner page — each link with its target's current … |
| KV-BE-165 | [Retention and erasure registry for the M4, M6 and M7 tables](tasks/backend/KV-BE-165-retention-m4-m6-m7.md) | M | F-PRIVACY-003, F-PRIVACY-002 | KV-DB-028 (listing PII purge, partition drops), KV-BE-050 (erasure registry and scan), KV-BE-049 (retention ADR, DEC-12), KV-BE-150 (`user_action_log`); tables of KV-BE-047, KV-BE-125, KV-BE-135, KV-BE-136, KV-BE-153, KV-BE-156, KV-BE-110 | TODO | Every table the M4, M6 and M7 tasks add has a written, scheduled and time-travel-tested retention rule or an explicit "kept, because" entry, and every one of them that holds a user link is in the erasure registry — so the `/privacy` promises hold for the … |
| KV-BE-166 | [`stats.js` for the legacy landing mirror from configuration](tasks/backend/KV-BE-166-landing-stats-js.md) | S | F-ANALYTICS-004 | DEC-26 (PostHog projects per environment), DEC-15 (`kvadro.app` at S2); KV-BE-152 (shared `posthog` config); Q-LND-008, Q-SEO-005 | TODO (production values BLOCKED by DEC-26) | While HOMI serves the unchanged legacy landing and the SEO pages need the same analytics loader, `/stats.js` is generated per environment from configuration — the legacy loader's behaviour (visit id, click-time bot-link tagging, cookieless PostHog EU) … |

**Exit criteria.**

- API-034 green in the contract harness: `204` for every catalogue event, unknown names dropped with `204`, empty `tma `
  answered `401` silently, a 1 MB body refused without `5xx` (SEC-REQ-022).
- Every retention rule of SEC-REQ-038 for the M4/M6/M7 tables has a time-travel Pest test (KV-BE-165 together with
  KV-DB-028 and KV-QA-017); an erased user leaves no row in the action log and one PostHog deletion is recorded.
- `data/live.json`, `data/pins-rent.json`, `data/pins-sale.json` and `img/snap/<number>.webp` keep their paths and
  shapes (schema snapshots of RES-010…RES-013); no phone or listing text in them; a takedown removes the snapshot at once.
- The generated list of the 1 008 SEO URLs (KV-QA-014) resolves through the public statistics API (`15` §3.9); thin
  slices are `noindex` per DEC-30 and absent from the sitemap data; the frozen rent-index and sale-price CSVs are
  byte-equal to the legacy files (`14` §6.5).

**Risks.** SEO pages have no legacy artefact to serve and sit on the S2 critical path (`10` §3.10, DEC-15 contingency) —
the slice catalogue and public API (KV-BE-157, KV-BE-159) start as soon as M6 medians exist on synthetic data; published
index values must never change (Q-SEO-013) — migrated as frozen rows, not recomputed; PostHog continuity needs the
distinct-id map (ENT-006, KV-DB-014) and the legacy project (DEC-26); landing selection rules for `latest` and pins are
unknown (Q-API-051) — spec rules, compared with the last legacy snapshot at R1.

**Blocking decisions and questions.** DEC-08 (CSP), DEC-12 (retention ADR), DEC-14 (no public listing pages), DEC-15
(`kvadro.app` at S2), DEC-26 (PostHog projects), DEC-30 (thin-page threshold); Q-API-045, Q-API-046, Q-API-049,
Q-API-050, Q-API-051, Q-LND-010, Q-SEO-001, Q-SEO-002, Q-SEO-003, Q-SEO-008, Q-SEO-009, Q-SEO-013, Q-SEO-014,
Q-SEO-016, Q-DATA-032.

## 6. Execution order

1. **M4** (after KV-BE-023, KV-BE-032, KV-BE-045 and KV-DB-009 exist): KV-BE-100 → KV-BE-109 → KV-BE-110 → KV-BE-101 →
   KV-BE-102 → KV-BE-103 → KV-BE-104 → KV-BE-105 → KV-BE-106 → KV-BE-107 → KV-BE-108 → KV-BE-111. The telegram track's
   delivery group (M5.8) can start against KV-BE-109 and KV-BE-110 with fakes.
2. **M6, decisions first:** KV-BE-120 (ADR drafts for DEC-02 and DEC-03 go to the first developer early — review
   latency is the critical path), then KV-BE-121 → KV-BE-122 → KV-BE-123 → KV-BE-124 → KV-BE-126 → KV-BE-128 →
   KV-BE-131 → KV-BE-132 → KV-BE-134 → KV-BE-137 → KV-BE-139 → KV-BE-140 (a fixture post becomes a priced listing);
   then KV-BE-127, KV-BE-129, KV-BE-130, KV-BE-133, KV-BE-135, KV-BE-136, KV-BE-138, KV-BE-125, KV-BE-141, KV-BE-142;
   KV-BE-143 when `telegram.uz` can push.
3. **M7:** analytics first because S1 needs it — KV-BE-150 → KV-BE-151 → KV-BE-153 → KV-BE-152 → KV-BE-165; then the
   S2 path for SEO — KV-BE-157 → KV-BE-158 → KV-BE-160 → KV-BE-164 → KV-BE-159 → KV-BE-163 → KV-BE-161 → KV-BE-162; the
   landing data — KV-BE-156 → KV-BE-154 → KV-BE-155; KV-BE-166 whenever DEC-26 is answered.

M4 and the start of M6 can run in parallel (different modules); M7's SEO part waits for KV-BE-139/140 only for real
numbers — it is built and tested on seeded `market_medians` rows first.

## 7. Coverage

Every feature of the modules RADAR, DELIVERY, PIPELINE, SEO, LANDING, ANALYTICS, PRIVACY and MEDIA in `09`, plus the
features of other modules whose remainder `11` §16.1 assigns to M4/M6/M7. "M0–M3" names the tasks of `11` that already
cover the rest.

| # | Feature | Pri | Covered by (this roadmap) | Covered elsewhere or why no task |
| - | ------- | --- | ------------------------- | -------------------------------- |
| 1 | F-RADAR-001 | P0 | KV-BE-101 | previews use KV-BE-031, KV-BE-032 (client calls); bot `/subs` is telegram track |
| 2 | F-RADAR-002 | P0 | KV-BE-100, KV-BE-102, KV-BE-103 | bot create path: telegram track (`11b` M5.5) |
| 3 | F-RADAR-003 | P0 | KV-BE-100, KV-BE-103 | bot edit path: telegram track |
| 4 | F-RADAR-004 | P0 | KV-BE-104, KV-BE-106 | bot buttons: telegram track |
| 5 | F-RADAR-005 | P0 | KV-BE-104 | bot delete: telegram track |
| 6 | F-RADAR-006 | P0 | KV-BE-102, KV-BE-105 | flow options: KV-BE-032 |
| 7 | F-RADAR-007 | P2 | — | P2; no new backend work: the nudge is a legacy-client sheet, its flow line is KV-BE-032 |
| 8 | F-RADAR-008 | P0 | KV-BE-100, KV-BE-103, KV-BE-111 | `bot_chat_state` maintained by the telegram track (`11b` M5.3); column in KV-DB-007 |
| 9 | F-DELIVERY-001 | P0 | KV-BE-107, KV-BE-108 | — |
| 10 | F-DELIVERY-002 | P0 | KV-BE-108, KV-BE-110 | sending and pacing: telegram track (`11b` M5.8, SEC-REQ-029) |
| 11 | F-DELIVERY-003 | P0 | KV-BE-110 | digest message and send job: telegram track |
| 12 | F-DELIVERY-004 | P0 | KV-BE-110 | release job and send: telegram track |
| 13 | F-DELIVERY-005 | P0 | KV-BE-109, KV-BE-102 | message log writes: KV-TG-022; migration: KV-DB-019 |
| 14 | F-DELIVERY-006 | P0 | KV-BE-111, KV-BE-137 | the edit itself: telegram track |
| 15 | F-DELIVERY-007 | P0 | KV-BE-104 | API-032/033: KV-BE-044; the poll: telegram track |
| 16 | F-DELIVERY-008 | P1 | — | P1; no backend-domain work: recipients = users with the bot-only `service_news` setting (KV-BE-045 / KV-DB-007), throttled sender and opt-out are telegram track (`11b` M5.8), the operator screen is ARM (M9, DEC-22) |
| 17 | F-HIDE-004 | P0 | KV-BE-106, KV-BE-108, KV-BE-104 | bot submenu: telegram track |
| 18 | F-FILTER-005 | P0 | KV-BE-102 | count and flow endpoints: KV-BE-032 |
| 19 | F-FILTER-006 | P0 | KV-BE-100, KV-BE-107 | money and presets: KV-BE-016, KV-BE-019, KV-BE-020 |
| 20 | F-SETTINGS-005 | P0 | KV-BE-110 | settings API: KV-BE-045 |
| 21 | F-PIPELINE-001 | P0 | KV-BE-120, KV-BE-121, KV-BE-122, KV-BE-123, KV-BE-124, KV-BE-125, KV-BE-126, KV-BE-142, KV-BE-143 | KV-DB-029 (attach to migrated publications) |
| 22 | F-PIPELINE-002 | P0 | KV-BE-120, KV-BE-128, KV-BE-129, KV-BE-130 | gateway and masking: KV-BE-047 |
| 23 | F-PIPELINE-003 | P0 | KV-BE-121, KV-BE-127, KV-BE-134, KV-BE-135, KV-BE-136 | number resolver: KV-BE-018 |
| 24 | F-PIPELINE-004 | P0 | KV-BE-131, KV-BE-132 | gazetteer: KV-BE-015, KV-DB-006, KV-DB-034 |
| 25 | F-PIPELINE-005 | P0 | KV-BE-139, KV-BE-140 | serialization of `median_*`: KV-BE-024, KV-BE-034 |
| 26 | F-PIPELINE-006 | P0 | KV-BE-123, KV-BE-137, KV-BE-138 | retention purge: KV-DB-028 |
| 27 | F-PIPELINE-007 | P0 | KV-BE-131 | rates: KV-BE-019 |
| 28 | F-PIPELINE-008 | P1 | KV-BE-154, KV-BE-155, KV-BE-157 | — |
| 29 | F-LISTING-004 | P0 | KV-BE-140 | serialization: KV-BE-034 |
| 30 | F-LISTING-005 | P0 | KV-BE-141 | on-demand translation: KV-BE-047, KV-BE-048 |
| 31 | F-LISTING-006 | P0 | KV-BE-134 | serialization: KV-BE-034 |
| 32 | F-LISTING-007 | P0 | KV-BE-132, KV-BE-133 | serialization: KV-BE-034, KV-BE-021 |
| 33 | F-OWNER-002 | P0 | KV-BE-128, KV-BE-134 | badge resolver: KV-BE-025 |
| 34 | F-ADMIN-002 | P1 | KV-BE-126, KV-BE-138 | ARM screens: M9 |
| 35 | F-MEDIA-001 | P0 | KV-BE-127 | KV-BE-002, KV-BE-003, KV-BE-004, KV-BE-026, KV-BE-027 |
| 36 | F-MEDIA-002 | P0 | — | no M4/M6/M7 work: `meta.tiles` is KV-BE-029; PMTiles hosting is infrastructure (Q-API-053) |
| 37 | F-MEDIA-003 | P0 | — | no M4/M6/M7 work: KV-BE-037 |
| 38 | F-MEDIA-004 | P1 | KV-BE-156 | — |
| 39 | F-SEO-001 | P1 | KV-BE-157, KV-BE-159 | routes and pages: `frontend/landing` (CF-010) |
| 40 | F-SEO-002 | P1 | KV-BE-157, KV-BE-158, KV-BE-159 | pages: `frontend/landing` |
| 41 | F-SEO-003 | P1 | KV-BE-158, KV-BE-159 | pages: `frontend/landing` |
| 42 | F-SEO-004 | P1 | KV-BE-158, KV-BE-159 | pages: `frontend/landing` |
| 43 | F-SEO-005 | P1 | KV-BE-157, KV-BE-159 | CTA wording (DEV-046): frontend and bot |
| 44 | F-SEO-006 | P1 | KV-BE-161, KV-BE-162 | frozen legacy series loaded by the migration (KV-DB-021) |
| 45 | F-SEO-007 | P1 | KV-BE-160 | signed photos: KV-BE-026, KV-BE-027 |
| 46 | F-SEO-008 | P1 | KV-BE-157, KV-BE-163 | XML rendering and robots: `frontend/landing` |
| 47 | F-SEO-009 | P1 | KV-BE-159 | `ETag`/`Last-Modified` from the snapshot; headers and CDN: `frontend/landing` + production track |
| 48 | F-SEO-010 | P1 | KV-BE-160 | `s_seo_*` payload parser: telegram track |
| 49 | F-SEO-011 | P1 | KV-BE-164 | — |
| 50 | F-SEO-012 | P1 | KV-BE-159 | unknown-slug answer; the 404 page: `frontend/landing` |
| 51 | F-LANDING-001 | P1 | — | P1; pages and locale routes are `frontend/landing` (CF-010); no backend data |
| 52 | F-LANDING-002 | P2 | — | P2; client-side scenes; no backend work |
| 53 | F-LANDING-003 | P1 | KV-BE-154, KV-BE-155 | — |
| 54 | F-LANDING-004 | P1 | — | P1; static blocks in `frontend/landing` |
| 55 | F-LANDING-005 | P1 | — | P1; bot payload parser and `user_attributions` are telegram track + KV-DB-007; no backend-domain work |
| 56 | F-LANDING-006 | P1 | — | P1; client language logic in `frontend/landing` |
| 57 | F-LANDING-007 | P1 | KV-BE-153 | headers, CSP, manifest: `frontend/landing` (DEC-08) |
| 58 | F-LANDING-008 | P3 | — | P3 drop candidate (DEV-043) |
| 59 | F-LANDING-009 | P1 | — | P1; host routing and 404 in `frontend/landing` and nginx |
| 60 | F-LANDING-010 | P3 | — | P3 drop candidate (DEV-044, edge) |
| 61 | F-LANDING-011 | P3 | — | P3 drop candidate: RES-016 is not implemented unless Q-API-049 shows it is used |
| 62 | F-ANALYTICS-001 | P0 | KV-BE-151 | — |
| 63 | F-ANALYTICS-002 | P1 | KV-BE-152 | `meta.analytics`: KV-BE-029; distinct id: KV-BE-007, KV-DB-007; migration of ids: KV-DB-014 |
| 64 | F-ANALYTICS-003 | P0 | KV-BE-150 | bot action events: telegram track (`11b` M5.9); partition drop: KV-DB-028 |
| 65 | F-ANALYTICS-004 | P1 | KV-BE-166 | new landing analytics bootstrap: `frontend/landing` |
| 66 | F-PRIVACY-001 | P0 | — | P0 but no backend work: policy texts are the bot `/privacy` (KV-TG-048) and the landing page; retention ADR KV-BE-049 |
| 67 | F-PRIVACY-002 | P0 | KV-BE-111, KV-BE-152, KV-BE-165 | procedure: KV-BE-049, KV-BE-050; bot button: KV-TG-049 |
| 68 | F-PRIVACY-003 | P0 | KV-BE-165 | listing PII purge and partition drops: KV-DB-028; `telegram_updates`: KV-TG-003 |
| 69 | F-PRIVACY-004 | P0 | KV-BE-128, KV-BE-129 | gateway: KV-BE-047; log redaction: KV-BE-008 |

## 8. Counts

| Milestone | KV-BE tasks (S / M / L) | Total |
| --------- | ----------------------- | ----: |
| M4 | 12 (3 / 8 / 1) | 12 |
| M6 | 24 (4 / 12 / 8) | 24 |
| M7 | 17 (5 / 9 / 3) | 17 |
| **Total** | **53 (12 / 29 / 12)** | **53** |
