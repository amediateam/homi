# KV-BE-154 — Landing `live.json` builder and publication

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); nginx location and headers **[PT/INF]** |
| Complexity | M |
| Feature IDs | F-LANDING-003, F-PIPELINE-008 |
| Dependencies | KV-BE-023 (search predicate), KV-BE-032 (`FlowEstimator`), KV-BE-140 (`listing_market` tones and deltas); KV-BE-026 (signed media not used here); Q-API-051, Q-LND-002, Q-LND-007 |

## Goal

HOMI regenerates `data/live.json` with exactly the legacy path and shape the unchanged landing reads (counters,
lock-screen pushes, filter-sheet footer, radar tile), from HOMI's own listings, on the observed legacy schedule, written
atomically to public storage and removed of any listing the moment it is withdrawn or taken down.

## Legacy reference

- RES-010 (`08` lines 1353-1369); landing contract `03b` §1.5 (lines 674-685); LND-032 (loader, `max-age=1800`,
  rewrite observed 02:02); ENT-054.
- Fixture `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/live.json`; reader
  `$KVADRO_ROOT/demo/landing/site/landing.js:61-75`, `:1115`, `:2102`, `:2165`, `:2229`;
  producer named in `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:60-61`, `:66-77` (`scripts/landing_snapshot.py`,
  `app/api/landing.py` — not available).
- Rules: BR-API-133 (job, schedule, `max-age=1800`), BR-LND-007 (counter shows `day` if ≥ 100, else `week` if ≥ 100,
  else hidden — client-side, `COUNT_MIN = 100`), BR-LND-012 (tones), BR-LND-014 (≤ 4 pushes from `latest`),
  BR-LND-015 and BR-LND-016 (`sheet.all`, `sheet.demo`: «≈N в день» if `per_day ≥ 1`, else `per_day × 7` a week).
- Defects: LB-API-017 and LB-LND-005 (constant `DATA_V`; data versioning), LB-LND-006 (hard-coded numbers shown as
  live; DEV-039 `PROPOSED` for the new landing).
- Open: Q-API-051 (selection rules of `latest`, schedule), Q-LND-002 (generator), Q-API-049 (`/api/landing/*` —
  not implemented, `10` §4.6).

## Implementation

1. Read `.claude/skills/laravel-queues/`, `.claude/skills/laravel-database-optimization/`, and the KV-BE-023 /
   KV-BE-032 tasks (anonymous use of the search predicate and the flow estimator).
2. `php artisan make:class Services/PublicData/LandingDataBuilder --no-interaction` with `live(CarbonImmutable $now):
   array` returning exactly `{now, day, week, since, latest[], sheet{all{count, per_day}, demo{count, per_day}}}` plus
   one additive key `generated_at` (ISO `Z`; ignored by `landing.js`, used by the new landing and by monitoring):
   - `now` = snapshot instant (ISO-8601 UTC `Z`); `since` = `null` (fixture value; unused by the client).
   - `day` / `week` = active listings first seen in the last 24 h / 7 days in the configured scope
     (`config/public_data.php` `landing.live.scope`; default: property type `apartment`, all six cities, deals
     `rent_long` and `sale` — spec-tested until Q-API-051 answers).
   - `latest` = the 6 newest active listings of Tashkent `rent_long` apartments with a known price, each
     `{id: number, rooms, price_usd (integer USD), delta (integer percent = round(median_delta × 100)), tone, district
     (ru name), district_code (landing spelling), area (number|null), seen_at (ISO Z of first_seen_at), link}`.
   - `link` = `https://t.me/<TELEGRAM_BOT_USERNAME>?startapp=l_<number>-web` (DEV-040 `PROPOSED` tag suffix behind
     `landing.attribution_tags`, default off).
   - `tone` mapping from `listing_market`: `good`, `same`, `mixed`, `no_repair` pass through; `dearer` → `high`;
     `check` and `suspicious` → `null` (no public "suspicious" label on the landing, SEC-REQ-045); no comparison →
     `tone: null` with `delta: 0` (the fixture type is an integer; the client renders `null` tones without a market
     line, BR-LND-012).
   - `sheet.all` = `{count, per_day}` for Tashkent `rent_long` apartments with no other condition; `sheet.demo` = the
     same for `DEMO_FILTERS` (2 rooms, districts `chilonzor` + `mirobod`, `owner = no_agents`); `count` from
     `ListingSearchService::count()` and `per_day` = `week / days` of `FlowEstimator::estimate()` rounded to one
     decimal — both called **without a user** (no per-user exclusions; add a nullable-user overload in this task if
     KV-BE-023 / KV-BE-032 require a `User`).
   - District codes in the landing spelling (`mirzo_ulugbek`, LB-DATA-001) via `Gazetteer` with the `landing` alias
     context of `dictionary_code_aliases` (add the context if KV-BE-015 exposes only the API spelling).
3. `php artisan make:class Services/PublicData/LandingDataPublisher --no-interaction`: writes JSON
   (`JSON_UNESCAPED_UNICODE`, no pretty print) to the `media_public` disk at `landing/data/live.json` atomically
   (write `live.json.tmp-<ulid>`, then move), keeps the previous file on any build error and raises an operator alert;
   served at `/data/live.json` on `kvadro.app` with `Cache-Control: public, max-age=1800` and `ETag`
   **[PT/INF: nginx location `^~ /data/` → the public disk path]**.
4. `php artisan make:command PublicData/BuildLandingData --no-interaction` (`landing:build {--only=live|pins|all}`);
   schedule `live` at 02:02 and 15:00 `Asia/Tashkent` (observed legacy times, `10` §4.11) with
   `->onOneServer()->withoutOverlapping()`; the pins of KV-BE-155 use the same command.
5. Immediate removal: a queued listener on `ListingWithdrawn` and `ListingPurged` (and takedowns, KV-BE-138) checks
   whether the listing is in the current `latest` and, if so, rebuilds `live` within 5 minutes (debounced with a cache
   lock) — SEC-REQ-040 lists landing data among the surfaces a takedown clears.
6. Staleness monitor: `landing:check-freshness` (hourly) alerts when `generated_at` is older than 14 h.

## Files

- `backend/app/Services/PublicData/{LandingDataBuilder,LandingDataPublisher}.php` (new)
- `backend/app/Console/Commands/PublicData/{BuildLandingData,CheckLandingFreshness}.php` (new)
- `backend/app/Listeners/PublicData/RebuildLandingOnWithdrawal.php` (new); `backend/config/public_data.php` (new);
  `backend/routes/console.php` (schedule)
- `backend/tests/Feature/PublicData/LandingLiveJsonTest.php`, `backend/tests/Fixtures/landing/live.schema.json` (from
  the fixture's shape, no values copied)

## API contract

Static file `GET /data/live.json[?v=…]` (query ignored) on the legacy site host:
`{"now": "…Z", "day": int, "week": int, "since": null, "latest": [ {"id": int, "rooms": int, "price_usd": int,
"delta": int, "tone": "good"|"same"|"mixed"|"no_repair"|"high"|null, "district": string, "district_code": string,
"area": number|null, "seen_at": "…Z", "link": string} ×6 ], "sheet": {"all": {"count": int, "per_day": number},
"demo": {"count": int, "per_day": number}}, "generated_at": "…Z"}`; `Content-Type: application/json`,
`Cache-Control: public, max-age=1800`. No phone, no text, no photo in this file.

## Business rules

- Kept: BR-API-133 (job, times, cache header), RES-010 shape; BR-LND-007, BR-LND-014, BR-LND-015, BR-LND-016 are
  client rules — the data keeps `day`, `week`, `latest`, `sheet` meaningful for them.
- Defect fixes `APPROVED`: LB-LND-005 / LB-API-017 (`generated_at` published; ETag + short `max-age` instead of the
  constant key — the legacy client keeps its constant `?v=` and still gets fresh data after 30 min).
- DEV-039 `PROPOSED` (no placeholder numbers) concerns the new landing; this file enables it (`generated_at`).
- DEV-040 `PROPOSED` (tagged `startapp` links) behind config; test `->todo('DEV-040 PROPOSED')`.

## Acceptance criteria

- The generated file validates against the schema derived from the legacy fixture (same keys and types; the only extra
  key is `generated_at`); `latest` has at most 6 items, newest first, all active Tashkent `rent_long` apartments.
- `day ≤ week`; `sheet.demo.count ≤ sheet.all.count`; `per_day ≥ 0`.
- A listing withdrawn or taken down disappears from `latest` within 5 minutes; a failed build keeps the previous file.
- The file contains no digit sequence that matches the phone pattern and no listing text.

## Tests

- `LandingLiveJsonTest`: `shape_matches_legacy_fixture_schema`, `latest_has_six_newest_tashkent_rent_apartments`,
  `link_uses_web_source_and_number`, `district_code_uses_landing_spelling` (`mirzo_ulugbek`),
  `tone_mapping_dataset` (good/same/mixed/no_repair pass, dearer→high, check/suspicious/none→null),
  `delta_is_rounded_integer_percent`, `day_and_week_windows_at_boundaries` (frozen clock: first_seen 24 h ± 1 s),
  `sheet_demo_uses_demo_filters_without_user_exclusions`, `per_day_is_week_over_days_one_decimal`,
  `write_is_atomic_and_previous_file_kept_on_error`, `withdrawn_listing_triggers_rebuild` (`Event::fake` → listener),
  `scheduled_at_0202_and_1500_tashkent` (schedule inspection), `no_phone_pattern_in_output`,
  `->todo('DEV-040 PROPOSED')`.

## Edge cases

- Fewer than 6 qualifying listings (staging, empty city): `latest` shorter, never padded with placeholders.
- Build at 19:00 UTC (00:00 Tashkent): windows are rolling instants, not calendar days; `seen_at` stays UTC `Z`.
- `listing_market` missing for a new listing (medians hourly): `tone: null`, `delta: 0`.
- A merged listing in `latest`: the survivor's `number` is used (aliases never appear).
- The legacy landing may still request `?v=202610171944`: nginx ignores the query.

## Security

- SEC-REQ-021 (data rendered as text by the landing), SEC-REQ-025 / SEC-REQ-040 (withdrawn and taken-down listings
  removed from landing data at once), SEC-REQ-045 (no public suspicion labels), SEC-REQ-033 (`nosniff` on the file).

## Definition of done

Tests green (`make ci-backend`), the KV-QA-013 landing scenarios that read `live.json` pass against generated data on
staging, parity gate items ticked (`15` §4) for the `live.json` part of F-LANDING-003 and F-PIPELINE-008, docs and the
feature rows in `09` updated, PR reviewed by the other developer.
