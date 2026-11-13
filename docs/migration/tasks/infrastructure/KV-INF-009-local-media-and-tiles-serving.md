# KV-INF-009 — Local `/media` internal location and PMTiles Range/CORS

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) |
| Complexity | M |
| Feature IDs | F-MEDIA-001, F-MEDIA-002 |
| Dependencies | KV-INF-002 (local legacy-host aliases); CF-012 and the ADR-0014 extension for listing photos (backend track, F-MEDIA-001); the legacy media route that answers `X-Accel-Redirect` (backend track, RES-001 / RES-002); a local PMTiles sample file (Q-API-053 decides the real one) |

## Goal

Locally, the legacy media URLs `/media/<number>/<n>.jpg` and `.s.jpg` on `kvadro-app.homi.loc` and
`kvadro.homi.loc` are answered by Laravel with `X-Accel-Redirect` to an `internal` nginx location reading
`backend/storage/app/private`, and a PMTiles file on `cdn.homi.loc` answers `Range` requests with `206` and CORS for the
Mini App origins only — the same shape the production track builds on staging and production (KV-INF-020,
KV-INF-021).

## Legacy reference

- RES-001, RES-002 (signed JPEG 800/480 on both kvadro hosts), RES-003 (vector tiles in `meta.tiles`); BR-API-054 …
  BR-API-056; client thumbnail regex works only on the relative form (`10` §2.1 CF-012).
- Path routing of `17` §3.2 rows `/media/*` and `/tiles/*`; tiles requirements `17` §7 row "Basemap PMTiles"
  (`Range` → `206` + `Content-Range`, CORS `GET`/`HEAD`/preflight for Mini App origins, expose `Content-Range`,
  `Content-Length`, `ETag`); SEC-REQ-024, SEC-REQ-032.
- HOMI local today: `infra/local/nginx/cdn.homi.conf` (public disk, no CORS), ADR-0012 (media on disk locally).

## Implementation

1. On the two legacy-host vhosts of KV-INF-002: `location ^~ /media/ { try_files $uri @laravel; }` handing the request to
   php-fpm, and `location ^~ /_protected/listing-photos/ { internal; alias <repo>/backend/storage/app/private/listing-photos/; }`
   (path relative to the `$approot` variable the vhosts already use; no machine path in the repository). Response
   headers set in the internal location: `Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400`,
   `X-Content-Type-Options: nosniff`.
2. Access log for `/media/` without the query string (custom `log_format` in a snippet), matching SEC-REQ-047.
3. `cdn.homi.conf`: `location ^~ /tiles/` serving `backend/storage/app/public/tiles/*.pmtiles` with
   `add_header Accept-Ranges bytes`, CORS from a `map $http_origin $tiles_cors` limited to
   `https://kvadro-app.homi.loc` and `https://app.homi.loc`, `Access-Control-Expose-Headers: Content-Range,
   Content-Length, ETag`, preflight `OPTIONS` → 204; headers repeated inside the location (nginx `add_header` is not
   inherited, `17` §14).
4. `scripts/dev/storage.sh`: create `storage/app/private/listing-photos/` and `storage/app/public/tiles/` and copy a
   small synthetic PMTiles fixture if present under `backend/tests/Fixtures/tiles/` (no third-party map data committed
   without a licence check, Q-API-053).
5. `scripts/dev/check.sh`: a "media/tiles" section with the curl checks of the Tests table (skipped with WARN when the
   backend media route is not merged yet).

## Files

- `infra/local/nginx/kvadro.homi.conf`, `infra/local/nginx/kvadro-app.homi.conf` (from KV-INF-002, changed)
- `infra/local/nginx/cdn.homi.conf`, `infra/local/nginx/snippets/media-log.conf` (new)
- `scripts/dev/storage.sh`, `scripts/dev/check.sh` (changed)

## API contract

- `GET https://kvadro-app.homi.loc/media/<number>/<n>.jpg?e=…&s=…` → Laravel validates the signature and answers
  `X-Accel-Redirect: /_protected/listing-photos/legacy/<sha256>/800.jpg`; nginx returns `200 image/jpeg`; a direct
  request to `/_protected/…` → 404.
- `GET https://cdn.homi.loc/tiles/<file>.pmtiles` with `Range: bytes=0-16383` and
  `Origin: https://kvadro-app.homi.loc` → `206`, `Content-Range`, `Access-Control-Allow-Origin` echoing the origin.

## Business rules

BR-API-054 … BR-API-056 (signed, expiring photo URLs, sizes 800/480) are enforced by the backend route; this task only
makes the bytes reachable through the internal location. Photos are never served from a public, immutable path
(SEC-029).

## Acceptance criteria

- With a valid signed URL from the backend route the image is served with `image/jpeg`; with a tampered `s` the
  backend answers 404 and nginx serves nothing.
- `/_protected/listing-photos/…` requested directly → 404.
- Ranged tile request → 206 with CORS for the two allowed origins; `Origin: https://evil.example` → no ACAO header.
- `make dev-check` shows the media/tiles section green once the backend route exists.

## Tests

| # | Command | Expected |
| - | ------- | -------- |
| 1 | `curl -sI "https://kvadro-app.homi.loc/media/<n>/1.jpg?<signed query from tinker>"` | `200`, `content-type: image/jpeg` |
| 2 | same with the last character of `s` changed | `404` |
| 3 | `curl -sI https://kvadro-app.homi.loc/_protected/listing-photos/legacy/x/800.jpg` | `404` |
| 4 | `curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-1023' -H 'Origin: https://kvadro-app.homi.loc' https://cdn.homi.loc/tiles/sample.pmtiles` | `206` |
| 5 | test 4 with `-I` | `access-control-allow-origin: https://kvadro-app.homi.loc`, `access-control-expose-headers` includes `Content-Range` |
| 6 | test 4 with `Origin: https://evil.example` | no `access-control-allow-origin` |
| 7 | `tail infra/local/logs/<kvadro-app access log>` after test 1 | no `e=` / `s=` in the line |

## Edge cases

- `.s.jpg` (480 px) and `.jpg` (800 px) map to different files; a missing rendition is a backend 404, not an nginx 500.
- Range requests beyond the file size → 416 from nginx; the Mini App's PMTiles reader handles it.
- Safari sends `Range` on `HEAD` for some media; `HEAD` is allowed in CORS.

## Security

SEC-REQ-024 (signature checked by Laravel before any byte is served), SEC-029 (no public immutable path for listing
photos), SEC-REQ-032 (tiles CORS limited to Mini App origins), SEC-REQ-047 (no signatures in access logs).

## Definition of done

`make dev-check` media/tiles section green on both machines, the vhost snippets reviewed by the first developer as the
template for KV-INF-020 and KV-INF-021, `docs/infrastructure/local-development.md` updated, PR reviewed by the other
developer.
