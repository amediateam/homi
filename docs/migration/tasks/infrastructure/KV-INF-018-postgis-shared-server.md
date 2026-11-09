# KV-INF-018 — PostGIS on the shared PostgreSQL server

| Field | Value |
| ----- | ----- |
| Status | TODO (needs DEC-09) |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | S |
| Feature IDs | F-MAP-002, F-PIPELINE-004 |
| Dependencies | DEC-09 (adopt PostGIS), the PostGIS ADR of CF-014; KV-DB-005 (`14` §8, the migration that runs `CREATE EXTENSION`); KV-INF-005 (same major version locally) |

## Goal

The PostgreSQL 18 server shared with other products offers PostGIS to `homi_staging_db` (before R1) and `homi_db`
(before the first Geo deploy), at a version agreed with the other databases on that server, so that the KV-DB-005
migration succeeds under the application role. Serves stages **S1** and **S2** (`18` §2) and `17` §15 item 3.

## Legacy reference

- Legacy runs PostGIS 3.5.2 (`/ping` output TXT-BOT-085, BOT-021; `$KVADRO_ROOT/docs/about.md:396`).
- Spatial needs: lasso polygon on feed, count, flow and map, distances to metro and centre, nearest-12/15 within 5 km
  for medians (BR-API-050…053, BR-API-058; `08` §1.7); CF-014 conflict and option A in `10` §3.14.
- HOMI today: no PostGIS anywhere (`10` §1.2); the server is shared (ADR-0011), so enabling an extension needs a
  privileged role (`17` §5).

## Implementation

1. Inventory (read-only): PostgreSQL minor version, available PostGIS packages, extensions already installed in the
   other products' databases, and whether any of them pins a PostGIS version. Record in
   `docs/infrastructure/deployment.md` § "PostgreSQL extensions".
2. Choose the PostGIS version: the newest 3.x packaged for the server's PostgreSQL 18 that does not force an upgrade
   of another database's extension; align local (KV-INF-005) and the CI image (KV-QA-001) with it. The OS package is
   a server change — **needs first developer approval** (and a maintenance note for the other products).
3. Install the package; in `homi_staging_db` run `CREATE EXTENSION IF NOT EXISTS postgis` as the privileged role, or
   grant the HOMI migration role the right to do it (preferred: the privileged role creates it once; the KV-DB-005
   migration then uses `CREATE EXTENSION IF NOT EXISTS` and is a no-op).
4. Verify `SELECT postgis_full_version()` under the application role and run one geography query from the
   KV-DB-005 test on staging.
5. Repeat for `homi_db` before the first deploy that contains geography columns; same approval.
6. Add the extension check to the deploy smoke tests (KV-INF-023) and to backups (KV-INF-026: restore drill must
   restore a database with the extension).

## Files

- `docs/infrastructure/deployment.md` § "PostgreSQL extensions" (new section)
- `infra/server/postgres/postgis.md` or a provisioning script (new, production-owned)

## API contract

n/a — database server provisioning; no HTTP surface.

## Business rules

- Spatial rules served: BR-API-050…BR-API-053, BR-API-058 (via F-MAP-002, F-PIPELINE-004).
- ADR-0011: no shared schemas with other products; the extension is created per database.

## Acceptance criteria

- `homi_staging_db` and later `homi_db` report the agreed PostGIS version under the application role.
- The KV-DB-005 migration runs `migrate --force` on staging without a privileged connection.
- No other database on the server changed its extension version (before/after inventory attached).

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `psql -c "SELECT postgis_full_version()"` as the HOMI role on `homi_staging_db` | the agreed version |
| 2 | `SELECT ST_DWithin('SRID=4326;POINT(69.24 41.31)'::geography, 'SRID=4326;POINT(69.25 41.31)'::geography, 1000)` | `t` |
| 3 | `php artisan migrate --force` on staging including KV-DB-005 | exit 0 |
| 4 | inventory diff of `pg_extension` across all databases | only HOMI databases changed |
| 5 | restore drill of KV-INF-026 | restored database answers check 1 |

## Edge cases

- The package manager offers only a PostGIS version different from local/CI: align local and the CI image instead of
  pinning the server to an old build.
- A future PostgreSQL major upgrade of the shared server needs a coordinated `ALTER EXTENSION postgis UPDATE`.
- If DEC-09 rejects PostGIS, this task becomes `DROPPED` and CF-014 option B moves to the backend track.

## Security

The privileged role is used only by the first developer on the server; the HOMI application role stays without
superuser rights. No data is touched. SEC-REQ-034 (separate roles per environment).

## Definition of done

Inventory and checks recorded in `docs/infrastructure/deployment.md`, `17` §15 item 3 ticked, KV-DB-005 green on
staging, the development track told the exact version in the PR (for KV-INF-005 and KV-QA-001).
