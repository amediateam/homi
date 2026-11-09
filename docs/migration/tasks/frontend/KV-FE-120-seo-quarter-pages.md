# KV-FE-120 — SEO quarter pages

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-003 |
| Dependencies | KV-FE-119 (district template, nesting); backend KV-BE-158 (quarter statistics), KV-BE-157, KV-BE-159; Q-SEO-006 (quarter attachment), Q-SEO-015 (open-data licences), Q-SEO-004 |

## Goal

The 45 Tashkent quarter and massif pages (rent only) exist in three languages — 135 pages — with the legacy blocks:
lead, «Где это», the near-price line, «Школы рядом», cards, CTA and «Соседние кварталы».

## Legacy reference

- LND-047 (quarter / massif); `$KVADRO_ROOT/docs/seo-pages.md:110-113`, `:154`, `:198`, `:253-257`, `:323`.
- URL-028 `/{rent}/tashkent/{district}/{quarter}/` (45 per language); examples `yunusobod/minor` «Минор (Ц-6)»,
  `yunusobod/qiyot` «Киёт (Ц-5)», `chilonzor/chilonzor-19`, `uchtepa/chilonzor-26`, `mirzo-ulugbek/buyuk-ipak-yoli`,
  `olmazor/sebzor`, `shayxontohur/chorsu`. A quarter sits under the district that owns it per the hokimiyat; some
  «Чиланзар-N» massifs sit under `uchtepa`.
- Rules: BR-SEO-009 (title «Аренда квартир в квартале Минор (Ц-6), Ташкент — цены и свежие объявления | kvadro²»;
  description without «кнопкой «Дешевле»»), BR-SEO-013 (near usual price: 12 nearest same-rooms within 5 km, ≤ 3 per
  channel, fallback to the district under 8), BR-SEO-021 (membership by name in the text; distances from the middle of
  the quarter; schools: number, rating place, distance; neighbours with distance and flats), BR-SEO-025 (tag
  `s_seo_kv_yunusobod-minor`), BR-SEO-030.
- Defects: LB-SEO-007 (names per script: ru «Минор (Ц-6)», uz «Minor (C-6)»).

## Implementation

1. `frontend/landing/components/seo/templates/QuarterPage.tsx`, registered for `kind = quarter`, legacy order:
   1. lead «Квартиры, в объявлении которых назван квартал …»;
   2. «Где это»: district (link), nearest metro and distance from the middle of the quarter;
   3. prices «по 12 ближайшим в обычных домах, до ~0,7 км · в Юнусабаде — $500» per room count from
      `stats.quarter.near[]` (`radius_m`, `class` → «в обычных домах» / «в ЖК» per `median_near_class`), with the
      district comparison;
   4. «Школы рядом»: number, place in the Tashkent 2024 rating, distance;
   5. cards (KV-FE-115); CTA (frame);
   6. «Соседние кварталы» with distance and flat count.
2. Distances formatted by the shared formatter (KV-FE-102 / KV-FE-018 rules: metres rounded under 1 km, km with one
   decimal, «~» prefix where the data is approximate).
3. Breadcrumbs `kvadro² › Аренда квартир › Ташкент › Юнусабад › Минор (Ц-6)`.
4. Attribution of open data (school rating and boundaries, `opendata.tashkent.uz`) and of OpenStreetMap where the
   archive shows it; licences per Q-SEO-015.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | indexable quarter | blocks above |
| thin | below the threshold | `noindex,follow`, not in the sitemap |
| no near price | fewer than 8 near listings | the district median line only (BR-SEO-013 fallback) |
| no schools | `schools = []` | block hidden |
| sorted | `?sort=` | KV-FE-115 |
| data-fetch failure | API error | last cached render |
| 404 | a quarter under the wrong district, under `prodazha`, unknown slug | KV-FE-100 (BR-SEO-004) |

Texts: «Где это», «Школы рядом», «Соседние кварталы», the lead and the near-price line above; namespace
`seo.quarter.*`; uz/en from the archive (Q-SEO-004).

## Interaction

Static.

## Telegram integration

n/a, except the CTA link URL-047 (`s_seo_kv_<district>-<quarter>`; DEV-049 grammar `_kv_<quarter>` decided in the
backend) and card links URL-054.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/QuarterPage.tsx`, `frontend/landing/components/seo/{WhereBlock,NearPrices,SchoolsNearby,NeighbourList}.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-quarter.ts` (new)
- `frontend/landing/tests/seo/QuarterPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{key}?lang=` (KV-BE-159) with `stats.quarter {district_key, metro {station_key,
distance_m}, near[{rooms, median_usd, n, radius_m, class}], schools[{number, rating_place, distance_m}],
neighbours[{quarter_key, distance_m, flats}]}` (KV-BE-158); names via `places`.

## Business rules

- Kept: BR-SEO-009, BR-SEO-013, BR-SEO-021, BR-SEO-025, BR-SEO-030.
- Defect fixes `APPROVED`: LB-SEO-007, LB-SEO-001, LB-SEO-002, LB-SEO-003.
- Quarter attachment (Q-SEO-006) is a backend rule; the page shows what the data says.

## Acceptance criteria

- All 45 quarter URLs × 3 languages answer as the catalogue says; a quarter path under another district answers `404`.
- `/arenda/tashkent/yunusobod/minor/` title equals BR-SEO-009; uz page shows «Minor (C-6)».
- The near-price line names the radius and the house class; the fallback shows the district median only.
- Side by side with the archived quarter pages of KV-FE-007: same blocks and order.

## Tests

- Component: full data, no schools, no near price, ru/uz/en.
- E2E (mocked API): `/arenda/tashkent/yunusobod/minor/`, `/uz/ijara/tashkent/uchtepa/chilonzor-26/`,
  `/prodazha/tashkent/yunusobod/minor/` (`404`).

## Edge cases

- A quarter whose nearest metro is farther than the documented cut-off: line omitted, not «0 м».
- Quarter codes with Cyrillic letters in ru and Latin in uz (`Ц-6` / `C-6`): from the dictionary, never transliterated
  in the frontend.

## Security

SEC-REQ-021, SEC-REQ-019; school and open-data names rendered as text.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-003 (quarter part) ticked; PR reviewed by the other developer.
