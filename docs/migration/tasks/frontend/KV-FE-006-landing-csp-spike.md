# KV-FE-006 — Landing and SEO CSP spike: SRI vs `'unsafe-inline'`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); security review |
| Complexity | S |
| Milestone | FE-0 (M9, decision input for S2) |
| Feature IDs | F-LANDING-007, F-SEO-009 |
| Dependencies | — ; decides DEC-08 (FD-5) and answers Q-SEC-013; fixes LB-LND-009; feeds KV-FE-104 |

## Goal

A short spike shows which CSP the statically generated landing and SEO pages can carry without giving up the 300 s
cache: Next's experimental SRI (hashes at build time, no `'unsafe-inline'` for scripts) or the `'unsafe-inline'`
baseline with a recorded residual risk. Nonces are out: they force dynamic rendering and defeat `s-maxage=300`
(`10` §5.13).

## Legacy reference

- Legacy header (LND-034, from the prod fingerprint `$KVADRO_ROOT/demo/landing/tools/sync/release.json`):
  `default-src 'self'`; `script-src 'self'` + two `sha256-…` + `https://eu-assets.i.posthog.com`; `style-src 'self'
  'unsafe-inline'`; `img-src 'self' data: blob: https:`; `font-src 'self' data:`; `connect-src 'self'
  https://eu.i.posthog.com https://eu-assets.i.posthog.com`; `worker-src 'self' blob:`; `child-src 'self' blob:`;
  `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `report-uri /api/csp-report`. SEO pages send the same
  header (LND-059, `$KVADRO_ROOT/docs/seo-pages.md:375-377`).
- Defect: LB-LND-009 (inline scripts pinned by sha256; fix: nonces or build-time hashes, narrow `img-src`, keep a
  report endpoint with `report-to` + `report-uri`).
- Decision: DEC-08, `10` §5.13 "CSP" row; SEC-REQ-031 (landing part), SEC-REQ-033; Q-SEC-013.
- Next docs: `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` — nonces need
  dynamic rendering (`:38`, `:181`); "Subresource Integrity (Experimental)" with `experimental.sri.algorithm`
  (`:456-538`).

## Implementation

1. Read the CSP guide and `…/05-config/01-next-config-js/headers.md`; note that the landing app runs with
   `cacheComponents: true`.
2. On a spike branch of `frontend/landing`: one static page under `app/[lang]/` with the shapes the real pages will
   carry — JSON-LD (`<script type="application/ld+json">`, not executed), the PostHog loader script from
   `eu-assets.i.posthog.com` (LND-031), a small client component (language menu), and `generateStaticParams` for
   `ru`, `uz`, `en`.
3. Build (a): `experimental.sri: {algorithm: 'sha256'}`, header without `'unsafe-inline'` for scripts. Build (b): the
   `'unsafe-inline'` baseline of DEC-08. Serve both with `next start` behind the local nginx (`https://homi.loc`).
4. For each build, in Chrome, Firefox and Safari: list inline scripts Next still emits (RSC payload, bootstrap) and
   whether the CSP blocks any of them; confirm the page stays statically generated (`next build` output marks it static
   / prerendered); confirm `integrity` attributes on every script tag in (a); count CSP violations reported to a local
   `report-uri` stub.
5. Check the PostHog loader under (a): an external script without `integrity` must still be allowed by host; record the
   directive.
6. Write `docs/migration/spikes/KV-FE-006-landing-csp.md`: findings, the proposed header text for the chosen build,
   and the residual risk statement if (b) wins ("no user input is rendered; API strings are text only, SEC-REQ-021").
7. Hand the result to the DEC-08 deciders (developer + security review); KV-FE-104 implements it.

## States and texts

n/a — spike.

## Interaction

n/a.

## Telegram integration

n/a (landing).

## Storage and analytics

The PostHog loader is part of the test page; no real key is used (a dummy key, requests blocked locally).

## Files

- Spike branch only: `frontend/landing/app/[lang]/…`, `frontend/landing/next.config.ts` (SRI flag) — not merged.
- Merged: `docs/migration/spikes/KV-FE-006-landing-csp.md` (new).

## API contract

n/a. The report endpoint is RES-015 (`POST /api/csp-report`, backend).

## Business rules

n/a.

## Acceptance criteria

- The report says whether build (a) blocks any Next inline script in the three browsers, whether the pages stay
  static, and gives the exact header for the recommended build.
- `img-src` is narrowed from legacy `https:` to `'self' data:` plus the media host(s) (LB-LND-009 fix) and the report
  shows the page still loads its images.
- DEC-08 has an answer recorded in `10` §8 by its owner.

## Tests

Manual matrix (3 browsers × 2 builds) with the violation counts; repeated after a `next` patch upgrade if the
experimental flag changes.

## Edge cases

- `experimental.sri` changes or disappears in a Next patch release: the report names the fallback (b).
- JSON-LD must never need `'unsafe-inline'` (not executed); confirm no browser reports it.

## Security

SEC-REQ-031 (landing part: no nonces on cached pages), SEC-REQ-033 (`frame-ancestors 'none'`, `nosniff`,
`Referrer-Policy`), SEC-REQ-021 (no other `dangerouslySetInnerHTML`).

## Definition of done

Report merged; DEC-08 answered; spike branch deleted; KV-FE-104 unblocked; PR reviewed by the other developer and the
security reviewer.
