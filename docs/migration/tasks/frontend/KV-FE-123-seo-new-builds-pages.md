# KV-FE-123 — SEO new-builds pages

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-005 |
| Dependencies | KV-FE-117, KV-FE-118, KV-FE-119 (city, rooms and district templates); backend KV-BE-157, KV-BE-159; decisions DEV-046 `PROPOSED` (CTA), Q-SEO-004 |

## Goal

The new-builds section's city, city + rooms, district and district + rooms pages (74 per language, 222 in total; the
hub is KV-FE-116) render with the new-builds template: lead, prices by rooms with price per m², prices by district,
cards, CTA and links — with the dead-end CTA of LB-SEO-005 fixed per DEV-046 once approved.

## Legacy reference

- LND-051 (new-builds pages); `$KVADRO_ROOT/docs/seo-pages.md:158`, `:202`, `:294-298`.
- Counts per language (`03b` §2.1): city 6, city + rooms 17, district 14, district + rooms 37. URL patterns are those of
  URL-024 … URL-027 with the section slug `novostrojki` / `novostroyka` / `new-builds`.
- Rules: BR-SEO-016 (price and price per m²; down payments and instalments excluded; at most a tenth of a group from one
  channel; new build = «так сказано в объявлении или в канале»; «по N из M»), BR-SEO-009 (title «Новостройки в
  Ташкенте — купить квартиру в новостройке: 2 665 объявлений | kvadro²»; sale description «Обычная цена — $76 500,
  $1 429 за м².»), BR-SEO-003 (rooms 1–4), BR-SEO-025 (tags `s_seo_new[_<city>[_<district>][_<N>k]]`, e.g.
  `s_seo_new_tashkent_mirobod_2k`), BR-SEO-031 (CTA «В радаре выберите «Купить», «Новостройка», район, бюджет и
  комнаты…»).
- Defect: LB-SEO-005 (the CTA points to a radar step the bot does not have) → DEV-046.

## Implementation

1. `frontend/landing/components/seo/templates/NewBuildsPage.tsx`, registered for `kind = new_city`, `new_city_rooms`,
   `new_district`, `new_district_rooms`, legacy order:
   1. lead «Новостройка — так сказано в объявлении или в канале»;
   2. prices by rooms + per m² + «по N из M объявлений» (reuse `RoomPriceTiles` of KV-FE-117 with the m² line);
   3. prices by district (city level; reuse `DistrictPriceTable`);
   4. cards (KV-FE-115); CTA (frame);
   5. links: rooms, districts, all sale of the place, cities (KV-FE-127).
2. Titles and descriptions per BR-SEO-009 for the city level; rooms and district variants and uz/en from the KV-FE-007
   archive (Q-SEO-004).
3. DEV-046 flag `dev046NewBuildsCta` in `frontend/landing/lib/deviations.ts`, default off:
   - off: the legacy CTA text and the bot link `s_seo_new…`;
   - on (variant chosen at approval): either the same CTA once the bot wizard offers «Новостройка» for sale (telegram
     track), or a CTA that opens the Mini App with the new-build filter — its link format is fixed in the DEV-046
     decision (the legacy Mini App has no filter deep link; `?news=` handles only feature codes, TMA-012).

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | indexable | blocks above |
| thin | below the threshold | `noindex,follow`, not in the sitemap |
| median cell | group < 8 | «—» |
| sorted | `?sort=` | KV-FE-115 |
| data-fetch failure | API error | last cached render |
| 404 | `/novostrojki/ceny/`, quarters or metro under new builds, rooms > 4 | KV-FE-100 (BR-SEO-004) |

Texts: lead, «за м²», «по N из M объявлений», CTA text above; namespace `seo.newBuilds.*`; uz/en from the archive.

## Interaction

Static.

## Telegram integration

n/a, except the CTA link URL-047 (`s_seo_new…`) and card links URL-054.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/NewBuildsPage.tsx` (new)
- `frontend/landing/lib/deviations.ts` (flag `dev046NewBuildsCta`)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-new-builds.ts` (new)
- `frontend/landing/tests/seo/NewBuildsPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{key}?lang=` (KV-BE-159): counters, `medians[{rooms, median_usd, median_usd_m2, n, m}]`,
district medians, `cards`, `links`, `bot_payload` for the `new_*` slice kinds (KV-BE-157).

## Business rules

- Kept: BR-SEO-016, BR-SEO-009, BR-SEO-003, BR-SEO-025, BR-SEO-031.
- Defect fixes `APPROVED`: LB-SEO-001, LB-SEO-002, LB-SEO-003.
- DEV-046 `PROPOSED` behind its flag; test `todo('DEV-046 PROPOSED')`.

## Acceptance criteria

- The 74 new-builds slices per language from the catalogue answer as the resolver says; `/novostrojki/ceny/` → `404`.
- `/novostrojki/tashkent/` title equals the BR-SEO-009 text with the snapshot count.
- Price tiles show both the price and «за м²» with «по N из M».
- With the flag off the CTA equals the archive; with it on, the CTA follows the approved DEV-046 variant.
- Side by side with the archived new-builds pages (KV-FE-007).

## Tests

- Component: the four kinds × ru/uz/en; flag off/on.
- E2E (mocked API): `/novostrojki/tashkent/`, `/uz/novostroyka/tashkent/mirobod/2-xonali/`, `/en/new-builds/`
  (hub, KV-FE-116), `/novostrojki/tashkent/metro/` (`404`).
- `todo('DEV-046 PROPOSED')`: CTA variant.

## Edge cases

- A listing both «новостройка» and with a down-payment price: excluded from medians by the backend, still a card
  (price shown with the down-payment marker if the API sends it).
- Price per m² missing for a group (no areas): the m² line omitted.

## Security

SEC-REQ-021, SEC-REQ-019; any Mini App link built for DEV-046 goes through the builder of KV-FE-106 (allowlist, length).

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-005 ticked; DEV-046 row of `09` updated when decided; PR reviewed by the other developer.
