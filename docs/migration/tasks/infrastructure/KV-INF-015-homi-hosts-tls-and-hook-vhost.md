# KV-INF-015 — HOMI hosts, TLS and the hook vhost on staging and production

| Field | Value |
| ----- | ----- |
| Status | TODO (DNS for `homi.uz` and `*.staging.homi.uz` must exist — `docs/infrastructure/environments.md` "Not decided yet") |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | F-BOT-012 (and F-COMPAT-001, F-MEDIA-002 through `api.*` and `cdn.*`) |
| Dependencies | ADR-0011 (hosting topology), ADR-0013 (Next SSR behind nginx, ports), ADR-0008 conventions; the development track's local vhosts (`infra/local/nginx/*.conf`) as templates; KV-TG-001 (route bound to the hook host) |

> **Reconciliation with PR #8 (2026-11-09).** The production track already serves the HOMI hosts on staging and
> production with Let's Encrypt certificates (`infra/{production,staging}/nginx/`, `docs/infrastructure/deployment.md`).
> `hook.*` already answers 404 except `= /up` and `^~ /telegram/`, with `client_max_body_size 1m`. `homi.uz` and
> `app.homi.uz` proxy to the Next apps rather than answering 404 (step 1). What remains: check the deployed vhosts
> against the acceptance criteria, the server `.env` values of step 4, and the SEC-REQ-008 option. Extend the existing
> files instead of creating them.

## Goal

Staging and production serve the HOMI hosts of `17` §3.1 (`api.`, `hook.`, `cdn.`, `arm.`, and the unpublished
`homi.uz` / `app.` names) with publicly trusted certificates, and `hook.*` forwards only `/telegram/*` and `/up` to
Laravel with a 1 MB body limit — the precondition for any webhook registration on the staging bot (KV-INF-017) and
for the production switch (KV-INF-031).

## Legacy reference

- Host matrix `17` §3.1, TLS `17` §3.3, hook path routing `17` §3.2 last row; checklist `17` §15 item 1 (staging
  hosts and certificates; the legacy aliases are KV-INF-016).
- Webhook authenticity SEC-REQ-008 (body ≤ 1 MB, host binding), SEC-031; Telegram requires a publicly trusted
  certificate on the webhook host.
- Local templates: `infra/local/nginx/hook.homi.conf` (only `/telegram/` and `/up`), `api.homi.conf`, `cdn.homi.conf`,
  `snippets/security-headers.conf`, `snippets/tls.conf`.

## Implementation

1. `infra/staging/nginx/` and `infra/production/nginx/` (production-owned paths): vhosts for every HOMI host, derived
   from the local templates; `hook.*` keeps `location ^~ /telegram/` and `location = /up` only, everything else 404,
   `client_max_body_size 1m`, access log without request bodies; `api.*` with `client_max_body_size` per ADR-0012
   uploads; `homi.uz` and `app.homi.uz` answer 404 (or a holding page) until DEC-04.
2. Let's Encrypt certificate per host (HTTP-01), renewal timer, expiry alert input for KV-INF-025.
3. Ports for `next start` per ADR-0013 (3100–3102 production, 3200–3202 staging) behind the landing / app / arm vhosts.
4. Server `.env` (names only in docs): `APP_URL`, `TELEGRAM_WEBHOOK_URL` = `https://hook.<env>/telegram/webhook` (the
   Laravel route binds to that host, KV-TG-001), `CORS_ALLOWED_ORIGINS` per environment (SEC-REQ-032).
5. Optional defence in depth (SEC-REQ-008): an nginx `allow` list of the source ranges Telegram publishes for webhook
   delivery on `hook.*` — only if the first developer accepts maintaining it; never the only check.
6. `docs/infrastructure/environments.md` staging/production rows updated (production-owned rows).

## Files

- `infra/staging/nginx/*.conf`, `infra/production/nginx/*.conf` (new, production track)
- `docs/infrastructure/environments.md` (staging/production rows)

## API contract

- `POST https://hook.<env>/telegram/webhook` reaches Laravel; `GET https://hook.<env>/anything` → 404 from nginx.
- `GET https://api.<env>/up` → 200.

## Business rules

None; SEC-REQ-008 and ADR-0011 govern.

## Acceptance criteria

- Every HOMI host answers with a valid certificate (`openssl s_client` shows a chain to a public root, expiry > 30 days).
- `hook.*` exposes only `/telegram/*` and `/up`; a 2 MB POST is refused by nginx with 413.
- The webhook route answers 403 to an unsigned POST on `hook.*` and 404 on `api.*` (application check, KV-TG-001).
- `homi.uz` and `app.homi.uz` are not indexable before DEC-04 (`X-Robots-Tag: noindex` or 404).

## Tests

| # | Command (from an allowed machine) | Expected |
| - | --------------------------------- | -------- |
| 1 | `openssl s_client -connect hook.staging.homi.uz:443 -servername hook.staging.homi.uz </dev/null \| openssl x509 -noout -enddate` | date > 30 days ahead |
| 2 | `curl -s -o /dev/null -w '%{http_code}' https://hook.staging.homi.uz/` | `404` |
| 3 | `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' https://hook.staging.homi.uz/telegram/webhook` | `403` |
| 4 | `head -c 2000000 /dev/zero \| curl -s -o /dev/null -w '%{http_code}' -X POST --data-binary @- https://hook.staging.homi.uz/telegram/webhook` | `413` |
| 5 | same POST as 3 against `https://api.staging.homi.uz/telegram/webhook` | `404` |
| 6 | `curl -sI https://api.staging.homi.uz/up` | `200` |

## Edge cases

- Certificate renewal must not reload nginx in a way that drops in-flight webhook requests; a graceful reload is
  enough (Telegram retries non-2xx).
- `route:cache` on deploy captures the hook host from `TELEGRAM_WEBHOOK_URL`; a wrong value makes every update 404 —
  the post-deploy smoke test of KV-INF-023 posts an unsigned request and expects 403, not 404.
- Production `hook.homi.uz` exists before S2 but no webhook points at it until T0.4 (KV-INF-031).

## Security

SEC-REQ-008, SEC-031, SEC-REQ-033 (headers on every host, details KV-INF-024), SEC-REQ-032 (CORS origins without
staging or local values in production). Server `.env` values never leave the server (ADR-0011).

## Definition of done

`17` §15 item 1 (HOMI hosts part) ticked by the first developer for staging, the production hosts ready before
KV-INF-029, checks of the Tests table recorded in the production notes, `environments.md` rows updated.
