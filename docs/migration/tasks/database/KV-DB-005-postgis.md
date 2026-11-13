# KV-DB-005 — Enable PostGIS in HOMI environments

| Field | Value |
| ----- | ----- |
| Status | TODO (staging/production BLOCKED by DEC-09) |
| Owner | Backend (track: development) for the ADR, migration, local and CI steps; DevOps (track: production) for the **[PT]** server steps |
| Complexity | M |
| Feature IDs | F-MAP-002, F-PIPELINE-004, F-PIPELINE-005, F-FILTER-001, F-LISTING-007. Technical migration task — geography columns of KV-DB-006, KV-DB-008, KV-DB-009 and KV-DB-034 cannot exist without the extension |
| Dependencies | CF-014; DEC-09, DEC-23; KV-QA-001 |

## Goal

An accepted ADR "PostGIS" fixes the spatial column conventions and the test strategy; `postgis` is enabled by a
migration on every HOMI database (local, CI, staging, production); a PostgreSQL-group test runs a geography query in
CI.

## Legacy reference

- Legacy runs PostgreSQL + PostGIS 3.5.2 (`$KVADRO_ROOT/docs/about.md:396`); `/ping` reported the PostGIS version
  (LB-BOT-027).
- Spatial behaviour: lasso polygon 3–40 vertices on feed, count, flow and map (BR-API-034, `08` §1.7); metro and centre
  distances and `geo_radius_m` (BR-API-050, BR-API-051, BR-DATA-036); nearest-12/15 within 5 km for medians
  (BR-API-058); district and block boundaries from open data (BR-API-053); radar polygons (ENT-008, `06` §2.2).
- Schema conventions: `06` §4.1 row "PostGIS", §4.3 item 8; `10` §3.14 (CF-014 option A), `17` §5.
- HOMI today: no extension, CI image `postgres:18` (`.github/workflows/backend.yml:31-32`), tests on SQLite
  (`backend/phpunit.xml:25-27`), `HANDOFF.md:101`; `.ai/agents/postgis-geo-engineer.md` rules 10–17.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 1, 2, 9–17), `.claude/skills/laravel-database-optimization/`,
   KV-QA-001 and `17` §5. Check the PostGIS functions used below against the PostGIS documentation (Boost
   `search-docs` or postgis.net) as the agent file requires.
2. Write ADR "PostGIS" (next free number): extension `postgis` (no `postgis_topology`, no `postgis_raster`);
   `geography(Point,4326)` + GiST for listing locations, places, metro and POIs; `geometry(MultiPolygon,4326)` for
   district, zone and quarter boundaries; `geography(Polygon,4326)` for radar areas; `ST_DWithin` for radii,
   `<->` KNN on geometry for nearest-N, `ST_Covers`/`ST_Contains` for polygons, `&&` envelope prefilter; district
   assigned at write time (rule 13); planar maths in EPSG:32642 (rule 16); test strategy (PostgreSQL group, SQLite
   suite skips geo with a named reason); fallback CF-014 option B (lat/lng + bounding boxes + PHP point-in-polygon)
   recorded with its cost — degraded lasso and nearest-neighbour medians at ~18.6 k active listings.
3. `php artisan make:migration enable_postgis_extension --no-interaction`: `up()` runs
   `CREATE EXTENSION IF NOT EXISTS postgis` only when `DB::getDriverName() === 'pgsql'`; `down()` is a no-op with a
   comment (dropping the extension would drop dependent columns; it needs an explicit DBA action). Mark the migration
   as requiring a role allowed to create extensions and say so in the PR (data-impact note, `parallel-work.md` §3).
4. Local (development track, `infra/local` + `scripts/dev`): document `brew install postgis` in
   `docs/infrastructure/local-development.md`; add a `make dev-check` probe "PostGIS available"
   (`SELECT postgis_full_version()` through `php artisan db:show`-style tinker-free check, or `psql` if already used by
   the script) that fails with an instruction.
5. CI (coordinate with KV-QA-001, which owns `phpunit.pgsql.xml` and the `pgsql` group): switch the service image in
   `.github/workflows/backend.yml` to a PostGIS build for PostgreSQL 18 — **PROPOSED — needs first developer approval
   (dependency change)** (DEC-23); until approved the geo tests stay skipped with the reason "PostGIS image pending
   DEC-23".
6. Add `backend/tests/Feature/Pgsql/PostgisAvailableTest.php` (group `pgsql`): the extension exists, a
   `geography(Point,4326)` distance and an `ST_DWithin` query return the expected values on synthetic points.
7. **[PT]** Staging and production (DEC-09): the production track checks the PostGIS version available on
   `5.45.127.98` against the other products' databases on the shared server, then enables the extension per database
   (`homi_staging_db`, `homi_db`) with a privileged role before the first deploy of this migration; the
   application role never gets superuser rights (rule 9). Result recorded in the production notes.
8. Open the PR with the ADR, migration, test and docs; the CI image change goes into its own PR after DEC-23.

## Files

- `docs/architecture/decisions/00NN-postgis.md` (new)
- `backend/database/migrations/<ts>_enable_postgis_extension.php` (new)
- `backend/tests/Feature/Pgsql/PostgisAvailableTest.php` (new)
- `scripts/dev/` health-check script and `Makefile` `dev-check` target (probe added)
- `docs/infrastructure/local-development.md` (PostGIS install note)
- `.github/workflows/backend.yml` (service image — separate PR, after DEC-23)

## API contract

n/a for endpoints — the extension makes these legacy fields computable: `polygon` filter on API-004…API-007
(`08` §1.7), `ListingPreview.metro_km`, `center_km`, `lat`, `lon`, `ListingDetails.geo_radius_m`, `nearby[].km`,
`median_radius_km`, map `points[].lat/lon` (`08` §1.8).

## Business rules

BR-API-034, BR-API-050, BR-API-051, BR-API-053, BR-API-058, BR-DATA-036 become implementable. LB-DATA-020
(`district_source`, defect fix `APPROVED`) depends on polygon assignment. No DEV involved.

## Acceptance criteria

- The ADR is accepted (or left `Proposed` with DEC-09 recorded as open).
- `php artisan migrate:fresh` on local PostgreSQL 18 with PostGIS succeeds; the same migration is a no-op on SQLite.
- `PostgisAvailableTest` passes locally and in CI once the image is approved; before that it is skipped with the
  named reason, never silently.
- `make dev-check` fails with a clear message on a machine without PostGIS.
- **[PT]** `SELECT extname FROM pg_extension` on `homi_staging_db` lists `postgis` (production record).

## Tests

- `PostgisAvailableTest` (`pgsql`): `it('has the postgis extension')`, `it('computes geography distance in metres')`
  (two synthetic Tashkent points ≈ 1 km apart within ±1 m), `it('uses ST_DWithin for a 5 km radius')`.
- `MigrationsRunTest` (existing suite, SQLite): `migrate:fresh` still succeeds (the migration skips on SQLite).
- Manual: `make dev-check` with and without the extension.

## Edge cases

- `CREATE EXTENSION` without privilege: migration fails loudly with the error; the PR description tells the
  production track to enable it first.
- Different PostGIS versions locally and on the server: the ADR records the minimum version (3.4+) and the functions
  used; the CI image pins the same major version.
- `migrate:fresh` on a database where other schemas use PostGIS: `IF NOT EXISTS` avoids failure.

## Security

The application role keeps no superuser or `CREATE EXTENSION` rights in staging and production (rule 9); the
extension is enabled by a separate privileged role **[PT]**. No data is involved.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` runs on PostgreSQL 18 + PostGIS; migration
reviewed against the postgis-geo-engineer checklist; data-impact note (extension creation needs a privileged role) in
the PR.
