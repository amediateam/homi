# KV-FE-114 — SEO page frame: breadcrumbs, counters, CTA, footer

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-002 |
| Dependencies | KV-FE-101 (path parser), KV-FE-102 (catalogues, formatters), KV-FE-103 (head, JSON-LD helper), KV-FE-106 (bot link builder); backend KV-BE-157 (slice catalogue), KV-BE-159 (public statistics API); decisions DEC-15 (S2 scope), DEC-14 (no listing pages), DEC-10 (USD); Q-SEO-001, Q-SEO-004, Q-SEO-011 |

## Goal

One server-rendered frame serves every SEO page type of `03b` §2.3: header with language switch, breadcrumbs, H1,
lead, counter tiles, the summary sentence, a slot for the type blocks, the Telegram CTA, a slot for the link blocks
and the footer — rendered from one data snapshot per slice, in ru/uz/en, as the legacy pages do (LND-040, LND-041).
The per-type tasks (KV-FE-116…KV-FE-126) only fill the block slot.

## Legacy reference

- LND-040 (general: server-rendered, no JS but `stats.js`, USD only, CDN 5 min), LND-041 (common frame);
  `$KVADRO_ROOT/docs/seo-pages.md:32-42`, `:174-187`; `03b` §2.3, §2.5.
- Rules: BR-SEO-010 (counters), BR-SEO-023 (USD only), BR-SEO-025 (CTA payload), BR-SEO-030 (owners link on the city
  page), BR-SEO-031 (CTA texts), BR-SEO-007 (head, via KV-FE-103).
- Defects: LB-SEO-001 (number format), LB-SEO-002 (plurals), LB-SEO-003 (one snapshot for all languages),
  LB-SEO-011 (payload grammar → DEV-049).
- URLs: the SEO patterns URL-023…URL-035 (counts per language: 336, ×3 = 1 008); footer links URL-050 (support bot),
  URL-060 (Instagram).
- Parity baseline: the per-type template fixtures extracted by KV-FE-007 (no `area.css`, SVGs or uz/en texts exist in
  the mirror — Q-SEO-001, Q-SEO-004).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/{generate-static-params,
   generate-metadata,cacheLife,cacheTag}.md`, `01-app/02-guides/{incremental-static-regeneration-cache-components,
   internationalization,json-ld}.md`. `cacheComponents` is on: data reads use `use cache` + `cacheLife('seo')` +
   `cacheTag` (profile defined by KV-FE-129), never route-segment `revalidate`.
2. Server-only data client `frontend/landing/lib/public-api/client.ts` (`import 'server-only'`): base URL from
   `PUBLIC_API_INTERNAL_URL` (`17` §4), Sanctum token with `public-data:read` from a server-only variable (name
   announced in the PR per KV-INF-003; never `NEXT_PUBLIC_*`); unwraps the ADR-0007 envelope; typed readers
   `resolve(lang, path)`, `slice(key, lang, sort)`, `places(lang)` (KV-BE-159).
3. `frontend/landing/app/[lang]/[...slug]/page.tsx` (route of `10` §5.3): `resolve` → `kind` → template from a
   registry `frontend/landing/components/seo/templates/index.ts`; unknown → `notFound()` (localised 404 of KV-FE-100).
   Each cached read is tagged `seo:slice:<slice_key>` and `seo:snapshot` — **not** per language, so the three language
   versions revalidate together (LB-SEO-003).
4. `frontend/landing/components/seo/SeoFrame.tsx` (Server Component) renders, in legacy order:
   - header: logo → the landing of the language (`/`, `/uz/`, `/en/`), language switch «Русский · Oʻzbekcha · English»
     linking to the **alternates of the same page** from `resolve.alternates` (Q-SEO-011: confirm in the archive);
   - breadcrumbs (`kvadro² › Аренда квартир › Ташкент › Юнусабад`) + `BreadcrumbList` JSON-LD through the helper of
     KV-FE-103;
   - `h1`, lead, counter tiles («611 квартир в аренду», «287 новых за 7 дней»), the sentence «Сейчас в Юнусабаде — 611
     квартир в аренду, 287 из них появились за последнюю неделю, 6 — от хозяев без риелтора.» (BR-SEO-010; the owners
     clause links to the by-owner page on the city page, BR-SEO-030);
   - `{children}` (type blocks);
   - CTA «Новые квартиры … — сразу в Telegram» with the scenario text of BR-SEO-031 and the button «Открыть в Telegram»
     → `https://t.me/<bot>?start=<bot_payload>` from the slice data, checked by the builder of KV-FE-106;
   - `{links}` slot (KV-FE-127);
   - footer «Главная · Конфиденциальность · Поддержка (@KvadroSupportBot) · Instagram».
5. Counters and plurals through the formatters of KV-FE-102 (ru one/few/many, uz one, en one/other; narrow no-break
   space thousands in ru/uz, comma in en — LB-SEO-001, LB-SEO-002). Place names in the grammatical case the template
   needs come from `places` (cases per language, LB-SEO-007), never concatenated by hand.
6. `stats.js` equivalent (KV-FE-105) is included by the landing root layout; this frame adds nothing else client-side.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | `resolve.indexable = true` | full frame, `robots` index,follow (KV-FE-103) |
| thin page | `indexable = false`, `noindex_reason = thin` | same frame, `<meta name="robots" content="noindex,follow">`, excluded from the sitemap (KV-FE-128) |
| sorted | `?sort=` present | same frame with re-ordered cards (KV-FE-115), `noindex,follow`, canonical without the parameter |
| empty slice | counters 0 (Q-SEO-008 decides `200 noindex` vs `404`) | follow `resolve`: a `404` answer → 404 page; a slice with 0 listings → frame with zero counters and the empty card block of KV-FE-115 |
| data-fetch failure | API `5xx`/timeout during revalidation | the last cached render keeps being served (`10` §5.14); no cached render → localised `error.tsx` with `noindex,follow` |
| 404 | unknown slug, wrong case, foreign slug, type the section lacks | KV-FE-100 page («Страница не найдена» / «Sahifa topilmadi»), DEV-047/DEV-048 redirects behind flags |

Texts are SEO templates, not Mini App keys: ru from `03b` §2.3 and BR-SEO-009/BR-SEO-031, uz/en from the KV-FE-007
archive (Q-SEO-004). Catalogue namespace `seo.frame.*` in `@homi/i18n` (KV-FE-102); a text the archive does not hold is
"new text (not in legacy), product owner review".

## Interaction

- Plain links only; no client interaction besides the language switch links and the analytics loader.
- Responsive: one column on phones, legacy landing breakpoints (`landing.css`) as far as the archive shows; no layout
  shift from late data (everything is in the HTML).

## Telegram integration

n/a, except the bot CTA link URL-047 (`start=s_seo…`, tagged with `--v<visit>` at click time by KV-FE-105, BR-LND-003).

## Storage and analytics

- `sessionStorage kv-visit` and PostHog (cookieless) through KV-FE-105; no custom events (LND-063, Q-SEO-005).
- No localStorage on SEO pages.

## Files

- `frontend/landing/lib/public-api/{client,types}.ts` (new)
- `frontend/landing/app/[lang]/[...slug]/{page,error}.tsx` (new)
- `frontend/landing/components/seo/{SeoFrame,Breadcrumbs,CounterTiles,SeoCta,SeoFooter}.tsx`,
  `frontend/landing/components/seo/templates/index.ts` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-frame.ts` (new)
- `frontend/landing/tests/seo/SeoFrame.test.tsx`, `frontend/landing/e2e/seo-frame.spec.ts` (after KV-FE-010)

## API contract

- `GET /api/v1/public/seo/resolve?lang=&path=` → `{slice_key, kind, canonical, alternates {ru, uz, en, x-default},
  indexable, noindex_reason, redirect}`; `404` envelope with `data.links` → 404 page.
- `GET /api/v1/public/seo/slices/{slice_key}?lang=&sort=` → counters, medians, `stats`, `cards`, `links`,
  `bot_payload`, `snapshot_id`, `lastmod` (KV-BE-159). `401`/`403` are deployment errors (alert, error page).
- `GET /api/v1/public/places?lang=` → names, cases, slugs.

## Business rules

- Kept: BR-SEO-010, BR-SEO-023 (USD, no switch, until DEC-10 says otherwise), BR-SEO-025, BR-SEO-030, BR-SEO-031.
- Defect fixes `APPROVED` (policy): LB-SEO-001, LB-SEO-002, LB-SEO-003.
- DEV-049 `PROPOSED`: the payload grammar is chosen by the backend (`bot_payload`); the frontend renders it as sent and
  validates length only.
- DEC-14: no per-listing pages; the frame never shows a phone, listing text or address.

## Acceptance criteria

- For one page of each type × language from the KV-FE-007 archive, the rendered frame has the same breadcrumbs, H1,
  counter texts, sentence, CTA text and payload, and footer links (numbers aside).
- ru `168 квартир`, `81 новая за неделю` (correct plural), uz and en per their rules; thousands separators per locale.
- The three language versions of a slice show identical numbers for one snapshot.
- A forced `500` of the API after one successful render keeps serving the previous HTML.
- The language switch links point to the alternate of the same page.

## Tests

- Unit: counter sentence builder per locale (0, 1, 2, 5, 11, 21, 81, 168); breadcrumb list → JSON-LD shape.
- Component: `SeoFrame` with fixture slices (district, city, quarter) × ru/uz/en; owners link only on the city page.
- E2E (mocked public API): status, canonical, hreflang set, robots, title, H1 for one URL per type; API failure after a
  warm cache keeps `200`.
- Parity: the crawl comparison of KV-FE-176 and the URL suite of KV-QA-014.

## Edge cases

- A place without a case form in a language: fall back to the nominative with the preposition the template needs and
  report once (never an empty string).
- Counters 0 with owners 0: the owners clause is omitted, not «0 — от хозяев».
- A slice whose `bot_payload` exceeds 49 characters: render the CTA without the payload suffix and log (BR-LND-003).

## Security

- SEC-REQ-021: every API string rendered as text; JSON-LD serialised with `<`, `>`, `&`, U+2028, U+2029 escaped.
- SEC-REQ-019: only `https://t.me/…` and own-host links are emitted.
- The public-data token stays server-side; no API URL or token appears in the HTML.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-002 ticked; the F-SEO-002 row in `09` updated; PR reviewed by the other developer.
