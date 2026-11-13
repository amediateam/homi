# KV-FE-100 — Landing routing: language prefixes, trailing slash, legacy redirects, localised 404

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); [PT] steps marked |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-001, F-SEO-012, F-LANDING-001, F-LANDING-009 |
| Dependencies | — (first FE-3a task); nginx path routing of the legacy host is infrastructure (KV-INF-016 **[PT]**); decisions: DEV-038 `PROPOSED`, Q-LND-006, CF-010 |

## Goal

`frontend/landing` owns the URL shape of `kvadro.app` exactly as legacy: ru without a prefix, `/uz/` and `/en/`
prefixes, a `308` to the slashed URL, `/index.html` → `301 /`, case-sensitive `404`s rendered as a localised HTML page
with `noindex,follow`, and the `?lang=` handling switchable between legacy (DEV-038 off) and the redirect (DEV-038 on).
Every later landing and SEO task mounts its pages under this skeleton.

## Legacy reference

- LND-038 (landing routing: `/`, `/uz/`, `/en/` HTML; `/uz`, `/en` → `308`; `/index.html` → `301 /`; unknown path →
  JSON `404` on the local mirror, UNVERIFIED for prod, Q-LND-006), LND-055 (SEO 404 page), LND-002, LND-027, LND-029.
- URL-001…URL-005, URL-007, URL-039 (`03b` §6.2); BR-SEO-004 (routing table), BR-SEO-032 (404 page), BR-LND-004
  (language order, path step).
- Defects and deviations: LB-LND-013 (JSON 404 → HTML 404, `APPROVED` policy), LB-LND-002 → DEV-038, LB-LND-003
  (`<base href="../">` text substitution → one locale route, `APPROVED` policy).
- Evidence: `$KVADRO_ROOT/demo/landing/tools/lib/server.mjs:1-3`, `:39-66`; `$KVADRO_ROOT/docs/seo-pages.md:115-129`;
  `10` §5.3 (route table), §5.13 (trailing slash and 404 rules); `17` §3.2 (which paths nginx sends to Next at S2).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/{internationalization,redirecting}.md`,
   `01-app/03-api-reference/03-file-conventions/{proxy,not-found,layout,dynamic-routes}.md`,
   `01-app/03-api-reference/05-config/01-next-config-js/{trailingSlash,redirects}.md`. Note: `permanent: true` gives
   `308`; the legacy `301`s need `statusCode: 301` in `redirects` or `NextResponse.redirect(url, 301)` in `proxy.ts`.
2. Remove the `create-next-app` page, Geist fonts and `lang="en"` layout (`10` §1.11, §5.9); set `trailingSlash: true`
   in `frontend/landing/next.config.ts` (URL-039 and URL-004 then answer `308` as legacy).
3. Route tree: `frontend/landing/app/[lang]/layout.tsx` (root layout: `<html lang={lang}>`, `lang ∈ {ru, uz, en}` via
   `generateStaticParams`, `dynamicParams = false` for the segment), `app/[lang]/page.tsx` (landing, filled by
   KV-FE-108), `app/[lang]/[...slug]/page.tsx` (SEO catch-all, filled by KV-FE-101/KV-FE-114), `app/[lang]/not-found.tsx`.
4. `frontend/landing/proxy.ts`: (a) a path starting with `/uz/` or `/en/` passes; (b) a direct `/ru` or `/ru/…` request
   answers the localised `404` (no second URL for ru content); (c) any other path is rewritten to `/ru<path>`;
   (d) `/index.html` → `301 /` with the query kept (URL-005); (e) `/?lang=…`, `/uz/?lang=…`, `/en/?lang=…` per step 6;
   (f) paths under `/api/`, `/media/`, `/data/`, `/img/snap/`, `/call/` are never matched (`config.matcher`) — nginx
   sends them to Laravel or static storage; if one reaches Next anyway it gets the 404 page, never JSON (LB-LND-013).
5. `not-found.tsx` per language: `noindex,follow` robots meta, the localised title and links to the rent hub, the rent
   index and the methodology of the same language (BR-SEO-032), built with `buildSeoPath` once KV-FE-101 exists
   (hard-coded slugs of `03b` §2.2 until then). The HTTP status is `404`.
6. DEV-038 flag `dev038RootAlwaysRu` in `frontend/landing/lib/deviations.ts` (default off). Off: `?lang=` is left to the
   page (KV-FE-108 applies BR-LND-004 on `/` client-side, legacy parity). On: `/?lang=uz|en` → `301 /uz/` or `/en/`
   keeping every other parameter (`s`, `utm_*`) and the hash; `?lang=ru` or an unknown value → `301` to the same path
   without `lang`.
7. **[PT]** Record in KV-INF-016 which paths nginx sends to Next on the legacy host at S2 (SEO sections, sitemap,
   robots, unknown paths) and at S4 (everything except `/api`, `/media`, `/data`, `/img/snap`, `/call`).

## States and texts

| State | Shown when | Texts | Notes |
| ----- | ---------- | ----- | ----- |
| success (route found) | path matches a known pattern | rendered by the page tasks | `200` |
| not found, ru | unknown path, wrong case, unknown slug, type the section lacks, foreign slug (BR-SEO-004) | «Страница не найдена» (`03b` LND-055) + three links | `404`, `noindex,follow` |
| not found, uz | same under `/uz/` | «Sahifa topilmadi» | as ru |
| not found, en | same under `/en/` | title from the archive of KV-FE-007 (Q-SEO-004); until then new key `seo.notFound.title` «Page not found» (not in legacy; product owner review) | as ru |
| redirect | `/index.html`, `/uz`, `/en`, no trailing slash, `?lang=` with DEV-038 on | — | `301` / `308` as listed |
| error (render failure) | a page throws | `app/[lang]/error.tsx` with the same frame and `noindex,follow` (`10` §5.14) | never an empty page |

The 404 texts live in the `seo` namespace of KV-FE-102 (`seo.notFound.title`, `seo.notFound.links.*`, new keys —
legacy SEO pages had no client catalogue).

## Interaction

- Link clicks inside the landing are plain anchors (no client router needed for SEO pages); a language switch is a real
  navigation (KV-FE-108, LB-LND-001 fix).
- Responsive: the 404 page uses the SEO frame of KV-FE-114 (single column, readable at 320 px).

## Telegram integration

n/a — public web pages. The Mini App origin is a different host.

## Storage and analytics

- No storage. The 404 page loads the site analytics of KV-FE-105 like any page (`$pageview` with the 404 URL), as
  legacy SEO pages did (LND-063).

## Files

- `frontend/landing/next.config.ts` (`trailingSlash`, `redirects` for `/index.html`), `frontend/landing/proxy.ts` (new)
- `frontend/landing/app/[lang]/layout.tsx`, `app/[lang]/page.tsx`, `app/[lang]/[...slug]/page.tsx`,
  `app/[lang]/not-found.tsx`, `app/[lang]/error.tsx` (new); remove `app/layout.tsx`, `app/page.tsx` of the template
- `frontend/landing/lib/deviations.ts` (new), `frontend/landing/lib/locales.ts` (prefix ↔ locale)
- `frontend/landing/tests/routing.test.ts`, `frontend/landing/e2e/routing.spec.ts` (after KV-FE-010)

## API contract

n/a for this task (the SEO catch-all calls `GET /api/v1/public/seo/resolve` of KV-BE-159 from KV-FE-101 on).

## Business rules

- Kept: BR-SEO-004 (trailing slash `308`, other case `404`, unknown slug `404`, missing type `404`, foreign slug `404`,
  ignored parameters), BR-SEO-032 (404 page), the LND-038 routes, BR-LND-004 step 2 (path decides the language).
- Defect fixes `APPROVED`: LB-LND-013 (HTML 404 everywhere except `/api/`), LB-LND-003 (one locale route, no `<base>`).
- DEV-038 `PROPOSED` behind `dev038RootAlwaysRu` (test `todo('DEV-038 PROPOSED')`). DEV-047/DEV-048 redirects belong to
  KV-FE-101.

## Acceptance criteria

- `/`, `/uz/`, `/en/` answer `200` with `<html lang>` `ru`, `uz`, `en`; `/uz` and `/en` answer `308` to the slashed URL
  with the query kept; `/arenda/tashkent` answers `308` to `/arenda/tashkent/`.
- `/index.html?s=x` answers `301` to `/?s=x`; `/ru/` and `/ru/arenda/` answer `404`.
- `/ARENDA/`, `/does-not-exist/`, `/uz/arenda/` answer `404` with an HTML body, `noindex,follow` and three links in the
  prefix's language — never JSON.
- With DEV-038 off, `/?lang=en` answers `200`; with it on, `301` to `/en/` keeping `s` and `utm_source`.
- Landing parity scenarios (KV-QA-013, `03b` §1.6) `query-lang-en`, `browser-uz`, `browser-en`, `browser-kk` reach the
  same final language as legacy with DEV-038 off (texts by KV-FE-108).
- The URL suite of KV-QA-014 rows URL-001…URL-005, URL-007, URL-039 passes for the "same domain kept" profile.

## Tests

- Unit (`routing.test.ts`): prefix parsing (`/`, `/uz/`, `/en/`, `/ru/`, `/UZ/`), the matcher exclusions, the `?lang=`
  redirect builder (keeps `s`, `utm_*`, hash; drops `lang`).
- E2E (`routing.spec.ts`, `next start`): status and `Location` for every row of the acceptance list; the 404 body
  contains `noindex` and the localised title per prefix.
- DEV-038: `todo('DEV-038 PROPOSED')` for the `301` cases.

## Edge cases

- `/uz/index.html` and `/en/index.html`: legacy behaviour unknown — answer `404` and record in Q-LND-006's follow-up.
- Percent-encoded paths (`/%61renda/`): decoded by Next before matching; the result must still be case-sensitive.
- Double slashes (`//arenda/`): `404`, not a redirect loop.
- `HEAD` requests: same status as `GET`.
- `/favicon.ico`: not a page — served by KV-FE-103 (URL-015).

## Security

- SEC-REQ-033: headers come from KV-FE-104 and KV-INF-024; no route echoes the request path into HTML unescaped (the
  404 page shows no path at all).
- Open-redirect safety: redirect targets are built from the parsed path and a fixed origin (`NEXT_PUBLIC_SITE_URL`),
  never from a user-supplied host.

## Definition of done

`make ci-frontend` green; routing unit and E2E tests green (or added as soon as KV-FE-010 lands); the URL rows above
checked against KV-QA-014; parity gate G4 for F-LANDING-009 and F-SEO-012 ticked (`15` §4); the `09` rows updated; PR
reviewed by the other developer.
