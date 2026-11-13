# KV-FE-104 — Landing and SEO CSP and security headers

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-08) |
| Owner | Frontend (track: development); [PT] steps marked |
| Complexity | S |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-LANDING-007, F-SEO-009 |
| Dependencies | KV-FE-006 (CSP spike), KV-FE-100; KV-INF-024 (headers per vhost **[PT]**), KV-BE-153 (`POST /api/csp-report`); decisions: DEC-08, Q-SEC-013, Q-LND-007 |

## Goal

The pages that `frontend/landing` renders (SEO pages from S2, the landing and privacy pages from S4) send one
Content-Security-Policy chosen by DEC-08 on the spike of KV-FE-006, with the analytics hosts allowed, `img-src`
narrowed, reports to the legacy `report-uri /api/csp-report`, and the other legacy headers of the SEO pages — without
a second, conflicting CSP header added by nginx.

## Legacy reference

- LND-034 (legacy CSP: `default-src 'self'`; `script-src 'self'` + two `sha256-…` + `https://eu-assets.i.posthog.com`;
  `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https:`; `font-src 'self' data:`;
  `connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com`; `worker-src 'self' blob:`;
  `child-src 'self' blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `report-uri /api/csp-report`;
  the same header on SEO pages), LND-059 / BR-SEO-027 (`Referrer-Policy: no-referrer`, `nosniff`, HSTS).
- RES-015 and URL-021 (`POST /api/csp-report`, backend KV-BE-153).
- Defect: LB-LND-009 (hash pinning, `img-src https:` too wide; fix `APPROVED`).
- Decision context: `10` §5.13 row "CSP" (DEC-08: start with `script-src 'self' 'unsafe-inline'` + analytics host,
  `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` as a recorded residual risk; hashes if the
  `experimental.sri` spike removes `'unsafe-inline'`; nonces rejected because they force dynamic rendering);
  SEC-REQ-031, SEC-REQ-033; `17` §14 rows "Landing host, SEO pages and the S4 landing".

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (nonce vs SRI
   sections) and `01-app/03-api-reference/05-config/01-next-config-js/headers.md`.
2. Take the option DEC-08 records from KV-FE-006: (a) baseline `'unsafe-inline'` for Next's inline bootstrap scripts,
   or (b) `experimental.sri` hashes if the spike proved them for the inline scripts too. Nonces are not used here.
3. Policy (option a, adjust per the decision): `default-src 'self'`; `script-src 'self' 'unsafe-inline'
   https://eu-assets.i.posthog.com`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data:` + the media host of the
   environment (signed `/media` is same-origin on `kvadro.app`; add `cdn.*` only if landing snapshots move there,
   DEV-012); `font-src 'self'`; `connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com`;
   `worker-src 'self' blob:`; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`; `frame-ancestors 'none'`;
   `report-uri /api/csp-report` plus `report-to` with a `Reporting-Endpoints` header pointing to the same path.
4. Set the header from Next (`headers()` in `frontend/landing/next.config.ts`, source `/:path*`) so it travels with the
   app and can be tested; the analytics host list comes from `NEXT_PUBLIC_POSTHOG_HOST` at build time.
5. Other headers from Next for HTML responses: `Referrer-Policy: no-referrer` (legacy SEO value, stricter than the
   SEC-REQ-033 default), `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(), camera=(),
   microphone=()` (the landing never asks for location).
6. **[PT]** KV-INF-024: nginx adds HSTS and must not add a second `Content-Security-Policy` for paths proxied to Next
   (two CSP headers intersect and would block the page). During S1–S3 the legacy landing files keep their own hashed
   header (infrastructure, KV-INF-010); this task covers only Next-rendered paths.
7. Inline scripts the landing needs (the display-version switch of KV-FE-109, JSON-LD which is not executed) must be
   allowed by the chosen option; record any hash in the PR.

## States and texts

n/a — headers. A violation is invisible to the user; it shows up as a report.

## Interaction

n/a.

## Telegram integration

n/a.

## Storage and analytics

CSP reports go to `POST /api/csp-report` (KV-BE-153: `204`, bounded body, counters only).

## Files

- `frontend/landing/next.config.ts` (`headers()`), `frontend/landing/lib/security-headers.ts` (policy builder, new)
- `frontend/landing/tests/security-headers.test.ts`, `frontend/landing/e2e/csp.spec.ts`

## API contract

- `POST /api/csp-report` (RES-015, KV-BE-153), anonymous, `application/csp-report` or `application/reports+json`,
  ≤ 16 KB → `204`.

## Business rules

- Kept: BR-SEO-027 header set (CSP as the landing, `Referrer-Policy: no-referrer`, `nosniff`, HSTS via nginx).
- Defect fix `APPROVED`: LB-LND-009 (no hash pinning of hand-written inline scripts, narrow `img-src`, report endpoint).
- DEC-08 decides `'unsafe-inline'` vs SRI; the residual risk of `'unsafe-inline'` is recorded in the ADR of KV-FE-006.

## Acceptance criteria

- Every HTML response of `frontend/landing` carries exactly one `Content-Security-Policy` header equal to the policy
  builder's output for the environment.
- A page load in Chromium and WebKit (Playwright) produces zero CSP violations on the landing, a district page, the rent
  index, the privacy page and the 404 page, with analytics enabled.
- An injected `<img src="https://evil.example/x.png">` in a test fixture is blocked and reported to `/api/csp-report`.
- Landing parity runs of KV-QA-013 record CSP violations; the count is zero for every scenario.

## Tests

- Unit: the builder for local, staging and production hosts; no `https:` wildcard in `img-src`; `frame-ancestors 'none'`.
- E2E (`csp.spec.ts`): listen to `securitypolicyviolation` on the pages above; one forced violation hits the report
  endpoint (mocked locally).

## Edge cases

- Browsers that ignore `report-to` use `report-uri`.
- The PostHog SDK version changes the asset path (`/static/<version>/array.js`): the host allowance covers it; with
  SRI (option b) the external script is not hashed — only Next's own scripts are.
- Development (`next dev`) needs `'unsafe-eval'` for React refresh: only when `NODE_ENV=development`.

## Security

SEC-REQ-031 (landing and SEO CSP model), SEC-REQ-033 (header set), SEC-REQ-022 (report endpoint bounded and
unauthenticated reports never stored as user data).

## Definition of done

`make ci-frontend` green; header tests and the zero-violation E2E green; KV-INF-024 updated with the "no second CSP"
rule **[PT]**; parity gate G4 for F-SEO-009 (header part) ticked (`15` §4); PR reviewed by the other developer and the
security reviewer.
