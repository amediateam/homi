# KV-FE-117 — SEO city pages

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-002 |
| Dependencies | KV-FE-114 (frame), KV-FE-115 (cards); backend KV-BE-157 (slice aggregates), KV-BE-159; related: KV-FE-127 adds the link blocks when it lands; Q-SEO-020 (Tashkent region template), Q-SEO-004, DEC-30 |

## Goal

The rent and sale city pages exist for the six cities in three languages with the two legacy templates: a city with
districts (Tashkent; Tashkent region per Q-SEO-020) shows the «Цены по районам» table, a city without districts
(Andijan, Namangan, Kokand, Fergana) shows the price tiles by rooms. New-builds city pages use the template of
KV-FE-123.

## Legacy reference

- LND-043 (city with districts), LND-044 (city without districts); `$KVADRO_ROOT/docs/seo-pages.md:194-195`,
  `:62-71` (which districts have pages).
- URL-024 `/{section}/{city}/`: 54 pages in total (6 cities × rent, sale, new builds × 3 languages); this task renders
  the rent and sale ones — 12 per language, 36 in total. Cities: `tashkent`, `tashkent-region`, `andijan`, `namangan`,
  `kokand`, `fergana` (BR-SEO-002).
- Rules: BR-SEO-009 (title and description templates), BR-SEO-010 (counters), BR-SEO-011 (district medians, «—» under 8
  listings, «по N из M»), BR-SEO-025 (tags `s_seo_tashkent`, `s_seo_kokand`, `s_seo_sale_<city>`, uz/en with
  `_uz`/`_en`), BR-SEO-030 (owners link on the city page), BR-SEO-031 (CTA text).
- Defects: LB-SEO-001, LB-SEO-002, LB-SEO-003, LB-SEO-007 (names per script).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/{generate-static-params,generate-metadata}.md`.
   The 36 city paths are listed by `generateStaticParams` from the slice catalogue (KV-BE-157 via `places` / sitemap
   data); the rest render on demand and are cached.
2. `frontend/landing/components/seo/templates/CityPage.tsx`, registered for `kind = city`; variant by
   `stats.has_districts` (data, not a hard-coded list):
   - **with districts** (legacy order): counters (frame); «Цены по районам» — a table district × 1/2/3 rooms with the
     usual price, cells «—» when fewer than 8 listings, district names linking to the district pages; cards (KV-FE-115);
     CTA; links «по комнатам», «по районам», «по кварталам и массивам», «у метро», the other section of the city,
     «по городам» (KV-FE-127);
   - **without districts**: «Сколько стоит аренда в Коканде» (price tiles by rooms with «по N из M объявлений»); cards;
     CTA; links by rooms, sale in the city, «по городам».
3. Frame sentence: «N — от хозяев без риелтора» links to `/arenda/tashkent/bez-posrednikov/` when that page exists
   (BR-SEO-030; only Tashkent has one).
4. Head (KV-FE-103): title template «Аренда квартир в <city, prepositional>… — снять квартиру: N объявлений | kvadro²»
   (BR-SEO-009 city / district row); sale «Купить квартиру в …» per the archive; description per BR-SEO-009 («N квартир в
   аренду в <city> из Telegram-каналов, M новых за неделю. Обычная цена: 1 комната $…, 2 комнаты $…, 3 комнаты $… в месяц.
   Недорогие — кнопкой «Дешевле». Без повторов и рекламы, бесплатно.»; sale: «Обычная цена — $76 500, $1 429 за м².»).
   uz/en from the KV-FE-007 archive (Q-SEO-004). `BreadcrumbList` `kvadro² › Аренда квартир › Ташкент`.
5. Tashkent region: render with the with-districts variant only when the data says it has district slices
   (`chirchiq`, `olmaliq`, `zangiota` for rent; `qibray`, `toshkent-tumani` for sale); otherwise the without-districts
   variant — decide against the archive (Q-SEO-020).

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | indexable city slice | the variant above |
| thin | `indexable = false` | same page, `noindex,follow`, not in the sitemap (DEC-30, BR-SEO-006) |
| median cell missing | group < 8 listings | «—» |
| room tile missing | no median for that room count | tile omitted (archive decides) |
| sorted | `?sort=` | KV-FE-115 |
| data-fetch failure | API error | last cached render |
| 404 | unknown city slug, wrong case, `4-komnatnye` under rent | KV-FE-100 |

Texts: «Цены по районам», «Сколько стоит аренда в <city>», «по N из M объявлений», «1 комната», «2 комнаты», «3
комнаты», «$500/мес»; namespace `seo.city.*`; uz/en from the archive.

## Interaction

Static; the district table scrolls horizontally on narrow phones (no layout overflow of the page).

## Telegram integration

n/a, except the CTA bot link URL-047 and card links URL-054.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/CityPage.tsx`, `frontend/landing/components/seo/{DistrictPriceTable,RoomPriceTiles}.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-city.ts` (new)
- `frontend/landing/tests/seo/CityPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{key}?lang=` → counters (`active`, `new_7d`, `owners`), `medians` per district × rooms
with `n` and `m`, `stats.has_districts`, `cards`, `links`, `bot_payload`, `lastmod` (KV-BE-157, KV-BE-159).

## Business rules

- Kept: BR-SEO-009, BR-SEO-010, BR-SEO-011, BR-SEO-025, BR-SEO-030, BR-SEO-031, BR-SEO-023 (USD).
- Defect fixes `APPROVED`: LB-SEO-001, LB-SEO-002, LB-SEO-003, LB-SEO-007.
- DEV-049, DEV-050 `PROPOSED` (payload grammar, links only to indexable slices) — rendered as the data/flags say.

## Acceptance criteria

- `/arenda/tashkent/` shows the 12-district table with «—» exactly where the snapshot has fewer than 8 listings.
- `/arenda/kokand/` shows the price tiles and the links «по комнатам», sale in the city, «по городам».
- Titles and descriptions equal the templates (ru) and the archive (uz/en) with the snapshot's numbers.
- Side by side with the archived city pages of KV-FE-007 (Tashkent, Kokand; ru, uz, en): same block order.
- KV-QA-014: every city URL of the generated list answers `200` with a complete hreflang set.

## Tests

- Unit: title/description builders with fixture numbers (0, 1, 611, 2 665) per locale.
- Component: both variants × ru/uz/en; owners link only when the by-owner slice exists.
- E2E (mocked API): status, canonical, hreflang, robots for an indexable and a thin city fixture.

## Edge cases

- A city whose sale section has no listings: the page is thin (`noindex`), still `200`, or `404` if the resolver says the
  slice does not exist (Q-SEO-008).
- District names with apostrophes in uz (`Mirzo Ulugʻbek`): rendered from the dictionary, slug without the apostrophe.

## Security

SEC-REQ-021 (text rendering), SEC-REQ-019 (links); no personal data.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-002 (city part) ticked; PR reviewed by the other developer.
