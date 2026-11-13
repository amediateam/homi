# KV-INF-008 — Trusted proxies and real client IPs for limiters

| Field | Value |
| ----- | ----- |
| Status | DROPPED (the application part is covered by the backend track's legacy rate-limit task — `TRUSTED_PROXIES`, `trustProxies()` in `bootstrap/app.php` and its test, feature F-COMPAT-002 / SEC-REQ-027; the server part — the real edge ranges in the production `.env` — is an acceptance item of KV-INF-032) |
| Owner | DevOps (track: development) |
| Complexity | S |
| Feature IDs | F-COMPAT-002 |
| Dependencies | CF-018; related: superseded by the backend rate-limit work (F-COMPAT-002) and KV-INF-032 (DEC-16) |
## Goal

Kept for the stable numbering. The goal — every limiter keyed by Telegram user or by the real client IP, never by an
edge or proxy address — is delivered by the two pieces named in the Status row. Nothing is left for the development
track's infrastructure work: locally php-fpm sits directly behind nginx, so `REMOTE_ADDR` is already the client
(`infra/local/nginx/snippets/laravel-fpm.conf`; only the Next dev proxy sets `X-Forwarded-For`,
`infra/local/nginx/snippets/proxy-next-dev.conf:5-7`).

## Legacy reference

- CF-018 consequence "the client IP is derived through a trusted-proxy list matching the real edge" (`10` §3.18);
  SEC-REQ-027 text; edge choice DEC-16 (`17` §7 "Edge").
- Legacy limits themselves are unknown (Q-API-001).

## Implementation

None in this task. Where the work lives:

1. Application: `TRUSTED_PROXIES` env list, `trustProxies(at: …)`, forged-`X-Forwarded-For` test — backend track
   (F-COMPAT-002).
2. Production and staging values: the edge ranges (Cloudflare or nginx only) written into the server `.env` and
   verified after the DNS/edge switch — KV-INF-032 acceptance criteria.
3. Name listed in `docs/infrastructure/environments.md` — KV-INF-003.

## Files

None.

## API contract

n/a — dropped.

## Business rules

n/a — dropped; SEC-REQ-027 is satisfied by the pieces above.

## Acceptance criteria

The task is closed when the backend rate-limit task is merged with its trusted-proxy test and KV-INF-032 records the
client-IP check on production.

## Tests

None here; the tests are `tests/Feature/Http/TrustedProxyTest.php` (backend) and the post-switch check of KV-INF-032.

## Edge cases

If DEC-16 drops Cloudflare and staging gains a load balancer later, the edge list changes only in the server `.env`
(production track); no development-track infrastructure change follows.

## Security

SEC-REQ-027 (bucket keys) and SEC-031 (webhook limiter keyed by bot + IP, KV-TG-001) depend on the real client IP;
the forged-header case is tested in the backend task.

## Definition of done

Status stays `DROPPED`; the `11b` §3.2 row says so; no PR.
