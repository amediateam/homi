# ADR-0018: Mini App — App Router with a route per screen, server rendering through a session cookie with a header fallback

- Status: Proposed
- Date: 2026-11-14
- Deciders: developer (answer round of 2026-11-14); first developer (review of this PR)
- Source: `docs/migration/24-three-wave-strategy.md` §8.1 (DEC-44); `docs/migration/25-wave-1-plan.md` §3.1–§3.5, §3.10; `docs/migration/16-security-review.md` (SEC-REQ-007, SEC-REQ-031, Q-SEC-012); verbatim answers 7, 8, 19, 31 in `docs/migration/decisions/2026-11-14-developer-answers.md`; amends ADR-0003 and ADR-0013

## Context

`frontend/app` becomes HOMI's Mini App, rebuilt from the audit with the legacy interface (ADR-0016). Every screen is
per user. Telegram hands `initData` to the page in the browser only, so the first request of a launch has no session.
Telegram Web shows the Mini App inside a frame, where some browsers refuse cookies. ADR-0003 kept the web token in
memory and `localStorage`; ADR-0013 treated `frontend/app` as an SEO surface.

## Decision

- **Routes.** App Router with an address per screen, the locale as the first segment, filters as search parameters.
  Sheets and overlays are intercepting routes in parallel slots, so a direct load of their address still works;
  Back follows the visible legacy behaviour (`25` §3.2).
- **Rendering.** Pages are Server Components that fetch `/api/v1` with the user's session; interactive parts are
  Client Components that receive the server data as `initial` props. Without a session the page renders a shell,
  the client signs in, and the router refreshes (`25` §3.1).
- **Caching.** Nothing per user is cached. Only reference data is cached on the server, keyed by locale (`25` §3.1).
- **Telegram.** One adapter module owns every call to `window.Telegram.WebApp`, and it removes `initData` from the
  address before any analytics code runs (`25` §3.3).
- **Session** (`25` §3.4):
  1. The client posts `initData` to the app's own route `POST /bff/session`, which calls `POST /api/v1/auth/telegram`.
  2. The route sets the cookie `homi_session`: `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`, with the
     token's lifetime, and returns the token in the body.
  3. If the cookie comes back, the app is in **cookie mode**: Server Components fetch with it, and mutations are
     Server Actions.
  4. If not, the app is in **header mode**: the token stays in memory only, and Client Components fetch through
     `/bff/*` with `Authorization: Bearer`.
  5. One screen implementation serves both modes. A `401` signs in again with the current `initData`.
- **Data layer.** A server-only API module, an allow-listed `/bff/[...path]` pass-through, Server Actions for every
  mutation, and no query library (`25` §3.5).
- **Browser floor.** The Next.js default, with an «Обновите Telegram» screen from an inline boot script for older
  engines (DEC-44, `25` §3.3, §3.10).

**Amends ADR-0003.** Laravel still issues and checks Sanctum bearer tokens, and there are still no session cookies
between a client and Laravel. For the Mini App, the token lives in the `HttpOnly` cookie set by the app's own server,
or in memory in header mode. It never goes to `localStorage`, `DeviceStorage`, `CloudStorage` or the address
(SEC-REQ-007). A valid cookie of the same Telegram user skips the sign-in on a later launch (`25` §3.4).

This replaces the "memory + `localStorage`" storage of ADR-0003 and its consequence that Server Components cannot
read the token from a cookie. DEC-44 also replaces three parts of SEC-REQ-007: memory only, no cookies for
credentials, and a new exchange at each launch.

**Amends ADR-0013.** `frontend/app` is not an SEO/GEO/AEO surface: its pages are per user and dynamic (`25` §3.1).
Landing and SEO pages belong to `frontend/landing` (CF-013, DEC-38). The app's vhosts must allow framing by Telegram
Web (Q-SEC-012, `25` §3.10).

## Consequences

- Two session modes to build and test: both run in the end-to-end suite and are checked on staging in three
  browsers (RK-30).
- The CSP is nonce-based and set in `proxy.ts` (SEC-REQ-031). A nonce needs per-request rendering. WP-21 opens with
  a one-day spike that chooses between nonces with dynamic rendering and hashes for the inline scripts. Accepted
  ADRs are not edited, so its result becomes a short ADR that amends this one.
- The production track changes the app vhosts: the staging vhost sends `X-Frame-Options: SAMEORIGIN` today.
- Version-specific mechanics are to be verified in the installed documentation by WP-20: how `cacheComponents` and
  Suspense treat cookie reads, interception inside a route group, slot catch-alls beside `[locale]/[...rest]`, and
  the exact browser versions of the Next.js floor.

## Alternatives considered

- A client-only SPA with bearer tokens (ADR-0003 as written): rejected. The developer chose server-side requests
  through a cookie session (answer 8), and a token in `localStorage` is exposed to any XSS (SEC-REQ-007).
- A static export: rejected. Every screen is per user, and ADR-0013 already rules out `output: 'export'`.
- Cookie mode only: rejected. Telegram Web is supported with a fallback (answer 31).
