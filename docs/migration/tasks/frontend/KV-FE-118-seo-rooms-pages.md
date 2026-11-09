# KV-FE-118 — SEO rooms pages: city + rooms, district + rooms

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-002 |
| Dependencies | KV-FE-117 (city template), KV-FE-119 (district template); backend KV-BE-157, KV-BE-159; Q-SEO-004, DEC-30 |

## Goal

The rent and sale «N-комнатные» pages exist at city and district level in three languages with the legacy blocks: the
«N-комнатные по районам» table (city with districts) or the price tile of the place, cards, CTA and the room and
district links. New-builds rooms pages use KV-FE-123.

## Legacy reference

- LND-045 (city + rooms and district + rooms); `$KVADRO_ROOT/docs/seo-pages.md:153`, `:157`, `:197`, `:108`.
- URL-025 `/{section}/{city}/{N}-{komnatnye|xonali|room}/` (174 in total) and URL-027
  `/{section}/{city}/{district}/{N}-…/` (372 in total). This task renders rent and sale: city + rooms 18 + 23 = 41 per
  language, district + rooms 37 + 50 = 87 per language — 128 per language, 384 in total (`03b` §2.1).
- Rules: BR-SEO-003 (rooms slugs; rent N = 1–3, sale N = 1–4; `/arenda/…/4-komnatnye/` → `404`), BR-SEO-009 (titles),
  BR-SEO-011 (medians, «—» under 8), BR-SEO-025 (tags `…_<N>k`), BR-SEO-030, BR-SEO-031.
- Example: `/arenda/tashkent/yunusobod/2-komnatnye/` = `/uz/ijara/tashkent/yunusobod/2-xonali/` =
  `/en/rent/tashkent/yunusobod/2-room/`.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md`
   (prerender the indexable rooms slices; the rest on demand).
2. `frontend/landing/components/seo/templates/RoomsPage.tsx`, registered for `kind = city_rooms` and
   `kind = district_rooms`, legacy order:
   1. city with districts: the table «2-комнатные по районам» — district, usual price, «сейчас в аренде» (count), «—»
      under 8 listings; city without districts and district level: the price tile of the place («2 комнаты $615/мес ·
      по N из M объявлений»);
   2. cards (KV-FE-115);
   3. CTA (frame);
   4. links: other room counts of the place, «2-комнатные в других районах», the other section of the same place,
      cities (KV-FE-127).
3. Head: rent «Снять 2-комнатную квартиру в Юнусабаде, Ташкент — 289 объявлений и цены | kvadro²», sale «Купить
   2-комнатную квартиру в Юнусабаде, Ташкент — 306 объявлений и цены | kvadro²» (BR-SEO-009; the city-level variant
   «… в Ташкенте» per the archive); description per BR-SEO-009; uz/en from the archive (Q-SEO-004).
4. Room counts: «4-комнатные» means «4 и больше» for sale (per the archive wording); the room number in titles is the
   grammatical form from the catalogue («2-комнатную», «2 xonali», «2-room»), not string concatenation.
5. Bot payload from the slice: `s_seo_tashkent_2k`, `s_seo_tashkent_yunusobod_2k`, `s_seo_sale_tashkent_yunusobod_2k`,
   with `_uz` / `_en` for those languages (BR-SEO-025).

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | indexable slice | blocks above |
| thin | ≤ the threshold of DEC-30 | `noindex,follow`, excluded from the sitemap (most rooms slices are data-driven, BR-SEO-005) |
| median cell missing | group < 8 | «—» |
| sorted | `?sort=` | KV-FE-115 |
| data-fetch failure | API error | last cached render |
| 404 | `4-komnatnye` under rent, `5-komnatnye` anywhere, a room slug of another language | KV-FE-100 (DEV-048 redirect behind its flag) |

Texts: «N-комнатные по районам», «сейчас в аренде», «Обычная цена», «по N из M объявлений», «2-комнатные в других
районах»; namespace `seo.rooms.*`; uz/en from the archive.

## Interaction

Static; the district table scrolls horizontally on narrow phones.

## Telegram integration

n/a, except the CTA link URL-047 and card links URL-054.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/RoomsPage.tsx` (new; reuses `DistrictPriceTable` and `RoomPriceTiles`
  of KV-FE-117)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-rooms.ts` (new)
- `frontend/landing/tests/seo/RoomsPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{key}?lang=` (KV-BE-159) for `city_rooms` / `district_rooms` keys: counters, medians
(per district for the table, or the place's own), `cards`, `links.rooms[]`, `links.districts[]`, `links.sections[]`,
`links.cities[]`, `bot_payload`.

## Business rules

- Kept: BR-SEO-003, BR-SEO-005, BR-SEO-009, BR-SEO-011, BR-SEO-025, BR-SEO-030, BR-SEO-031.
- Defect fixes `APPROVED`: LB-SEO-001, LB-SEO-002 («289 объявлений», «81 новая»), LB-SEO-003.
- DEV-048 `PROPOSED` (foreign-language slugs redirect), DEV-050 `PROPOSED` (link policy) — flags in
  `frontend/landing/lib/deviations.ts`.

## Acceptance criteria

- The generated rooms URL list (from the catalogue) for rent and sale answers `200`; rent `4-komnatnye` answers `404`.
- Titles match BR-SEO-009 (ru) and the archive (uz/en) with the snapshot numbers.
- The 2-room city table of Tashkent and the district tile of Yunusobod match the archived pages' structure (KV-FE-007).
- Thin rooms pages carry `noindex,follow` and are absent from the sitemap.

## Tests

- Unit: room-form helper (1…4 × 3 languages × nominative/accusative where the title needs it).
- Component: city-level table, district-level tile, ru/uz/en.
- E2E (mocked API): `/arenda/tashkent/2-komnatnye/`, `/uz/sotuv/tashkent/yunusobod/4-xonali/`,
  `/en/rent/tashkent/yunusobod/4-room/` (`404`).

## Edge cases

- A district + rooms page exists for one room count only (Yangihayot, `03b` §2.1): links list only existing slices.
- `rooms_max` semantics of «4+» on sale: the count and cards come from the backend predicate; the page only labels it.

## Security

SEC-REQ-021, SEC-REQ-019; no personal data.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-002 (rooms part) ticked; PR reviewed by the other developer.
