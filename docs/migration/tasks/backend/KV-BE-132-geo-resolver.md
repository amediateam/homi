# KV-BE-132 — `GeoResolver`: point, uncertainty, district, zone, metro and centre distances

| Field | Value |
| ----- | ----- |
| Status | TODO (PostGIS in staging/production BLOCKED by DEC-09; local and CI per KV-DB-005 / KV-QA-001) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PIPELINE-004, F-LISTING-007 |
| Dependencies | KV-DB-005 (PostGIS), KV-DB-006 (cities, districts, zones), KV-DB-034 (metro, quarters, places, boundaries), KV-BE-015, KV-BE-131; Q-API-020 |

## Goal

Every normalised listing gets a location the rest of HOMI can trust: a WGS 84 point with an uncertainty radius
(`geo_radius_m`) measured from the most specific place named in the post, the city, the district (with
`district_source`), the zone membership (`center`, `near_center`), the quarter and place ids, the nearest metro station
with `metro_km`, and `center_km` — all computed at write time with PostGIS so search, matching and medians need no
spatial joins.

## Legacy reference

- BR-API-050 (city, district, zone, landmark, ЖК, coordinates with `geo_radius_m`, nearest metro with distance, distance
  to the centre), BR-API-051 / BR-DATA-036 (distances from the block, landmark or metro named in the listing, not from
  the district; district may be inferred from a landmark or mahalla), BR-API-053 (boundaries from
  `opendata.tashkent.uz` `/132`, `/134`), BR-DATA-035 (listings without a recognisable place never match zone or
  district radars; «Весь <город>» matches every listing of the city), BR-API-052 (client shows the metro when
  `metro_km ≤ 1.5`), BR-APP-031 (`~` prefix when `geo_radius_m ≥ 400`, client default 500), BR-SEO-020 («у метро» ≈
  1 km straight line — consumed by M7), BR-SEO-021 (quarter distances from the middle of the quarter).
- LB-DATA-020 (store `district_source`; flag points outside every polygon; migrated rows `legacy_unknown`), Q-API-020
  (geocoder and `geo_radius_m` derivation unknown), Q-SEO-006, Q-API-026 (city zooms).
- `$KVADRO_ROOT/docs/about.md:141`, `:174-176`; `$KVADRO_ROOT/docs/seo-pages.md:252-255`.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` rules 11–17 and check `ST_Covers`, `ST_DWithin`, `<->` KNN,
   `ST_Distance` on geography and `ST_Centroid`/`ST_PointOnSurface` in the PostGIS docs (`search-docs`) before writing
   SQL. Tests first in the `pgsql` group (KV-QA-001).
2. `php artisan make:class Services/Geo/GeoResolver --no-interaction`:
   `resolve(NormalisedListing $draft, City $city): GeoResult` — choose the anchor, in order of specificity:
   1. coordinates in the payload (a shared location or a collector point) → radius 50 m (`PROPOSED`);
   2. ЖК (`places.kind = jk`) or a landmark/block named in the text → the place point, radius 300 m;
   3. a quarter named in the text → the quarter `midpoint`, radius = half the quarter's bounding diagonal, capped at
      800 m;
   4. a metro station named → the station point, radius 600 m;
   5. a mahalla or street → place point when in the gazetteer, radius 500 m;
   6. district only → no point (`location = null`), `district_source = text`;
   7. nothing → city only.
   All radii are `PROPOSED` config values in `config/geo.php` (Q-API-020 open); `geo_radius_m` is stored with the
   anchor kind (`geo_anchor`: `coords`, `jk`, `landmark`, `quarter`, `metro`, `mahalla`, `district`, `city`).
3. District: with a point → `ST_Covers(districts.boundary, point::geometry)` (postgis rule 13; GiST), `district_source =
   polygon`; a stated district that disagrees with the polygon → keep the polygon district, record
   `district_conflict` for review; no polygon match → the stated or the place's district with `district_source =
   landmark|text`, plus `outside_polygons = true` (LB-DATA-020); never guessed from the city centre.
4. Zones: membership of `city_zones` polygons (`center`, `near_center`, canonical order) stored as `zones text[]` on the
   listing (additive column if KV-DB-008 lacks it — `php artisan make:migration add_zones_to_listings_table`).
5. Metro: nearest station of the same city by KNN `location::geometry <-> station::geometry` then exact
   `ST_Distance(geography)` in km with 2 decimals → `metro_station_id`, `metro_km`; only for cities with metro
   (Tashkent); `null` without a point.
6. Centre: `center_km` = `ST_Distance` to the city centre (KV-DB-034 sets centres) rounded to 0.1 km.
7. Quarter and place ids: quarter by `ST_Covers(quarters.boundary, point)` when the quarter has a boundary, else by
   the text mention (BR-SEO-021); `place_id` = the anchor place.
8. Write all fields in one update in the `ResolveGeo` stage (KV-BE-124); the stage is idempotent (same input → same
   output; tested).
9. `php artisan make:command Geo/ReresolveListings --no-interaction` → `geo:reresolve {--city=} {--since=}
   {--only-outside}`: recomputes after a gazetteer or boundary import, in chunks, without touching price or status;
   dispatches `ListingGeoChanged` so medians and matching can react (KV-BE-139/140, M4 matching).

## Files

- `backend/app/Services/Geo/GeoResolver.php`, `backend/app/Domain/Geo/GeoResult.php`, `backend/app/Services/Ingest/Stages/ResolveGeo.php` (body),
  `backend/app/Console/Commands/Geo/ReresolveListings.php`, `backend/app/Events/Listings/ListingGeoChanged.php` (new)
- `backend/config/geo.php` (radii, anchors); migration `add_zones_and_geo_anchor_to_listings_table` if needed
- `backend/tests/Feature/Pgsql/Geo/GeoResolverTest.php`, `backend/tests/Feature/Pgsql/Geo/ReresolveListingsTest.php` (new)

## API contract

n/a (internal). The values surface through `ListingPreview.metro_km`, `center_km`, `lat`, `lon` and
`ListingDetails.geo_radius_m` (`08` §1.8), serialized by KV-BE-028 / KV-BE-034.

## Business rules

- BR-API-050, BR-API-051, BR-DATA-036, BR-DATA-035 (no place → never matches zone/district radars: `district_id` null
  and `zones` empty in that case), BR-API-052, LB-DATA-020 fix (`09` §4.3, `APPROVED`).
- DEV-019 `PROPOSED` (one distance formatter) is a display concern of KV-BE-021; this task stores numbers only.

## Acceptance criteria

- A listing naming «Ц-5» (quarter with boundary) gets the quarter, its district by polygon, `district_source =
  polygon`, `geo_radius_m` from the quarter rule, and the nearest station with `metro_km`.
- A point outside every district polygon keeps `district_id` from the text with `outside_polygons = true`.
- A listing with only a district gets no point, no `metro_km`, no `center_km`, and is absent from the map (KV-BE-033).
- `ST_DWithin`/KNN queries use the GiST indexes (EXPLAIN pasted in the PR, postgis rule 8).

## Tests

- `GeoResolverTest` (`pgsql` group, synthetic polygons and stations): `coords_anchor_radius_50`, `jk_anchor_wins_over_district`,
  `quarter_midpoint_and_radius_cap`, `metro_anchor`, `district_by_polygon`, `stated_district_conflict_recorded`,
  `outside_polygons_flagged`, `zones_membership_canonical_order`, `nearest_metro_knn_and_km`, `no_metro_outside_tashkent`,
  `center_km_rounding`, `district_only_has_no_point`, `nothing_resolved_city_only`, `idempotent_same_input_same_output`,
  `uses_gist_index` (EXPLAIN contains `Index Scan` on the GiST index).
- `ReresolveListingsTest`: `boundary_import_moves_listing_and_dispatches_event`, `only_outside_selects_flagged`,
  `price_and_status_untouched`.

## Edge cases

- Two places named in one post (a ЖК and a metro): the most specific anchor (ЖК) wins; the metro still feeds
  `metro_km` from the ЖК point.
- A place name shared by two districts («Чиланзар-N» quarters lying in Uchtepa, ENT-045): the quarter's own
  `district_id` wins over the name.
- Tashkent region towns (`chirchiq`, Q-SEO-020): treated as districts of the region city until the gazetteer decides.
- PostGIS absent (SQLite suite): the resolver is skipped with a message; non-geo fields still flow (tests in `pgsql`).

## Security

- BR-API-131 / BR-DATA-034: user geolocation never reaches this code — only post data. SEC-REQ-017 (closed codes),
  SEC-REQ-047 (no addresses from posts in logs).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), EXPLAIN plans in the PR, radii recorded as `PROPOSED` with Q-API-020,
`09` rows F-PIPELINE-004 and F-LISTING-007 updated, PR reviewed by the other developer.
