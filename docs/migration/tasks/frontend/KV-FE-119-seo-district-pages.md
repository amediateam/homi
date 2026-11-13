# KV-FE-119 — SEO district pages

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-002 |
| Dependencies | KV-FE-117 (city template, shared price components); backend KV-BE-158 (district rank), KV-BE-157, KV-BE-159; Q-SEO-016 (rank rules), Q-SEO-020 (Tashkent region districts), Q-SEO-004 |

## Goal

The rent and sale district pages exist in three languages with the legacy blocks: price tiles per room count with
«по N из M объявлений», the district-rank sentence, cards, CTA and the district's link blocks. New-builds district
pages use KV-FE-123.

## Legacy reference

- LND-046 (district); `$KVADRO_ROOT/docs/seo-pages.md:152`, `:196`, `:275`.
- URL-026 `/{section}/{city}/{district}/` (138 in total); rent 15 + sale 17 = 32 per language, 96 in total here
  (`03b` §2.1). Districts: Tashkent 12 (`yunusobod`, `chilonzor`, `mirzo-ulugbek`, `yakkasaroy`, `mirobod`, `yashnobod`,
  `shayxontohur`, `olmazor`, `sergeli`, `uchtepa`, `yangihayot`, `bektemir`); Tashkent region `chirchiq`, `olmaliq`,
  `zangiota` (rent), `qibray`, `toshkent-tumani` (sale).
- Rules: BR-SEO-009 (title «Аренда квартир в Юнусабаде, Ташкент — снять квартиру: 611 объявлений | kvadro²» and the
  description), BR-SEO-011 (usual price: 60 days, ≥ 8, ≤ 3 per channel, «по 82 из 197»), BR-SEO-012 (rank sentence),
  BR-SEO-025 (tags `s_seo_tashkent_yunusobod`, `s_seo_tashkent-region_chirchiq`, `s_seo_sale_tashkent_yunusobod`),
  BR-SEO-030, BR-SEO-031.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md`;
   all district paths are prerendered.
2. `frontend/landing/components/seo/templates/DistrictPage.tsx`, registered for `kind = district`, legacy order:
   1. price tiles «1 комната $500/мес · по 82 из 197 объявлений» for 1/2/3 rooms (sale: price and price per m²);
   2. rank sentence «Двухкомнатная здесь в среднем дороже, чем в 7 из 11 других районов города» from
      `stats.rank {rooms, higher_than, of}` (KV-BE-158); hidden when `rank` is `null`;
   3. cards (KV-FE-115); CTA (frame);
   4. links: the district's rooms pages, all districts, the district's quarters, nearby stations, sale in the district
      with per-room counters, cities (KV-FE-127).
3. Description (BR-SEO-009): «611 квартир в аренду в Юнусабаде, Ташкент из Telegram-каналов, 287 новых за неделю.
   Обычная цена: 1 комната $500, 2 комнаты $615, 3 комнаты $800 в месяц. Недорогие — кнопкой «Дешевле». Без повторов и
   рекламы, бесплатно.»; sale: «Обычная цена — $76 500, $1 429 за м².». Place names in the prepositional case from the
   dictionary («в Юнусабаде», «в Чирчике»).
4. `BreadcrumbList`: `kvadro² › Аренда квартир › Ташкент › Юнусабад`.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | indexable | blocks above |
| thin | below the DEC-30 threshold | `noindex,follow`, not in the sitemap |
| tile missing | no median for a room count (< 8) | tile shows «—» or is omitted (archive decides) |
| no rank | `rank = null` (city with < 2 district medians) | sentence omitted |
| sorted | `?sort=` | KV-FE-115 |
| data-fetch failure | API error | last cached render |
| 404 | unknown district, district of another city, reserved slug misuse | KV-FE-100 |

Texts: the tile and rank sentence above (ru); comparatives «дороже» / «дешевле» per the sign — ask the archive whether a
«дешевле» form exists (Q-SEO-016); namespace `seo.district.*`; uz/en from the archive.

## Interaction

Static.

## Telegram integration

n/a, except the CTA link URL-047 and card links URL-054.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/DistrictPage.tsx`, `frontend/landing/components/seo/RankSentence.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-district.ts` (new)
- `frontend/landing/tests/seo/DistrictPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{key}?lang=` (KV-BE-159): counters, `medians[{rooms, median_usd, n, m}]`, `stats.rank
{rooms, higher_than, of}` (KV-BE-158), `cards`, `links`, `bot_payload`, `lastmod`.

## Business rules

- Kept: BR-SEO-009, BR-SEO-011, BR-SEO-012, BR-SEO-025, BR-SEO-030, BR-SEO-031.
- Defect fixes `APPROVED`: LB-SEO-001, LB-SEO-002, LB-SEO-003.
- Rank tie handling and room choice are spec-tested until Q-SEO-016.

## Acceptance criteria

- All district URLs of the generated list answer `200` with canonical and hreflang; Tashkent region districts follow
  the catalogue (Q-SEO-020).
- The tile captions show «по N из M объявлений» with N = used, M = all listings of the room count.
- Rank sentence `7 из 11` for the fixture with 12 districts and one missing median.
- Side by side with the archived Yunusobod page (ru, uz, en): same blocks, same order.

## Tests

- Unit: rank sentence builder (higher_than 0, 7, of; `null`), tile caption per locale.
- Component: rent and sale districts × ru/uz/en.
- E2E (mocked API): `/arenda/tashkent/yunusobod/`, `/uz/ijara/tashkent-region/chirchiq/`,
  `/en/sale/tashkent-region/qibray/`.

## Edge cases

- A district that exists for sale but not for rent (`qibray`): `/arenda/tashkent-region/qibray/` → `404`.
- `of = 0`: no sentence.

## Security

SEC-REQ-021, SEC-REQ-019; no personal data.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-002 (district part) ticked; PR reviewed by the other developer.
