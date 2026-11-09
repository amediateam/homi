# KV-FE-116 — SEO section hubs

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-002 |
| Dependencies | KV-FE-114 (frame), KV-FE-115 (cards); backend KV-BE-157, KV-BE-159; Q-SEO-001, Q-SEO-004 |

## Goal

The three section hubs — rent, sale and new builds — exist in ru, uz and en (9 pages, URL-023) with the legacy blocks:
lead, link cards to the special pages and the other sections, the «… по городам» list with counters, and the CTA.

## Legacy reference

- LND-042 (section hub); `$KVADRO_ROOT/docs/seo-pages.md:151` (rent hub title), `:193` (blocks), `:358-367` (tags).
- URL-023: `/arenda/`, `/prodazha/`, `/novostrojki/`; `/uz/ijara/`, `/uz/sotuv/`, `/uz/novostroyka/`; `/en/rent/`,
  `/en/sale/`, `/en/new-builds/` (3 per language, 9 in total, `03b` §2.1).
- Rules: BR-SEO-001 (slugs), BR-SEO-009 (rent hub title), BR-SEO-025 (tags `s_seo`, `s_seo_sale`, `s_seo_new`),
  BR-SEO-030 (interlinking), BR-SEO-031 (CTA texts).
- Inbound links: the landing footer «Все города и районы» → `arenda/`, «Продажа квартир» → `prodazha/` (LND-018).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md`.
   The 9 hub paths are part of `generateStaticParams` of `[lang]/[...slug]` (prerendered at build).
2. `frontend/landing/components/seo/templates/SectionHubPage.tsx`, registered for `kind = hub` in the template registry
   of KV-FE-114; it fills the frame's block slot in legacy order:
   1. lead (section-specific text from the archive);
   2. link cards to the special pages — rent hub: «Индекс аренды» (`/arenda/indeks/`), «Как мы считаем»
      (`/arenda/metodika/`), «Цены на квартиры» (`/prodazha/ceny/`); and to the other two sections; paths built with
      `buildSeoPath` of KV-FE-101 for the page language;
   3. «… по городам»: the six cities with their counters (`links.cities[]`, KV-BE-164 data through the slice);
   4. CTA (frame).
3. Head: title per BR-SEO-009 for the rent hub («Аренда квартир в Узбекистане по городам и районам — объявления из
   Telegram | kvadro²»); sale and new-builds hub titles and all uz/en titles from the KV-FE-007 archive (Q-SEO-004);
   `BreadcrumbList` `kvadro² › Аренда квартир`.
4. Bot payload from the slice (`s_seo`, `s_seo_sale`, `s_seo_new`, with `_uz` / `_en` after `s_seo` for those
   languages, BR-SEO-025).

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | always (hubs are indexable) | blocks above, counters from the snapshot |
| city with 0 listings | a city count is 0 | the city row stays with «0» or is hidden — follow the archive; if the archive does not show it, keep the row (links to a thin page are governed by DEV-050, KV-FE-127) |
| data-fetch failure | API error on revalidation | last cached render |
| 404 | `/novostrojki/ceny/` and other types the section lacks | KV-FE-100 (BR-SEO-004) |

Texts: rent hub title above; link-card labels «Индекс аренды», «Как мы считаем», «Цены на квартиры»; heading «… по
городам» with the section noun; uz/en and the sale/new-builds leads from the archive. Namespace `seo.hub.*`.

## Interaction

Static links only. Responsive: link cards wrap; the city list is a simple list with counts.

## Telegram integration

n/a, except the CTA bot link URL-047 (`s_seo`, `s_seo_sale`, `s_seo_new`).

## Storage and analytics

Through KV-FE-105 only (pageview, autocapture); nothing stored.

## Files

- `frontend/landing/components/seo/templates/SectionHubPage.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-hub.ts` (new)
- `frontend/landing/tests/seo/SectionHubPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/resolve?lang=&path=/arenda/` → `{kind: "hub", slice_key, …}`;
`GET /api/v1/public/seo/slices/{key}?lang=` → counters, `links.cities[] {slice_key, count, indexable}`,
`links.sections[]`, `bot_payload` (KV-BE-159, KV-BE-164).

## Business rules

- Kept: BR-SEO-001, BR-SEO-009, BR-SEO-025, BR-SEO-030, BR-SEO-031.
- DEV-049 `PROPOSED` (payload grammar) is decided in the backend; the hub renders the payload it receives.

## Acceptance criteria

- The 9 hub URLs answer `200`, canonical = itself, hreflang ru/uz/en + `x-default` = ru, and are in the sitemap.
- The rent hub `<title>` equals the BR-SEO-009 text; the other titles equal the archive per language.
- Link cards and the city list point to existing pages of the same language; the CTA payload is `s_seo`, `s_seo_uz`,
  `s_seo_en_sale`, … as the archive shows.
- Side by side with the archived hubs (KV-FE-007): same blocks in the same order.

## Tests

- Component: `SectionHubPage` × 3 sections × 3 languages with fixture slices.
- E2E (mocked API): status, canonical, hreflang, title, H1 and the six city links for `/arenda/`, `/uz/sotuv/`,
  `/en/new-builds/`; `/arenda` → `308 /arenda/` (KV-FE-100).

## Edge cases

- The new-builds hub has no «Индекс аренды» card unless the archive shows one — do not invent cards.
- A city added to the dictionary later appears automatically from the data; no hard-coded city list.

## Security

SEC-REQ-021 (text rendering), SEC-REQ-019 (link targets); no personal data on the page.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-002 (hub part) ticked; PR reviewed by the other developer.
