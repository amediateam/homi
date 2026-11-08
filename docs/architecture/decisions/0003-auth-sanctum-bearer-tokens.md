# ADR-0003: Authentication — Sanctum bearer tokens, Telegram as identity

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D2)
- Source: `docs/ai/reports/phase-0.md` §5, §6 (A1–A3 reuse candidates), §14

## Context

Users sign in with Telegram (Mini App `initData` or Login Widget); there are no passwords and no registration (`docs/about.md`). Three browser apps on sibling subdomains (`app.`, `arm.`, `landing`) plus the Telegram bot call the Laravel API. The reference codebase `app.uz` uses Sanctum personal access tokens (bearer in `Authorization`, token stored client-side, abilities per product, revoke-and-reissue refresh) and has a Next.js client (`frontend/lendo/lib/{api,auth}.ts`) built for that model. It has no SPA cookie/stateful setup.

## Decision

Sanctum **personal access tokens** for every client:

- `POST /api/v1/auth/telegram` verifies Telegram `initData` (or Login Widget hash) server-side and issues a token; tokens carry abilities (`app:*`, `arm:*` …) and an expiry; refresh = revoke + reissue.
- Clients send `Authorization: Bearer <token>`; no session cookies, no CSRF cookie flow, `supports_credentials=false` in CORS; allowed origins are the explicit app hosts per environment (no wildcard).
- `arm` users additionally need a role check (authorization layer decided with the first ARM feature; `spatie/laravel-permission` is a PROPOSED package).
- Token storage on the web is the client's concern (memory + `localStorage`, as in `app.uz`); the ADR accepts the XSS trade-off in exchange for one auth model across web, Mini App and bot.

## Consequences

- Reuse from `app.uz` (adapt, do not copy folders): `TokenController` flow, `Support/Telegram/InitDataVerifier.php` (READY), `frontend/lendo/lib/{api,auth}.ts` as the base of `frontend/packages/api-client`.
- `SESSION_DOMAIN`, `SANCTUM_STATEFUL_DOMAINS` and `statefulApi()` are **not** used; Sanctum's `EnsureFrontendRequestsAreStateful` stays off.
- Next.js Server Components cannot read the token from a cookie; data fetching that needs auth happens client-side or through a route handler that forwards the bearer. Public listing pages stay server-rendered without auth.
- Tests: token issuing, ability enforcement, expiry and Telegram hash verification must be covered before the first protected endpoint ships.

## Alternatives considered

- Sanctum SPA cookie sessions — rejected by the developer: team convention is bearer tokens; cookies add CSRF/cross-subdomain complexity for three hosts.
- Hybrid (cookies for web, tokens for bot) — rejected: two auth paths to test and document.
