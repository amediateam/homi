# KV-FE-007 — SEO archive: templates and fixtures from the legacy crawl

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (crawl approval — the crawl touches production) |
| Owner | Frontend (track: development); the crawl run itself by the developer or the production track **[PT]** |
| Complexity | M |
| Milestone | FE-0 (M9, S2 critical path) |
| Feature IDs | F-SEO-001, F-SEO-002, F-SEO-003, F-SEO-004, F-SEO-005, F-SEO-006, F-SEO-007, F-SEO-008, F-SEO-009, F-SEO-010, F-SEO-011, F-SEO-012 |
| Dependencies | crawl approval (developer; touches production); answers Q-SEO-001, Q-SEO-004, Q-SEO-009, Q-SEO-010, Q-SEO-011 (and inputs for Q-SEO-002, Q-SEO-003, Q-SEO-016, Q-SEO-020); feeds KV-FE-102, KV-FE-114…KV-FE-129, KV-FE-176 |

## Goal

The SEO pages exist today only as a description of 25 sampled pages (`03b` §0 item 2). Before HOMI can rebuild 1 008
pages in three languages for S2, the live pages are archived once, read-only, and turned into what the frontend needs:
per page type × language templates (title, description, H1, lead, block headings, CTA and link texts, 404 text,
JSON-LD shapes), sanitised HTML fixtures, the URL list with status, canonical, hreflang and robots, and the CSVs. The
same archive is the parity baseline of KV-FE-176.

## Legacy reference

- Inventory and counts: `03b` §2.1 (1 012 sitemap URLs: landing ×3, privacy, 1 008 SEO; 336 per language), address
  scheme §2.2, page types LND-040…LND-055, shared parts LND-056…LND-064, rules BR-SEO-001…BR-SEO-038, URL table §6.2
  (URL-012, URL-023…URL-041).
- Unknowns this closes: Q-SEO-001 (full content, `area.css`, SVGs, uz/en texts), Q-SEO-004 (uz/en templates),
  Q-SEO-009 (CSV under `/uz/`, `/en/`), Q-SEO-010 (`metro` slug in uz/en), Q-SEO-011 (language switch target);
  inputs for Q-SEO-002 (exact noindex threshold), Q-SEO-003 (`lastmod`), Q-SEO-016 (sorts, «новых за 7 дней»),
  Q-SEO-020 (Tashkent region template).
- Legacy source of the sampled templates: `$KVADRO_ROOT/docs/seo-pages.md` (`03b` cites it as `SEO:n`).
- Risk: SEO pages have no artefact HOMI can serve; DEC-15 contingency (`18` §5.3); frozen index history Q-SEO-013.

## Implementation

1. Write the crawl plan in the PR description for approval: `GET https://kvadro.app/sitemap.xml`, then every `<loc>`
   and every `xhtml:link` alternate, plus `?sort=cheap|expensive|below` for a sample of 10 pages per type, both CSVs,
   `/robots.txt`, `area.css`, `og-{ru,uz,en}.jpg`, the 404 page (`/arenda/xx-not-a-city/`), one wrong-case and one
   foreign-slug URL, one URL without the trailing slash (record the `308`). Rate: 1 request per second, single
   connection, a descriptive `User-Agent`; no query strings other than the listed ones; no `/media/` downloads (photo
   URLs are recorded, not fetched).
2. **[PT]** Run it once with the developer's approval; store raw responses (headers + bodies) **outside the
   repository** (team archive storage named by the production track), with a SHA-256 manifest; this raw archive also
   serves Q-SEO-013 (the frozen CSV history, consumed by the backend's index-series task).
3. Extract into the repository (script `scripts/migration/seo_archive_extract.py`, Python standard library, read-only
   on the archive):
   - `docs/migration/data/seo-crawl-index.csv`: `url, lang, type, status, canonical, robots, hreflang_ru, hreflang_uz,
     hreflang_en, hreflang_xdefault, title, h1, cards, in_sitemap, lastmod, last_modified_header, cache_control`;
   - `docs/migration/data/seo-templates.json`: per type × language the title, description, H1, lead, section
     headings, counter tiles, CTA heading/button, link-block headings, footer texts, with numbers and place names
     replaced by named placeholders (`{count}`, `{new7}`, `{place_prepositional}`, `{median_1}` …), plus the observed
     declension forms per place (input for KV-FE-102 and the gazetteer cases of KV-DB-006);
   - `frontend/landing/tests/fixtures/seo/<type>-<lang>.html`: one sanitised sample per type × language (42 files),
     scripts and photo signatures stripped, channel handles replaced by `example_channel`, post ids by `1`.
4. Classify every crawled URL by the parser rules of BR-SEO-004 (type, city, district, quarter, station, rooms) and
   report mismatches with the slug tables of `03b` §2.2 (input for KV-FE-101).
5. Answer the Q-SEO items with evidence lines (file + row) in `docs/migration/data/seo-crawl-summary.md`; record the
   threshold observations for Q-SEO-002 (smallest indexed card count, largest noindex count).
6. If approval is refused: record "proceed without archive" — templates then come only from `03b` §2.3 / §3.2, uz/en
   texts are translated anew (product owner review), and KV-FE-176 compares against the generated URL list only.

## States and texts

The extracted templates are the "texts" of FE-3a. Each template entry keeps the legacy wording verbatim with
placeholders; no rewording here (copy fixes LB-SEO-001 / LB-SEO-002 are applied later by KV-FE-102).

## Interaction

n/a.

## Telegram integration

n/a. CTA `start=s_seo…` payloads and card `startapp=l_<id>-seo-<channel>-<post>` links are recorded per page
(BR-SEO-025, BR-SEO-026) — with channel and post sanitised in fixtures.

## Storage and analytics

Records whether SEO pages load `stats.js` and which PostHog requests fire on one district page (Q-SEO-005, LND-063).

## Files

- `scripts/migration/seo_archive_extract.py` (new)
- `docs/migration/data/seo-crawl-index.csv`, `seo-templates.json`, `seo-crawl-summary.md` (new)
- `frontend/landing/tests/fixtures/seo/*.html` (new, sanitised samples)

## API contract

n/a — public HTML, RES-017 (SEO pages), RES-018 (CSV), RES-019 (sitemap), RES-020 (robots).

## Business rules

Evidence for BR-SEO-004…BR-SEO-010, BR-SEO-022, BR-SEO-025, BR-SEO-027, BR-SEO-034…BR-SEO-036 as observed; no rule is
changed here.

## Acceptance criteria

- The index CSV has one row per sitemap URL (1 012 expected; any difference explained) with status and head fields.
- `seo-templates.json` covers all 14 page types of LND-042…LND-055 in ru, uz and en, or marks a missing combination
  with the reason (for example no uz CSV).
- Fixtures contain no phone numbers, no photo signatures, no real channel handles (grep check in the PR).
- Each listed Q-SEO item has an evidence line or "still open" with a reason.

## Tests

`python3 -I scripts/migration/seo_archive_extract.py --self-test` on two tiny synthetic pages; a grep test in CI that
fixtures under `frontend/landing/tests/fixtures/seo/` match no `+998`, `&s=`, or `t.me/` handle other than
`example_channel`.

## Edge cases

- Pages that change between crawl and extraction: the archive is the reference; counts are not compared, structure is.
- A sitemap URL answering `404` or `noindex`: recorded as is (it is a finding for BR-SEO-036 / Q-SEO-008).
- Cloudflare challenge pages: stop the crawl, record the URL, ask the production track (DEC-16).

## Security

Read-only GETs at a polite rate with approval (touches production); the raw archive stays out of the repository and
agent context; fixtures sanitised (SEC-REQ-041 spirit, `15` §1.7); no `/media/` fetch.

## Definition of done

Extraction merged; Q-SEO rows updated by the owner of `03b`; KV-FE-102 and KV-FE-114 consume the templates; PR
reviewed by the other developer.
