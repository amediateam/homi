# 15 — Testing strategy and parity gate

Part of the kvadro² → HOMI migration audit (rules, labels and ID scheme: [`README.md`](README.md)). QA tasks
`KV-QA-NNN` are defined in §6 of this document; their task files are in [`tasks/qa/`](tasks/qa/).

- **Status:** wave 1 (2026-11-09) — strategy and task list. No test code exists yet; nothing was run for this document;
  the legacy tree was only read.
- **Inputs:** `08` (every API row lists the tests it needs), `02`, `03`, `03b`, `04`, `05`, `06`, `10`, `14` §6,
  `16` §4–§5, the legacy parity harness (`$KVADRO_ROOT/CLAUDE.md:23-52`, `$KVADRO_ROOT/demo/app/tools/parity/*`,
  `$KVADRO_ROOT/demo/landing/tools/parity/*`) and the HOMI test setup (`backend/phpunit.xml`, `backend/tests/Pest.php`,
  `.github/workflows/backend.yml`, `Makefile` targets `ci-backend` / `ci-frontend`).
- **New tools.** Every tool or dependency that is not in the repository today is `PROPOSED` and marked **needs approval
  (dependency change)**. The route is `docs/handoff/parallel-work.md` §4: the first developer approves, the package is
  listed in `scripts/packages/proposed.json` and installed in a separate PR.
- **Alignment with `09`.** The parity gate (§4) is kept per feature `F-<MODULE>-NNN` of
  [`09-feature-parity-matrix.md`](09-feature-parity-matrix.md) (144 features, `data/features.csv`). `09` §4 sorts every
  `LB-…` into a `DEV-NNN` row (52 rows, all `PROPOSED`) or a "defect fix, no DEV" row (107, `APPROVED` by the policy);
  §1.4 turns that into expected test outputs. The `acceptance_tests` column of `09` is the per-feature list of cases;
  this document defines how they are built, run and gated.
- **Production.** No test calls a production API or Telegram. The two optional steps that would record production
  responses (§1.6, §3.9) are marked **needs developer approval: touches production** and are read-only by design.

## 0. Decisions in one screen

1. Parity is proven by comparing outputs for the same inputs, not by a green build. Every comparison names its oracle
   (§1.3) and its mode (§1.5); where a legacy fix applies, the `DEV-…` that changes the expected output (§1.4).
2. The legacy Mini App production build is the strongest oracle available. It runs **unchanged**, as a reference
   client, against HOMI's legacy surface, reusing the legacy parity harness design (§2.5).
3. Contract tests of the legacy `/api/*` surface are a PR gate. They are driven by golden fixtures derived from `08`,
   `$KVADRO_ROOT/docs/api.md` and the parity mocks (§2.1, §2.4).
4. Everything that touches geography, `jsonb`, locks, sequences or concurrency is tested on PostgreSQL + PostGIS, not
   on the in-memory SQLite the suite uses today (§2.3, KV-QA-001).
5. Tests never reach the network: Telegram, PostHog, the LLM, the rate source and tile hosts are faked, and
   `Http::preventStrayRequests()` is on in every suite (§1.7).
6. A feature is at parity only when all ten gate conditions are ticked with evidence and countersigned (§4). Unticked
   items stay open; the feature row in `09` cannot be `DONE` with an open item.

## 1. Principles

### 1.1 "It compiles" and "tests pass" are not parity

- A green build proves that the code agrees with the tests we wrote. Parity requires two more things: the tests encode
  **legacy behaviour** (or a recorded deviation), and the **old clients** — the legacy Mini App, messages already
  sitting in users' chats, public links — still work.
- A test whose expected value was read off the new implementation is not a parity test. Every parity test states
  where its expected output comes from (§1.3) and links the legacy evidence (`path:line`, audit ID or recording).
- Most legacy server behaviour is `DOCUMENTED_ONLY` or `UNVERIFIED` (`02`). A test of such behaviour is labelled
  **spec-tested**: its expected value is our specification, not an observation. Gate condition G10 (§4) keeps this
  label visible instead of letting it pass as parity.

### 1.2 The comparison chain

Every characterization or parity case is one record with five parts:

| Part | Meaning | Example: API-004, last page |
| ---- | ------- | --------------------------- |
| Legacy Input | The request or Telegram update exactly as the legacy client or Telegram sends it | `GET /api/feed?city=tashkent&deal=rent_long&owner=any&types=apartment&limit=20&cursor=<opaque>` with `Authorization: tma <test initData>` |
| Legacy Output | What legacy answers, with the oracle it comes from | `200 {"items": [], "next_cursor": null}` — contract (`08` §1.8, BR-API-022) |
| New Input | The same input sent to HOMI, byte-identical unless the case says why | the same request against HOMI's legacy route group |
| New Output | What HOMI answers | captured by the test |
| Comparison | Mode (§1.5) and the allowed differences | `shape`; `next_cursor` is JSON `null`; no item id repeats across pages |

Golden fixture format (KV-QA-002):

```json
{
  "subject": "API-004",
  "case": "last-page-next-cursor-null",
  "legacy": {
    "input": {"method": "GET", "path": "/api/feed", "query": "city=tashkent&deal=rent_long&owner=any&types=apartment&limit=20&cursor={{cursor}}", "auth": "tma:user-a"},
    "output": {"status": 200, "model": "FeedPage", "body": {"items": [], "next_cursor": null}},
    "source": "contract",
    "evidence": ["08-api-inventory.md#API-004", "$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:41-42"]
  },
  "new": {"input": "same", "expect": "same", "deviation": null},
  "compare": {"mode": "shape", "strict": ["next_cursor"], "mask": []}
}
```

When a fix applies, `deviation` is `{"id": "DEV-…", "state": "APPROVED|PROPOSED", "expect": {…}}` and the legacy
output stays in the record for history.

### 1.3 What can be compared while the legacy backend is unavailable

| # | Oracle | What it proves | Limits | Used by |
| - | ------ | -------------- | ------ | ------- |
| O1 | API contract: `08` §1–§2, `data/api-inventory.json`, `$KVADRO_ROOT/docs/api.md` §2–§4 | methods, paths, statuses, field names and types, strictly read keys, error dialect (`CONFIRMED` where the client reads it) | nothing about values or server algorithms | golden fixtures, contract tests (§2.1, §2.4) |
| O2 | Legacy client code (decompiled Mini App, landing JS) | what the client parses and what crashes it (LB-APP-002, LB-API-009, LB-API-011) | decompiled, not original source | strictness rules, enum safety (§3.12) |
| O3 | Legacy Mini App production build as a reference client | the old client works end to end on HOMI: DOM, `<html class>`, `lang`, API request set | needs a runner (approval) and data seeded to mirror the mocks | §2.5 |
| O4 | Parity mocks (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs`, `mocks-filters.mjs`, `gl-parity.mjs`) | realistic shapes, scenario steps, fault cases (403, 500, 204) | inferred from code, not recorded (`$KVADRO_ROOT/CLAUDE.md:34`); values invented | fixtures, reference-client seed |
| O5 | Landing production mirror (`$KVADRO_ROOT/demo/landing/site/`) and its 40 scenarios with fixtures (`$KVADRO_ROOT/demo/landing/tools/parity/`) | landing DOM, language rules, CSP hashes, landing-data schema | landing data is a snapshot; SEO pages are not mirrored (25 of 1 008 sampled, Q-SEO-001) | §2.9 |
| O6 | Bot transcripts (`$KVADRO_ROOT/docs/telegram-bot.md`, `04`) | texts (TXT-BOT-…), keyboards, flows, toasts | pushes, digests and quiet hours never observed (`04` §5); `callback_data` grammar unknown (Q-BOT-017) | bot conversation tests (§2.6) |
| O7 | Legacy database dump (`14`) | carried-over data: counts, fingerprints, relations, business checks | blocked by P1–P5 (`14` §1.1) | migration validation (§2.10) |
| O8 | Read-only recording of production responses with the owner-approved test account (§1.6) | real formats and statuses (Q-API-022, Q-API-003, Q-API-007) | **needs developer approval: touches production**; one account's view | fixture refresh |
| O9 | Specification: BR- rules, approved `DEV-…`, SEC-REQ- | behaviour legacy never exposed, or that we change on purpose | decided, not observed: spec-tested | everything server-side |

Not comparable at all, and therefore spec-tested: duplicate-merge rules (Q-API-019), median and tone thresholds
(Q-API-011, Q-API-021), sort tie-breaks (Q-API-010), flow relax-option selection, radar delivery timing (Q-BOT-002,
Q-BOT-003, Q-BOT-033), deletion scope (Q-API-048).

### 1.4 Expected output when a deviation applies

The migration policy (`README.md`, "Migration policy") fixes legacy defects instead of reproducing them, and `09` §4
records every fix. The expected output of every case is chosen in this order:

1. **`DEV-NNN` `APPROVED`** (`09` §4.2) → the test expects the new behaviour; its name carries the DEV id; the fixture
   keeps `legacy.output` for the record.
2. **`DEV-NNN` `PROPOSED`** → the test for the proposed behaviour is written and marked `->todo('DEV-NNN PROPOSED')`;
   no legacy assertion is written. Gate condition G5 stays open until the developer decides. On 2026-11-09 all 52 DEV
   rows are `PROPOSED`.
3. **Defect fix without a DEV** (`09` §4.3, `APPROVED` by the policy) → the test expects the fixed behaviour now,
   because nothing a user or a legacy client relied on changes.
4. **No `LB-…`** → the test expects the legacy output from its oracle.
5. **Client-side fixes** (`LB-APP-…`) apply to the new HOMI Mini App only; the legacy Mini App is not modified
   (`09` §4). Reference-client runs (§2.5) therefore expect the legacy client's own behaviour, quirks included.
6. **Compatibility window.** When a fix changes the legacy surface (`/api/*`, `callback_data`, deep links, URLs), the
   affected reference-client scenarios (§2.5) or old-message cases (§2.6) must stay green: the fix ships compatible,
   or only after the client it would break is retired.
7. A test that asserts a known `LB-…` defect without a decision is a review finding, not parity.

Expectations that already differ from legacy today, because they are defect fixes approved by the policy: uniform
`404` instead of `422` for a media URL without signature (LB-API-023, SEC-REQ-024); plain-text map labels (LB-API-008,
SEC-REQ-018); a silent `401` for an empty `tma ` header (LB-API-001, SEC-REQ-005); `200 {"hidden": …}` for every report
reason (LB-API-015); "round first, then pick the unit" for UZS strings (LB-APP-011, server strings and the new
clients). Written as `todo` until approved: `/start l_<id>` answered with the listing (DEV-037), `?lang=` redirects
(DEV-038), typed amounts in common formats (DEV-029), server-side duplicate-radar prevention (DEV-009), Tashkent time in
the price history (DEV-014), budgets in the user's currency (DEV-006).

### 1.5 Comparison modes

| Mode | Rule | Typical use |
| ---- | ---- | ----------- |
| `exact` | Bytes equal after documented masking (signatures, tokens, timestamps) | bot texts, CSV exports, CSP hashes, `meta.analytics.id` |
| `shape` | Same key set (strict keys present even when `null`), same JSON types, ids are JSON integers, arrays never `null`, enums inside the documented set | every `/api/*` response |
| `set` | Same set of ids or requests; order ignored unless the contract orders | feed vs count vs map; reference-client request sets |
| `semantic` | Same meaning under a stated rule (`count` = items reachable through pagination) | consistency checks (§3.7) |
| `tolerance` | Numeric difference within a stated bound | medians ± max($1, 1 %) (`14` §6.6); performance budgets |
| `behaviour` | DOM tree, `<html class>`, `lang`, API request set (with non-GET bodies) and probed Telegram calls equal | reference-client and landing runs (§2.5, §2.9) |

### 1.6 Optional: read-only recording of production responses

**Needs developer approval: touches production.** Without that approval this section is not executed and O8 stays
empty; the affected cases stay spec-tested.

- **Purpose:** close format and status questions the contract cannot answer — Q-API-022 (formatting of `price`, `age`,
  `title`, `status_text`, `facts`), Q-API-003 (auth failures), Q-API-007 (`422` body), Q-APP-011, Q-API-029 — and
  refresh golden fixtures with real formats.
- **Account:** only the owner-approved test account (`14` §1.1 P14). The developer obtains its `initData` in Telegram
  and puts it into an environment variable for one session. It is never stored, logged, committed or shown to an
  agent.
- **Requests:** `GET` only — `/api/bot`, `/api/meta`, `/api/cities`, `/api/feed` (≤ 3 pages), `/api/feed/count`,
  `/api/feed/flow`, `/api/map`, `/api/listings/:id` (≤ 20 ids, with and without `preview=1`), `/api/subscriptions`,
  `/api/settings`, `/api/favorites`, `/api/history`, `/api/hidden`, plus one negative-auth probe per Q-API-003 case
  with a deliberately tampered hash. No `POST`, `PUT`, `PATCH`, `DELETE`, no `/api/events`; at most 1 request per
  second and one run per day.
- **Sanitising before anything reaches disk:** `phone`, `phone_display`, `original_text`, `summary`, `author.label`,
  `offers`, `history[].text`, `history[].url`, `sources`, `call_url`, `contact_url`, photo URL signatures and the
  account's `analytics.id` are replaced by fixed placeholders of the same type and format. Raw responses stay in
  memory. Output: `backend/tests/Fixtures/Legacy/recorded/<date>/` with a README naming the approval.
- **Bot side:** recorded only by a human on the test account (radar push, digest, quiet hours — Q-BOT-002, Q-BOT-003),
  as cropped screenshots of the bot chat.

### 1.7 Ground rules for every suite

- **Synthetic data only.** No real `initData`, Telegram ids, phone numbers, names or channel posts in fixtures, logs or
  screenshots. Phone-like values use the non-assigned operator code `00` (`+998 00 000 00 00`); channel handles use
  `example_channel`. Data copied from the parity mocks is sanitised the same way before it is committed.
- **No network.** The base `Tests\TestCase` calls `Http::preventStrayRequests()`; Telegram, PostHog, the LLM, the CBU
  rate source and tile hosts are faked. A stray request fails the test.
- **Deterministic.** Frozen clock (`$this->travelTo()`), fixed seeds, no `sleep()`; time-dependent cases run at
  explicit UTC instants (§3.10).
- **No secrets.** Tests sign `initData` and the webhook secret with synthetic values set in `phpunit.xml`. Tests and
  agents never read the dev, staging or production bot tokens or `backend/.env`.
- **Legacy tree read-only.** Runners copy what they need (production artefacts, scenario files) into a gitignored
  scratch directory and run there; nothing executes with the legacy tree as working directory (§2.5).

## 2. Test layers

### 2.0 Overview

| Layer | Purpose | Tool | Where | Runs | Tasks |
| ----- | ------- | ---- | ----- | ---- | ----- |
| Characterization | Freeze legacy outputs as golden fixtures | JSON fixtures + Pest datasets (existing) | `backend/tests/Fixtures/Legacy/` | PR | KV-QA-002 |
| Unit | Pure rules: filter normaliser, money, time windows, payload grammars, signers | Pest (existing) | `backend/tests/Unit/` | PR | KV-QA-006, KV-QA-007 |
| Feature / integration | HTTP, jobs, queues, database | Pest on SQLite (existing); Pest on PostgreSQL + PostGIS | `backend/tests/Feature/` | PR; bursts nightly | KV-QA-001, KV-QA-008 |
| API contract | Byte compatibility of the legacy `/api/*` surface | Pest + shape matcher in `tests/Support` (no new dependency) | `backend/tests/Feature/LegacyApi/` | PR | KV-QA-004 |
| Reference client | Legacy Mini App build on HOMI | runner chosen in KV-QA-010 — PROPOSED | gitignored scratch + runner code | nightly, pre-release | KV-QA-010, KV-QA-011, KV-QA-012 |
| Bot conversation | Updates in, Bot API calls out | Pest + `Http::fake` (existing) | `backend/tests/Feature/Bot/` | PR | KV-QA-003, KV-QA-009 |
| E2E, new clients | New Mini App, landing, ARM | Playwright or the Pest browser plugin — PROPOSED (HANDOFF T8); Dusk (existing) as interim smoke | `frontend/*`, `backend/tests/Browser/` | nightly, pre-release | T8; KV-QA-022 (device pass) |
| Visual regression | Key states look the same | screenshots from the KV-QA-010 runner; diff tool PROPOSED | `docs/migration/visual-baseline/` | on demand, pre-release | KV-QA-019 |
| Landing and public URLs | 40 landing scenarios, 62 URL patterns, 1 008 SEO URLs, deep links | KV-QA-010 runner; Pest `Smoke` suite with the HTTP client (existing) | `backend/tests/Smoke/` | nightly, pre-release | KV-QA-013, KV-QA-014 |
| Migration validation | Counts, checksums, RI, business checks — and tests of those checks | Pest on PostgreSQL + the validation command (KV-DB-022) | `backend/tests/Feature/Migration/` | PR (synthetic), rehearsals | KV-QA-018 |
| Security | The test plan of `16` §5 | Pest (existing) | `backend/tests/Feature/Security/` | PR | KV-QA-015, KV-QA-016, KV-QA-017 |
| Performance | Feed/map p95, radar matching throughput, Telegram send rate | `Benchmark`, `EXPLAIN`, burst runner (existing); k6 PROPOSED | `backend/tests/Performance/` (not in default run) | weekly, staging | KV-QA-020 |
| Smoke per environment | Each deployment answers | Pest `Smoke` suite, `make dev-check` | `backend/tests/Smoke/`, `scripts/dev/` | per deploy | KV-QA-022 |

Pest is `pestphp/pest` `^5.3` (`backend/composer.json:42`). Today's suite: 47 cases on SQLite, nothing for any legacy
contract (`10` §1.12).

### 2.1 Characterization tests (golden fixtures per API-NNN)

- One directory per endpoint, `backend/tests/Fixtures/Legacy/api/API-NNN/`, with fixtures in the §1.2 format: the
  positive case from the parity mocks, every error listed in the `08` row ("Errors"), and the cases named in its
  "Tests" field as they become implementable.
- Shared models (`ListingPreview`, `ListingDetails`, `FeedPage`, `SearchFilters` with exactly 25 keys, `Subscription`,
  `SubscriptionMutationResult`, `MetaResponse`, `CityMeta`, `CityStats`, `SettingsResponse`, `HiddenResponse`,
  `MapResponse`, `FlowResponse`, the error body) are described once in `backend/tests/Fixtures/Legacy/models/` with,
  per field: type, nullability, the strict flag (`!` in `08` §1.8), allowed enum values and the evidence line.
- `source` is `contract`, `mock` or `recorded`; a `mock` value is a shape example, never a value expectation.
- A fixture self-test checks that every fixture matches its model and that each of API-001 … API-034 has at least one
  fixture. The legacy client's i18n key list (from `$KVADRO_ROOT/demo/app/src/i18n/locales/{ru,uz_Latn,en}.js`) is
  extracted as `legacy-i18n-keys.json` for enum-safety tests (§3.12).

### 2.2 Unit tests

Pure functions with datasets: the shared filter normaliser and validator (SEC-REQ-017), money formatting and parsing
(§3.11), quiet-hour and digest windows (§3.10), `start` / `startapp` payload grammars (`03b` §6.3, BR-BOT-096), the
`initData` verifier (SEC-REQ-001), the media URL signer (SEC-REQ-024), the call-token signer (SEC-REQ-026),
`callback_data` encoding (≤ 64 bytes, versioned), HTML escaping for bot output (SEC-REQ-020), the `uz_Latn` ↔ `uz`
mapping (CF-006). Cases come from the shared fixtures of KV-QA-006 so the backend and the new clients test the same
table.

### 2.3 Feature and integration tests — and the SQLite gap

- Feature tests run on in-memory SQLite (`backend/phpunit.xml:26-28`), so PostgreSQL behaviour is not exercised
  (`CLAUDE.md`, "Databases"). CI already starts `postgres:18` but only for `composer setup`
  (`.github/workflows/backend.yml:28-44`).
- KV-QA-001 adds a PostgreSQL run of the whole Feature suite (`phpunit.pgsql.xml`) and a `Feature/Pgsql/` folder whose
  tests skip themselves on SQLite. **PostGIS** joins once the CF-014 ADR and KV-DB-005 are accepted and the CI image
  is approved.
- Must run on PostgreSQL: lasso polygon, distances, nearest-12/15 medians and `geo_radius_m` (GAP-006, GAP-007,
  GAP-009); `jsonb` radar filters and their 25-key check (V-RI-3 in `14`); unique and partial indexes behind
  idempotency (SEC-REQ-015); `lockForUpdate` and advisory locks; sequences for preserved numbers (CF-003, V-RI-9);
  partitioned tables; `insertOrIgnore` on (`bot_id`, `update_id`) under concurrency (SEC-REQ-009); everything in
  `14` §6.
- Race tests (§3.6) use `DatabaseTruncation` instead of `RefreshDatabase`: rows inside an open test transaction are
  invisible to a second connection.

### 2.4 API contract tests (legacy `/api/*`)

One fixture-driven suite (`backend/tests/Feature/LegacyApi/LegacyContractTest.php`) with one dataset per endpoint,
built from the fixtures of §2.1 by the harness of KV-QA-004. Rules every legacy response is checked against:

| Rule | Source |
| ---- | ------ |
| Path is the bare legacy path (`/api/feed`), never `/api/v1`; body is bare JSON, no `success` / `data` envelope | `08` §1.1, CF-001 |
| Strict keys are present even when `null` or empty: `photos_preview`, `center_km`, `metro_km`, `median_delta`, `history[].price_usd`, `history[].change_pct`, `sources`, `median_value` when `median` is truthy, all 25 `filters` keys, `relaxed`, `next_cursor` | `08` §1.8, LB-API-005, LB-API-009 |
| Listing `id` is a JSON integer (compared with `===`), below 2^53; ids in `listing_ids` and map points are numbers | LB-API-011, CF-003 |
| Arrays are never `null` | `08` §1.4 |
| `next_cursor` is JSON `null` on the last feed page and always on favourites and history | BR-API-022, BR-API-023, LB-API-004 |
| Application errors are `{"detail": "<string>"}`; the five access reasons on `403`; `409 {"detail":"no_chat"}` vs the limit `409` with another `detail` | BR-API-017, BR-API-021, LB-API-033 |
| Validation errors use the dialect decided for Q-API-007 (legacy: Pydantic `422`) and never `500` | BR-API-018, SEC-REQ-017 |
| No empty `200`; any 2xx the client parses is JSON; `204` only where `08` recommends it and never for `POST …/report` | BR-API-020, LB-API-003, LB-API-015 |
| `GET /api/bot` answers `200` without auth and ignores any `Authorization` header | BR-API-009, SEC-REQ-005 |
| Query parsing: repeated keys (`types`, `districts`, `renovation`, `appliances`, `zones`) all applied; `+` as space; the literal string `undefined` handled as documented | BR-API-025, `08` §1.7 |
| Bodiless `POST`/`DELETE` without `Content-Type` accepted | `08` §1.3 |
| `Content-Type: application/json`; `Cache-Control: private, no-store`; no `Access-Control-Allow-Origin` on the same-origin surface | SEC-REQ-032, SEC-REQ-033 |
| Server display strings in the user's locale and currency; enum values inside the legacy client's dictionary | CF-017, LB-API-006, §3.12 |
| Timestamps ISO-8601 UTC with `Z` | BR-API-151 |

A case runs as soon as a route with its method and path is registered; until then it is reported as `todo`, so the
denominator (34 endpoints) is visible from day one (§5.6) and a backend PR that adds a route is checked without
editing any test.

### 2.5 Legacy Mini App as a reference client

**What is reused.** The legacy harness (`$KVADRO_ROOT/demo/app/tools/parity/parity.mjs`) opens two builds in headless
Chrome at 390 × 844 with identical Telegram and API mocks (`mocks.mjs:7-60` fakes `window.Telegram.WebApp`, freezes
`Math.random` and `Date`; `parity.mjs:37-58` intercepts `/api/*` and `/media/*`, blocks the Telegram SDK, PostHog and
OSM). It compares the normalised DOM of `#root` and portals, `<html class>`, `lang` and the set of API requests
including non-GET bodies, excluding `POST /api/events` (`parity.mjs:60-89`). `SHOTS=` saves screenshots
(`parity.mjs:76`). Scenario lists at the audit date: 43 in `mocks.mjs`, 36 in `mocks-filters.mjs`, 16 in
`gl-parity.mjs` (`$KVADRO_ROOT/CLAUDE.md:26-28` still says 28 / 35 / 16).

**How it is used against HOMI.**

1. The runner copies the legacy **production artefacts** — not a rebuild of the decompiled sources (Q-SEC-015,
   SEC-REQ-049) — and the scenario files into a gitignored scratch directory, and records a hash manifest. It first
   checks which release the artefacts are: `08` names `index-plF_TOcT.js`, while
   `$KVADRO_ROOT/demo/app/tools/parity/original/assets/` holds `index-B_mMoUu6.js`.
2. It serves the artefacts and proxies `/api`, `/media`, `/tiles` and `/call` to HOMI — the same rule as
   `VITE_API_PROXY` (`$KVADRO_ROOT/demo/app/vite.config.js:49-63`), implemented in the runner so that no legacy
   `npm`/`vite` run is needed.
3. It starts the HOMI backend itself (PHP built-in server on a free port, never `php artisan serve`, never ports
   8000/8001) on a dedicated PostgreSQL database seeded with the **mock-equivalent seed** (KV-QA-011), and with a
   synthetic bot token; the injected fake Telegram carries `initData` signed with that token.
4. Each data-path scenario runs twice — artefacts + legacy mocks (expected) and artefacts + HOMI (actual) — and the
   two snapshots are compared in `behaviour` mode. Fault-injection scenarios (forced `500`, `403`, `204`) stay
   mock-only; they test the client, not the backend, and become E2E cases for the new Mini App.
5. Every difference is either fixed or mapped to a `DEV-…`; results go to `docs/migration/data/reference-client-results.csv`.

**Runner options** (decided in KV-QA-010):

| Option | Pros | Cons | Approval |
| ------ | ---- | ---- | -------- |
| A. `puppeteer-core` in a small Node runner (the legacy harness design, ported) | proven on these exact scenarios; request interception and init scripts built in | new npm dependency | needs approval (dependency change) |
| B. Pest browser plugin (`pestphp/pest-plugin-browser`, Playwright) | one PHP suite; screenshots and assertions; reusable for E2E and visual | new dependency; init-script and interception support to verify | needs approval (dependency change) |
| C. Dusk + ChromeDriver CDP (`Page.addScriptToEvaluateOnNewDocument`, `Network.setBlockedURLs`, performance log for requests) | no new dependency | more glue code; request bodies harder to capture | none |

Fallback for local exploration only: a `vite dev` run of a scratch copy with `VITE_API_PROXY` pointing at the local
HOMI — it needs a scratch `npm` install (approval) and runs the decompiled sources, so it is never the gate.

### 2.6 Bot conversation tests

- **In:** synthetic updates (`message`, `callback_query`, `my_chat_member`, `contact`) posted to `/telegram/webhook`
  with the test secret, queues `sync`. **Out:** every Bot API call is captured by a fake (`Http::fake` on
  `api.telegram.org`) and asserted: method order, `chat_id`, `message_id` for edits, exact text per `TXT-BOT-…` and
  locale after HTML escaping, `parse_mode`, inline keyboard labels and `callback_data`, `answerCallbackQuery` text and
  `show_alert`.
- The fake validates Telegram's limits on every call: text ≤ 4 096 and caption ≤ 1 024 characters, `callback_data`
  ≤ 64 bytes, HTML well formed with Telegram's allowed tags, `url` buttons `https` and allow-listed (SEC-REQ-019,
  SEC-REQ-020). It can answer `429 retry_after`, `403 blocked` and `400 message is not modified`.
- Transcripts per flow come from `04` §3 (Russian texts verbatim; uz/en where `tb` §13 captured them, otherwise the key
  and shape only, Q-BOT-014). Legacy `callback_data` cases: unknown, malformed, 65 bytes, another user's ids and —
  once Q-BOT-017 is answered — every legacy prefix; all end in TXT-BOT-039 with no state change (`04` §6.3).
- Outbound and scheduled flows (BOT-081 … BOT-084, BOT-062) are spec-tested with a frozen clock; their legacy formats
  are unknown (Q-BOT-002, Q-BOT-003).

### 2.7 E2E for the new clients

- The new Mini App, landing and ARM have no test runner (HANDOFF T8 gate). Proposed: Playwright (or the Pest browser
  plugin if chosen in KV-QA-010) with the same fake Telegram as §2.5, so that the legacy fault-injection scenarios
  (forced `403`/`500`/`204`, write-access denial, share twice) become E2E cases — needs approval (dependency change).
- Interim: Dusk (installed) can drive the `*.homi.loc` hosts for smoke-level flows.
- A manual **device pass** before each release on the dev or staging bot: Telegram iOS, Android (including one old
  WebView, the legacy build targets `chrome80` / `safari13.1`), Desktop and Web, with a checklist built from TMA-001 …
  TMA-045 (KV-QA-022). Staging bots belong to the production track; using them needs its approval each time.

### 2.8 Visual regression

- Baselines: about 32 key states of the legacy Mini App (list in KV-QA-019, SCR-002 … SCR-045), ru light at 390 × 844,
  plus dark and uz/en variants for the feed, listing and filters, captured from the production artefacts with the
  sanitised mocks on the CI Linux image (fonts differ across machines).
- Until a diff tool is approved, comparison is a human side-by-side review recorded in the PR; an automatic pixel diff
  (pixelmatch or the browser plugin's screenshot assertion) needs approval (dependency change).
- `behaviour` comparison (§2.5) does not see pure CSS changes (`$KVADRO_ROOT/CLAUDE.md:47`); visual review covers them.

### 2.9 Landing, SEO and public URLs

- **Landing:** the 40 legacy scenarios (`$KVADRO_ROOT/demo/landing/tools/parity/scenarios.mjs`, groups in `03b` §1.6)
  run with base = the production mirror and candidate = the new `frontend/landing`, comparing DOM with origins
  stripped, `<html class>`, `lang`, title and description, localStorage, CSP violations and same-origin requests
  (`$KVADRO_ROOT/demo/landing/tools/parity/parity.mjs:26-83`). Expected differences follow the LB-LND decisions and
  CF-010.
- **Public URLs and deep links:** §3.9 and KV-QA-014.

### 2.10 Migration validation

The checks themselves are KV-DB-022 (`14` §6: V-CNT-1…3, V-SUM-1…6, V-RI-1…10, the business checks of §6.5, the
tolerances of §6.6). QA adds **tests of the checks** (KV-QA-018): on a synthetic legacy stage and target, each check
is run once on clean data (pass) and once per planted defect (fail) — a dropped row, a changed listing number, a
24-key radar filter, an alias pointing to a merged listing, PII left on a purged listing, a sequence below the
preserved maximum, an erased subject present. Re-running a load on unchanged data writes zero rows (`14` §7.2). The
API-level sampled diff of `14` §6.4 runs only against staging HOMI and an approved recording (O8).

### 2.11 Security tests

The plan is `16` §5; every SEC-REQ- carries its acceptance test. Split into three suites: authentication, access gate,
IDOR and rate limits (KV-QA-015); webhook, bot input, injection, files and capability URLs (KV-QA-016); privacy,
logging, retention and deletion (KV-QA-017). The concrete cases are in §3.1 – §3.3 and §3.8.

### 2.12 Performance

- Dataset: synthetic, at legacy volume — about 1 050 new listings per day (`10` CF-004), the six cities, user and radar
  counts from Q-DATA-002 / Q-BOT-034 or, until then, the assumed sizes in KV-QA-020 marked `ASSUMED`.
- Measured on PostgreSQL + PostGIS: p50/p95 of `GET /api/feed` (default, heavy filters, 40-vertex polygon),
  `/api/feed/count`, `/api/feed/flow`, `/api/map` (largest city, all points), `/api/listings/:id`; `EXPLAIN (ANALYZE,
  BUFFERS)` snapshots per query; radar matching time per new listing against all active radars; outbound send rate
  against the fake Bot API with pacing and `retry_after` (SEC-REQ-029).
- PROPOSED budgets (developer decides): feed, count and listing p95 ≤ 300 ms, flow p95 ≤ 500 ms, map p95 ≤ 1 s on
  staging hardware; every legacy endpoint far below the client's 15 s timeout (BR-API-002); a recorded radar-tab burst
  of 30 requests passes the limiters (CF-018, SEC-REQ-027).
- Tools: `Illuminate\Support\Benchmark`, the burst runner of KV-QA-008, Pulse on staging (all installed); k6 for load
  profiles — needs approval (dependency change). A legacy timing sample would need developer approval: touches
  production.

### 2.13 Smoke tests per environment

| Environment | Checks | Owner |
| ----------- | ------ | ----- |
| Local | `make dev-check` plus legacy-surface probes: `GET /api/bot` → `200`; `GET /api/meta` without auth → `401 {"detail":…}`; webhook without secret → `403`; a signed media URL → `200` | development |
| CI stack (nightly) | the same probes against a backend started in the job; the URL suite on generated URLs | development |
| Staging | probes; reference-client run with a staging test account's `initData` pasted by the developer; staging bot checklist; device pass | production track (staging bot approval each time) |
| Production, after each deploy | read-only probes (`/up`, `GET /api/bot`, a signed media URL, `robots.txt`, three SEO URLs); `getWebhookInfo` — **needs developer approval: touches production** | production track |

### 2.14 Tools that need approval

| Tool | For | Without it | Approval |
| ---- | --- | ---------- | -------- |
| `puppeteer-core` (Node) | reference client, landing scenarios, screenshots | option C of §2.5 | needs approval (dependency change) |
| `pestphp/pest-plugin-browser` + Playwright | reference client, E2E, screenshot assertions | as above | needs approval (dependency change) |
| Playwright, Vitest + Testing Library in `frontend/` | new-client unit and E2E tests (T8) | Dusk smoke on `*.homi.loc` | needs approval (dependency change); HANDOFF T8 gate |
| PostGIS image for CI (a `postgis/postgis` tag matching PostgreSQL 18, pinned by digest) and PostGIS locally | geography in the pgsql run | plain `postgres:18` for non-geo cases | needs approval (dependency change); CF-014 ADR, KV-DB-005, production-track check |
| `pcov` in CI (`setup-php` `coverage: pcov`) | line coverage | denominators of §5.6 only | needs approval (CI tool change) |
| k6 | load profiles | burst runner + Pulse | needs approval (dependency change) |
| Image diff (pixelmatch or a browser-plugin assertion) | automatic visual diff | human review | needs approval (dependency change) |
| A JSON Schema validator (for example `opis/json-schema`) | shapes from a legacy OpenAPI document (CF-020 option A) | hand-written matcher | needs approval (dependency change); optional |

## 3. Special focus areas — concrete cases

Actors used below: **A** (owner of the resource), **B** (another user), **U** (unknown id), **G** (gated user, one
case per access state `private`, `invite`, `full`, `join`, `blocked`), **N** (no `Authorization`).

### 3.1 Authorization and IDOR matrix

Expected (SEC-REQ-014, `16` §5.2): A → `2xx`; B → `404 {"detail":"Not Found"}` and **no change to A's rows**; U →
`404`; G → `403 {"detail":"<reason>"}`; N → `401`. The matrix is generated from the route list of the legacy group
and v1, so a new route without a row fails a coverage test (KV-QA-015).

| # | Case | Expected |
| - | ---- | -------- |
| 1 | B sends `PUT /api/subscriptions/{A's radar}` with new filters | `404`; fingerprint of A's radar (filters, active, mode) unchanged |
| 2 | B sends `PATCH /api/subscriptions/{A's radar}` `{"active": true}` | `404`; the `no_chat` check, if reached, is evaluated for B, never for A |
| 3 | B sends `DELETE /api/subscriptions/{A's radar}`, then `POST …/relax` | `404` twice; A's radar exists with the same filters |
| 4 | B sends `DELETE /api/hidden/{A's author entry}`; A sends `DELETE /api/hidden/{a listing id}` | `404` both; nothing removed (API-027) |
| 5 | B sends `DELETE /api/hidden` | only B's entries cleared; A's `GET /api/hidden` unchanged |
| 6 | B favourites, hides, blocks the author of, reports listing L | A's favourites, hidden lists and votes unchanged; B's rows only |
| 7 | B reads `GET /api/favorites`, `/api/history`, `/api/settings`, `/api/subscriptions` | only B's data; counts equal B's own |
| 8 | Response for "B on A's id" vs "anyone on an unknown id" | identical status and body bytes; identical number of queries (`DB::getQueryLog()`, instead of wall-clock timing) |
| 9 | B's bot chat sends a forged `callback_data` carrying A's radar id or listing state | alert TXT-BOT-039, no state change, no message to A |
| 10 | G with `blocked` calls each of the 33 protected routes | `403 {"detail":"blocked"}`; no `phone`, `phone_display` or `call_url` ever reaches G (SEC-REQ-006) |
| 11 | Each other gate state × every protected route | one access middleware per DEV-001 (`PROPOSED`; until approved, the legacy set of BR-API-011, BR-API-014); `GET /api/bot` stays `200` |
| 12 | N on every route except `GET /api/bot` | `401`; nothing stored |
| 13 | B on `GET`/`DELETE /api/v1/media/{A's private media}` | `404` (SEC-REQ-016) |
| 14 | Call token issued to B for listing X presented for listing Y | `404`; the token records its requester and counts towards B's quota (SEC-REQ-026, SEC-REQ-028) |
| 15 | App token on a `media:write`, `intake:write` or `arm:*` route; `tma` on v1; `Bearer` on legacy | `403`; `401`; `401` (SEC-REQ-004) |

### 3.2 `initData` validation, expiry and replay

| # | Case | Expected (legacy surface) |
| - | ---- | ------------------------- |
| 1 | Valid `initData` signed with the test token; fields reordered | `200` both |
| 2 | One character changed in `user`, `auth_date`, `start_param` or `hash` | `401` |
| 3 | Missing `hash`; wrong-length `hash`; duplicate key; non-JSON `user`; non-integer `user.id`; value over 4 KB | `401` (SEC-REQ-001) |
| 4 | Signed with another environment's token, or with the pre-rotation production token after the cut-over | `401` (BR-API-008, SEC-REQ-012) |
| 5 | `auth_date` = now − window + 1 s / now − window − 1 s / now + 61 s (frozen clock) | `200` / `401 {"detail":"auth_expired"}` / `401` (SEC-REQ-002, DEV-002 `PROPOSED`; legacy window Q-API-002) |
| 6 | `initData` only in `?tgWebAppData=` or in the body | `401` (SEC-REQ-003) |
| 7 | `Authorization: tma ` with an empty value (also via `POST /api/events`) | `401 {"detail":"unauthorized"}`; no stored event; no error-level log line (BR-API-010, SEC-REQ-005) |
| 8 | Replay inside the window from a second IP | `200`; both log lines carry the same fingerprint (first 12 hex of SHA-256 of `hash`), never the value |
| 9 | Payload with a `signature` field next to `hash` | verified per the current Telegram rules recorded in SEC-REQ-001 |
| 10 | First contact of a new Telegram user | user row created without name, username or photo (SEC-REQ-004, SEC-REQ-036) |
| 11 | `language_code` `uz`, `uz-UZ`, `en-GB`, `kk`, missing | locale `uz_Latn`, `uz_Latn`, `en`, then the default chosen with DEV-020 (one language detector) and Q-BOT-035 (TMA-008, CF-006) |
| 12 | Signer cross-check: one fixture signed by an independent implementation (Python standard library) | the PHP verifier accepts it and rejects its one-byte mutation, so signer and verifier are not the same code (KV-QA-003) |

### 3.3 Webhook authenticity and `update_id` idempotency

| # | Case | Expected |
| - | ---- | -------- |
| 1 | No secret header; wrong secret; another environment's secret; empty configured secret | `403`; no row in `telegram_updates` (SEC-REQ-008) |
| 2 | Correct secret on a non-hook host (`api.*`) | `404` |
| 3 | Body over 1 MB; `Content-Type` other than JSON | `413` before parsing; refused |
| 4 | The same update posted twice in sequence | one row, one job, one side effect (one radar, one `sendMessage`) (SEC-REQ-009) |
| 5 | The same update posted 10 times concurrently (PostgreSQL burst) | as #4 |
| 6 | Same `update_id` for another `bot_id` | processed independently |
| 7 | Handler throws | `200` to Telegram; row `failed` after the job's tries; no partial duplicate effect (SEC-REQ-010) |
| 8 | Update types outside `allowed_updates` (`edited_message`, `inline_query`) | `200`, ignored |
| 9 | A callback from a message sent before the cut-over, re-delivered after the dedup row was pruned | catch-all TXT-BOT-039 or an idempotent re-application; no state change beyond the first application |
| 10 | Pending updates at the webhook switch | handled per the Q-SEC-017 decision in the cut-over rehearsal |

### 3.4 Duplicate requests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | 10 identical concurrent `POST /api/subscriptions` | one radar; every `200` names the same `subscription.id` (SEC-REQ-015, DEV-009 `PROPOSED`) |
| 2 | `POST /api/subscriptions` → `409 no_chat` → write access granted → the client's single repeat | no radar after the `409`; exactly one after the repeat (LB-API-013, BR-BOT-099) |
| 3 | `POST …/favorite` sent twice (retry) | toggle kept for the legacy client, serialised per (user, listing): responses `true` then `false`, final state equals the last response; v1 uses idempotent `PUT`/`DELETE` and bot buttons carry the target state (LB-API-039 defect fix) |
| 4 | `POST …/hide`, `POST …/block-author` twice | one row; both `2xx`; same `listing_ids` (LB-API-043) |
| 5 | `POST …/report` with the same reason twice; with two reasons | counted once; two rows (Q-API-038, SEC-REQ-015) |
| 6 | `DELETE /api/subscriptions/:id` twice | second answer per the decision recorded for API-022 (legacy `404` expected) |
| 7 | Two taps on the bot's save button (two `callback_query` ids, same message) | one radar, one confirmation edit |
| 8 | Prefetch failure plus the immediate repeat of `GET /api/meta` (`client.js:56-60`) | no second user row, no second attribution |
| 9 | `POST …/share` twice within the cache window | the same prepared message id per (user, listing, locale) (LB-API-046 defect fix, SEC-REQ-027) |
| 10 | Intake: the same event or idempotency key twice | one listing, the stored first response replayed (T2) |

### 3.5 Event reprocessing

| # | Case | Expected |
| - | ---- | -------- |
| 1 | Radar fan-out job sends 2 of 5 cards, fails, retries | the remaining 3 are sent; 5 delivered-log rows; no card twice (unique delivery key written with the send) |
| 2 | Digest job retried | one digest per (user, digest slot) |
| 3 | Bot API `429 retry_after=3` | nothing sent to that chat for 3 s; no duplicate message (SEC-REQ-029) |
| 4 | Bot API `403` (user blocked the bot) | deliveries handled per Q-BOT-012; no retry storm |
| 5 | Price change of a listing re-ingested twice | one history event; pushes per the Q-BOT-033 decision, never twice |
| 6 | `duplicate_changed` processed twice | one alias; favourites and deliveries re-pointed once (V-RI-1, V-RI-2) |
| 7 | Takedown processed twice | each delivered message edited once to «Объявление снято» (BOT-062, SEC-REQ-040) |
| 8 | Migration load re-run on unchanged data; restart after a mid-run failure | zero writes; resumes after the last committed batch (`14` §7.2) |
| 9 | Erasure replay, then a re-import of the same legacy user | user skipped (SEC-REQ-039, ENT-007) |
| 10 | Scheduler overlap of the hourly median job | one run at a time; one result set |

### 3.6 Races and transactions (PostgreSQL only, KV-QA-008)

Two techniques, both with existing tools: deterministic interleaving on two database connections (A takes the lock,
B's attempt is asserted to wait, fail or serialise — no sleeps), and bursts of N parallel HTTP requests through
`Process::pool` and `curl` against a PHP built-in server on a free port.

| # | Case | Expected |
| - | ---- | -------- |
| 1 | Two concurrent favourite toggles of one (user, listing) | serialised; the unique key is never violated; no `500` |
| 2 | 20 concurrent radar creates at 9 radars | exactly 10; every loser gets the limit `409` (SEC-REQ-015) |
| 3 | `PATCH {"active": true}` and `POST` racing at the limit | the limit rule (total or active radars, recorded for API-021) holds |
| 4 | N distinct users vote `agent` concurrently across the threshold | the phone is marked once; N audit rows (SEC-REQ-045, DEV-010 `PROPOSED`) |
| 5 | One user votes twice concurrently | one vote |
| 6 | Radar deleted while its matching job runs | no card sent after the delete commits |
| 7 | Radar saved (starter list) while an instant push of the same new listing runs | one delivery |
| 8 | Listing hidden while a digest is assembled | follows the stated snapshot rule; never a half-applied hide |
| 9 | User deleted while a delivery job for them is queued | the job stops; no rows recreated |
| 10 | 50 concurrent ingests allocating listing numbers | unique numbers, above every preserved and alias number (CF-003, V-RI-9) |
| 11 | Merge while a user favourites the alias | one favourite on the survivor |
| 12 | `PUT /api/settings` from the Mini App and `/settings` from the bot at once | per-key last write wins; untouched keys keep their values (LB-API-049) |

### 3.7 Data consistency

| # | Case | Expected |
| - | ---- | -------- |
| 1 | Same filters on `/api/feed` (all pages), `/api/feed/count`, `/api/map` | feed id set = map id set plus listings without coordinates; `count` = size of the feed set (`semantic`) |
| 2 | `GET /api/cities` `counts[deal]` vs `/api/feed/count` with default filters for that city | equal (Q-API-016) |
| 3 | Hidden listings and blocked authors | excluded from feed, count, flow, map and radar delivery alike (Q-API-036; DEV-034 `PROPOSED` shares the rules between bot and Mini App) |
| 4 | Favourite added in the bot / in the app | visible in `GET /api/favorites` / bot `/fav` |
| 5 | Settings changed in the bot `/settings` / in the app | `GET /api/settings`, `GET /api/meta` and the bot panel agree; `locale_chosen` and `city_chosen` become `true` (LB-API-018) |
| 6 | Radar created in the app / in the bot | appears in the other with the same summary and 25-key filters |
| 7 | Merged listing id | survivor returned by `GET /api/listings/:id`, `startapp=l_<id>`, `/media/<id>/…`, landing pins and favourites |
| 8 | A flow option applied | its filters give `count` ≥ the original (API-006) |
| 9 | Radar `starter` count | equals the matching listings in the starter window |
| 10 | Presets, `typical`, `median_*`, map `usd` | USD whatever the user's currency (BR-API-154) |
| 11 | Server money strings vs the new client's formatter | identical on the shared money fixture (CF-017, KV-QA-006) |
| 12 | Migrated data | `14` §6 (§2.10) |

### 3.8 File validation and capability URLs

| # | Case | Expected |
| - | ---- | -------- |
| 1 | The existing 28 media cases (`backend/tests/Feature/Media/*`) | stay green on SQLite and PostgreSQL |
| 2 | Polyglot JPEG+HTML, SVG, HTML renamed `.jpg`, MIME mismatch | refused |
| 3 | 50 000 × 50 000 pixel flood; file over 25 MB | refused without decoding |
| 4 | GPS-tagged JPEG | stored and served without EXIF (SEC-REQ-023) |
| 5 | Collector photo URLs: `http://`, `127.0.0.1`, `169.254.169.254`, redirect to a private address, DNS name resolving into `10.0.0.0/8`, 30 s slow body, 100 MB body | refused within the limits (SEC-REQ-023) |
| 6 | `/media/<n>/<k>.jpg` and `.s.jpg` with a valid signature | `200 image/jpeg`, 800 px and ≤ 480 px wide, `nosniff`, `Cache-Control: public, max-age=86400` (RES-001, RES-002) |
| 7 | Altered `s`, other `k`, other listing number, past `e`, `e` more than 48 h ahead, missing `s` | uniform `404` (SEC-REQ-024; the missing-`s` case is the LB-API-023 defect fix) |
| 8 | Valid URL of a taken-down listing | `404` at once |
| 9 | 90 days after withdrawal (time travel, scheduler run) | every rendition, snapshot and object gone; CDN purge requested from the fake (SEC-REQ-025) |
| 10 | `/call/<token>` fresh / after TTL / for another listing | page with the `tel:` action and the headers of SEC-REQ-026 / expiry page / `404` |
| 11 | CSV cells starting with `=`, `+`, `-`, `@`, tab, CR | neutralised (SEC-REQ-021); frozen-period CSVs byte-equal to the published legacy files (`14` §6.5) |
| 12 | `POST /api/events` with 1 MB; `POST /api/csp-report` with 100 KB | bounded rejection or `204` dropped; never `5xx` (SEC-REQ-022) |

### 3.9 Backward compatibility of public links

The domain decision (Q-SYS-006) sets the profile; KV-QA-014 runs whichever is decided, driven by
`docs/migration/data/public-urls.json` (62 patterns, 49 must keep) and a generated list of the 1 008 SEO URLs (slug
scheme of `03b` §2.2 plus the gazetteer of KV-DB-006).

| URLs | Same domain kept | Domain changes |
| ---- | ---------------- | -------------- |
| URL-001 … URL-003 landing | `200`, canonical = itself, hreflang ru/uz/en + `x-default` | old host: `301` path-for-path with the query kept; new host: `200` |
| URL-004 `/uz`, `/en` | `308` to `/uz/`, `/en/` | old host `301` to the new slashed URL |
| URL-005 `/index.html` | `301` to `/`, query kept | same via the new host |
| URL-006 `?s=` / `?utm_source=` | `200`; bot links carry `s_web_<tag>` (BR-BOT-096) | `301` with query, then as left |
| URL-007 `?lang=` | legacy `200`; DEV-038 (`PROPOSED`): `301` to `/uz/`, `/en/` | `301` with query |
| URL-010, URL-011, URL-014, URL-016 privacy, robots, icons, og images | `200` with the legacy content type | `301` |
| URL-012 `sitemap.xml` | `200`; every entry answers `200`; alternates symmetric | new sitemap on the new host; old `301` |
| URL-023 … URL-035 SEO pages | `200`, canonical = itself, hreflang complete, title and description per Q-SEO-004 | `301` path-for-path |
| URL-036 thin slices | `200` with `noindex,follow`, absent from the sitemap (threshold per DEV-050) | `301` |
| URL-037 `?sort=` | `200` with `noindex,nofollow` | `301` with query |
| URL-038 ignored parameters | `200`, canonical without parameters; `?page=N` → `301` to the canonical page per DEV-045 (`PROPOSED`) | `301` with query |
| URL-039 no trailing slash; wrong case; slug of another language | `308` to the slashed URL; legacy `404`, DEV-047 (`PROPOSED`) `301` to lower case; DEV-048 (`PROPOSED`) redirect | `301`; as left |
| URL-040, URL-041 CSV | `200 text/csv`, byte-equal for frozen periods | `301` |
| URL-042, URL-043 media | `200` for a valid signature during the compatibility window | old host kept for the window |
| URL-044 `/call/<token>` | `200` for a fresh token | old host kept for the window |
| URL-045 … URL-049 bot links | parser accepts `s_web`, `s_web_<40-char tag>`, `--v<visit>` with the 49-character cut, `s_seo_uz_<slice>` (grammar per DEV-049), `s_web--l<id>` (welcome + listing message, BOT-031), `s_friend`; `l_<id>` → welcome (legacy) or the listing (DEV-037); 64 bytes of junk or Unicode → welcome, not stored as attribution | n/a — the bot keeps its username or forwards (`03b` §6.1) |
| URL-052 … URL-057 `startapp` and Mini App URL | `l_<id>`, `l_<id>-web`, `l_<id>-fb12`, `l_<id>-seo-<channel>-<post>`, `l_<id>-<channel>-<post>`, `l_abc` (source `share`, no listing), merged id → survivor; `?listing=<id>`, `?news=<code>`; attribution per DEV-040 | Mini App host kept or redirected with the fragment (Q-LND-009) |
| URL-059 `t.me/<channel>/<post>` | emitted unchanged in bot buttons and `sources[].url` | same |

The generated SEO list is compared once with the live legacy `sitemap.xml` (one `GET`) — **needs developer approval:
touches production**; without it the generated list is the reference and Q-SEO-001 stays open.

### 3.10 Time zones: UTC storage, Asia/Tashkent days

Asia/Tashkent is UTC+5 all year, no DST. Every case runs at explicit UTC instants with a frozen clock.

| # | Case | Expected |
| - | ---- | -------- |
| 1 | Quiet hours `23-08`; instant radar; listing matched at 17:59:59 / 18:00:00 / 02:59:59 / 03:00:00 UTC | sent / held / held / flushed with the morning digest (BR-BOT-077) |
| 2 | Quiet hours `00-09`; matched at 18:59:59 and 19:00:00 UTC | sent; held |
| 3 | Digest `09,19` | sent at 04:00 and 14:00 UTC, never at 09:00 UTC |
| 4 | Listings arriving between 14:00 UTC and 04:00 UTC next day | all in the next digest, none twice across the Tashkent midnight (19:00 UTC) |
| 5 | `age` for a listing posted at 18:30 UTC (23:30 Tashkent), viewed at 19:30 UTC the same UTC day (00:30 Tashkent) | "yesterday" wording, because the day is the Tashkent day (BR-API-150) |
| 6 | `posted_days=1` at 04:59 and 05:00 Tashkent | rolling 24 h or Tashkent calendar day, as decided; both edges tested |
| 7 | `history[].at`, `median_updated` on the legacy surface | ISO-8601 with `Z` (BR-API-151), although v1 uses offsets (ADR-0006) |
| 8 | Media URL issued at 23:59:59 and 00:00:00 UTC | `e` aligned to midnight UTC, at most 48 h ahead (BR-API-152, SEC-REQ-024) |
| 9 | Rent index: listing at 31 Jan 21:00 UTC (1 Feb 02:00 Tashkent) | month per the Q-DATA-032 decision; published legacy values unchanged |
| 10 | Retention: withdrawal at 19:00 UTC, clock advanced 90 days ± 1 s; action log at 180 days | purge exactly at the boundary (SEC-REQ-038) |
| 11 | Whole suite with process `TZ=UTC` and `TZ=Asia/Tashkent` (`APP_TIMEZONE=UTC` both times) | identical results: no code depends on the server's zone (nightly matrix) |
| 12 | Migrated naive legacy timestamps | converted with the proven zone (Q-DATA-035); sampled `history[].at` equal to the legacy API output |
| 13 | New client: home-screen visit days, history dates | Tashkent days and times (LB-APP-010 defect fix; LB-APP-025 → DEV-014 `PROPOSED`) |

### 3.11 Money: USD/UZS and the 1 mln boundary

Legacy rules: prices stored and filtered in USD; UZS is display only at `meta.usd_uzs` (BR-API-153); client rules in
`$KVADRO_ROOT/demo/app/src/lib/money.js:32-46`, `:76-101`, `:103-140`; server strings formatted per user currency
(LB-API-029). The cases live in the shared fixture of KV-QA-006, used by the server formatter and, after T8, by
`@homi/utils`.

| # | Case | Expected |
| - | ---- | -------- |
| 1 | USD 1 200 in ru, uz, en | `$1 200`, `$1 200`, `$1,200`; the separator code point is fixed in the fixture |
| 2 | 850 400 сум | `850 000 сум` (below 1 mln: rounded to thousands) |
| 3 | 999 499 сум | `999 000 сум` |
| 4 | 999 500 … 999 999 сум | legacy `1 000 000 сум`; new (server strings and new clients): the 1 mln unit, because rounding happens before the unit is chosen (LB-APP-011 defect fix) |
| 5 | 1 000 000 сум, 1 049 999 сум | the 1 mln unit with the decimal format of the fixture |
| 6 | 999 950 000 сум | the млрд unit by the same round-first rule (LB-APP-011 defect fix) |
| 7 | UZS input `1,2` (млн) at rate 12 650 | `max(1, round(1 200 000 / 12 650))` = 95 USD (BR-API-031) |
| 8 | UZS input `0,001` at rate 12 650 | 1 USD (the `max(1, …)` floor) |
| 9 | Input `1.000.000`, `85 000`, `650$`, `85k`, `1,2 млн` | legacy `null` for `1.000.000` → new 1 000 000 (LB-APP-011 defect fix, new clients); bot typed amounts per DEV-029 (`PROPOSED`) |
| 10 | Input `0`, empty, `abc` | `null` in the app; TXT-BOT-022 in the bot |
| 11 | `meta.currency = UZS` with `usd_uzs` 0 or missing | USD display |
| 12 | UZS presets from city USD presets | rounded to 50 млн (sale), 0.1 млн (daily), 0.5 млн (otherwise); duplicates dropped (BR-API-155) |
| 13 | Rate changes after a radar was saved with a UZS-entered bound | legacy: the stored USD bound is unchanged (LB-API-027); DEV-006 (`PROPOSED`) keeps the entered currency — `todo` until decided |
| 14 | UZS-posted listing | converted at the rate of its date; medians, sorts and `below_median` on USD (CF-005) |
| 15 | Sums and fingerprints | integer cents (`price_usd_cents`, V-SUM-1); no float equality anywhere in tests |
| 16 | `PUT /api/settings {"currency": "UZS"}` then `GET /api/feed` | `price` strings switch to сум in the user's locale (Q-APP-011) |

### 3.12 i18n: ru, uz_Latn, en

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `PUT /api/settings {"locale": "uz_Latn"}`; `GET /api/settings`; `GET /api/meta` | `200`; both return `uz_Latn`; internally `uz` (CF-006, LB-API-048) |
| 2 | `locale` `uz` or `uz-Latn` on the legacy wire | the decided answer (`422` or normalised), never `500` |
| 3 | Server catalogues `lang/{ru,uz,en}` | same key set, no empty values, same placeholders, plural forms complete |
| 4 | A key missing at runtime | falls back to ru, one warning per key, never a `500` (new behaviour; the legacy client's `t()` throws, LB-APP-002) |
| 5 | Every enum value the server can emit (`subscription.mode`, filter `types`, `deal`, `sort`, `median_rooms`, `median_tone`, `nearby[].kind`, `market` codes) | contained in the legacy client's key list (`legacy-i18n-keys.json`), so the legacy client never white-screens (LB-APP-002, LB-APP-015, LB-APP-016, LB-API-006) |
| 6 | Russian plurals for 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111 | объявление / объявления / объявлений chosen correctly; uz and en forms per locale |
| 7 | Numbers | ru `18 657`, en `18,662` (`04` §7) |
| 8 | Bot texts | every TXT-BOT- in ru; uz/en per Q-BOT-014; known typos fixed per DEV-015 and the `copy` rows of `09` §4.3 |
| 9 | Language switch in the bot | the current message re-rendered in the new language; later replies in it (BOT-025) |
| 10 | Landing with browser `uz-UZ`, `en-US`, `kk-KZ`, `?lang=en`, stored `kv-landing-lang` | the legacy language rules (BR-LND-004, BR-LND-005; landing scenarios `browser-*`, `query-lang-en`, `stored-lang-uz`) |
| 11 | SEO page in ru | uz and en counterparts exist; hreflang symmetric |
| 12 | Cyrillic Uzbek or mixed-script free text in the bot | parsed or politely refused; never an exception (`04` §7) |
| 13 | `POST /api/listings/:id/translate` for each target locale | text in that locale; already-target text handled (API-010) |

## 4. The parity gate

### 4.1 Ten conditions

| # | Condition | Evidence required to tick it | Ticked by |
| - | --------- | ---------------------------- | --------- |
| G1 | Legacy source found and studied | audit rows with `path:line` for every behaviour of the feature; each related `Q-…` closed or explicitly accepted as spec-tested | audit owner (development track) |
| G2 | Behaviour documented | the feature row in `09` lists its API-, SCR-, BOT-, BTN-, URL-, TMA-, BR-, LB- and DEV- items; states and errors described | audit owner |
| G3 | New backend done | merged PR(s) for the legacy surface and v1 where both apply | implementer |
| G4 | New frontend done | merged PR(s) for the new Mini App, landing or bot UI; `n/a` only with a reason (for example "served by the legacy client during the window") | implementer |
| G5 | Business rules kept | every BR- of the feature has a test; every DEV- is `APPROVED` and its test expects the new behaviour; no `PROPOSED` DEV left | implementer + developer (DEV approval) |
| G6 | Roles and limits checked | access-gate states, IDOR rows (§3.1), limits (radar cap, quotas, rate limits) tested for the feature | QA owner |
| G7 | Positive and negative scenarios | positive, negative and edge cases from the `08` "Tests" field, the bot transcripts or the URL table exist and pass | QA owner |
| G8 | Required tests green | every layer required for the feature type (§4.6) green in CI; no test of the feature in quarantine; CI run linked | QA owner |
| G9 | Integrations checked | Telegram (fake and staging bot), PostHog, tiles, media, LLM, as the feature uses them; staging evidence | production track for staging checks; QA owner otherwise |
| G10 | No critical divergence | reference-client, landing or transcript comparison shows no unexplained difference; every difference fixed or mapped to a DEV; spec-tested parts named | QA owner, countersigned by the other developer |

### 4.2 Unit of gating

The unit is the feature `F-<MODULE>-NNN` of `09` — 144 features on 2026-11-09 (P0 94, P1 29, P2 15, P3 6). `09` §5
proves that every `API`, `RES`, `SCR`, `BOT`, `BTN`, `LND`, `URL`, `TMA` and `TXT-BOT` id belongs to at least one
feature, so a gate per feature covers the whole legacy surface. Features with the decision `DROP_CANDIDATE` or `DEFER`
(`09` §2.3) carry `n/a:<decision>` in G3–G10 until the decision is taken. The first gate review covers the P0
features: they are needed at the backend cut-over.

### 4.3 How the gate is recorded

- **Detail:** `docs/migration/data/parity-gate.csv`, one row per unit:
  `unit_id, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, ticked_by, countersigned_by, signed_at, notes`.
- **Cell grammar:** `open` · `done:<evidence>` · `n/a:<reason>` · `waived:<DEV-… or decision link>`. Evidence is a
  repository path with line, a PR number or a CI run URL; never a screenshot alone.
- **Summary:** a `Gate` column in `09` with `n/10` and the list of open conditions, regenerated by
  `scripts/migration/parity_gate.py` (Python standard library, KV-QA-023). `--check` fails when a feature is `DONE`
  in `09` with any `open` cell, when evidence paths do not exist, or when a cell breaks the grammar.

### 4.4 Sign-off rules

- The implementer ticks G3–G5 and G7–G8 in the PR that delivers the evidence; the QA owner (development track; an
  agent may prepare, a person signs) verifies G6–G8 and G10; the production track ticks G9 for staging checks.
- The other developer countersigns the row in review (`docs/handoff/parallel-work.md`: every PR is reviewed by the
  other developer). A row without a countersignature is not at parity.
- DEV approval is the developer's decision (`README.md`, "Migration policy"); the gate never approves a DEV.
- **Unchecked items stay open.** No "mostly done", no ticking ahead of the evidence, no closing by silence. Reopening:
  any later failure in a required test or a newly found divergence sets the affected cell back to `open`.

### 4.5 Divergence severity (for G10)

| Severity | Examples | Rule |
| -------- | -------- | ---- |
| Critical | data loss; wrong money or price; permission or IDOR leak; legacy client crash or white screen; broken must-keep URL or deep link; feature missing; re-sent radar cards | blocks G10; fix before parity |
| Major | visible wrong text, format, order or count; missing toast; changed request set | fix, or record a DEV and get it approved |
| Minor | cosmetic differences with no change in meaning | recorded in the results file; does not block |

### 4.6 Required layers per feature type

| Feature type (`09` modules) | Required for G8 |
| --------------------------- | --------------- |
| Mini App on the legacy API (COMPAT, ONBOARD, FEED, FILTER, MAP, LISTING, CONTACT, SHARE, FAV, HISTORY, HIDE, REPORT, RADAR, SETTINGS, LOCALE, TMA) | characterization, contract, feature (SQLite + PostgreSQL), reference-client scenarios that touch it, security rows (§3.1–§3.2), E2E for the new Mini App after T8, visual review of its key states |
| Bot (BOT, OWNER, F-ONBOARD-004, F-ONBOARD-005, F-FAV-002, F-REPORT-002) | bot conversation transcripts, feature (incl. race and reprocessing cases of §3.4–§3.6), security rows (§3.3), deep-link parser cases if it starts from a link |
| Radar delivery (DELIVERY) | bot transcripts, frozen-clock time cases (§3.10), reprocessing (§3.5), races (§3.6), performance (matching and send rate) |
| Landing and SEO (LANDING, SEO, F-MEDIA-004) | landing scenarios, URL suite, injection cases for JSON-LD and CSV, visual review |
| Data and pipeline (PIPELINE, MEDIA, ANALYTICS) | feature on PostgreSQL, migration validation (planted-defect tests + rehearsal run), consistency checks (§3.7), performance where it serves search |
| Cross-cutting (ACCESS, PRIVACY, ADMIN) | the matching security suite, smoke per environment |

## 5. Environments, data and CI

### 5.1 Environments

| Environment | Database | Telegram | Other external services | Data | Used for |
| ----------- | -------- | -------- | ----------------------- | ---- | -------- |
| Local, default | SQLite in memory | fake | fake | factories | unit, feature, contract, bot |
| Local, PostgreSQL | `homi_test` on local PostgreSQL 18 (PostGIS after approval) | fake | fake | factories, coverage dataset, mock-equivalent seed | pgsql run, races, reference client |
| Local stack (`*.homi.loc`) | `homi` | dev bot; live webhook checks need an HTTPS tunnel (T1 gate) | none or fakes | seeded | manual checks, Dusk, URL suite |
| CI | `postgres:18` service (PostGIS image after approval) | fake | fake | synthetic | PR gate, nightly |
| Staging | staging database | staging bot (production track) | a separate PostHog project (`14` P12) | rehearsal data R1–R3 | rehearsals, smoke, device pass, performance |
| Production | — | production bot | — | real | read-only smoke only, with approval |

### 5.2 Test data

- **Factories** (one per model, `CLAUDE.md`) — synthetic, the default.
- **Coverage dataset** (KV-QA-005): every enum value and edge of `06` and `08` — six cities, all deals × types, merged
  alias, withdrawn, purged, taken down, `post_deleted`, video, UZS-posted, `down_payment`, median present and absent,
  owner verified, phone and source authors, 0/1/many photos, users in every access state, a pre-`zones` radar.
- **Mock-equivalent seed** (KV-QA-011): the parity mocks' data rebuilt through HOMI models so DOM comparison is
  meaningful.
- **Sanitised migrated sample** (`14` R0, Q-DATA-003): only the masked sample, stored outside the repository; loaders
  refuse input without the sanitised marker (SEC-REQ-041). Never production dumps on laptops or in CI artefacts.
- **Recordings** (§1.6): only sanitised, only with approval.

### 5.3 Bots and external services in tests

Tests never call Telegram: the fake Bot API (KV-QA-003) answers. Live checks use the dev bot locally and the staging
bot on staging (production track approval each time, `docs/handoff/parallel-work.md`); `initData` is bound to the bot
token (BR-API-008), so staging reference-client runs use a staging test account's `initData` pasted by the developer.
PostHog, the LLM provider, the rate source and tile hosts are faked in tests; staging uses separate accounts.

### 5.4 CI integration

| Suite | PR gate | Nightly | Pre-release / rehearsal |
| ----- | ------- | ------- | ----------------------- |
| `composer ci:check` on SQLite: unit, feature, contract, bot, security, i18n, money/time (`make ci-backend`) | yes (exists) | yes | yes |
| Whole Feature suite on PostgreSQL (+ PostGIS after approval) | yes, once it has been green nightly for two weeks | yes | yes |
| Race bursts; `TZ=Asia/Tashkent` matrix; random order | no | yes | yes |
| Frontend lint, typecheck, build (`make ci-frontend`) | yes (exists) | — | yes |
| Frontend unit / E2E (after T8 approval) | unit yes, E2E no | E2E yes | E2E yes |
| Reference client (3 suites) and landing scenarios | no | yes (after runner approval) | yes, against staging |
| URL suite | no | yes (CI-started stack) | yes (staging hosts) |
| Migration validation | planted-defect tests yes | — | R1–R3 on staging (`14` §7.4) |
| Visual capture | — | on demand | yes, review |
| Performance | — | weekly smoke | staging run before the cut-over |
| Smoke per environment | — | local probes | every deploy |

The nightly workflow is a new file `.github/workflows/qa-nightly.yml` (development track owns non-deploy workflows,
`docs/handoff/parallel-work.md` §1); its jobs and schedules are set in KV-QA-021.

### 5.5 Flaky-test policy

- A test is flaky when it fails and passes on the same commit. PR gates never retry automatically; the nightly run
  reruns a failure once only to classify it.
- A flaky test is moved within one working day to `->group('quarantine')` (excluded from the PR gate, still run
  nightly) with a known-issue entry (`KI-…` in `.ai/memory/known-issues.md`) naming the owner and a 7-day deadline.
- While a feature's test is quarantined, its G8 is `open`. Deleting a test needs approval (`CLAUDE.md`).
- Usual causes and the required fix: time (frozen clock), order (random-order nightly run), network (stray-request
  guard), shared Redis or cache state (array drivers in tests), concurrency (interleaving instead of sleeps), browser
  timing (wait for a settled DOM, as the landing harness does, not fixed delays).

### 5.6 Coverage reporting with explicit denominators

Line coverage (after `pcov` is approved) is informational and never a gate. Parity coverage is reported as
numerator / denominator, with the denominator stated and dated:

| Metric | Denominator on 2026-11-09 | Source |
| ------ | ------------------------- | ------ |
| Endpoints with green contract tests | 34 API + the backend-served RES (RES-001, RES-002, RES-003, RES-005, RES-010 … RES-013, RES-015, RES-018 … RES-020, RES-022) | `08` |
| Endpoints with golden fixtures | 34 | `08` |
| Reference-client scenarios identical or DEV-mapped | data-path subset of 43 + 36 + 16 (fixed in KV-QA-011 / KV-QA-012) | legacy harness |
| Landing scenarios identical or DEV-mapped | 40 | `03b` §1.6 |
| Bot rows / buttons / texts with a transcript assertion | 84 BOT / 76 BTN / 88 TXT-BOT | `04` |
| Must-keep URL patterns with a regression check | 49 of 62 | `data/public-urls.json` |
| SEO URLs answering as expected | 1 008 | `03b` §2.1 |
| Telegram integration points with a test or device-pass item | 45 TMA | `05` |
| Screens with a visual baseline | 45 SCR (about 32 in the first capture) | `03` |
| Security requirements with an automated acceptance test | 50 SEC-REQ | `16` |
| Validation checks with a planted-defect test | 19 SQL checks + 10 business checks | `14` §6 |
| IDOR matrix cells | routes × actors, generated | KV-QA-015 |
| Features with a 10/10 gate | 144 (P0 94) | `09` §2.1 |
| DEV rows decided (`APPROVED` or rejected) | 52 | `09` §4.2 |
| Defect fixes (no DEV) with a test expecting the fix | 107 | `09` §4.3 |

`scripts/qa/denominators.py` (KV-QA-021) prints this table into the nightly job summary. A denominator changes only
when its source document changes, and the change is visible in the diff.

## 6. QA tasks (`KV-QA-NNN`)

All `PROPOSED`. Task files: `tasks/qa/KV-QA-NNN-<slug>.md`. Order and dependencies will be merged into
`13-dependency-graph.md` and `21-development-master-plan.md`.

| ID | Title | Depends on | Done when | Status |
| -- | ----- | ---------- | --------- | ------ |
| KV-QA-001 | PostgreSQL + PostGIS test database for feature tests | CF-014 ADR and KV-DB-005 (PostGIS step only); image approval | the whole Feature suite runs on PostgreSQL 18 locally and in CI; `Feature/Pgsql` tests skip on SQLite | `PROPOSED` |
| KV-QA-002 | Golden fixtures and model shapes from `08` and the parity mocks | — | 34/34 endpoints and 14 models have sanitised fixtures that pass the fixture self-test | `PROPOSED` |
| KV-QA-003 | Telegram test kit: `initData` signer, update factory, fake Bot API | — | signer agrees with an independent implementation; the fake enforces Telegram limits; stray requests fail | `PROPOSED` |
| KV-QA-004 | Contract test harness for the legacy `/api/*` surface | KV-QA-002, KV-QA-003; compatibility route-group ADR (CF-001, CF-002) | matcher self-tests green; 34 per-endpoint test files exist (real or `todo`); coverage test counts them | `PROPOSED` |
| KV-QA-005 | Legacy-shaped coverage dataset seeder | KV-DB-007 … KV-DB-010 | the seeder builds every case of §5.2; a test asserts each enum value and edge is present | `PROPOSED` |
| KV-QA-006 | Time and money case matrix with clock helpers | — | shared fixtures for §3.10 and §3.11 committed with sources; helpers tested; TZ matrix runnable | `PROPOSED` |
| KV-QA-007 | i18n completeness and enum-safety tests | KV-QA-002; CF-006 decision | catalogue parity, missing-key fallback and enum-safety tests exist and run | `PROPOSED` |
| KV-QA-008 | Concurrency and idempotency kit | KV-QA-001 | the kit detects a planted lost update and passes with the lock; first race rows of §3.6 written | `PROPOSED` |
| KV-QA-009 | Bot conversation test kit and golden transcripts | KV-QA-003; T1 | DSL self-test green; transcripts for the flows of `04` §3; payload grammar dataset | `PROPOSED` |
| KV-QA-010 | Reference-client runner spike | runner approval (option A or B) or option C | decision recorded; scenario `feed` runs in both modes; artefact manifest committed | `PROPOSED` |
| KV-QA-011 | Reference-client base scenarios with the mock-equivalent seed | KV-QA-010; legacy routes of the covered screens | data-path scenarios of `mocks.mjs` identical or DEV-mapped; results file written | `PROPOSED` |
| KV-QA-012 | Reference-client filter and map scenarios | KV-QA-011 | data-path scenarios of `mocks-filters.mjs` and `gl-parity.mjs` identical or DEV-mapped | `PROPOSED` |
| KV-QA-013 | Landing reference scenarios against the new landing | KV-QA-010; new landing; CF-010 | 40 scenarios identical or mapped to LB-LND decisions | `PROPOSED` |
| KV-QA-014 | Public-URL and deep-link regression suite | KV-DB-006; Q-SYS-006 | every must-keep URL pattern and the generated SEO list checked per profile; payload parser datasets green | `PROPOSED` |
| KV-QA-015 | Security suite 1: authentication, access gate, IDOR, rate limits | KV-QA-003, KV-QA-004, KV-QA-008; T6 | `16` §5.1, §5.2, §5.7 cases implemented; generated IDOR matrix has no uncovered route | `PROPOSED` |
| KV-QA-016 | Security suite 2: webhook, bot input, injection, media and call URLs | KV-QA-003, KV-QA-009; T1 | `16` §5.3, §5.5, §5.6 cases implemented with a synthetic payload corpus | `PROPOSED` |
| KV-QA-017 | Security suite 3: privacy, logging, retention, deletion | KV-QA-001; KV-DB-007; CF-019 | `16` §5.8 cases with time travel and a database-wide deletion scan | `PROPOSED` |
| KV-QA-018 | Tests for the migration validators | KV-DB-013, KV-DB-022, KV-QA-001 | each of the 19 SQL checks fails on its planted defect and passes on clean data; idempotent re-run proven | `PROPOSED` |
| KV-QA-019 | Visual baseline of legacy key states | KV-QA-010 | about 32 baselines with a manifest; review procedure written | `PROPOSED` |
| KV-QA-020 | Performance baseline and budgets | KV-QA-001, KV-QA-008; search endpoints | p50/p95 and plans recorded for the listed endpoints; matching and send-rate figures; budgets proposed | `PROPOSED` |
| KV-QA-021 | CI integration: gates, nightly, quarantine, denominators | KV-QA-001, KV-QA-004 | PostgreSQL job, nightly workflow, quarantine group and denominator summary in place | `PROPOSED` |
| KV-QA-022 | Smoke tests per environment and the device pass | KV-QA-014; T1 | local probes in `make dev-check`; staging and production checklists approved by the production track | `PROPOSED` |
| KV-QA-023 | Parity-gate tracking | `09` (exists) | `parity-gate.csv` with one row per feature (144), the checker and the `Gate` column of `09` in place | `PROPOSED` |

## 7. Testing risks

| # | Risk | Effect | Mitigation |
| - | ---- | ------ | ---------- |
| 1 | No legacy backend or database: server behaviour is known from the contract, mocks and docs only | parity tests encode guesses; wrong expectations pass review | oracle per test (§1.3); spec-tested label (§1.1); approved read-only recording (§1.6); G1/G10 |
| 2 | Tests run on SQLite while geo, `jsonb`, locks and races need PostgreSQL + PostGIS | search, medians, idempotency and races untested until CF-014 and the CI image are approved | KV-QA-001 PostgreSQL run now, PostGIS when approved; nothing geo is gated on SQLite |
| 3 | Server-formatted strings and enums must match the legacy client byte for byte (Q-API-022, LB-APP-002) | white screens and wrong prices in the legacy client | contract strictness (§2.4), enum safety (§3.12), shared money fixture (§3.11), reference-client runs |
| 4 | Bot: legacy `callback_data` unknown (Q-BOT-017); pushes, digests and quiet hours never observed (Q-BOT-002, Q-BOT-003) | old buttons break; radars re-send or go silent after the switch | catch-all tests, delivered-log migration checks (`14` §6.5), frozen-clock delivery tests, human recording on the test account |
| 5 | The reference client, E2E and visual diffs need tools that are not approved yet | the most important gate — "the legacy client works on HOMI" — stays manual | KV-QA-010 option C without new dependencies; approval requested early |
| 6 | Unknown legacy windows and limits (`auth_date`, Q-API-002; rate limits, Q-API-001) | HOMI rejects working clients or allows abuse | conservative defaults (SEC-REQ-002, SEC-REQ-027), recorded traffic profile, staging soak with the legacy client |
