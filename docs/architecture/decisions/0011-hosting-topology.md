# ADR-0011: Hosting topology for staging and production

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint H)
- Source: `docs/ai/reports/phase-0.md` §7, §14; local nginx mirrors under `Server/nginx/<ip>/` (read-only reference)

## Context

The CDN guide's server `31.220.104.38` hosts nginx + MinIO (`s3.hc.uz`) and monitoring but no PHP. The developer confirmed the team's web server is `159.253.19.121` (nginx mirror with PHP vhosts for other products exists locally) and the PostgreSQL server is `5.45.127.98`. Domains follow the mandate: `homi.uz`, `app.`, `arm.`, `api.`, `cdn.`, `hook.homi.uz` and `*.staging.homi.uz`.

## Decision

| Role | Host | Notes |
|---|---|---|
| Web/app (nginx, php-fpm, Horizon, Next.js SSR via Node/pm2 or static export) | `159.253.19.121` | staging and production vhosts on the same host, separated by directory, user, `.env` and systemd units |
| PostgreSQL 18 | `5.45.127.98` | separate databases `homi_staging`, `homi_production`, separate roles; no shared schemas with other products |
| Object storage (MinIO behind nginx) | `31.220.104.38` / `https://s3.hc.uz` | buckets `homi-public`, `homi-private` per environment (`homi-staging-*`), per-environment IAM users; `cdn.homi.uz` vhost proxies the public bucket only |
| Redis | `159.253.19.121` (local to the app) | one instance per environment or separate DB index — decided in Phase 3 |
| TLS | certbot per host, as on the existing servers | `hook.homi.uz` needs a public cert for Telegram |

Rules: staging and production never share a writable bucket, database or Redis DB; secrets live only in server-side `.env` files managed by the developer; agents never receive production credentials; production deployments and webhook changes require explicit human approval (master prompt §15.1).

## Consequences

- `infra/staging/` and `infra/production/` hold nginx vhost templates, systemd units and deploy scripts derived from the conventions in the `159.253.19.121` mirror (read in Phase 3/6 by a read-only subagent).
- DNS for `homi.uz` must point `homi`, `app`, `arm`, `api`, `hook` to `159.253.19.121` and `cdn` to `31.220.104.38` (owner of DNS: developer).
- Cross-host latency between app and DB exists today for other products; measure before optimising.

## Alternatives considered

- Everything on the MinIO host — rejected: that host has no PHP stack and is operated as storage/monitoring.
- New dedicated VPS — deferred; the existing web server already runs the team's Laravel products.
- Laravel Cloud — not chosen; infrastructure is self-managed.
