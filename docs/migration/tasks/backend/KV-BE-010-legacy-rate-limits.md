# KV-BE-010 — Legacy rate limiters and trusted proxies

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); trusted-proxy list of the real edge supplied by the production track **[PT]** (DEC-16) |
| Complexity | M |
| Feature IDs | F-COMPAT-002 |
| Dependencies | KV-BE-005, KV-BE-007 |

## Goal

Every legacy route class has its own named limiter keyed by the internal user id (anonymous routes by the real client
IP), over-limit answers are `429 {"detail":"rate_limited"}` with `Retry-After`, and the real legacy traffic profile —
debounced count/flow and the 30-request radar tab — passes without a `429`.

## Legacy reference

- Client request patterns: `count` 250 ms and `flow` 500 ms debounce with abort (`$KVADRO_ROOT/demo/app/src/features/filters/useLiveFeedStats.js:12-45`); the radar tab sends `feed` + `count` + `flow` per radar on every entry
  (`$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:42`, `:52`, `:59`; LB-API-038); no client cache
  (BR-API-142); 15 s timeout (BR-API-002; `client.js:24`); a `429` shows a generic error.
- Legacy limits unknown (Q-API-001); HOMI's single `api` limiter is 120/min
  (`backend/app/Providers/AppServiceProvider.php:62-83`); webhook limiter keyed by IP only (SEC-031).
- Decisions: CF-018 A (`10` §3.18), SEC-REQ-027 table (`16` §4.6), SEC-REQ-028 (quota is KV-BE-035), test plan `16`
  §5.7, `15` §3.1 and the "Rate limits" rows; F-COMPAT-002 acceptance in `09`.

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (rate limiting), `.claude/skills/laravel-testing/`,
   `.ai/agents/security-reviewer.md` (reviewer rule 8).
2. Tests first (below).
3. In `AppServiceProvider::configureRateLimiting()` add the named limiters (starting values `PROPOSED`, tuned from
   measured legacy traffic): `legacy-reads` 300/min, `legacy-meta` 30/min, `legacy-listing` 120/min, `legacy-call`
   30/h, `legacy-translate` 30/h, `legacy-share` 20/h, `legacy-lists` 60/min, `legacy-report` 30/day, `legacy-radar`
   30/min (radar writes and `PUT /api/settings`), `legacy-events` 60/min, keyed `user:<internal id>`; `legacy-anon` 60/min,
   `legacy-csp` 30/min, `legacy-media` 1 200/min, `legacy-call-page` 30/min, keyed by IP. Values come from
   `config/legacy.php` (`limits.*`) so staging can tune them without code.
4. Provide `App\Http\Middleware\Legacy\LegacyThrottle` (or reuse `ThrottleRequests` with the renderer mapping of
   KV-BE-005) and a route macro/constant list so later tasks write `->middleware('throttle:legacy-reads')`; the legacy
   group never uses the `api` limiter (verify `route:list -v` shows no `throttle:api` on legacy routes).
5. `legacy-events` is special (API-034, M7): excess is answered `204` and dropped, not `429` — implement the limiter
   name now; the drop behaviour belongs to the M7 events task (documented in `config/legacy.php`).
6. Trusted proxies: `bootstrap/app.php` `->withMiddleware(fn ($m) => $m->trustProxies(at: …))` from a new
   `TRUSTED_PROXIES` env list (CSV of CIDRs; empty locally) and the forwarded headers of the real edge **[PT]**;
   a forged `X-Forwarded-For` from an untrusted address is ignored.
7. Change the webhook limiter key to bot + IP (`telegram-webhook`, SEC-031) only if HANDOFF T1 has not already done it;
   otherwise leave a note.
8. Pint, PHPStan, tests.

## Files

- `backend/app/Providers/AppServiceProvider.php`, `backend/config/legacy.php`, `backend/bootstrap/app.php`
- `backend/routes/legacy.php` (limiter constants or a comment table for later tasks)
- `backend/tests/Feature/LegacyApi/LegacyRateLimitTest.php`, `backend/tests/Feature/Http/TrustedProxyTest.php` (new)
- `backend/.env.example` (`TRUSTED_PROXIES`, separate PR)

## API contract

Over the limit on any legacy route: `429 {"detail":"rate_limited"}` with `Retry-After: <seconds>` and the
`X-RateLimit-*` headers Laravel adds; body never empty. Under the limit: the route's own response. v1 keeps its
envelope `429`.

## Business rules

Kept: BR-API-002 (answer within 15 s — limits must not create retries), BR-API-142 (no client cache: the server must
absorb repeated reads). Defect fix context: LB-API-038 and LB-API-052 (the batched preview and caching are new-API or
KV-BE-032 work; here only the burst must pass).

## Acceptance criteria

- For each limiter: N requests allowed, request N+1 → `429 {"detail":"rate_limited"}` with `Retry-After`.
- Two users never share a bucket; the same user on two IPs shares one bucket; anonymous routes are per IP.
- A recorded radar-tab burst (10 radars × 3 requests within 2 s) plus a filter session (40 count and 20 flow requests in
  a minute) passes without a `429`.
- Behind a configured trusted proxy two client IPs get two buckets; `X-Forwarded-For` from an untrusted peer is ignored.

## Tests

`backend/tests/Feature/LegacyApi/LegacyRateLimitTest.php` (test-only routes in the `legacy` group, frozen clock, array
cache):
- dataset `it('limits :name at its configured value', …)` over every limiter with small test values from config.
- `it('renders 429 in the legacy dialect with Retry-After')`.
- `it('keeps buckets per user')`, `it('keys anonymous routes by ip')`.
- `it('lets the recorded radar tab burst through')` — replays a fixture of 30 requests.
`backend/tests/Feature/Http/TrustedProxyTest.php`: `it('derives the client ip only through trusted proxies')`.

## Edge cases

- Aborted count/flow requests still count; the 300/min budget absorbs 250 ms debounce for a minute of typing (≤ 240).
- `Retry-After` for the `legacy-report` daily limiter is up to 86 400 s; the old client ignores it.
- The limiter must run after authentication (user key) but before heavy work; for anonymous routes before anything.
- Redis unavailable: Laravel's limiter throws — the renderer answers `500 internal_error`; noted as an ops alert.

## Security

SEC-REQ-027 (all legacy rows), SEC-031 (webhook key), trusted proxies per SEC-REQ-027 text; the limiter key never
contains the Telegram id (SEC-REQ-047, SEC-REQ-036).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; `TRUSTED_PROXIES` announced and the production
track asked for the edge CIDRs (DEC-16) in the PR description; limiter values listed in `docs/infrastructure/environments.md` as tunables.
