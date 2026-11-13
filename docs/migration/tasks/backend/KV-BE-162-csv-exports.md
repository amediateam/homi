# KV-BE-162 — RES-018 CSV exports

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); nginx locations **[PT/INF]** |
| Complexity | S |
| Feature IDs | F-SEO-006 |
| Dependencies | KV-BE-161; archived legacy CSVs at cut-over (Q-SEO-013); Q-SEO-009 |

## Goal

The two public CSV files that external articles cite keep their paths, columns and bytes:
`/arenda/indeks/kvadro-rent-index.csv` and `/prodazha/ceny/kvadro-sale-prices.csv` are regenerated from
`price_index_points` after each index run, byte-identical to the published legacy files for frozen periods, safe to
open in spreadsheets.

## Legacy reference

- RES-018 (`08` lines 1441-1447); LND-061 (`03b` lines 1039-1045); `$KVADRO_ROOT/docs/seo-pages.md:325-345`.
- Rules: BR-SEO-024 (rent index columns `period,start,rooms,median_usd,listings`, `period` ∈ `month|week`, `start` ISO
  date — the Monday for weeks; sale prices columns `month,district,rooms,median_usd,median_usd_m2,listings`,
  `district=all` and `rooms=0` mean all, `median_usd` empty for `rooms=0`; `text/csv; charset=utf-8`), BR-API-139.
- Public URL patterns URL-040 and URL-041 (must keep; `15` §3.9 «`200 text/csv`, byte-equal for frozen periods»);
  `14` §6.5 (index CSV byte-equal check).
- Open: Q-SEO-009 (uz/en CSV variants), Q-SEO-013 (archive both CSVs at the cut-over).

## Implementation

1. Read the KV-BE-161 task (`IndexSeries`) and SEC-REQ-021 (CSV formula injection).
2. `php artisan make:class Services/Pricing/CsvExportService --no-interaction`: `rentIndexCsv(): string` and
   `salePricesCsv(): string` built from published rows only (the open current period is excluded unless the archive
   shows it was included — follow the archive):
   - row order, number formatting (integers without grouping, decimal point if any), empty cells, line endings and the
     presence of a trailing newline and a BOM copied from the archived legacy files (defaults until the archive
     exists: header row, `\n` endings, trailing newline, no BOM, rows ordered by `period`, `start`, `rooms` / `month`,
     `district`, `rooms`);
   - `district` values are the SEO slugs (`all` for the city), never names;
   - formula-injection guard: any text cell starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with
     `'` (SEC-REQ-021) — the legacy columns are numeric, ISO dates or slugs, so legacy bytes stay unchanged.
3. Publication: written atomically to `media_public` under `exports/` with the legacy file names, served at the legacy
   paths with `Content-Type: text/csv; charset=utf-8`, `Cache-Control: public, max-age=300`, `nosniff`
   **[PT/INF: nginx locations for the two paths, also on the `uz`/`en` paths if Q-SEO-009 shows variants]**.
4. The `pricing:index` command of KV-BE-161 calls the export after a successful run; a failed export keeps the
   previous files and alerts.
5. Archive fixtures: `backend/tests/Fixtures/csv/` holds a **synthetic** pair now; the real archived legacy files are
   added by the migration rehearsal (production-track data handling, `14` §1.2) — never committed if they contain
   anything beyond the public numbers (they do not: the files are public).

## Files

- `backend/app/Services/Pricing/CsvExportService.php` (new); `backend/app/Console/Commands/Pricing/RefreshPriceIndex.php`
  (call)
- `backend/tests/Feature/Pricing/CsvExportTest.php`, `backend/tests/Fixtures/csv/{kvadro-rent-index,kvadro-sale-prices}.synthetic.csv`

## API contract

- `GET /arenda/indeks/kvadro-rent-index.csv` → `200 text/csv; charset=utf-8`, header
  `period,start,rooms,median_usd,listings`.
- `GET /prodazha/ceny/kvadro-sale-prices.csv` → `200 text/csv; charset=utf-8`, header
  `month,district,rooms,median_usd,median_usd_m2,listings`.

## Business rules

- Kept: BR-SEO-024, BR-API-139; frozen periods byte-equal (`14` §6.5).
- No DEV.

## Acceptance criteria

- For every frozen period, the generated file's rows are byte-equal to the archived legacy rows (synthetic archive in
  CI; real archive at rehearsal R1).
- Headers, column order, `median_usd` empty for `rooms=0`, `district=all` present.
- No cell starts with `=`, `+`, `-` or `@` unless prefixed.

## Tests

- `CsvExportTest`: `rent_index_header_and_columns`, `sale_prices_header_and_columns`,
  `rooms_zero_has_empty_median_usd`, `district_all_rows_present`, `weeks_start_on_monday_iso_dates`,
  `frozen_periods_byte_equal_to_archive` (synthetic archive), `open_period_excluded`,
  `formula_injection_prefixed_dataset` (synthetic text cells), `line_endings_and_trailing_newline_as_archive`,
  `failed_export_keeps_previous_file`.

## Edge cases

- A frozen period with zero published rooms values (all under 50): absent from the file, as in the archive.
- A district renamed in the gazetteer: the slug is the key, unchanged.
- The archive shows a row order the generator cannot reproduce (e.g. insertion order): store the order index with the
  migrated rows (KV-DB-021) and sort by it for frozen periods.

## Security

- SEC-REQ-021 (formula-injection guard), SEC-REQ-033 (`nosniff`), public aggregates only.

## Definition of done

Tests green (`make ci-backend`), URL-040 and URL-041 green in KV-QA-014, the `14` §6.5 index CSV check green at R1,
parity gate items ticked (`15` §4) for the CSV part of F-SEO-006, docs and the feature row in `09` updated, PR
reviewed by the other developer.
