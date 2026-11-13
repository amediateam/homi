# KV-FE-176 — SEO crawl parity gate

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); staging run **[PT]** |
| Complexity | M |
| Milestone | FE-5 (M9, stage S2 gate) |
| Feature IDs | F-SEO-001, F-SEO-002, F-SEO-003, F-SEO-004, F-SEO-005, F-SEO-006, F-SEO-007, F-SEO-008, F-SEO-009, F-SEO-010, F-SEO-011, F-SEO-012 |
| Dependencies | KV-FE-007 (legacy archive), KV-FE-114…KV-FE-129 (pages), KV-QA-014 (URL suite); DEC-15 (contingency if the gate fails) |

## Goal

Before S2, every SEO URL of the legacy sitemap is compared with HOMI staging on the properties search engines and
users see: status, canonical, hreflang set, robots, title, H1, card count, CSV bytes for frozen periods — and the
result decides between the full S2 scope and the DEC-15 contingency.

## Legacy reference

- Parity gate row of `10` §5.13 ("crawl of every sitemap URL before the freeze (Q-SEO-001) compared with HOMI staging").
- Routing and indexing rules BR-SEO-004, BR-SEO-006, BR-SEO-007, BR-SEO-008; counts `03b` §2.1 (1 008 pages, 336 per
  language); URL table `03b` §6.2 (URL-023…URL-041).
- DEC-15 (contingency: HOMI proxies SEO paths to the legacy origin for a short read-only period, `18` §5.3).

## Implementation

1. Input: the archive of KV-FE-007 (legacy HTML, headers, CSVs) and the generated URL list of KV-QA-014.
2. Crawl HOMI staging at a polite rate **[PT]** (staging access) for the same URLs plus the redirect probes (no trailing
   slash, mixed case, foreign slugs, `?page=2`, `?sort=cheap`).
3. Extract per URL: status, `Location`, canonical, hreflang alternates, robots meta, `<title>`, first `<h1>`, number of
   cards, JSON-LD types; CSV: bytes for frozen periods (BR-SEO-017 "past months never change").
4. Compare with expected values: equal, or different by an approved DEV (DEV-045, DEV-047, DEV-048, DEV-050) or an LB-SEO
   fix (LB-SEO-001 number format, LB-SEO-002 plurals, LB-SEO-003 consistent data across languages); data-driven counts
   compared with a tolerance agreed in the PR (live data differs between crawl dates).
5. Write `docs/migration/data/seo-crawl-parity.csv` and a summary with the go/no-go for FE-3a at S2.

## States and texts

n/a — the crawl compares rendered pages.

## Interaction

n/a.

## Telegram integration

Bot CTA payloads (`s_seo…`, BR-SEO-025) and card links (`startapp=l_<id>-seo-<channel>-<post>`, BR-SEO-026) extracted and
compared as strings.

## Storage and analytics

n/a.

## Files

- `scripts/migration/seo_crawl_compare.py` (Python standard library, like the other migration scripts) or a Playwright
  spec; `docs/migration/data/seo-crawl-parity.csv`

## API contract

n/a (HTTP crawl of public pages).

## Business rules

BR-SEO-001…BR-SEO-032; DEC-30 for the thin-page threshold.

## Acceptance criteria

- 100 % of the legacy sitemap URLs answer on staging with the expected status and canonical; hreflang sets symmetric.
- Title and H1 equal (modulo the LB-SEO copy fixes) on every page type and language present in the archive.
- CSV bytes identical for frozen periods.
- A written go/no-go for DEC-15.

## Tests

The comparison script has a self-test on a two-page fixture with planted differences.

## Edge cases

Pages that were thin in the archive and indexable now (data drift); legacy pages missing from the HOMI data (a place
without listings) — `404` vs `200 noindex` per Q-SEO-008.

## Security

Crawl only public pages; no credentials; polite rate; production crawl of the legacy site needs the developer's approval
(it touches production) — that part belongs to KV-FE-007.

## Definition of done

Results committed; G10 for the SEO features linked; the S2 decision recorded with the product owner and first developer.
