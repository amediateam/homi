# KV-QA-012 — Reference-client filter and map scenarios

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | L |
| Feature IDs | F-FILTER-001 … F-FILTER-007, F-FEED-002, F-MAP-001, F-MAP-002, F-MAP-003, F-MEDIA-002, F-HISTORY-001, F-FAV-001 |
| Dependencies | KV-QA-011; KV-QA-001 with PostGIS (polygon and map); legacy routes API-004 … API-007 |

## Goal

The 36 filter scenarios and the 16 MapLibre GL scenarios of the legacy harness run against HOMI with the mock-equivalent
seed; every data-path scenario is identical or its difference is resolved and recorded.

## Legacy reference

- Filter scenarios: `$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs:45-86` (36 entries: full sheet, quick sheets,
  sort, city, relax via flow options, empty and error feeds, favourites and history tabs); flow options
  `mocks-filters.mjs:33-45`.
- GL scenarios: `$KVADRO_ROOT/demo/app/tools/parity/gl-parity.mjs` (16: base, dark, PMTiles, template, pin click,
  stack, spider, card close, cluster expand and max, locate denied and ok, theme switch, lasso); WebGL forced with
  SwiftShader (`$KVADRO_ROOT/CLAUDE.md:28`).
- Contract: `08` §1.7 (FilterQuery, repeated keys, polygon 3–40 vertices), API-005 … API-007, RES-003, RES-004;
  `points[].label` plain text (LB-API-008 defect fix).
- Fix decisions: DEV-004, DEV-017, DEV-018, DEV-021, DEV-023, DEV-024, DEV-025, DEV-052 (`PROPOSED`).

## Implementation

1. Extend `reference-client-scenarios.csv` with both suites and classify them (data-path vs fault: `x-feed-error`,
   `x-feed-error-more` are fault cases).
2. Extend `ParityMockSeeder` (or a sibling seeder) so that `/api/feed/count`, `/api/feed/flow` (with options `price`
   and `rooms`, each carrying 25-key filters) and `/api/map` return the values the scenarios render; empty-feed
   scenarios use a city or filter set with no listings rather than a forced response.
3. For GL: map points with the coordinates of the mock items; stacks and clusters need the same point layout; `tiles`
   in meta `null` (OSM blocked) or the PMTiles fixture path as in `gl-pmtiles` — serve the tile fixture locally, never
   from a production host.
4. Run all data-path scenarios in both modes; append to `reference-client-results.csv`; resolve every difference as in
   KV-QA-011 step 5.
5. The request set is produced by the legacy client, so it is identical by construction; what this task proves is
   that HOMI's answers (counts, flow options, map points, polygon filtering) render the same DOM.

## Files

- `docs/migration/data/reference-client-scenarios.csv`, `reference-client-results.csv`
- `backend/database/seeders/Testing/ParityMockSeeder.php` (extended)
- `backend/tests/Browser/Parity/FilterScenariosTest.php`, `MapScenariosTest.php` (new; or runner equivalents)

## API contract

API-004 (`GET /api/feed` with every FilterQuery key), API-005, API-006 (options with full filters), API-007
(`points[]` with numeric `lat`/`lon`, plain `label`, `tone`, `priced`, `usd`, `total`), RES-003 (`Range` requests).

## Business rules

BR-API-025 … BR-API-034 (filter semantics), BR-APP-012 (same-filters key); DEV rows of the FILTER module per their
state.

## Acceptance criteria

- Both suites classified; every data-path scenario has a result row with a resolution where it differs.
- The lasso scenario sends a polygon and HOMI filters by it on PostGIS (not on SQLite).
- No map `label` in any HOMI response contains `<`, `>`, `&`, `"` or `'` (SEC-REQ-018).

## Tests

`FilterScenariosTest`, `MapScenariosTest`; a consistency assertion per run: the map ids equal the feed ids for the same
filters (`15` §3.7 #1).

## Edge cases

- GL scenarios need WebGL in headless Chrome (`--use-gl=swiftshader`); if the CI image lacks it, they run nightly on a
  runner that has it and are skipped elsewhere with a reason.
- Debounced live requests (250 ms count, 500 ms flow) abort earlier requests; HOMI must tolerate dropped connections.
- `x-fs-city-pick` switches to a city without zones: the seed must have such a city (Samarkand in the mocks).

## Security

Tiles and photos are served from local fixtures; blocked hosts stay blocked.

## Definition of done

Tests green, parity gate items ticked (15 §4; G10 evidence for the FILTER and MAP features), docs and the feature rows
in 09 updated, PR reviewed by the other developer.
