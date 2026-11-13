# KV-FE-115 — SEO listing cards, sorting and photos

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-007 |
| Dependencies | KV-FE-114 (frame, data client); backend KV-BE-160 (slice cards), KV-BE-026 (signed photo URLs); KV-FE-106 (deep-link check); decisions DEC-14 (no listing pages); Q-SEO-016 (sort definitions), Q-SEO-007 (legacy signatures in cached pages) |

## Goal

Every SEO page shows up to 24 listing cards of its slice with the legacy markup and content, in the order «Сначала
новые» by default or by `?sort=cheap|expensive|below#cards`, each card linking into the Mini App with
`startapp=l_<id>-seo-<channel>-<post>`; sorted pages are `noindex,follow` with a canonical without the parameter.

## Legacy reference

- LND-056 (cards and sorting), LND-060 (photos), LND-062 (links into the Mini App); `$KVADRO_ROOT/docs/seo-pages.md:210-238`
  (card markup and observed formats), `:379-390` (photos).
- URLs: URL-037 (`?sort=` on any SEO page, 3 variants per page), URL-054 (`startapp=l_<id>-seo-<channel>-<post>`),
  URL-042 / URL-043 (signed `/media` photos).
- Rules: BR-SEO-022 (≤ 24 cards, no pagination, formats per locale), BR-SEO-014 (badges), BR-SEO-026 (deep link),
  BR-SEO-028 (photo URLs), BR-SEO-004 (sort pages `200` + `noindex,follow`), BR-SEO-007 (sort links `rel="nofollow"`),
  BR-SEO-023 (USD).
- Defects: LB-SEO-001 (numbers), LB-SEO-006 (photo errors, backend), LB-LND-012 (unsigned copies — not used here).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/{lazy-loading,incremental-static-regeneration-cache-components}.md`
   and `03-api-reference/02-components/image.md` (decide `<img>` vs `next/image`: the signed `/media` URL carries a
   query that expires within 48 h, so `next/image` optimisation would cache foreign photos under new keys — use a plain
   `<img>` with `width`, `height`, `loading="lazy"`, as legacy).
2. `frontend/landing/components/seo/SeoCards.tsx` (Server Component), anchor `id="cards"`: sort links in legacy order
   «Сначала новые» (no parameter), «Дешевле» (`?sort=cheap#cards`), «Дороже» (`?sort=expensive#cards`), «Ниже рынка»
   (`?sort=below#cards`), each `rel="nofollow"`, the active one marked with `aria-current`.
3. The page reads `searchParams.sort` inside a Suspense boundary (Cache Components: request data stays out of the static
   shell); only `cheap|expensive|below` are passed to the API (KV-BE-159 answers `422` otherwise); any other value is
   ignored and the default order is shown (BR-SEO-004: unknown parameters ignored).
4. Card markup (legacy, `seo-pages.md:221-236`): `<li><a class="card" href="<link>" target="_blank" rel="noopener">`,
   photo block with `<img src="<photo>" alt="" loading="lazy" width="400" height="300">` and badges, body with price
   (`$700` + `<small>/мес</small>`), params, place (optional), foot «<age>» and «Открыть в Telegram ↗».
5. The strings `price`, `params`, `place`, `age` arrive formatted from KV-BE-160 (per locale, LB-SEO-001); badges are
   rendered from `{kind, pct}` with the catalogue: `owner` → «Хозяин» (class `b-owner`), `below_market` → «на N%
   дешевле рынка» / uz «bozordan N% arzon» / en «N% below market» (BR-SEO-014).
6. `link` is checked with the `startapp` parser of KV-FE-106 (`^l_\d+-seo(-[A-Za-z0-9_]{4,32}-\d{1,12})?$`, ≤ 64
   characters, host `t.me`, bot from `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`); a failing link is replaced by
   `https://t.me/<bot>?startapp=l_<id>-seo` and reported.
7. Robots and canonical for sorted pages come from `resolve` (`noindex_reason = sorted`) through KV-FE-103.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | ≥ 1 card | up to 24 `<li>` in the API order |
| empty | 0 cards (thin or empty slice) | the sort links are hidden; one line from the archive (KV-FE-007); if the archive has none: new text (not in legacy) «Сейчас здесь нет объявлений — радар пришлёт новые в Telegram», product owner review |
| sorted | `?sort=cheap|expensive|below` | same list re-ordered, `noindex,follow`, canonical without `sort` |
| photo missing | `photo = null` | neutral placeholder block of the same size (no broken image) |
| photo error | the signed URL answers `404` (expired or taken down) | the `<img>` `onerror` is not available in a Server Component: CSS keeps the placeholder background under the image so a failed load shows the placeholder; no retry |
| data-fetch failure | API error on revalidation | last cached render (KV-FE-114) |

Texts (ru; uz/en from the archive, Q-SEO-004): «Сначала новые», «Дешевле», «Дороже», «Ниже рынка», «Хозяин», «на N%
дешевле рынка», «Открыть в Telegram ↗», period suffixes «/мес» (uz «/oy», en «/mo»). Catalogue namespace `seo.cards.*`.

## Interaction

- A card tap opens Telegram in a new tab (`target="_blank" rel="noopener"`); no client JavaScript.
- Sort links scroll to `#cards`.
- Responsive grid: one column on phones, more on wide screens as in the archive screenshots; image box fixed 4:3 to
  avoid layout shift (CLS ≤ 0.1, `10` §5.12).

## Telegram integration

n/a, except the Mini App deep link URL-054 (parsed by the Mini App, TMA-011: source `seo`, source post offered on the
no-access screen).

## Storage and analytics

None of its own; PostHog autocapture of card clicks through KV-FE-105 (no custom events, LND-063).

## Files

- `frontend/landing/components/seo/{SeoCards,SeoCard,SortLinks}.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-cards.ts` (new)
- `frontend/landing/tests/seo/SeoCards.test.tsx`, `frontend/landing/e2e/seo-sort.spec.ts` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/slices/{slice_key}?lang=&sort=new|cheap|expensive|below` (KV-BE-159) →
`cards[{number, price, params, place|null, age, badges[{kind: owner|below_market, pct?}], photo|null, link}]` (≤ 24,
KV-BE-160). `photo` = `/media/<number>/0.jpg?e=<unix>&s=<32 hex>` (RES-001; the `.s.jpg` variant RES-002 is not used
on SEO pages). `422` for a bad sort never happens because the page filters the value.

## Business rules

- Kept: BR-SEO-022, BR-SEO-014, BR-SEO-026, BR-SEO-028, BR-SEO-004 (sorted pages), BR-SEO-007 (`nofollow`).
- Defect fix `APPROVED`: LB-SEO-001 (formatting comes from the shared formatter).
- Sort semantics (`below` = ascending `median_delta`, tie-break by number) are spec-tested until Q-SEO-016.

## Acceptance criteria

- Each page shows at most 24 cards; no pagination link exists; `?page=2` shows the same cards (DEV-045 handled by
  KV-FE-101).
- `?sort=cheap#cards` returns `200`, `noindex,follow`, canonical = the page without `sort`; the four sort links carry
  `rel="nofollow"`.
- No card contains a phone number, the listing text or an address (asserted on the HTML).
- Every card link matches the `startapp` grammar and is ≤ 64 characters after `startapp=`.
- Side by side with an archived card list (KV-FE-007): same field order, badge texts and formats in ru/uz/en.

## Tests

- Unit: badge rendering (`owner`, `below_market` 12 %, both, none) × 3 locales; link check (valid, 65 characters,
  foreign host, missing channel part).
- Component: `SeoCards` with 0, 1, 24 cards; sorted variant marks the active link.
- E2E (mocked API): four sort URLs per page type; `?sort=foo` renders the default order with `200`; HTML contains no
  `+998` pattern.

## Edge cases

- A cached page older than 48 h would carry expired photo signatures: the cache profile of KV-FE-129 revalidates every
  300 s, so served HTML is never older than the signature window; an archived legacy page's signatures are irrelevant
  after the cut-over (Q-SEO-007).
- Channel names of 32 characters: the backend shortens the link (KV-BE-160); the frontend only verifies.
- A listing taken down between render and click: the Mini App shows its 404 state («Объявление не загрузилось»).

## Security

- DEC-14 and BR-SEO-022: no personal data on public pages; SEC-REQ-025: photos only through the signed, erasable route;
  `/media/` stays disallowed in robots (KV-FE-128).
- SEC-REQ-021: card strings rendered as text; SEC-REQ-019: only `t.me` and own-host URLs.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison of one card list per section
and language recorded in the PR; parity gate G4 for F-SEO-007 ticked; the F-SEO-007 row in `09` updated; PR reviewed
by the other developer.
