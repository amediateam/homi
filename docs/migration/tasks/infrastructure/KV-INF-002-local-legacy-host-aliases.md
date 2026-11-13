# KV-INF-002 — Local legacy-host aliases `kvadro.homi.loc`, `kvadro-app.homi.loc`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) |
| Complexity | M |
| Feature IDs | F-COMPAT-001, F-MEDIA-001, F-MEDIA-003 |
| Dependencies | CF-008 (HOMI serves the legacy hosts); DEC-07 (which legacy artefacts are served); manifests of KV-QA-010 (`docs/migration/data/legacy-miniapp-manifest.json`) and KV-QA-013 (`legacy-landing-manifest.json`) |

## Goal

The local stack answers on two more hosts with the same path routing as staging and production (`17` §3.2):
`https://kvadro-app.homi.loc` (legacy Mini App files, legacy `/api/*`, `/media`, `/call`) and
`https://kvadro.homi.loc` (legacy landing mirror, `/media`, `/api/csp-report`, later the SEO pages). The unchanged
legacy Mini App can then call relative `/api/*` on its own origin against the local HOMI backend.

## Legacy reference

- The old client calls relative `/api/*`, `/media`, `/tiles`, `/call` on its own origin:
  `$KVADRO_ROOT/demo/app/vite.config.js:49-63`, `08` §1.1, CF-001, CF-008.
- Host matrix and path routing: `17` §3.1 (local aliases `PROPOSED`), `17` §3.2; `10` §4.6 (legacy surface only on
  legacy hosts, host middleware refuses others with `404 {"detail":"Not Found"}`), `10` §7 row "Local nginx".
- Existing conventions: `infra/local/nginx/*.homi.conf`, `snippets/{paths,tls,security-headers,laravel-fpm}.conf`,
  `scripts/dev/lib.sh:26-27` (`HOMI_HOSTS`, `HOMI_VHOSTS`), `scripts/dev/{hosts,certs,nginx}.sh`, ADR-0008.

## Implementation

1. Read ADR-0008, `docs/infrastructure/local-development.md` and `17` §3. The Laravel side (legacy route group,
   `EnsureLegacyHost`, `LEGACY_APP_HOSTS` / `LEGACY_SITE_HOSTS` config) belongs to the backend track (F-COMPAT-001);
   this task gives it hosts to bind to.
2. `scripts/dev/lib.sh`: add `kvadro.homi.loc kvadro-app.homi.loc` to `HOMI_HOSTS` and the two vhost names to
   `HOMI_VHOSTS`; `hosts.sh` then writes 8 entries, `certs.sh generate` issues the mkcert certificate with 8 SANs
   (sudo steps are announced as today).
3. `infra/local/nginx/kvadro-app.homi.conf` (new), following `hook.homi.conf`:
   - `/` and `/assets/*`, `/maplibre-gl.mjs`, favicons → static root `infra/local/legacy/miniapp/` (gitignored);
     `index.html` `Cache-Control: no-cache`, `/assets/*` one year immutable (`17` §3.2);
   - `^~ /api/`, `^~ /call/`, `^~ /media/` → `laravel-fpm.conf` (`client_max_body_size 64k` for `/api/`);
   - the internal photo location for `/media` comes from KV-INF-009;
   - include `security-headers.conf`; the legacy CSP header is added by KV-INF-010.
4. `infra/local/nginx/kvadro.homi.conf` (new): `/`, `/uz/`, `/en/`, `/privacy.html`, landing assets → static root
   `infra/local/legacy/landing/` (gitignored); `/uz` → `308 /uz/`, `/index.html` → `301 /` (RES-009);
   `/data/*.json` and `/img/snap/*` → the public disk prefixes `landing/data/`, `landing/snap/`; `^~ /media/` and
   `= /api/csp-report` → php-fpm; everything else 404 for now (SEO pages land with the frontend track, CF-010).
5. `scripts/dev/legacy-artefacts.sh sync|check` (new): copies the frozen Mini App build and landing mirror **from**
   `$KVADRO_ROOT` (path from `.ai/local.env`, read-only; nothing is built or run there) into `infra/local/legacy/`,
   then verifies every file against the SHA-256 manifests; `check` is called by `make dev-check`. Add
   `infra/local/legacy/` to `.gitignore`.
6. `scripts/dev/check.sh`: probes `https://kvadro-app.homi.loc/` → 200 with the manifest's `index.html` hash and
   `https://kvadro-app.homi.loc/api/unknown` → 404 JSON from Laravel (proves the fpm route), and
   `https://kvadro.homi.loc/uz` → 308.
7. `docs/infrastructure/local-development.md`: topology table and `dev-check` list updated; `environments.md` gains
   the two local hosts in a "Legacy hosts (migration)" row (local column only — staging/production cells are filled
   by the production track, KV-INF-016, KV-INF-029).

## Files

- `infra/local/nginx/kvadro-app.homi.conf`, `infra/local/nginx/kvadro.homi.conf` (new)
- `scripts/dev/lib.sh`, `scripts/dev/check.sh`, `scripts/dev/legacy-artefacts.sh` (new), `.gitignore`
- `docs/infrastructure/local-development.md`, `docs/infrastructure/environments.md` (local column only)

## API contract

n/a — routing only. Expected answers: `GET /` on `kvadro-app.homi.loc` → legacy `index.html`; `GET /api/*` →
Laravel legacy group (bare JSON, `{detail}` errors); `GET /api/*` on `api.homi.loc` must **not** reach the legacy
group (backend host binding).

## Business rules

- BR-API-017…BR-API-021 (legacy status-code and body invariants) are enforced by the backend; this task must not add
  nginx error pages or redirects on `/api/*` that would alter them.
- RES-009 landing redirects (`/uz` → `/uz/`, `/index.html` → `/`).

## Acceptance criteria

- `make dev-setup` on a clean machine produces 8 trusted hosts; `make dev-check` passes the three new probes.
- The legacy Mini App opened at `https://kvadro-app.homi.loc/?listing=1` in a desktop browser (outside Telegram) shows
  its outside-Telegram screen (F-TMA-002) loaded from local files, with every asset served 200.
- No legacy artefact is committed; the vhost files contain no machine path (paths come from `snippets/paths.conf`).

## Tests

| # | Command | Expected |
| - | ------- | -------- |
| 1 | `curl -sI https://kvadro-app.homi.loc/` | `200`, `Cache-Control: no-cache` |
| 2 | `curl -sI https://kvadro-app.homi.loc/assets/<entry from the manifest>` | `200`, `immutable` |
| 3 | `curl -s https://kvadro-app.homi.loc/api/nope` | Laravel 404 (body per the backend renderer) |
| 4 | `curl -sI https://kvadro.homi.loc/uz` | `308`, `Location: /uz/` |
| 5 | `scripts/dev/legacy-artefacts.sh check` after editing one copied file | FAIL naming the file |
| 6 | `curl -sI https://hook.homi.loc/api/meta` | `404` (hook vhost unchanged) |

## Edge cases

- A developer without `KVADRO_ROOT`: `legacy-artefacts.sh` WARNs and the static roots stay empty; `/api/*` still works.
- Re-running `certs.sh generate` replaces the certificate; browsers keep trusting the mkcert CA.
- nginx `add_header` inheritance: every location that sets `Cache-Control` re-includes `security-headers.conf`
  (`docs/ai/reports/phase-3-notes.md` §A).

## Security

- SEC-REQ-032: no CORS headers on the legacy origin (same origin); SEC-REQ-033 baseline headers via the snippet.
- The legacy tree is read-only (`docs/migration/README.md` rules); the sync script only reads from it.
- SEC-REQ-049: served files are the frozen artefacts verified by hash, never a rebuild (Q-SEC-015, DEC-07).

## Definition of done

`make dev-check` green on both machines with the new hosts; `make ci-backend` unaffected; docs updated; PR (scripts and
vhosts only, no application code) reviewed by the other developer.
