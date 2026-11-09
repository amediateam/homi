# KV-FE-124 — Rent index page

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | L |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-006 |
| Dependencies | KV-FE-114 (frame); backend KV-BE-161 (index series, frozen history), KV-BE-162 (CSV), KV-BE-159 (`stats/rent-index`, `places` boundaries); Q-SEO-013 (history), Q-SEO-014 (salary source), Q-SEO-009 (uz/en CSV), Q-SEO-004 |

## Goal

The Tashkent rent index (`/arenda/indeks/`, `/uz/ijara/indeks/`, `/en/rent/index/`) renders the legacy blocks from the
published series: overline with the month and data date, «Аренда в зарплатах», the SVG district map with 2-room medians,
the district table with month-over-month change, the weekly chart with its table, the monthly table, the CSV link and
the citation terms, with `Dataset` JSON-LD — server-rendered, no chart library.

## Legacy reference

- LND-052 (rent index), LND-061 (CSV exports); `$KVADRO_ROOT/docs/seo-pages.md:159`, `:203`, `:300-311`, `:325-345`.
- URL-033 (3 pages, high citation risk), URL-040 `/arenda/indeks/kvadro-rent-index.csv`.
- Rules: BR-SEO-017 (monthly median of new listings with their last price; past months never change; weeks Monday to
  Sunday; a month or week shown and compared only with ≥ 50 listings of that room count; district table for 2 rooms:
  median, listings, change `±0%`, `−6%`, `+8%`, `—`; coverage from 2026-10-01), BR-SEO-018 («Аренда в зарплатах»:
  median in сум at the CBU rate / average accrued salary in Tashkent «12,3 млн сум, январь–сентябрь 2026» → «1 комната
  49% зарплаты»), BR-SEO-024 (CSV columns `period,start,rooms,median_usd,listings`), BR-SEO-009 (title «Индекс аренды
  Ташкента — ноябрь 2026 | kvadro²»), BR-SEO-007 (`Dataset` JSON-LD), BR-SEO-025 (tag `s_seo_index`).
- Slugs: `indeks` / `indeks` / `index` (BR-SEO-001).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/json-ld.md` and
   `01-app/03-api-reference/04-functions/cacheLife.md`.
2. `frontend/landing/components/seo/templates/RentIndexPage.tsx` (`kind = rent_index`), legacy order:
   1. overline «Ноябрь 2026 · данные на 8 ноября» (month and data date from the series, Asia/Tashkent);
   2. «Аренда в зарплатах»: per room count «1 комната 49% зарплаты»; the salary figure and its period as a caption
      (from the series payload; rounding per Q-SEO-014);
   3. SVG map of Tashkent: district polygons from `places` (simplified GeoJSON, KV-BE-159) projected server-side into an
      inline `<svg>`; fill by the 2-room median class; each district a link to its district page; text labels with the
      median; a legend;
   4. district table: district, median, listings, change vs the previous month;
   5. weekly chart: inline SVG polyline per room count, with the same data as a table inside `<details>`;
   6. monthly table;
   7. CSV link (`/arenda/indeks/kvadro-rent-index.csv`; the uz/en pages link the file the archive shows, Q-SEO-009);
   8. citation terms «цифры можно использовать со ссылкой»;
   9. CTA (frame).
3. `frontend/landing/components/seo/svg/{DistrictMap,LineChart}.tsx`: pure functions from data to SVG paths; no
   client JavaScript, no third-party chart or map library; `role="img"` with a text alternative, the table carries the
   same numbers.
4. JSON-LD `Dataset` (KV-FE-103 helper): name, description, `temporalCoverage` from 2026-10-01, `dateModified` (series
   `lastmod`), `variableMeasured`, `distribution` → `DataDownload` (`contentUrl` = the CSV, `encodingFormat`
   `text/csv`); plus `BreadcrumbList`.
5. Periods below the ≥ 50 rule are not drawn or compared (the series marks them); `—` in the change column.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | series available | all blocks |
| period hidden | < 50 listings for the room count | point and table row omitted; change «—» |
| first month | no previous month | change «—» |
| salary missing | no salary reference | «Аренда в зарплатах» hidden |
| data-fetch failure | API error | last cached render (never an empty index) |
| 404 | `/prodazha/indeks/`, `/novostrojki/indeks/` | KV-FE-100 |

Texts: overline, «Аренда в зарплатах», «% зарплаты», table headers, «цифры можно использовать со ссылкой», month names
per locale (Asia/Tashkent, uz month names from the catalogue); namespace `seo.index.*`; uz/en from the archive.

## Interaction

Static. Districts on the map are links; `<details>` opens the weekly table. Responsive: the SVG scales with
`viewBox`; tables scroll horizontally on narrow phones.

## Telegram integration

n/a, except the CTA link URL-047 (`s_seo_index`).

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/RentIndexPage.tsx`, `frontend/landing/components/seo/svg/{DistrictMap,LineChart,project}.ts(x)` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-index.ts` (new)
- `frontend/landing/tests/seo/{RentIndexPage,svg}.test.tsx` (after KV-FE-010)

## API contract

- `GET /api/v1/public/stats/rent-index?lang=` (KV-BE-159, data KV-BE-161): monthly and weekly points per room count with
  `listings` and a `published` flag, the 2-room district table with change, the salary reference, `lastmod`.
- `GET /api/v1/public/places?lang=` → district boundaries (simplified GeoJSON) and names.
- The CSV itself is a static file written by KV-BE-162 and served by nginx (RES-018); the page only links it.

## Business rules

- Kept: BR-SEO-017, BR-SEO-018, BR-SEO-024 (link and `Dataset`), BR-SEO-009, BR-SEO-007, BR-SEO-025.
- Frozen history: the page renders the published values as received; it never recomputes (Q-SEO-013, Q-DATA-032).
- Defect fixes `APPROVED`: LB-SEO-001 (number format), LB-SEO-010 (`dateModified` from data, not render time).

## Acceptance criteria

- The three URLs answer `200` with canonical, hreflang and a valid `Dataset` JSON-LD (schema.org validator offline
  check in the test).
- Every number on the page equals the archived page for the frozen months (KV-FE-007) — months up to the cut-over.
- The map has 12 district links; the weekly table equals the chart data.
- The CSV link resolves to `200 text/csv` on staging (KV-QA-014).

## Tests

- Unit: projection of a fixture polygon; line path for 3 room series; change formatting (`±0%`, `−6%`, `+8%`, `—`).
- Component: full series, hidden periods, no salary.
- E2E (mocked API): the three URLs; JSON-LD parse; `<details>` contains the weekly table.

## Edge cases

- A district without a 2-room median: grey fill and «—», still a link.
- Month boundary in Asia/Tashkent vs UTC (`15` §3.10 #9): the label comes from the series' period, never from the
  render clock.

## Security

SEC-REQ-021 (JSON-LD escaping; SVG built from numbers and dictionary names as text nodes, no injected markup).

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison of the frozen months recorded
in the PR; parity gate G4 for F-SEO-006 (index part) ticked; PR reviewed by the other developer.
