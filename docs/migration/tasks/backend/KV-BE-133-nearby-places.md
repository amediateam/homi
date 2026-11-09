# KV-BE-133 — Nearby parks and schools per listing

| Field | Value |
| ----- | ----- |
| Status | TODO (POI data import BLOCKED by Q-SEO-015 licences — synthetic POIs until then) |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-LISTING-007 |
| Dependencies | KV-BE-132, KV-DB-034 (`pois`); Q-API-020, Q-SEO-015 |

## Goal

Each located listing has at most one nearest park and one nearest school (with the 2024 rating where known), with the
distance measured from the listing's anchor, ready for `ListingDetails.nearby` and the SEO quarter pages — `kind`
limited to `park` and `school`, unique per listing, never the metro.

## Legacy reference

- `nearby: {kind: "park"|"school", name, km, note?}[]` — `kind` unique, only these two values, never `metro`
  (`08` §1.8; BR-API-052, BR-DATA-027), LB-API-010 (unknown or duplicate kinds crash the old client — whitelist),
  LB-APP-016; BR-API-053 (school rating 2024 from `opendata.tashkent.uz/data/134`, school locations from
  OpenStreetMap), BR-SEO-021 (schools near a quarter: number, rating place, distance), ENT-036, ENT-048.
- `$KVADRO_ROOT/docs/seo-pages.md:253-255`.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` rules 11, 12, 16 and KV-DB-034 (`pois`). Tests first (`pgsql` group).
2. `php artisan make:class Services/Geo/NearbyPlaces --no-interaction`: `forListing(Listing): list<NearbyPlace>` —
   per kind, `ORDER BY poi.location::geometry <-> :anchor LIMIT 1` with `ST_DWithin(poi.location, :anchor,
   :max_m)` (`config('geo.nearby.max_m')` = 1 500 m `PROPOSED`), `km` = geography distance rounded to 0.01;
   `note` for schools = rating place («№12 в рейтинге 2024») from `pois.rating`.
3. Storage: computed on publish and on `ListingGeoChanged` into `listing_nearby (listing_id, kind, poi_id, km)`
   (`php artisan make:migration create_listing_nearby_table --no-interaction`, PK `(listing_id, kind)` — uniqueness by
   construction); KV-BE-034's serializer reads it.
4. `php artisan make:command Geo/ImportPois --no-interaction` → `geo:import-pois {file} --kind=school|park
   [--ratings=file]`: local GeoJSON/CSV only, no downloads, matched/unmatched report; source URL, date and licence go
   to `docs/migration/data/geo-sources.md` (KV-DB-034 step 8) **[PT]** for the real files.
5. Quarter helper for M7: `NearbyPlaces::schoolsNearQuarter(Quarter, int $limit = 5)` from the quarter midpoint
   (BR-SEO-021).

## Files

- `backend/app/Services/Geo/NearbyPlaces.php`, `backend/app/Domain/Geo/NearbyPlace.php`,
  `backend/app/Models/ListingNearby.php`, `backend/app/Console/Commands/Geo/ImportPois.php`,
  `backend/app/Listeners/Geo/RecomputeNearby.php` (new); migration `create_listing_nearby_table`
- `backend/tests/Feature/Pgsql/Geo/NearbyPlacesTest.php` (new)

## API contract

n/a (data for `ListingDetails.nearby`, serialized by KV-BE-034).

## Business rules

- BR-DATA-027 / BR-API-052 (only `park` and `school`, unique, no metro), BR-API-051 (distance from the named place),
  BR-SEO-021, LB-API-010 fix (whitelist and uniqueness, `09` §4.3 `APPROVED`).

## Acceptance criteria

- A listing has 0, 1 or 2 `listing_nearby` rows, never two of one kind and never another kind.
- A listing without a point has no rows.
- A school beyond 1 500 m is not listed.

## Tests

- `NearbyPlacesTest`: `nearest_park_and_school`, `unique_kind_by_primary_key`, `beyond_max_distance_omitted`,
  `no_point_no_rows`, `school_note_from_rating`, `recomputed_on_geo_change`, `schools_near_quarter_ordered`,
  `import_reports_unmatched`.

## Edge cases

- Two schools at the same distance: lower rating place first, then lower id (deterministic).
- POI data missing for a city: no rows, no error.
- A park polygon instead of a point in the source data: imported as `ST_PointOnSurface`.

## Security

- SEC-REQ-021 (names rendered as text by clients; stored as plain text, no markup), BR-DATA-029 (plain labels).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), data sources recorded, `09` row F-LISTING-007 updated, PR reviewed by
the other developer.
