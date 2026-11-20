# KV-BE-155 — Landing `pins-rent.json` and `pins-sale.json` builder

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); nginx location **[PT/INF]** |
| Complexity | M |
| Feature IDs | F-LANDING-003, F-PIPELINE-008 |
| Dependencies | KV-BE-154 (builder, publisher, command), KV-BE-139 (district medians), KV-BE-140 (`listing_market`), KV-BE-156 (snapshots); Q-API-051, Q-LND-010 |

## Goal

HOMI regenerates `data/pins-rent.json` and `data/pins-sale.json` with the legacy path and shape the unchanged landing
reads (live price map, demo feed, radar collage, savings block), with district medians only (the point medians that
the legacy client mislabels as districts are dropped), a defined «bargain» count, and only listings whose snapshot
photo exists.

## Legacy reference

- RES-011, RES-012 (`08` lines 1371-1388); landing contract `03b` §1.5; LND-008, LND-012, LND-014; ENT-054
  (2026-11-08 snapshot: 167 rent pins, 149 sale pins, 1 310 dots, 2 069 median rows = 36 district + 2 033 point).
- Fixtures `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/pins-rent.json`, `…/pins-sale.json`; reader
  `$KVADRO_ROOT/demo/landing/site/landing.js:1041-1083`, `:2257`, `:2267-2324`.
- Rules: BR-API-134 (`x`/`y` in % of the static Tashkent map image, `img/snap/<id>.webp`, `startapp=l_<id>-web`,
  medians by district × rooms), BR-LND-008 (savings block uses medians with `rooms ∈ 1..3`, `median_usd > 0`),
  BR-LND-009 (bargains line shown when `bargains_week ≥ 100`; server definition «на 20% и больше дешевле»),
  BR-LND-010 (`in_all`, `in_rooms`), BR-LND-011 (demo filter semantics on `rooms`, `price_usd`, `district_code`,
  `is_owner`), BR-LND-012 (tones).
- Defects: LB-LND-004 (point medians rendered as district buttons), LB-DATA-008 (places keyed by `pt:<lat>:<lon>`),
  LB-LND-005 (unused `dots`), LB-LND-012 / LB-API-054 (unsigned photo copies — KV-BE-156).
- Open: Q-API-051 (pin selection, schedule), Q-LND-010 (one definition of «below market»).

## Implementation

1. Read the KV-BE-154 task (builder and publisher) and `.ai/agents/postgis-geo-engineer.md` (rule 14 bounding box).
2. `LandingDataBuilder::pins(Deal $deal, CarbonImmutable $now): array` → `{pins[], dots, medians[], bargains_week}` plus
   `generated_at`:
   - Candidates: active Tashkent apartments of the deal (`rent_long` for rent, `sale` for sale) with a location inside
     the map bounds, a price and a snapshot photo produced by KV-BE-156 for this run, first seen within
     `landing.pins.max_age_days` (default 14).
   - Selection (spec until Q-API-051): newest first, round-robin across districts so every district with candidates
     appears, capped at `landing.pins.max` (rent 170, sale 150 — the legacy counts as the order of magnitude).
   - `in_all` = the first `landing.pins.in_all_max` (default 60) of the selection; `in_rooms` = the first
     `landing.pins.in_rooms_max` (default 25) per room count 1–3 (BR-LND-010; `rooms ≥ 4` never `in_rooms`).
   - Per pin: `id` (number), `x`, `y` (percent, two decimals) from a linear equirectangular projection of the point
     onto the static map image with bounds `landing.map_bounds` (west, south, east, north) calibrated in this task from
     at least four control points identifiable on the image (`$KVADRO_ROOT/demo/landing/site/` map asset) and the
     gazetteer coordinates of the same places — calibration values and residuals recorded in the PR; `rooms`,
     `price_usd` (int), `delta` (int %), `tone` (mapping of KV-BE-154), `area` (number|null), `floor`,
     `floors_total`, `district` (ru name), `district_code` (landing spelling), `point` (place, quarter or ЖК name in
     ru, empty string when none), `photo` = `img/snap/<number>.webp`, `link` = `https://t.me/<bot>?startapp=l_<number>-web`,
     `age_min` (whole minutes since `first_seen_at` at `now`), `is_owner` (`true`/`false`/`null`), `in_all`,
     `in_rooms`.
   - `dots` = `[]` (unused by the page, LB-LND-005; the sale fixture already has `[]`).
   - `medians` (rent only) = district × rooms 1–3 rows from `market_medians` (scope district, Tashkent, 60-day window,
     `n ≥ 8`): `{district_code, rooms, median_usd (int), n}`; **no point entries** (LB-LND-004 fix). A flag
     `landing.emit_point_medians` (default off) re-adds place medians keyed `pt:<lat>:<lon>` / `pt:<lat>:<lon>:near`
     from `places` coordinates (LB-DATA-008 mapping) for a side-by-side comparison with the legacy file only.
   - `bargains_week` (rent) = active Tashkent `rent_long` apartments first seen in the last 7 days with
     `median_delta ≤ −0.20` (BR-LND-009 server definition; Q-LND-010 open); sale: `medians: []`, `bargains_week: null`
     (fixture values).
3. The `landing:build` command of KV-BE-154 builds `pins` at 15:00 `Asia/Tashkent` (observed) and also at 02:02 so the
   snapshot set and the pins never disagree; snapshot generation (KV-BE-156) runs first in the same command, and a pin
   whose snapshot failed is dropped.
4. Publication through `LandingDataPublisher` at `landing/data/pins-rent.json`, `landing/data/pins-sale.json`
   (atomic), `Cache-Control: public, max-age=1800` **[PT/INF: nginx]**.
5. Withdrawal and takedown listener of KV-BE-154 also covers pins (rebuild within 5 minutes; the snapshot file is
   deleted at once by KV-BE-156).

## Files

- `backend/app/Services/PublicData/LandingDataBuilder.php` (`pins()`), `backend/app/Domain/PublicData/MapProjection.php`
  (new)
- `backend/config/public_data.php` (`landing.pins.*`, `landing.map_bounds`, `landing.emit_point_medians`)
- `backend/tests/Feature/PublicData/LandingPinsJsonTest.php`, `backend/tests/Unit/PublicData/MapProjectionTest.php`,
  `backend/tests/Fixtures/landing/pins.schema.json` (new)

## API contract

Static files `GET /data/pins-rent.json`, `GET /data/pins-sale.json` (query ignored):
`{"pins": [{"id": int, "x": number, "y": number, "rooms": int, "price_usd": int, "delta": int, "tone": string|null,
"area": number|null, "floor": int|null, "floors_total": int|null, "district": string, "district_code": string,
"point": string, "photo": "img/snap/<id>.webp", "link": string, "age_min": int, "is_owner": bool|null, "in_all": bool,
"in_rooms": bool}], "dots": [], "medians": [{"district_code": string, "rooms": int, "median_usd": int, "n": int}],
"bargains_week": int|null, "generated_at": "…Z"}`.

## Business rules

- Kept: BR-API-134, RES-011 and RES-012 shapes; BR-LND-008 … BR-LND-012 stay true for the data (rooms 1–3 medians,
  integer prices, tones in the client's set, `is_owner` tri-state).
- Defect fixes `APPROVED` (`09` §4.3): LB-LND-004 (district medians only), LB-LND-005 (dead `dots` emptied,
  `generated_at`), LB-DATA-008 (place medians keyed by `place_id` internally).
- Bargain threshold 20 % is the landing's own server definition (BR-LND-009), distinct from the ≥ 10 % tone
  (BR-API-059); Q-LND-010 may unify them — config `landing.bargain_threshold` = 0.20.

## Acceptance criteria

- Both files validate against the schema from the legacy fixtures; every `photo` path resolves to an existing file
  (KV-BE-156) at publication time.
- `medians` has no `pt:` key unless the comparison flag is on; every `district_code` has a dictionary name.
- Every pin lies within 0–100 % on both axes; a control point projects within 1 % of its marked position.
- Withdrawn or taken-down listings are absent after the debounced rebuild; the snapshot is gone at once.

## Tests

- `LandingPinsJsonTest`: `rent_and_sale_shapes_match_fixture_schema`, `sale_has_empty_medians_and_null_bargains`,
  `medians_are_district_only_rooms_1_to_3_n_at_least_8`, `point_medians_only_with_flag`,
  `bargains_week_counts_minus_20_percent_last_7_days` (boundary −0.1999 vs −0.2000), `in_all_and_in_rooms_caps`,
  `round_robin_covers_every_district_with_candidates`, `pin_without_snapshot_is_dropped`,
  `link_and_photo_use_public_number`, `age_min_whole_minutes`, `is_owner_tri_state`,
  `outside_map_bounds_excluded`, `withdrawn_listing_removed_on_rebuild`.
- `MapProjectionTest` (unit): control points dataset within 1 %; corners map to 0 and 100.
- `pgsql` group: candidate query uses the GiST index (EXPLAIN contains an index scan on `location`).

## Edge cases

- Small samples: a district with `n < 8` for a room count is absent from `medians` (the client falls back to its first
  entry, BR-LND-008).
- No sale medians exist by design (fixture); the savings block is rent only.
- Clock at 19:00 UTC: `age_min` and the 7-day window are instant-based.
- A merged listing selected as a pin: the survivor number is used; its alias never appears.
- Map bounds recalibrated: pins move; the PR records the before/after residuals.

## Security

- SEC-REQ-021 (texts rendered as text), SEC-REQ-025 and SEC-REQ-040 (photos only through the media pipeline, removed on
  takedown and withdrawal), SEC-REQ-045 (no suspicion labels on a public page), no phones or listing texts in the file.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), the KV-QA-013 live-map scenarios pass against generated data on
staging, parity gate items ticked (`15` §4) for the pins part of F-LANDING-003 and F-PIPELINE-008, docs and the feature
rows in `09` updated, PR reviewed by the other developer.
