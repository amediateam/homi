# KV-FE-122 — SEO by-owner pages

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-004 |
| Dependencies | KV-FE-119 (district template); backend KV-BE-158 (owner statistics), KV-BE-157, KV-BE-159; Q-SEO-004 |

## Goal

The «без посредников» pages — one city page and two district pages per language, 9 in total — show only listings with
an explicit owner mark, with the owner share, «Сколько просят хозяева», the district table, cards and the owners CTA.

## Legacy reference

- LND-050 (by owner: city and district); `$KVADRO_ROOT/docs/seo-pages.md:156`, `:201`, `:289-292`.
- URL-031 `/{rent}/tashkent/{bez-posrednikov|maklersiz|by-owner}/` (3), URL-032
  `/{rent}/tashkent/{district}/{by-owner}/` (6; `sergeli` is one of the two districts).
- Rules: BR-SEO-015 (owner median of current owner listings where ≥ 8, compared with the 60-day usual price; share line;
  district table), BR-SEO-010 (owner mark: owner wording or `#хозяин` / `#собственник`; same rule as BR-API-046),
  BR-SEO-009 (title «Аренда квартир без посредников в Ташкенте — 58 объявлений от хозяина | kvadro²»), BR-SEO-025
  (tags `s_seo_tashkent_owners`, `s_seo_tashkent_sergeli_owners`), BR-SEO-031 (CTA «…и «Только хозяева»…»), BR-SEO-004
  (`bez-posrednikov` / `maklersiz` / `by-owner` reserved at the district level), BR-SEO-030 (linked from the city page
  sentence).

## Implementation

1. `frontend/landing/components/seo/templates/ByOwnerPage.tsx`, registered for `kind = owners` (city) and
   `kind = district_owners`, legacy order:
   1. lead «только объявления, где сдаёт сам хозяин: так написано в тексте или канал поставил пометку (#хозяин,
      #собственник)»;
   2. share line «Это 1% всех квартир…» (`stats.owners.share_pct`);
   3. «Сколько просят хозяева»: owner median (shown only when `n ≥ 8`) next to the usual price;
   4. table «по районам: от хозяев / всего / доля» (city page);
   5. cards (owner listings only, KV-FE-115); CTA (frame) with the owners scenario text.
2. Percentages formatted per locale (`1%`, uz/en per the archive); counts with the plural rules of KV-FE-102.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | indexable | blocks above |
| thin | below the threshold | `noindex,follow`, not in the sitemap |
| owner median hidden | `n < 8` | the «Сколько просят хозяева» block shows the usual price only or is hidden (archive decides) |
| sorted | `?sort=` | KV-FE-115 |
| data-fetch failure | API error | last cached render |
| 404 | `by-owner` under sale, under a district without the page, a foreign slug | KV-FE-100 |

Texts: lead, «Это N% всех квартир…», «Сколько просят хозяева», «от хозяев», «всего», «доля»; namespace
`seo.owners.*`; uz/en from the archive (Q-SEO-004).

## Interaction

Static.

## Telegram integration

n/a, except the CTA link URL-047 and card links URL-054.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/ByOwnerPage.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-owners.ts` (new)
- `frontend/landing/tests/seo/ByOwnerPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{key}?lang=` (KV-BE-159) with `stats.owners {median_usd, n, usual_usd, share_pct,
districts[{district_key, owners, total, share_pct}]}` (KV-BE-158).

## Business rules

- Kept: BR-SEO-015, BR-SEO-010, BR-SEO-009, BR-SEO-025, BR-SEO-031, BR-SEO-004, BR-SEO-030.
- Defect fixes `APPROVED`: LB-SEO-001, LB-SEO-002, LB-SEO-003.
- The owner mark is the backend's (F-OWNER-002); votes may change it later (DEV-010) without a frontend change.

## Acceptance criteria

- The 9 URLs answer as the catalogue says; `/prodazha/tashkent/bez-posrednikov/` answers `404`.
- The city page's district table sums owners and totals consistently with the counters.
- Title equals BR-SEO-009 (ru) and the archive (uz/en).
- Side by side with the archived city and `sergeli` pages (KV-FE-007).

## Tests

- Component: city and district variants; owner median hidden at `n = 7`.
- E2E (mocked API): `/arenda/tashkent/bez-posrednikov/`, `/uz/ijara/tashkent/maklersiz/`,
  `/en/rent/tashkent/sergeli/by-owner/`.

## Edge cases

- Share below 1 %: shown as «<1%» only if the archive does; otherwise rounded per the backend value.
- A district page that loses its owner listings: thin (`noindex`) or `404` per the resolver (Q-SEO-008).

## Security

SEC-REQ-021, SEC-REQ-019; the owner mark labels people — never show phones or names on the page (SEC-REQ-045 concerns
the votes behind the mark).

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-004 ticked; PR reviewed by the other developer.
