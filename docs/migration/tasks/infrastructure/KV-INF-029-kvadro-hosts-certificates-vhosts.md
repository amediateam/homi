# KV-INF-029 — Certificates and vhosts for `kvadro.app` and `app.kvadro.app`

| Field | Value |
| ----- | ----- |
| Status | TODO (needs custody of DNS or Cloudflare — KV-INF-014, Q-SEC-001, DEC-16) |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | F-COMPAT-001, F-LANDING-009 (and F-MEDIA-001, F-MEDIA-003, F-SEO-001 through the routed paths) |
| Dependencies | KV-INF-014 (custody), KV-INF-016 (staging vhosts as the template), KV-INF-024 (headers); DEC-15 (landing + SEO fully on HOMI or the SEO contingency), DEC-16; stage S2, runbook step T−72 h (`18` §6); `17` §15 item 11 |

## Goal

Three days before T0, HOMI's production web host holds valid certificates for `kvadro.app` and `app.kvadro.app` and
serves both hosts with the same routing that passed on staging, verified through a hosts-file override from an allowed
machine — while public DNS still points at the legacy origin.

## Legacy reference

- CF-008 option A (`10` §3.9): HOMI serves the legacy hosts from S2; old `web_app` buttons and every `t.me` /
  SEO link keep their URLs (`04` §6.3 item 3, `03b` §6.1).
- `17` §3.3 (HTTP-01 cannot reach HOMI before the DNS switch → DNS-01 or a Cloudflare origin certificate),
  `17` §3.2 (routing), `18` §6 T−72 h, §5.3 (SEO contingency: SEO paths proxied to the legacy origin for ≤ 14 days).

## Implementation

1. Certificate issuance (choose with DEC-16): (a) DNS-01 through the DNS provider's API with a token scoped to the
   `_acme-challenge` records (vault), or (b) a Cloudflare origin certificate if Cloudflare stays in front with
   "Full (strict)". Renewal automated; expiry alert in KV-INF-025.
2. `infra/production/nginx/kvadro-app.conf` and `kvadro.conf` copied from the staging vhosts of KV-INF-016: production
   names, production artefact directories, no `X-Robots-Tag: noindex` (the production SEO pages must stay indexable),
   production CSP snippets (KV-INF-010, KV-INF-024).
3. If DEC-15 chooses the contingency: a `location` group on `kvadro.app` proxying the SEO paths read-only to the legacy
   origin for at most 14 days, with a removal date in the runbook (`18` §5.3).
4. Verification from an allowed machine with `/etc/hosts` (or `curl --resolve`) pointing the two names at HOMI: the
   checks of the Tests table; record results in the production notes.
5. Keep the HOMI vhosts for these names disabled for real traffic until the GO step (they only answer when DNS or the
   edge points at HOMI anyway).

## Files

- `infra/production/nginx/kvadro-app.conf`, `infra/production/nginx/kvadro.conf` (new, production-owned)
- certificate renewal configuration under `infra/production/` (production-owned)

## API contract

Same routing as `17` §3.2 on the production names (see KV-INF-016's table).

## Business rules

Every public URL and deep link keeps working (`README.md` migration policy); SEO pages keep `s-maxage=300` and their
canonical/hreflang (`10` §3.10) — application concerns verified here only by status codes.

## Acceptance criteria

- `curl --resolve app.kvadro.app:443:<HOMI web host>` returns the frozen `index.html` with the expected CSP and a valid
  chain for `app.kvadro.app`.
- `kvadro.app` landing, three SEO pages per language, `sitemap.xml`, both CSV files answer `200` through the override
  (or the contingency proxy, if DEC-15 chose it).
- Certificates valid for > 30 days at T−72 h; renewal dry-run passes.

## Tests

| # | Command (allowed machine) | Expected |
| - | ------------------------- | -------- |
| 1 | `curl -sI --resolve app.kvadro.app:443:<web host> https://app.kvadro.app/` | `200`, CSP present |
| 2 | `openssl s_client -connect <web host>:443 -servername app.kvadro.app </dev/null \| openssl x509 -noout -subject -enddate` | subject `app.kvadro.app`, end date > 30 days |
| 3 | `curl -s --resolve app.kvadro.app:443:<web host> https://app.kvadro.app/api/meta` | `401 {"detail":"unauthorized"}` |
| 4 | `curl -sI --resolve kvadro.app:443:<web host> https://kvadro.app/sitemap.xml` | `200` |
| 5 | renewal dry-run (`--dry-run` of the ACME client) | success |

`<web host>` is the production web host of `docs/infrastructure/environments.md`.

## Edge cases

- The legacy operator cannot grant DNS API access and Cloudflare is dropped: no certificate before the switch is
  possible → S2 moves or a short HTTP-01 window right after the DNS switch is accepted by the product owner (users would
  see certificate errors — not recommended).
- `www.kvadro.app` or other names found in the SEO crawl (Q-SEO-001): add them to the certificate and redirect.
- HSTS: the legacy header's HSTS policy is kept unchanged (a longer `max-age` is not introduced at S2).

## Security

SEC-REQ-033 (headers), SEC-REQ-030 (CSP), certificate private keys only on the web host; the DNS token is scoped and
revoked after S3 if it belongs to the legacy account.

## Definition of done

`17` §15 item 11 ticked by the first developer at T−72 h, checks recorded, runbook step T−72 h marked done, DEC-15
outcome reflected in the vhosts.
