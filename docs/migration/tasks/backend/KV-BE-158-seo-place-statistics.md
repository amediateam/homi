# KV-BE-158 — Quarter, metro and owner statistics and the district rank

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-SEO-002, F-SEO-003, F-SEO-004 |
| Dependencies | KV-BE-157 (catalogue, aggregator, `stats jsonb`), KV-BE-140 (near medians, `median_near_class`), KV-BE-133 (nearby schools and parks); KV-DB-034 (quarters, metro, schools with rating); Q-SEO-006, Q-SEO-015, Q-SEO-016, Q-SEO-018 |

## Goal

The place-specific blocks of the SEO pages have their numbers: quarter pages («Где это», near prices in usual houses,
schools with rating, neighbouring quarters), the metro hub and station pages («у метро» within about 1 km, landmarks
with flat counts and distances), the by-owner pages (owner median, share, district table) and the district rank
sentence — written into each slice's `stats` by the hourly refresh, from the same calculations the Mini App uses.

## Legacy reference

- LND-046 (district: price tiles, rank sentence), LND-047 (quarter), LND-048 (metro hub), LND-049 (station), LND-050
  (by owner) in `03b` lines 853-913; §2.5 items 2 and 6; `$KVADRO_ROOT/docs/seo-pages.md:194-205`, `:253-257`,
  `:263-287`, `:320-323`.
- Rules: BR-SEO-012 (rank: the district's median for that room count vs the other districts of the city that have
  one; ties and room choice open), BR-SEO-013 (near usual price: rent 12 nearest same rooms, sale 15 nearest per m²,
  from the named place, ≤ 5 km, ≤ 3 per channel, caption «по 12 ближайшим в обычных домах, до ~0,7 км», district
  fallback under 8), BR-SEO-015 (owners: median of current owner listings, shown from 8, compared with the 60-day usual
  price; share = owner / all active; district table from owners / total / share), BR-SEO-020 (metro: the listing's
  landmark within about 1 km of the station; hub «—» under 8; station landmarks with counts and distance or «названа
  сама станция»), BR-SEO-021 (quarter membership by name in the text; distances from the middle of the quarter;
  schools with number, 2024 rating place, distance; neighbouring quarters with distance and flat count), BR-SEO-033
  (same «near» calculation as the Mini App `median_*`, unverified — Q-SEO-018).
- Open: Q-SEO-006 (how a listing is attached to a quarter, landmark or station), Q-SEO-015 (open-data versions and
  licences), Q-SEO-016 (rank rules).

## Implementation

1. Read the KV-BE-140 task (`MarketComparison` near median: scope point, radius, class) and the KV-BE-133 task
   (`pois` schools and parks), `.ai/agents/postgis-geo-engineer.md` (rules 12, 16).
2. `php artisan make:class Services/PublicData/SeoPlaceStatistics --no-interaction`, called by the KV-BE-157
   aggregator for slices of kind `quarter`, `metro_hub`, `metro_station`, `owners_city`, `owners_district`,
   `district`, `district_rooms`:
   - Quarter: `where` = owning district (hokimiyat nesting), nearest metro station and its distance from the quarter's
     middle (`ST_Distance` on geography, rounded per the display formatter); near prices per room count by calling
     `MarketComparison::nearMedian(point: quarter middle, rooms, deal)` — the same function as the per-listing
     comparison (BR-SEO-033), returning median, `n`, radius reached and house class (`jk`, `house`) for the caption,
     with the district fallback under 8; schools within `seo.quarter_school_radius_m` (default 1 500) with number,
     rating place and distance (KV-BE-133 data); neighbouring quarters = the 4 nearest quarters by centre distance with
     their active flat counts.
   - Metro: «у метро» membership = the listing's named place (quarter, ЖК, landmark or the station itself) lies within
     `seo.metro_radius_m` (default 1 000) of the station in a straight line (`ST_DWithin`), not the listing's own
     point; hub table per station × rooms 1–3 (median or `null` under 8) and the flat count; station page: landmarks
     with flat counts and distances, or the flag `named_station` when the text names only the station; neighbouring
     stations along the line order of the gazetteer (or the 2 nearest when no line order is seeded).
   - Owners: owner median for current `rent_long` owner listings of the scope (shown only with `n ≥ 8`), the 60-day
     usual price of all listings for comparison, `share = owners / active` (one decimal %), and the district table
     (`owners`, `total`, `share`) for the city page.
   - District rank (BR-SEO-012): for `rooms = 2` (the room count the legacy page shows) compare the district's median
     with every other district of the same city that has a median; `higher_than = count(other < this)`,
     `of = count(others with a median)`; ties count as not higher (spec until Q-SEO-016); omitted when the district
     has no median or fewer than 2 others have one.
3. All numbers are USD integers (BR-SEO-023); distances in metres (the frontend formats); counts are integers; texts
   are not produced here.
4. `stats` sub-shapes documented in the PR and pinned by a JSON-schema test so the landing app (and KV-BE-159) read a
   stable contract.

## Files

- `backend/app/Services/PublicData/SeoPlaceStatistics.php` (new); `backend/app/Services/PublicData/SeoSliceAggregator.php`
  (calls it); `backend/config/seo.php` (`metro_radius_m`, `quarter_school_radius_m`, rank room count)
- `backend/tests/Feature/Pgsql/SeoPlaceStatisticsTest.php`, `backend/tests/Fixtures/seo/stats.schema.json` (new)

## API contract

n/a — written to `seo_slices.stats` and served by KV-BE-159. Sub-objects: `quarter {district_key, metro {station_key,
distance_m}, near[{rooms, median_usd, n, radius_m, class}], schools[{number, rating_place, distance_m}],
neighbours[{quarter_key, distance_m, flats}]}`, `metro {stations[{station_key, flats, medians{1,2,3}}]}`,
`station {landmarks[{name_key, flats, distance_m}], named_station, near[…], district_median[…], neighbours[…]}`,
`owners {median_usd, n, usual_usd, share_pct, districts[{district_key, owners, total, share_pct}]}`,
`rank {rooms, higher_than, of}`.

## Business rules

- Kept: BR-SEO-012, BR-SEO-013, BR-SEO-015, BR-SEO-020, BR-SEO-021, BR-SEO-023; BR-SEO-033 made true by construction
  (one `nearMedian` function for the Mini App and the SEO pages; Q-SEO-018 compares legacy outputs when available).
- No DEV. The rank tie rule and the owner-share rounding are spec-tested choices (Q-SEO-016).

## Acceptance criteria

- A quarter's near median equals `MarketComparison::nearMedian()` for the quarter middle (same inputs, same output).
- A listing whose named landmark is 999 m from a station counts as «у метро»; at 1 001 m it does not — measured from
  the landmark, not the listing point.
- Owner statistics are absent below 8 owner listings; the share uses all active listings of the scope.
- The rank sentence data is absent for a district without a median and present with `of ≥ 2` otherwise.

## Tests

- `SeoPlaceStatisticsTest` (`pgsql`, PostGIS): `quarter_where_block_district_and_metro_distance`,
  `quarter_near_median_equals_market_comparison`, `near_falls_back_to_district_under_8`,
  `near_respects_3_per_channel_cap`, `schools_within_radius_with_rating`, `neighbouring_quarters_four_nearest`,
  `metro_membership_from_named_place_999_vs_1001_m`, `hub_cell_null_under_8`, `station_named_itself_flag`,
  `owners_median_hidden_under_8`, `owners_share_one_decimal`, `rank_counts_strictly_lower_districts`,
  `rank_ties_not_higher`, `rank_omitted_without_median`, `stats_match_schema`.

## Edge cases

- A quarter with no listings: the slice exists (legacy seed), `near` falls back to the district or is `null`.
- A station on the city border with landmarks in two districts: counted once per listing.
- Listings with only a district (no named place): never «у метро» and never in a quarter.
- Coordinates with a large uncertainty radius (`geo_radius_m`) are still used as the named place's point (the place's
  gazetteer point, not the listing's estimate).
- Small samples everywhere: no median from fewer than 8 listings.

## Security

- SEC-REQ-021 (data only; names from the gazetteer), SEC-REQ-045 (owner statistics are aggregates; no per-person
  label beyond the listing's own owner mark), no phones, texts or exact addresses in `stats`.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (`15` §4) for the data parts of F-SEO-002,
F-SEO-003 and F-SEO-004, docs and the feature rows in `09` updated, PR reviewed by the other developer.
