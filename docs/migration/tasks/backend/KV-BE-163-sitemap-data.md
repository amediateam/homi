# KV-BE-163 — RES-019 sitemap data source

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-SEO-008 |
| Dependencies | KV-BE-157 (slices, `indexable`, `lastmod_at`); KV-BE-159 (serving); DEC-30, Q-SEO-002, Q-SEO-003, Q-SEO-001 |

## Goal

The landing app renders `/sitemap.xml` from one backend list: the landing pages ×3, `privacy.html` and every
indexable SEO page in three languages, each with a data-based `lastmod` and its ru/uz/en and `x-default` alternates —
thin and sorted pages never appear.

## Legacy reference

- RES-019 (`08` lines 1449-1453): dynamic `/sitemap.xml`, `s-maxage=300`, 1 012 URLs (landing ×3, `privacy.html`,
  1 008 SEO pages) with `lastmod` and `xhtml:link` hreflang + `x-default`; `03b` §2.1, LND-058;
  `$KVADRO_ROOT/docs/seo-pages.md:46-47`, `:131-145`.
- Rules: BR-SEO-006 (thin pages not in the sitemap), BR-SEO-008 (contents and alternates), BR-SEO-034 (`lastmod` =
  date of the last data change, unverified), BR-SEO-035 (cut-off 10, unverified), BR-SEO-036 (shrinking slice drops
  out), BR-DATA-037, BR-API-136.
- Defects: LB-SEO-010 (`lastmod` and `Last-Modified` from the data snapshot), LB-SEO-012 (thin pages and index
  coverage). URL-012 (must keep).
- Open: Q-SEO-001 (1 012 vs «около 1020»), Q-SEO-002, Q-SEO-003, DEC-30; DEV-041 (`PROPOSED` localised privacy URLs)
  changes the privacy entries.

## Implementation

1. Read the KV-BE-157 task and `.claude/skills/seo-audit/` (sitemap rules).
2. `php artisan make:class Services/PublicData/SitemapData --no-interaction`: `entries(): list<SitemapEntry>` —
   - the three landing roots `/`, `/uz/`, `/en/` (one entry each, alternates to each other, `x-default` = `/`),
     `lastmod` = date of the latest `live.json` `generated_at` (KV-BE-154);
   - `privacy.html` (one entry; with DEV-041 on, three localised entries with alternates), `lastmod` from
     `config('seo.privacy_revised_at')`;
   - every slice with `indexable = true` × three languages, `loc` from `SliceKey::toPath(lang)`, alternates for the
     three languages + `x-default` (= ru), `lastmod` = `lastmod_at` date (`Y-m-d`) — the same value as the page's
     `Last-Modified` (LB-SEO-010);
   - never `?sort` URLs, never non-indexable slices, never the 404.
3. Served by KV-BE-159 as `GET /api/v1/public/seo/sitemap` with `ETag` = current snapshot; the landing app renders XML
   and sends `s-maxage=300` (BR-SEO-008, frontend track).
4. Size guard: if entries exceed 45 000 the response is split into pages (`?page=`) so the frontend can emit a sitemap
   index (not reached by the 1 012 legacy URLs; future growth).
5. A comparison helper `php artisan seo:sitemap-diff {file}` reads a sitemap XML file (the one-time legacy capture of
   `15` §3.9 when approved, or the generated KV-QA-014 list) and prints missing and extra paths — no network access.

## Files

- `backend/app/Services/PublicData/SitemapData.php`, `backend/app/Domain/PublicData/SitemapEntry.php` (new)
- `backend/app/Console/Commands/PublicData/SitemapDiff.php` (new); `backend/config/seo.php` (`privacy_revised_at`)
- `backend/tests/Feature/PublicData/SitemapDataTest.php` (new)

## API contract

Via KV-BE-159: `GET /api/v1/public/seo/sitemap` → envelope `data[{loc, lastmod: "YYYY-MM-DD", alternates: {ru, uz,
en, x-default}}]`, `meta {count, snapshot_id}`.

## Business rules

- Kept: BR-SEO-006, BR-SEO-008, BR-SEO-036, BR-DATA-037, BR-API-136; threshold per DEC-30.
- Defect fix `APPROVED`: LB-SEO-010 (data-based `lastmod`); BR-SEO-034 is implemented as "date of the last visible
  data change" (spec until Q-SEO-003).
- DEV-041 `PROPOSED` behind config; test `->todo('DEV-041 PROPOSED')`.

## Acceptance criteria

- Every entry's slice answers `indexable = true`; a slice turning thin disappears from the next list; a slice crossing
  the threshold appears.
- Alternates are symmetric across the three languages; `x-default` is the ru URL.
- On the full gazetteer seed with every slice indexable the list has 1 012 entries (3 + 1 + 1 008).
- `lastmod` of an unchanged slice is stable across refreshes.

## Tests

- `SitemapDataTest`: `contains_landing_roots_and_privacy`, `only_indexable_slices`, `thin_slice_excluded_9_vs_10`,
  `alternates_symmetric_with_x_default_ru`, `lastmod_equals_slice_lastmod_date`, `lastmod_stable_without_change`,
  `count_is_1012_on_full_seed`, `no_sort_or_404_urls`, `sitemap_diff_reports_missing_and_extra` (fixture XML),
  `->todo('DEV-041 PROPOSED')`.

## Edge cases

- A slice's `lastmod_at` changes at 19:00 UTC: the date is the UTC date of the instant (`Y-m-d`), stated in the PR
  (Q-SEO-003 may require the Tashkent date — one config switch).
- All slices thin on a fresh staging database: the sitemap holds only the landing roots and privacy.
- Q-SEO-001 shows legacy URLs not in the generated catalogue: `seo:sitemap-diff` lists them for KV-BE-157's seed.

## Security

- Public data only; SEC-REQ-021 (values escaped by the XML renderer of the frontend).

## Definition of done

Tests green (`make ci-backend`), URL-012 green in KV-QA-014, parity gate items ticked (`15` §4) for the sitemap part of
F-SEO-008, docs and the feature row in `09` updated, PR reviewed by the other developer.
