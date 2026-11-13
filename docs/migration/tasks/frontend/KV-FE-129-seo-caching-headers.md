# KV-FE-129 — SEO caching, revalidation and HTTP headers

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); [PT] steps marked |
| Complexity | S |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-009, F-PIPELINE-008 |
| Dependencies | KV-FE-104 (CSP and security headers), KV-FE-114 (data reads); infrastructure KV-INF-024 (headers per vhost) **[PT]**; backend KV-BE-159 (`ETag`, `Last-Modified`, `snapshot_id`); decisions DEC-16 (Cloudflare), DEC-15 |

## Goal

SEO pages and the sitemap are served from cache and refreshed every 300 seconds like legacy, all three language
versions of a slice from the same data snapshot, with the legacy `Cache-Control` at the edge, `Last-Modified` and `ETag`
from the data rather than the render time, and the last good render kept when the API fails.

## Legacy reference

- LND-059 (HTTP headers, caching, CDN); RES-017 (SEO pages); `$KVADRO_ROOT/docs/seo-pages.md:36-37`, `:375-377`.
- Rules: BR-SEO-027 (`Cache-Control: public, max-age=0, must-revalidate, s-maxage=300`; `Last-Modified`; landing CSP;
  `Referrer-Policy: no-referrer`; `nosniff`; HSTS; sitemap `s-maxage=300`).
- Defects: LB-SEO-003 (language versions rendered at different times disagree) and LB-SEO-010 (`Last-Modified` = render
  time).
- Architecture: `10` §5.13 (static generation + 300 s revalidation; header from nginx), §5.14 (fetch failures fall back
  to the last cached render).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/{cdn-caching,how-revalidation-works,incremental-static-regeneration-cache-components}.md`,
   `03-api-reference/05-config/01-next-config-js/{cacheLife,headers,generateEtags}.md`, `04-functions/{cacheTag,revalidateTag}.md`.
2. `frontend/landing/next.config.ts`: a `cacheLife` profile `seo` = `{stale: 300, revalidate: 300, expire: 86400}` —
   revalidate matches the legacy 5 minutes; `expire` long enough that an API outage keeps serving the last render
   (the photo-signature window of 24–48 h bounds it: pages older than a day would carry expiring photo URLs).
3. Every SEO data read (KV-FE-114, KV-FE-124…KV-FE-128) uses `cacheLife('seo')` and the tags `seo:snapshot` and
   `seo:slice:<slice_key>`; tags never include the language, so ru/uz/en of a slice expire and refresh together
   (LB-SEO-003). Within one render all reads use the `snapshot_id` returned by `resolve`.
4. Edge header **[PT]**: Next emits `s-maxage=300, stale-while-revalidate=…` for these pages; the legacy value
   `public, max-age=0, must-revalidate, s-maxage=300` is set by nginx on the landing host for SEO paths and the sitemap
   (KV-INF-024 vhost config; `17` §14). Record the final header in the PR from a `curl -sI` on staging.
5. `Last-Modified` / `ETag` from data: the slice `lastmod` and `snapshot_id` are known only inside the render. Option A:
   `proxy.ts` (matched to SEO paths) reads the same cached `resolve` result and sets `Last-Modified` = `lastmod`,
   `ETag` = `"<snapshot_id>-<lang>"`; option B (if the docs show `proxy.ts` cannot share the page cache cheaply): turn
   off Next's render-based `ETag` (`generateEtags: false`) and let nginx answer conditional requests from the cached
   upstream response — then record LB-SEO-010 as partly fixed (sitemap `lastmod` correct, page header approximate) and
   tell the backend owner. Choose after reading the docs; write the choice in the PR.
6. Optional, off by default: an internal `POST /api/revalidate` route handler (secret header, landing host only) that
   the backend calls when a new snapshot is published → `revalidateTag('seo:snapshot')`; with Cloudflare kept (DEC-16)
   it does not purge the CDN, so the 300 s bound stays the guarantee (`cdn-caching.md`). Not needed for parity.
7. Security headers on SEO responses (`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, HSTS, CSP)
   come from KV-FE-104 / KV-INF-024; this task only verifies them on SEO paths.

## States and texts

| State | When | Behaviour |
| ----- | ---- | --------- |
| fresh | within 300 s of the last render | served from cache |
| revalidating | after 300 s | stale HTML served, background refresh with one snapshot for all languages |
| API failure | refresh throws | previous render kept until `expire`; error logged once per slice |
| cold miss + API failure | no cached render | localised error page with `noindex,follow` (KV-FE-114) |

No user-visible texts.

## Interaction

n/a.

## Telegram integration

n/a.

## Storage and analytics

n/a (server-side caching only).

## Files

- `frontend/landing/next.config.ts` (`cacheLife.seo`, `generateEtags` per step 5)
- `frontend/landing/proxy.ts` (SEO matcher, header step 5 option A; shared with the routing of KV-FE-100)
- `frontend/landing/app/api/revalidate/route.ts` (optional, step 6)
- `frontend/landing/e2e/seo-caching.spec.ts` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/resolve` and `/seo/slices/{key}` (KV-BE-159) return `snapshot_id`, `lastmod`, `ETag`,
`Last-Modified`; conditional requests answer `304` server-to-server. The optional revalidate hook is internal and
undocumented outside the PR.

## Business rules

- Kept: BR-SEO-027 (edge header and the 300 s bound).
- Defect fixes `APPROVED`: LB-SEO-003 (one snapshot per slice across languages), LB-SEO-010 (data-based
  `Last-Modified`, fully or partly per step 5).

## Acceptance criteria

- On staging, `curl -sI` of an SEO page shows `Cache-Control: public, max-age=0, must-revalidate, s-maxage=300`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, HSTS and the landing CSP.
- Two requests 10 s apart return the same HTML; a data change becomes visible within 300 s (+ one request).
- ru, uz and en of one slice fetched in the same minute show identical numbers.
- With the API stopped after a warm render, pages keep answering `200` with the previous HTML.
- `Last-Modified` equals the slice's data date (option A) or the deviation is recorded (option B).

## Tests

- E2E (mocked API with a controllable clock and snapshot id): staleness window, same-snapshot across languages, API
  outage after warm cache, cold miss with API outage → error page with `noindex`.
- Header check script in the PR for staging (KV-QA-014 adds it to the URL suite).

## Edge cases

- A snapshot published mid-render of the three languages: all reads in one render use the `snapshot_id` from `resolve`;
  the backend keeps the previous snapshot readable for at least one revalidation period.
- Clock skew between the landing and the API host: headers are taken from the API values, not the local clock.

## Security

The optional revalidate route requires a secret header compared in constant time and is not exposed through the CDN
cache; no personal data in cache keys (paths and slice keys only). SEC-REQ-033 headers verified.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); staging header capture attached to the PR; parity
gate G4 for F-SEO-009 and F-PIPELINE-008 (landing side) ticked; PR reviewed by the other developer.
