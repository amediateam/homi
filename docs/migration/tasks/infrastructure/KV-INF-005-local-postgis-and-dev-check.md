# KV-INF-005 — PostGIS locally and in `make dev-check`

| Field | Value |
| ----- | ----- |
| Status | TODO (local part can start; it assumes the PostGIS ADR of DEC-09 is accepted) |
| Owner | DevOps (track: development) |
| Complexity | S |
| Feature IDs | F-MAP-002, F-PIPELINE-004 (and every geo query of F-FILTER-001, F-PIPELINE-005, F-RADAR-002 through them) |
| Dependencies | DEC-09, CF-014 (PostGIS ADR); related: KV-QA-001 owns the CI service image (needs approval (dependency change)), KV-DB-005 (`14` §8) owns the `CREATE EXTENSION` migration, and staging and production are KV-INF-018 |
## Goal

Every developer machine has the PostGIS extension available to the local PostgreSQL 18, `make dev-setup` installs it,
and `make dev-check` fails with a clear hint when the extension is missing or older than the version the ADR names.

## Legacy reference

- Legacy runs PostGIS 3.5.2 (`/ping` output TXT-BOT-085, `04` §3.3; `$KVADRO_ROOT/docs/about.md:396`); polygon,
  distance and nearest-neighbour rules BR-API-050 … BR-API-053, BR-API-058 depend on it.
- HOMI: no extension today (`10` §1.2 row PostGIS; `.ai/agents/postgis-geo-engineer.md:17`); local database rows of
  `17` §5 ("`brew install postgis` (development track; `make dev-check` verifies the extension)").
- Existing tooling: `scripts/dev/setup.sh` (Homebrew dependencies), `scripts/dev/check.sh` (PASS / WARN / FAIL lines),
  ADR-0008 (local environment).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` and ADR-0008.
2. `scripts/dev/setup.sh`: add `postgis` to the Homebrew formulae the setup installs (it announces the step like the
   others; no sudo needed). Record the installed version in the setup log.
3. `scripts/dev/check.sh`: new "PostGIS" section run against the local database from `backend/.env` without printing
   values: `SELECT default_version FROM pg_available_extensions WHERE name = 'postgis'` (available?) and, when the
   migration of KV-DB-005 has run, `SELECT extversion FROM pg_extension WHERE extname = 'postgis'` (installed?).
   PASS when available ≥ the ADR's minimum (3.5 proposed, parity with legacy), WARN when available but not yet
   created (migration pending), FAIL when unavailable with the hint `brew install postgis && make dev-check`.
4. `docs/infrastructure/local-development.md`: one paragraph "PostGIS" (install, how the extension is created by the
   migration, how to check the version); KI entry only if the install fails on a clean machine.
5. Do not touch CI: the PostGIS service image is KV-QA-001 and needs the first developer's approval (DEC-23).

## Files

- `scripts/dev/setup.sh`, `scripts/dev/check.sh` (changed)
- `docs/infrastructure/local-development.md` (changed)

## API contract

n/a — local tooling only; no HTTP surface.

## Business rules

None directly; it enables the geo rules BR-API-050 … BR-API-053 and the zone / metro distances of BR-BOT-027.

## Acceptance criteria

- On a machine without PostGIS, `make dev-check` prints a FAIL line naming the fix and exits 1.
- After `brew install postgis`, before the migration: WARN "available, not created"; after it: PASS with the version.
- `make dev-setup` on a clean machine installs PostGIS without manual steps.
- No database name, user or password appears in the check output.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `make dev-check` with the formula uninstalled (`brew uninstall postgis` on a test machine) | FAIL line, exit 1 |
| 2 | `make dev-check` after install, `php artisan migrate:status` without the PostGIS migration | WARN, exit 0 |
| 3 | after KV-DB-005's migration | PASS `PostGIS 3.x`, exit 0 |
| 4 | `make dev-check 2>&1 \| grep -E 'DB_PASSWORD\|password='` | no match |
| 5 | second developer machine (`docs/testing/verification-log.md` row) | same PASS line |

## Edge cases

- Homebrew PostgreSQL major upgrade: PostGIS must be built for the same major; the check compares
  `pg_available_extensions` of the running server, not the formula list.
- Another local project's database uses a different PostGIS version: the extension is per database; HOMI's check reads
  only HOMI's database.
- Tests on SQLite never need PostGIS; the `pgsql` Pest group (KV-QA-001) does.

## Security

No credentials printed (master prompt §6.6 rule kept by `check.sh`); no new network service; installing a Homebrew
formula is a local tool change, not a project dependency, and is noted in the PR.

## Definition of done

`make dev-check` shows the PostGIS line on both developer machines, `local-development.md` updated, PR reviewed by the
other developer.
