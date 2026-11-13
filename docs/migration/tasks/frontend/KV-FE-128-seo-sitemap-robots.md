# KV-FE-128 — Indexing rules, sitemap and robots

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-30) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-008 |
| Dependencies | KV-FE-101 (path builder), KV-FE-103 (head metadata); backend KV-BE-163 (sitemap data), KV-BE-159; decisions DEC-30 (thin-page threshold), DEV-050 `PROPOSED`, DEV-041 `PROPOSED` (localised privacy URLs); Q-SEO-002, Q-SEO-003, Q-SEO-008, Q-SEO-001 |

## Goal

`/sitemap.xml` lists exactly the indexable pages (the landing ×3, `privacy.html` and every indexable SEO page in three
languages) with data-based `lastmod` and complete ru/uz/en/`x-default` alternates; thin and sorted pages carry
`noindex,follow` and stay out of it; `/robots.txt` keeps the legacy rules.

## Legacy reference

- LND-058 (indexing rules and sitemap), LND-035 (`robots.txt`); `$KVADRO_ROOT/docs/seo-pages.md:44-47`, `:131-145`;
  `$KVADRO_ROOT/demo/landing/site/robots.txt:1-10`.
- RES-019 (`sitemap.xml`), RES-020 (`robots.txt`); URL-012 (sitemap, 1 012 entries), URL-011 (robots), URL-036 (thin
  slices `200` + `noindex,follow`, not in the sitemap).
- Rules: BR-SEO-006 (≤ 9 noindex, ≥ 11 indexed), BR-SEO-035 (exactly 10 — Q-SEO-002), BR-SEO-036 (shrinking slices
  stay `200` + `noindex` — Q-SEO-008), BR-SEO-008 (dynamic sitemap, `s-maxage=300`, alternates), BR-SEO-034 (`lastmod`
  = last data change — Q-SEO-003), BR-SEO-007 (sorted pages `noindex,follow`).
- Defects: LB-SEO-010 (`lastmod` vs render time), LB-SEO-012 (thin pages and coverage) → DEV-050.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/{sitemap,robots}.md`
   and `04-functions/generate-sitemaps.md` (one file suffices: 1 012 entries ≪ 50 000).
2. `frontend/landing/app/sitemap.ts`: `use cache` + `cacheLife('seo')` (KV-FE-129) + `cacheTag('seo:snapshot')`;
   entries from `GET /api/v1/public/seo/sitemap` — `url` = `NEXT_PUBLIC_SITE_URL` + `loc`, `lastModified` = the
   data date, `alternates.languages` = `{ru, uz, en, x-default}`; no `changeFrequency` / `priority` unless the archive
   shows them.
3. Landing entries (`/`, `/uz/`, `/en/`) and `privacy.html` come from the same endpoint (KV-BE-163); with DEV-041
   approved the backend adds `/uz/privacy.html` and `/en/privacy.html` — no frontend change.
4. Robots meta for pages: `generateMetadata` (KV-FE-103) sets `robots: {index: false, follow: true}` when
   `resolve.indexable = false` (`noindex_reason` `thin` or `sorted`); the threshold lives in the backend
   (`seo_slices.indexable`, DEC-30), never in the frontend.
5. `frontend/landing/app/robots.ts`: `User-agent: *`, `Allow: /`, `Disallow: /api/`, `/media/`, `/img/snap/`,
   `/*/img/snap/`, `Sitemap: <NEXT_PUBLIC_SITE_URL>/sitemap.xml` — same rules as legacy (photos of others never go to
   image search).
6. DEV-050 interacts only through the data (`indexable`) and the link blocks (KV-FE-127).

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | endpoint answers | full sitemap |
| data-fetch failure | API error | the last cached sitemap; never an empty `<urlset>` |
| thin page | `indexable = false` | page has `noindex,follow`; absent from the sitemap |
| sorted page | `?sort=` | `noindex,follow`; never in the sitemap |

No user-visible texts.

## Interaction

n/a — machine-read files.

## Telegram integration

n/a.

## Storage and analytics

n/a.

## Files

- `frontend/landing/app/{sitemap,robots}.ts` (new)
- `frontend/landing/tests/seo/{sitemap,robots}.test.ts`, `frontend/landing/e2e/sitemap.spec.ts` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/sitemap` (KV-BE-159, data KV-BE-163) → `data[{loc, lastmod: "YYYY-MM-DD", alternates {ru, uz,
en, x-default}}]`, `meta {count, snapshot_id}`.

## Business rules

- Kept: BR-SEO-006, BR-SEO-008, BR-SEO-007, BR-SEO-034 (as decided), BR-SEO-035 / BR-SEO-036 (as decided).
- Defect fix `APPROVED`: LB-SEO-010 (`lastmod` from data).
- DEC-30 decides the threshold (legacy at S2 is the recommendation); DEV-050 `PROPOSED`.

## Acceptance criteria

- The sitemap is valid XML with `xhtml:link` alternates for all four hreflang values on every entry; alternates are
  symmetric (each language's entry lists the same set).
- Its URL set equals the generated indexable list and, before the freeze, the archived legacy sitemap (KV-FE-176; 1 012
  entries expected, Q-SEO-001 re-check).
- Every entry answers `200` without `noindex` (KV-QA-014); no thin, sorted, `404` or redirected URL is listed.
- `robots.txt` equals the legacy file except the host taken from configuration.
- `lastmod` of a slice changes only when its data changes (two renders of one snapshot give the same file).

## Tests

- Unit: entry mapping (loc, lastModified, alternates); robots rules.
- E2E (mocked API): fetch `/sitemap.xml`, parse, request every entry against the mocked app, assert `200`, canonical
  self, no `noindex`; `/robots.txt` content.

## Edge cases

- A slice drops below the threshold between renders: removed from the next sitemap; its page turns `noindex` in the same
  snapshot (consistent by tag).
- `NEXT_PUBLIC_SITE_URL` changes at S6: entries move to the new host; the old host serves `301` (infrastructure, `03b`
  §6.1).

## Security

No personal data; `/media/` and `/img/snap/` stay disallowed (SEC-REQ-025 context).

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); sitemap comparison with the archive recorded in
the PR; parity gate G4 for F-SEO-008 ticked; PR reviewed by the other developer.
