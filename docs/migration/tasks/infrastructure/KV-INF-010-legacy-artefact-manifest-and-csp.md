# KV-INF-010 — Legacy artefact manifest, CSP hashes and the integrity CI job

| Field | Value |
| ----- | ----- |
| Status | TODO (DEC-07 must confirm "original files with a SHA-256 manifest"; the captured legacy header Q-APP-016 is the baseline) |
| Owner | DevOps (track: development) |
| Complexity | M |
| Feature IDs | F-TMA-001, F-LANDING-007 |
| Dependencies | DEC-07, Q-APP-016, Q-SEC-012, Q-SEC-015; the manifests of KV-QA-010 (`docs/migration/data/legacy-miniapp-manifest.json`) and KV-QA-013 (`docs/migration/data/legacy-landing-manifest.json`); KV-INF-002 (local vhosts that include the generated header) |

## Goal

The CSP header for the unchanged legacy Mini App and landing is generated from the exact served `index.html` files
(sha256 of every inline script, `17` §14), written into an nginx snippet that every environment includes, and a CI job
fails when the snippet and the manifest disagree — so a changed artefact or a hand-edited header can never ship
silently.

## Legacy reference

- RES-008 (Mini App shell), RES-009 (landing), `05` boot stubs and inline boot script; requirement SEC-REQ-030; header
  table `17` §14 rows "Mini App origin, legacy artefacts" and "Landing host, legacy files"; CI gate `17` §11 row
  "Legacy artefact integrity"; freeze evidence `18` §3 (SHA-256 manifest of every served file).
- The legacy header itself is still to be captured (`curl -sI https://app.kvadro.app/` from an allowed machine,
  Q-APP-016); Telegram Web framing decides `frame-ancestors` (Q-SEC-012).
- Supply chain: SEC-REQ-049 (serve the production artefacts, do not rebuild from decompiled sources).

## Implementation

1. `scripts/legacy/csp-from-manifest.py` (Python standard library only, run with `python3 -I`): reads a manifest and
   the referenced `index.html` (from the local artefact copy of KV-INF-002, never from `$KVADRO_ROOT` directly in CI),
   extracts every inline `<script>` body, computes `'sha256-…'`, and writes:
   - `infra/legacy/csp/miniapp.csp` and `infra/legacy/csp/landing.csp` — one CSP header value each, built from the
     template of `17` §14 (`script-src 'self' <hashes> https://telegram.org`, `connect-src 'self'` + PostHog + tile
     host, `img-src 'self' data: blob:` + tile/OSM hosts, `worker-src blob:` if needed, `style-src 'self'
     'unsafe-inline'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors` per Q-SEC-012,
     `report-uri /api/csp-report`); hosts per environment are placeholders filled by nginx `map`s, not hard-coded;
   - the inline-script hashes back into the manifest (`inline_script_sha256` list).
2. `infra/local/nginx/snippets/legacy-csp-miniapp.conf` and `…-landing.conf` (generated from the `.csp` files) included
   by the KV-INF-002 vhosts; the production track copies the same generator output into its server templates
   (KV-INF-024).
3. CI: a job in `.github/workflows/tooling.yml` (development-owned workflow) runs the generator in `--check` mode against
   the committed manifests and `.csp` files: it fails when a hash in a `.csp` file is not in the manifest, when the
   manifest lists an inline script whose hash is missing from the `.csp`, or when the `.csp` contains `'unsafe-eval'`
   or a wildcard `script-src`.
4. Local: `scripts/dev/legacy-artefacts.sh check` (KV-INF-002) also runs the generator in `--check` mode against the
   real copied files, so a changed `index.html` fails `make dev-check`.
5. Record the captured legacy header (Q-APP-016) in `docs/migration/data/legacy-csp-captured.txt` when available and
   diff it in the PR against the generated one; anything looser needs a reason in the PR (SEC-REQ-030).

## Files

- `scripts/legacy/csp-from-manifest.py` (new)
- `infra/legacy/csp/miniapp.csp`, `infra/legacy/csp/landing.csp` (new, generated, committed)
- `infra/local/nginx/snippets/legacy-csp-miniapp.conf`, `infra/local/nginx/snippets/legacy-csp-landing.conf` (new)
- `.github/workflows/tooling.yml` (changed), `scripts/dev/legacy-artefacts.sh` (changed)
- `docs/migration/data/legacy-miniapp-manifest.json`, `docs/migration/data/legacy-landing-manifest.json` (hash field added)

`infra/legacy/` is a new top-level folder under `infra/` — approval needed (CLAUDE.md: no new top-level folders
without approval); fallback `scripts/legacy/csp/` if refused.

## API contract

Response header on the legacy hosts: `Content-Security-Policy: <generated value>` on `index.html` of the Mini App and
the landing pages; `/api/csp-report` receives reports (backend route, RES-015).

## Business rules

No product rule; SEC-REQ-030 is the requirement. The legacy client is served byte-identical (DEC-07), so the CSP may
only be as strict as its inline boot code allows (`style-src 'unsafe-inline'` stays for the boot screen).

## Acceptance criteria

- The generated Mini App CSP contains exactly the inline-script hashes of the frozen `index.html` and no
  `'unsafe-inline'` in `script-src`.
- Changing one byte of an inline script in the local copy fails `make dev-check` and, once the manifest is updated
  without regenerating, the CI job.
- A headless run of the reference-client scenarios (KV-QA-010/011) produces zero CSP reports locally.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `python3 -I scripts/legacy/csp-from-manifest.py --check` on the committed files | exit 0 |
| 2 | remove one hash from `miniapp.csp` and run 1 | exit 1 naming the script |
| 3 | add `'unsafe-eval'` to `landing.csp` and run 1 | exit 1 |
| 4 | `curl -sI https://kvadro-app.homi.loc/ \| grep -i content-security-policy` | the generated value |
| 5 | reference-client base scenario run, then count of `/api/csp-report` posts | 0 |

## Edge cases

- Lazy chunks are external files (`'self'`), only inline scripts need hashes.
- An urgent legacy release after the freeze (`18` §3) changes `index.html`: the manifest, `.csp` files and snippets are
  regenerated in one PR, and the parity scenarios re-run.
- If Telegram Web frames the Mini App (Q-SEC-012), `frame-ancestors` lists `https://web.telegram.org`; otherwise
  `'none'`.

## Security

SEC-REQ-030 (header from the exact files), SEC-REQ-049 (artefact integrity), SEC-025 (report sink limits live in the
backend route). No secrets; the PostHog project key in `connect-src` is a host name only.

## Definition of done

CI job green on `main`, local vhosts send the generated header, the captured legacy header diff recorded in the PR,
the first developer has the generator output for the server templates (KV-INF-024), PR reviewed by the other developer.
