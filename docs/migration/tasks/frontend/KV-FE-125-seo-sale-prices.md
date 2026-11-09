# KV-FE-125 — Sale prices page

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-006 |
| Dependencies | KV-FE-124 (SVG map, tables, `Dataset` helper); backend KV-BE-161 (sale series), KV-BE-162 (CSV), KV-BE-159; Q-SEO-013, Q-SEO-009, Q-SEO-004 |

## Goal

The Tashkent sale prices page (`/prodazha/ceny/`, `/uz/sotuv/narxlar/`, `/en/sale/prices/`) renders the legacy blocks:
map and table of price per m² by district with month-over-month change, the monthly table, «Как считаем», the CSV link
and «Смотрите также», with `Dataset` JSON-LD.

## Legacy reference

- LND-053 (sale prices), LND-061 (CSV); `$KVADRO_ROOT/docs/seo-pages.md:160`, `:204`, `:313-318`, `:325-345`.
- URL-035 (3 pages, citation risk), URL-041 `/prodazha/ceny/kvadro-sale-prices.csv`.
- Rules: BR-SEO-019 (month by first appearance; one flat once; excluded down payments, instalments, prices below $5 000 and
  above $5 M; per m² only with an area; ≤ 1/10 of a group from one channel; groups under 8 hidden; comparison from 50),
  BR-SEO-024 (CSV columns `month,district,rooms,median_usd,median_usd_m2,listings`; `district=all`, `rooms=0` = all),
  BR-SEO-009 (title «Цены на квартиры в Ташкенте — ноябрь 2026: за м² по районам | kvadro²»), BR-SEO-007 (`Dataset`),
  BR-SEO-025 (tag `s_seo_sale_prices`). Slugs `ceny` / `narxlar` / `prices`.

## Implementation

1. `frontend/landing/components/seo/templates/SalePricesPage.tsx` (`kind = sale_prices`), legacy order:
   1. map (reusing `DistrictMap` of KV-FE-124, fill by price per m²) and the table «цена за м² по районам» with change
      against the previous month;
   2. monthly table: month, price per m², 1–4 rooms, listings;
   3. «Как считаем» (text from the archive, statements per BR-SEO-019; link to the methodology page);
   4. CSV link;
   5. «Смотрите также» (links per the archive: rent index, methodology, sale hub);
   6. CTA (frame).
2. `Dataset` JSON-LD with `DataDownload` → the CSV; `dateModified` from the series.
3. Groups under 8 listings are not shown; comparisons only from 50 (data flags from KV-BE-161).

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | series available | all blocks |
| group hidden | < 8 listings | cell «—» or row omitted (archive decides) |
| no comparison | < 50 listings or first month | change «—» |
| data-fetch failure | API error | last cached render |
| 404 | `/arenda/ceny/`, `/novostrojki/ceny/` | KV-FE-100 (BR-SEO-004) |

Texts: «цена за м² по районам», «Как считаем», «Смотрите также», table headers; namespace `seo.salePrices.*`; uz/en
from the archive (Q-SEO-004).

## Interaction

Static; responsive map and scrollable tables as in KV-FE-124.

## Telegram integration

n/a, except the CTA link URL-047 (`s_seo_sale_prices`).

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/SalePricesPage.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-sale-prices.ts` (new)
- `frontend/landing/tests/seo/SalePricesPage.test.tsx` (after KV-FE-010)

## API contract

- `GET /api/v1/public/stats/sale-prices?lang=` (KV-BE-159, data KV-BE-161): monthly points per district and room count
  (`median_usd`, `median_usd_m2`, `listings`, `published`), change vs the previous month, `lastmod`.
- `GET /api/v1/public/places?lang=` (boundaries). The CSV is a static file (KV-BE-162, RES-018).

## Business rules

- Kept: BR-SEO-019, BR-SEO-024, BR-SEO-009, BR-SEO-007, BR-SEO-025.
- Frozen history rendered as received (Q-SEO-013); defect fixes `APPROVED`: LB-SEO-001, LB-SEO-010.

## Acceptance criteria

- The three URLs answer `200`, canonical, hreflang, valid `Dataset` JSON-LD.
- Numbers of frozen months equal the archived page (KV-FE-007) and the archived CSV.
- The CSV link answers `200 text/csv; charset=utf-8` on staging (KV-QA-014).

## Tests

- Component: full series, hidden groups, first month.
- E2E (mocked API): the three URLs; JSON-LD parse; table row count per the fixture.

## Edge cases

- A district with sale data but without boundaries in the dictionary: table row kept, map region absent.
- `rooms=0` aggregate rows: shown only as the «м²» column, never as «0-комн.».

## Security

SEC-REQ-021 (JSON-LD escaping, text-only SVG labels).

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-006 (sale prices part) ticked; PR reviewed by the other developer.
