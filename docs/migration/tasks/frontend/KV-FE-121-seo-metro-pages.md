# KV-FE-121 — SEO metro hub and station pages

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-003 |
| Dependencies | KV-FE-114 (frame), KV-FE-115 (cards); backend KV-BE-158 (metro and station statistics), KV-BE-157, KV-BE-159; Q-SEO-010 (`metro` slug in uz/en), Q-SEO-006, Q-SEO-004 |

## Goal

The Tashkent metro hub (3 pages) and the 35 station pages (105 pages) exist with the legacy blocks: the hub table of
stations with near counts and medians, and per station the landmarks named in listings, near and district prices,
cards, CTA and neighbouring stations.

## Legacy reference

- LND-048 (metro hub), LND-049 (metro station); `$KVADRO_ROOT/docs/seo-pages.md:155`, `:199-200`, `:320-322`.
- URL-029 `/{rent}/tashkent/metro/` (3), URL-030 `/{rent}/tashkent/metro/{station}/` (105, e.g.
  `/arenda/tashkent/metro/abdulla-qodiriy/`). `metro` is not translated in the source slug table (Q-SEO-010; verify
  `/uz/ijara/tashkent/metro/` and `/en/rent/tashkent/metro/` in the archive).
- Rules: BR-SEO-020 («у метро» = a landmark within about 1 km in a straight line; hub cells «—» under 8; station page
  landmarks with flats and distance, or «названа сама станция»), BR-SEO-013 (near price), BR-SEO-009 (title «Аренда
  квартир у метро Айбек, Ташкент — цены и свежие объявления | kvadro²»; description without «кнопкой «Дешевле»»),
  BR-SEO-025 (tag `s_seo_metro` for the hub and every station), BR-SEO-004 (`metro` is a reserved slug at the district
  level; `/prodazha/tashkent/metro/` → `404`).
- Defects: LB-SEO-011 (one shared tag for all stations → DEV-049).

## Implementation

1. `frontend/landing/components/seo/templates/MetroHubPage.tsx` (`kind = metro_hub`): the table «Станция · Рядом ·
   1-комн. · 2-комн. · 3-комн.» for the 35 stations (station names link to the station pages; «—» under 8 listings);
   CTA. Rows ordered as the archive (line order or alphabetical — Q-SEO-001).
2. `frontend/landing/components/seo/templates/MetroStationPage.tsx` (`kind = station`), legacy order:
   1. lead about landmarks within about 1 km;
   2. «Где именно — ориентиры в объявлениях»: landmark, number of flats, distance to the station, or «названа сама
      станция» (`stats.station.named_station`);
   3. prices for the nearest listings and for the district;
   4. cards (KV-FE-115); CTA (frame);
   5. «Соседние станции».
3. Breadcrumbs `kvadro² › Аренда квартир › Ташкент › Метро › Айбек`.
4. Bot payload as the data says: legacy `s_seo_metro` everywhere; with DEV-049 approved the backend emits
   `…_m_<station>` — no frontend change.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | indexable | blocks above |
| thin station | below the threshold | `noindex,follow`, not in the sitemap |
| hub cell | group < 8 | «—» |
| no landmarks | only «названа сама станция» or none | the line «названа сама станция» or the block hidden (archive decides) |
| sorted | `?sort=` (station pages) | KV-FE-115 |
| data-fetch failure | API error | last cached render |
| 404 | unknown station, `metro` under sale or new builds | KV-FE-100 |

Texts: «Станция», «Рядом», «1-комн.», «2-комн.», «3-комн.», «Где именно — ориентиры в объявлениях», «названа сама
станция», «Соседние станции»; namespace `seo.metro.*`; uz/en from the archive.

## Interaction

Static; the hub table scrolls horizontally on narrow phones.

## Telegram integration

n/a, except the CTA link URL-047 and card links URL-054.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/{MetroHubPage,MetroStationPage}.tsx`, `frontend/landing/components/seo/LandmarkList.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-metro.ts` (new)
- `frontend/landing/tests/seo/Metro.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{key}?lang=` (KV-BE-159): hub `stats.metro {stations[{station_key, flats, medians
{1,2,3}}]}`; station `stats.station {landmarks[{name_key, flats, distance_m}], named_station, near[…],
district_median[…], neighbours[…]}` (KV-BE-158).

## Business rules

- Kept: BR-SEO-020, BR-SEO-013, BR-SEO-009, BR-SEO-025, BR-SEO-004.
- Defect fixes `APPROVED`: LB-SEO-001, LB-SEO-002, LB-SEO-003.
- DEV-049 `PROPOSED`: per-station payloads (backend).

## Acceptance criteria

- `/arenda/tashkent/metro/` lists 35 stations with «—» where the snapshot has fewer than 8 listings.
- The 35 station URLs × 3 languages answer as the catalogue says; titles match BR-SEO-009 (ru) and the archive.
- The `metro` slug in uz/en paths equals the archive (Q-SEO-010).
- Side by side with the archived hub and one station page per language (KV-FE-007).

## Tests

- Component: hub with full and partial medians; station with landmarks, with «названа сама станция» only.
- E2E (mocked API): `/arenda/tashkent/metro/`, `/en/rent/tashkent/metro/abdulla-qodiriy/`,
  `/prodazha/tashkent/metro/` (`404`).

## Edge cases

- A station slug equal to a district slug at another level: routing is by position (BR-SEO-004 reserved slugs), so no
  ambiguity; covered by the parser tests of KV-FE-101.
- Distances under 50 m: «названа сама станция» semantics come from the data, not from a frontend threshold.

## Security

SEC-REQ-021, SEC-REQ-019; landmark names from listings rendered as text only.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-003 (metro part) ticked; PR reviewed by the other developer.
