# KV-FE-033 — Mini App CSP and security headers

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-06) |
| Owner | Frontend (track: development); [PT] steps marked |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-001 |
| Dependencies | KV-FE-003 (ADR: option A or B), KV-FE-032 (boot shell carries the nonce or hashes); infrastructure KV-INF-024 (headers per vhost), KV-INF-010 (artefact manifest pattern for option B); backend KV-BE-153 (RES-015 report endpoint); decisions DEC-06, FD-2 (API host in `connect-src`), Q-SEC-012 |

## Goal

The HOMI Mini App is served with a strict per-request CSP (nonce + `'strict-dynamic'` under option A, build-time hashes
under option B) that still works on the oldest supported WebView, allows exactly the hosts the app talks to, lets
Telegram Web embed it if needed, reports violations, and carries the security headers of SEC-REQ-033.

## Legacy reference

- `03` §1.5 (legacy inline scripts allowed by sha256; header itself not in our material, Q-APP-016); TMA-001 port note
  (`connect-src` / `script-src` for `telegram.org`, nonces or hashes).
- Hosts the client uses: Telegram SDK (RES-007), PostHog (RES-006, host from `meta.analytics.host`, assets
  `eu-assets.i.posthog.com`), tiles (RES-003 from `meta.tiles`, OSM raster RES-004 `tile.openstreetmap.org`), photos
  (RES-001/RES-002 same origin `/media`), call page (RES-005 same origin), CSP reports (RES-015, URL-021).
- `10` §3.11 (CSP decision), §5.2 (header of option A); `16` SEC-REQ-030 (legacy transition client, for comparison),
  SEC-REQ-031, SEC-REQ-033; Q-SEC-012 (does Telegram Web frame the Mini App?).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` ("Adding a nonce with
   Proxy", "How nonces work", "Forcing dynamic rendering") and `03-api-reference/03-file-conventions/proxy.md`
   (matcher, request headers).
2. **Option A.** `frontend/app/proxy.ts`, matched only to the Mini App document routes (exclude `/_next/static`,
   `/_next/image`, `/favicon.*`, `/api`, `/media`, `/call`, `/tiles`): generate a fresh nonce
   (`crypto.randomUUID()` → base64), set `x-nonce` on the request and the CSP on the response:

   ```text
   default-src 'self';
   script-src 'self' 'nonce-<n>' 'strict-dynamic' https://telegram.org;
   style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob: <media/tile hosts> https://tile.openstreetmap.org;
   font-src 'self' data:;
   connect-src 'self' <API host if FD-2 = B> <tile hosts> https://eu.i.posthog.com https://eu-assets.i.posthog.com;
   worker-src 'self' blob:; child-src 'self' blob:;
   object-src 'none'; base-uri 'none'; form-action 'self';
   frame-ancestors <'none', or Telegram Web origins per Q-SEC-012>;
   report-uri /api/csp-report; report-to csp
   ```

   `'unsafe-eval'` only when `NODE_ENV === 'development'` (Next guide). `'self'` and `https://telegram.org` stay in
   `script-src` as the fallback for engines that ignore `'strict-dynamic'` (CSP2 browsers then use the nonce and the
   host list). `style-src 'unsafe-inline'` is a recorded residual risk (the boot screen and gesture transforms set
   inline styles; legacy has the same, SEC-REQ-030); move to nonce-only styles once the boot screen uses CSSOM only.
3. Host lists come from environment variables (`NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_API_URL`, a new
   `MINIAPP_CSP_EXTRA_HOSTS` announced in the PR and added to `.env.example` by KV-INF-003's process) — never from
   `meta` at request time (the header is built before meta exists).
4. The `(miniapp)` layout already reads the nonce (KV-FE-032), which forces dynamic rendering; the document response is
   `Cache-Control: no-store` so a cached HTML can never carry a stale nonce.
5. **Option B.** No proxy: a build step computes SHA-256 of the two inline scripts and the `nomodule` script and writes
   an nginx include with `script-src 'self' 'sha256-…' 'sha256-…' 'sha256-…' https://telegram.org` and the same other
   directives; a CI check recomputes the hashes from the built `index.html` (pattern of KV-INF-010).
6. Static security headers (SEC-REQ-033) are set by nginx (KV-INF-024 **[PT]**): HSTS, `X-Content-Type-Options:
   nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with `geolocation=(self)` (the
   Mini App uses it, TMA-035) and everything else off. This task delivers the exact list and a header snapshot test.
7. Q-SEC-012: open the dev Mini App in Telegram Web with `frame-ancestors 'none'`; if it is framed, allow only the
   Telegram Web origins observed (`https://web.telegram.org` and its subdomains); record the answer in the ADR.
8. Report endpoint: `report-uri /api/csp-report` on the Mini App origin, backed by KV-BE-153 (bounded body, sampled).

## States and texts

n/a — no UI. A blocked resource surfaces only through the error journal (KV-FE-034) and CSP reports.

## Interaction

n/a — no UI.

## Telegram integration

TMA-001 (SDK host in `script-src`), TMA-035 (`Permissions-Policy: geolocation=(self)`), TMA-043 (Telegram Web
framing, Q-SEC-012).

## Storage and analytics

- Storage: none.
- Analytics: PostHog ingestion and asset hosts must be in `connect-src`/`script-src`-via-`strict-dynamic`; a violation
  for them is a release blocker (dashboards break silently).

## Files

- `frontend/app/proxy.ts` (option A, new); `frontend/app/lib/security/csp.ts` (directive builder, new)
- `frontend/app/boot/hash-inline.ts` (option B only)
- `frontend/app/tests/security/csp.test.ts`, `frontend/app/e2e/csp.spec.ts`
- `infra/` nginx include (option B, with KV-INF-024 **[PT]**)

## API contract

- RES-015 / URL-021 `POST /api/csp-report` (`application/csp-report` or `application/reports+json`) → `204`; body
  bounded by the server (SEC-REQ-022).

## Business rules

n/a — no product rule; security requirements below.

## Acceptance criteria

- Every Mini App document response has a CSP with a fresh nonce (two requests → two nonces) and `no-store`.
- E2E runs of the core flows (boot, feed, map with tiles, listing with photos, share, PostHog load) report **zero**
  violations; a test-only page injecting an inline script without the nonce is blocked and reported (SEC-REQ-031).
- On the oldest WebView of the decided floor (KV-FE-174) the app boots with the same header.
- Header snapshot per route class (document, static asset, `/api/*`, `/media/*`, `/call/*`) matches SEC-REQ-033.
- `frame-ancestors` matches the Q-SEC-012 finding.

## Tests

- Unit (`csp.test.ts`): directive builder per environment (dev adds `'unsafe-eval'`, production does not; FD-2 = A vs B
  `connect-src`); host parsing rejects non-`https` values.
- E2E (`csp.spec.ts`, with KV-FE-170): violation listener (`securitypolicyviolation`) stays silent across the core
  flows; the injected-script page triggers exactly one report.

## Edge cases

- `meta.tiles` points to a host not in the list (configuration drift): the map falls back to raster and the violation
  is reported — the environment check of `make dev-check` should compare both values (follow-up for KV-INF-024).
- PostHog switches its asset host: covered by `'strict-dynamic'` for scripts loaded by allowed scripts, but
  `connect-src` must be updated — documented in the runbook.
- Browsers without `report-to`: `report-uri` remains.

## Security

SEC-REQ-031 (nonce + `'strict-dynamic'`), SEC-REQ-033 (headers), SEC-REQ-021 (no `dangerouslySetInnerHTML` besides the
generated boot scripts, which contain no user data), SEC-REQ-030 (the legacy transition client keeps its own hash CSP;
this task never changes it).

## Definition of done

`make ci-frontend` green; unit and E2E tests green (with KV-FE-010); the Q-SEC-012 answer and the header list recorded
in the CF-011 ADR (KV-FE-003); nginx part delivered with the production track (KV-INF-024); parity gate G4 for
F-TMA-001 ticked together with KV-FE-032; PR reviewed by the other developer and by the security review.
