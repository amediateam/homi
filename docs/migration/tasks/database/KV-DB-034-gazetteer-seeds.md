# KV-DB-034 — Gazetteer seeds: metro, quarters, city centres, boundaries import

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); boundary file download by the developer or **[PT]** (licence recorded) |
| Complexity | M |
| Feature IDs | F-PIPELINE-004, F-LISTING-007, F-FILTER-001, F-SEO-003, F-MAP-001 |
| Dependencies | KV-DB-006, KV-DB-005; Q-API-020 |

## Goal

The rest of the M1 gazetteer exists: `metro_stations` (35, with line and point) and `quarters` (45 Tashkent массивы
with SEO slugs and case forms) seeded; `places` and `pois` tables created ready for M6; city centres set; and an
artisan command imports district, zone and quarter boundaries from a local open-data GeoJSON file into the PostGIS
columns.

## Legacy reference

- ENT-045 (quarter, `06:960-965`; 45 quarters, Tashkent, rent pages — `$KVADRO_ROOT/docs/seo-pages.md:52-56`, `:110`;
  slugs `:103-113`; names in three scripts LB-SEO-007), ENT-046 (metro, `06:967-970`; 35 stations with SEO pages,
  `$KVADRO_ROOT/docs/seo-pages.md:57`, `:82-83`), ENT-047 (place/ЖК/landmark, `06:972-981`), ENT-048 (POI,
  `06:983-986`); mapping `06` §4.2 line 1254.
- Boundaries and school rating from `opendata.tashkent.uz` (`/132`, `/134`), schools from OpenStreetMap (BR-API-053;
  `$KVADRO_ROOT/docs/seo-pages.md:253-256`); `near_metro` ≈ 1 km (BR-API-037); distances from the named place
  (BR-API-051, BR-DATA-036).
- `ListingPreview.metro`, `metro_km`, `landmark`, `place` (`08` §1.8); SEO quarter and metro pages (URL patterns in
  `03b` §2.2).
- Open: Q-API-020 (gazetteer source), Q-DATA-028, Q-SEO-006 (listing ↔ place), licence of the open-data files.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 11–16) and the KV-DB-005 ADR; check `ST_GeomFromGeoJSON`,
   `ST_Multi`, `ST_MakeValid` in the PostGIS docs before use.
2. `php artisan make:model MetroStation -mfs --no-interaction`: `city_id`, `code`, `slug`, `name jsonb` (+
   `name_cases`), `line`, `location geography(Point,4326)` (pgsql; lat/lon fallback), `sort`; GiST on `location`.
3. `php artisan make:model Quarter -mfs --no-interaction`: `city_id`, `district_id` (per hokimiyat data, some
   «Чиланзар-N» lie in Uchtepa — ENT-045), `code`, `slug` (language-neutral), `name jsonb` with `ru`, `uz` (Latin),
   `en` and `name_cases`, `boundary geometry(MultiPolygon,4326)` nullable, `midpoint geography(Point,4326)`; GiST on
   `boundary`.
4. `php artisan make:model Place -mfs` (`kind` `landmark|jk|mahalla|block`, `name jsonb`, `aliases text[]`,
   `location`, `house_class` `jk|house|null`, `city_id`, `district_id`) and `php artisan make:model Poi -mfs`
   (`kind` `school|park`, `name jsonb`, `location`, `rating jsonb` nullable, `note jsonb`) — tables only, data in M6
   (Q-API-020); GiST on both `location` columns.
5. Add the deferred FKs `listings.quarter_id`, `listings.place_id`, `listings.metro_station_id` (`NOT VALID` +
   `VALIDATE`, rule 1).
6. Seeders (`GazetteerSeeder`, idempotent): 35 metro stations and 45 quarters with slugs and names from
   `$KVADRO_ROOT/docs/seo-pages.md` and `03b` §2.2; coordinates where the legacy material gives them, otherwise
   `null` + a `spec` note (no invented coordinates); every observed spelling into `dictionary_code_aliases`
   (`metro`, `quarter`). City centres updated on the KV-DB-006 rows.
7. `php artisan make:command GeoImportBoundaries --no-interaction` → `geo:import-boundaries {file} --dictionary=
   district|zone|quarter --match=slug|code`: reads a local GeoJSON FeatureCollection, matches features to rows,
   writes `ST_Multi(ST_MakeValid(ST_GeomFromGeoJSON(...)))` with SRID 4326, reports matched/unmatched/invalid counts,
   never downloads (no network; `Http::preventStrayRequests()` in its test).
8. Document the manual step: download the open-data files, record source URL, date and licence in
   `docs/migration/data/geo-sources.md` (development track) — the files themselves are not committed if the licence
   forbids redistribution.
9. Pint, PHPStan, tests.

## Files

- `backend/database/migrations/<ts>_create_metro_stations_table.php`, `…_create_quarters_table.php`,
  `…_create_places_table.php`, `…_create_pois_table.php`, `…_add_gazetteer_fks_to_listings.php` (new)
- `backend/app/Models/{MetroStation,Quarter,Place,Poi}.php`
- `backend/app/Console/Commands/GeoImportBoundaries.php`
- `backend/database/factories/*`, `backend/database/seeders/GazetteerSeeder.php`,
  `backend/database/seeders/data/geo/{metro,quarters}.php`
- `backend/tests/Feature/Database/GazetteerSeedTest.php`, `backend/tests/Feature/Pgsql/GeoImportBoundariesTest.php`,
  `backend/tests/Fixtures/Geo/synthetic-districts.geojson`
- `docs/migration/data/geo-sources.md` (new)

## API contract

n/a for endpoints — the rows must produce `ListingPreview.metro` (localised name), the inputs of `metro_km` and
`center_km`, `landmark`/`place` labels (M6), `nearby[] {kind: park|school, name, km, note}` (M6), and the quarter and
metro SEO slices (M7).

## Business rules

Keep BR-API-037 (≈ 1 km metro rule, computed in M6), BR-API-051, BR-API-052 (metro never in `nearby`), BR-API-053,
BR-DATA-027, BR-DATA-029 (names plain text), BR-DATA-036. Apply LB-SEO-007 and LB-LND-011 (one place dictionary,
names per script — defect fixes `APPROVED`) and LB-DATA-020 (boundaries enable `district_source = polygon`).

## Acceptance criteria

- 35 metro stations and 45 quarters seeded with slugs and three-locale names; seeding twice changes nothing.
- `geo:import-boundaries` on the synthetic fixture fills `districts.boundary` for matched rows, reports unmatched
  features, repairs an invalid ring with `ST_MakeValid`, and leaves unmatched rows untouched.
- A point inside a synthetic district polygon is found by `ST_Covers(boundary, point::geometry)` using the GiST index.
- No coordinate is invented: seeds without a legacy source keep `null`.

## Tests

- `GazetteerSeedTest`: `it('seeds 35 metro stations')`, `it('seeds 45 quarters with slugs')`, `it('resolves metro and
  quarter aliases')`, `it('has no markup in names')`, `it('is idempotent')`.
- `GeoImportBoundariesTest` (`pgsql`): import of `synthetic-districts.geojson` (two squares, one self-intersecting
  ring, one unmatched feature) → counts 2 matched / 1 repaired / 1 unmatched; `ST_IsValid` true for every stored
  boundary; point-in-polygon EXPLAIN uses the GiST index; the command makes no HTTP request.

## Edge cases

- GeoJSON in another CRS: refused unless EPSG:4326 (the command checks `crs`).
- Quarter names with apostrophe variants (`ʻ`, `'`): canonicalised (`14` §4.1 "Text").
- Overlapping district polygons from open data: the import reports overlaps; assignment rules stay in M6 (rule 13).
- Metro stations with the same name on two lines: unique by `code`, aliases per line.

## Security

Public reference data only (SEC-REQ-041); names rendered as text everywhere (SEC-REQ-021). The command reads only a
local path given by the operator; no URL fetching (SEC-REQ-023 does not apply).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note (new FKs on
`listings`) and the open-data licence in the PR.
