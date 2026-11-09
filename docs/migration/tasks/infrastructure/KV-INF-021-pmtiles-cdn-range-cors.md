# KV-INF-021 — PMTiles on `cdn.*` with Range and CORS

| Field | Value |
| ----- | ----- |
| Status | TODO (tile source needs Q-API-053) |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | S |
| Feature IDs | F-MEDIA-002 |
| Dependencies | KV-INF-009 (local equivalent and the header set to mirror), KV-INF-015 (`cdn.staging.homi.uz`, `cdn.homi.uz` vhosts), KV-INF-020 (public bucket); Q-API-053 (tile source, size, licence, update process) |

## Goal

The basemap for Uzbekistan is one PMTiles file on the public bucket, served from `cdn.*` so that the legacy Mini App
(MapLibre) can read it with HTTP `Range` requests from the legacy Mini App origin only: `206` with correct
`Content-Range`, CORS limited to the Mini App origins, and a cache that is safe for ranged requests. The URL is
delivered in `meta.tiles` (`MAP_TILES_URL`). Serves stage **S1** (`18` §2) and `17` §15 item 5 (tiles part).

## Legacy reference

- RES-003 (vector tiles in `meta.tiles`), RES-004 (OSM fallback), F-MEDIA-002; the client reads tiles via the
  `pmtiles` protocol (`05`, `08` §3); the tile source is unknown (Q-API-053).
- Target: `10` §4.14 "Map tiles", `10` §4.15 row "Basemap tiles", `17` §7 row "Basemap PMTiles" (Range → 206,
  CORS for the Mini App origins only, `proxy_cache` keyed on the range or `slice`), SEC-REQ-032 (tiles CORS).
- Storage host facts: CORS is global `*` in MinIO, so nginx on `cdn.*` sets the narrower headers
  (`docs/ai/reports/phase-3-notes.md` §A).

## Implementation

1. With Q-API-053 answered (or a Protomaps extract chosen by the product owner with its licence recorded), upload
   `tiles/uzbekistan-<date>.pmtiles` to the environment's public bucket with `Content-Type: application/octet-stream`
   (or `application/vnd.pmtiles`) — a new file name per update, never an overwrite.
2. `cdn.*` vhost: a `location /tiles/` that proxies the public bucket; hides the upstream CORS headers and sets
   `Access-Control-Allow-Origin` from a `map` of allowed origins (`kvadro-app.staging.homi.uz` on staging,
   `app.kvadro.app` and `app.homi.uz` once published on production), `Access-Control-Allow-Methods GET, HEAD, OPTIONS`,
   `Access-Control-Allow-Headers Range, If-Match`, `Access-Control-Expose-Headers Content-Range, Content-Length, ETag`,
   `Vary: Origin`; answers `OPTIONS` with `204`.
3. Caching: either the nginx `slice` module (`slice 1m; proxy_cache_key $uri$slice_range; proxy_set_header Range
   $slice_range;`) or `proxy_cache_bypass $http_range` — choose by a measurement on staging; `Cache-Control: public,
   max-age=31536000, immutable` is acceptable here because the file name is dated and the content is not personal.
4. Set `MAP_TILES_URL` per environment; the development track's `meta` serializer (F-MEDIA-002) emits it.
5. Update procedure (document in `docs/infrastructure/cdn.md`): upload new dated file → change `MAP_TILES_URL` →
   deploy → remove the old file after 7 days.
6. Any nginx module or package not yet on the host (e.g. `slice`) — **needs first developer approval**.

## Files

- `infra/staging/nginx/cdn.staging.homi.uz.conf`, `infra/production/nginx/cdn.homi.uz.conf` (tiles location)
- `docs/infrastructure/cdn.md` § "Basemap tiles" (source, licence, update steps)

## API contract

`GET|HEAD https://cdn.<env>/tiles/uzbekistan-<date>.pmtiles` with `Range: bytes=a-b` → `206`, `Content-Range`,
`Accept-Ranges: bytes`, CORS headers for allowed origins; without `Range` → `200`; `OPTIONS` preflight from an allowed
origin → `204`; other origins → no `Access-Control-Allow-Origin`.

## Business rules

RES-003 contract (`meta.tiles` carries the URL), SEC-REQ-032 (tiles allow only the Mini App origins and expose
`Content-Range`). No user-visible change from legacy (DEV none).

## Acceptance criteria

- The legacy Mini App on staging renders the map from the HOMI tile URL with zero CORS errors in the console.
- Ranged responses from cache and from origin return the same bytes for the same range.
- A request with `Origin: https://evil.example` gets no `Access-Control-Allow-Origin`.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `curl -sI -H 'Range: bytes=0-16383' -H 'Origin: https://kvadro-app.staging.homi.uz' <url>` | `206`, `Content-Range: bytes 0-16383/<size>`, ACAO = that origin, `Access-Control-Expose-Headers` includes `Content-Range` |
| 2 | same with `Origin: https://evil.example` | `206` without ACAO |
| 3 | `curl -s -X OPTIONS -H 'Origin: …' -H 'Access-Control-Request-Headers: range' <url> -o /dev/null -w '%{http_code}'` | `204` |
| 4 | two ranged requests through the cache, compare `sha256sum` with a direct storage read | equal |
| 5 | KV-QA-012 map scenarios on staging | pass |

## Edge cases

- MinIO's global `*` CORS headers leak through if not hidden — `proxy_hide_header Access-Control-*` is required.
- Multi-range requests (`bytes=0-1,5-6`): MapLibre does not use them; nginx may answer `200` — acceptable.
- Telegram Web runs the Mini App in a frame on `web.telegram.org`; the request origin is still the Mini App origin.

## Security

SEC-REQ-032 (narrow CORS), SEC-REQ-033 (`nosniff`, HSTS on `cdn.*`). The file holds no personal data; the licence
obligation (attribution) is shown in the map UI per Q-API-053.

## Definition of done

Tile file and vhost live on staging (production before S2), checks recorded in `docs/infrastructure/cdn.md`, G9
evidence for F-MEDIA-002 noted, `17` §15 item 5 (tiles part) ticked by the first developer.
