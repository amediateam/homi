# KV-INF-016 — Staging legacy-host aliases and path routing

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | F-COMPAT-001, F-MEDIA-001 (and F-MEDIA-003, F-LANDING-009, F-TMA-001 through the routed paths) |
| Dependencies | KV-INF-015 (staging HOMI hosts and TLS), KV-INF-002 (local vhosts used as the template), KV-INF-010 (generated legacy CSP), KV-INF-009 (internal `/media` location pattern); DEC-07 (artefacts served); CF-008 |

## Goal

`kvadro-app.staging.homi.uz` and `kvadro.staging.homi.uz` route exactly like the production kvadro hosts will
(`17` §3.2): legacy Mini App artefacts and landing mirror as static files from their manifests, Laravel for `/api/*`,
`/media/*` (with `X-Accel-Redirect` into the private bucket), `/call/*` and `/api/csp-report`, so the S1 parity runs and
rehearsals R1–R3 exercise the real routing.

## Legacy reference

- CF-008 option A (`10` §3.9): the old client calls relative `/api/*`, so the legacy surface must answer on the Mini App
  origin; old `web_app` buttons keep their URL (`04` §6.3 item 3).
- Routing table `17` §3.2 (all rows for the Mini App origin and the landing host); staging names `17` §3.1;
  checklist `17` §15 item 1 (legacy aliases); R1 in `18` §4 (artefacts served from `kvadro-app.staging.homi.uz`).
- RES-001, RES-002, RES-005, RES-008, RES-009, RES-015.

## Implementation

1. `infra/staging/nginx/kvadro-app.conf` and `kvadro.conf` from the local templates of KV-INF-002, with the staging
   certificate (Let's Encrypt HTTP-01 on the staging names).
2. Static roots: release-independent directories `legacy/miniapp/<manifest-hash>/` and `legacy/landing/<hash>/`,
   deployed from the frozen artefacts and verified against the manifests (`scripts/dev/legacy-artefacts.sh check`
   logic reused by the deploy, KV-INF-023); `/assets/*` `Cache-Control: public, max-age=31536000, immutable`,
   `index.html` `no-cache`.
3. Laravel locations: `/api/` (`client_max_body_size 64k`, no CORS headers), `/media/` (php-fpm → `X-Accel-Redirect`
   → `internal` location proxying to the private bucket of KV-INF-020), `/call/` (access log without the token
   segment), `/api/csp-report` on both hosts.
4. Landing host: `/uz` → `308 /uz/`, `/index.html` → `301 /`, `/data/*.json` and `/img/snap/*` from the public prefixes
   written by the backend, SEO paths to `next start` (`frontend/landing`) once they exist, CSV paths static.
5. Headers: the generated CSP snippets of KV-INF-010 and the baseline of `17` §14 (repeated in every location).
6. Robots: staging hosts send `X-Robots-Tag: noindex, nofollow` on everything (staging must never be indexed).
7. The staging bot's Main Mini App URL points here (KV-INF-017).

## Files

- `infra/staging/nginx/kvadro-app.conf`, `infra/staging/nginx/kvadro.conf` (new, production track)
- the production copies are prepared in KV-INF-029 from the same templates

## API contract

| Path on `kvadro-app.staging.homi.uz` | Upstream |
| ------------------------------------ | -------- |
| `/`, `/assets/*`, `/maplibre-gl.mjs`, favicons | static legacy Mini App |
| `/api/*` | Laravel legacy route group (`{detail}` errors) |
| `/media/*` | Laravel → `X-Accel-Redirect` → private bucket |
| `/call/*` | Laravel call page |

## Business rules

BR-API-017 … BR-API-021 (legacy status-code invariants) are application rules; this task guarantees the requests
reach the legacy route group unchanged (no CORS, no envelope, same origin).

## Acceptance criteria

- The legacy Mini App opened from the staging bot loads, `GET /api/meta` answers from HOMI with staging `initData`.
- Every served artefact matches its manifest hash; a mismatch blocks the deploy step.
- `/media` URLs signed by the staging backend return `image/jpeg`; a tampered signature 404.
- Zero CSP reports during the R1 smoke scenarios; `X-Robots-Tag` present on every response.

## Tests

| # | Command | Expected |
| - | ------- | -------- |
| 1 | `curl -sI https://kvadro-app.staging.homi.uz/` | `200`, `content-security-policy` = generated value, `x-robots-tag: noindex, nofollow` |
| 2 | `curl -s https://kvadro-app.staging.homi.uz/api/meta` (no `initData`) | `401 {"detail":"unauthorized"}` (legacy dialect) |
| 3 | `curl -sI https://kvadro-app.staging.homi.uz/api/meta -H 'Origin: https://evil.example'` | no `access-control-allow-origin` |
| 4 | signed `/media/<n>/1.jpg` from the staging backend | `200 image/jpeg` |
| 5 | `curl -sI https://kvadro.staging.homi.uz/uz` | `308`, `location: /uz/` |
| 6 | manifest check on the deployed directory | all hashes equal |

## Edge cases

- The Telegram WebView caches `index.html` aggressively; `no-cache` plus the hashed asset names keep updates visible.
- Old `web_app` buttons on the staging bot carry the staging URL only; production buttons never point at staging.
- A legacy client calling `/api/landing/*` (RES-016, deprecated candidate) gets the legacy `404 {"detail":"Not Found"}`.

## Security

SEC-REQ-030 (CSP from the manifest), SEC-REQ-032 (no ACAO on legacy routes), SEC-REQ-033 (headers), SEC-REQ-024 and
SEC-REQ-026 (`/media`, `/call` capability URLs; logs without query strings and tokens), SEC-REQ-047.

## Definition of done

Both staging aliases live with the checks recorded, `17` §15 item 1 (legacy-alias part) ticked by the first developer,
the vhosts reviewed by the development track against the local templates, R1 can start.
