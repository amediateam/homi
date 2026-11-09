# KV-FE-047 — Listing card and photo strip

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FEED-001, F-OWNER-002, F-MEDIA-001, F-FAV-001 |
| Dependencies | KV-FE-012 (primitives, icons), KV-FE-016 (catalogues), KV-FE-017 (money and numbers), KV-FE-018 (distance and age formatters); backend KV-BE-027 (RES-001 / RES-002), KV-BE-028 (`ListingPreview`); decisions: DEV-019 `PROPOSED`, Q-API-024, Q-APP-011 |

## Goal

The listing card used by the search feed, favourites, history, the map selection card (compact variant) and the
landing's phone demo exists once in `@homi/ui`: photo strip with lazy slides and dots, badge, favourite heart,
«viewed» eye, status tag, server price with period and market chip, facts line, age and location line — byte-equal in
wording to the legacy card, with the unknown-tone defect fixed.

## Legacy reference

- Component inventory `03` §2.1; SCR-007 card description; `$KVADRO_ROOT/demo/app/src/components/ListingCard.jsx:32-93`,
  `PhotoStrip.jsx:22-90`, `Photo.jsx:16-46`, `FavButton.jsx:17-45`, `ListingCardSkeleton.jsx:4-30`;
  `$KVADRO_ROOT/demo/app/src/lib/images.js:9-78`; formatters `$KVADRO_ROOT/demo/app/src/features/listing/format.js:9-279`
  (`listingTitle`, `shortPrice`, `priceKindLabel`, `listingFacts`, `metroLabel`, `centerDistanceLabel`, `ageLabel`,
  `marketVerdict`, `marketDeltaShort`, `cardBadge`).
- Server-formatted strings rendered as sent: `title`, `price`, `age`, `status_text`, `market`, `district_name`,
  `landmark` (`03` §1.12; F-LOCALE-003).
- Rules: BR-APP-026 (badge priority), BR-APP-027 (verdict wording), BR-APP-029 (metro), BR-APP-030 (location line),
  BR-APP-039 (favourite toggle), BR-APP-040 (viewed eye), BR-APP-059 (photos), BR-SEO-038.
- Defects: LB-APP-039 (unknown tone reads as "pricier", also wrong sign in the short label), LB-APP-031 → DEV-019.
- Contract: `ListingPreview` (`08` §1.8), API-011, RES-001, RES-002.
- Visual baselines: card states inside `feed` (`SCR-007-*`), `feed-dark-uz`, `feed-uzs-en-lite`, compact card inside
  `gl-pin-click` (`SCR-013-*`).

## Implementation

1. `frontend/packages/ui/src/listing/ListingCard.tsx` (props: `item: ListingPreview`, `favorite`, `viewed`, `compact`,
   `eager`, `onOpen(id, item)`, `onFavToggle(id, next)`), `PhotoStrip.tsx`, `Photo.tsx`, `ListingCardSkeleton.tsx`,
   `FavButton.tsx`; types from `@homi/types/legacy`. The favourite call itself is injected (the landing demo has none).
2. Formatters in `frontend/packages/ui/src/listing/format.ts`, ported from `format.js` with the catalogues of KV-FE-016:
   title before « · »; price split (first part, `(…)` removed, period from the first `/`); `price_kind:
   down_payment` → «· первый взнос»; facts `fmt.area`, `fmt.floorOf` / `fmt.floor`, server `market`, `fmt.pets`;
   metro only ≤ 1.5 km (under 50 m name only, else `fmt.metroDist` with metres rounded to 100); otherwise
   `fmt.centerKm` with 1 decimal; age = part after « · ».
3. One verdict function `marketVerdict()` (shared with KV-FE-066): tones `check`, `suspicious`, `same`, `mixed`,
   `no_repair`, `good`; +90 % and more → `fmt.marketTimes`. **LB-APP-039 fix:** an unknown tone picks "cheaper" or
   "pricier" by the sign of `median_delta` and renders with the neutral tone class; the short label always carries
   the real sign.
4. Badge (`cardBadge`, BR-APP-026): `suspicious` → `card.suspiciousCheap` (warn) > `check` → `card.checkPrice` (warn) >
   `owner_verified` → `card.ownerVerified` > `good` → `card.belowMarket` > `is_owner` → `card.owner`. Hidden in compact.
5. Photo strip: horizontal scroll-snap; mount slides lazily (viewed ones plus the next; pointer-down mounts the next);
   dots when more than one photo (not compact); compact shows one photo; ▶ badge when `video` is truthy, with a
   blurred thumbnail background; empty `photos_preview` → placeholder.
6. Photo sources (BR-APP-059): `.s.jpg` thumbnail derived only for `/media/<n>/<n>.jpg?…`; Save-Data, `slow-2g`/`2g`/
   `3g` or lite mode → thumbnail only; else `srcset` `480w` / `800w` with `sizes` `(min-width: 640px) 608px,
   calc(100vw - 32px)` (compact `112px`); `loading` lazy except `eager` (first two feed cards, `fetchpriority=high`);
   `referrerPolicy="no-referrer"`; `decoding="async"`; on error the placeholder (no retry, legacy). The first loaded
   photo calls `markFirstContent()` (PostHog loader of KV-FE-035). Plain `<img>` — not `next/image`: the signed relative
   `/media` URLs must not be rewritten (document the lint exception in the file).
7. Favourite heart: `stopPropagation`; ignore taps while busy; haptic `medium` when adding, `light` when removing;
   optimistic `onFavToggle(id, !favorite)`, then the server value `favorite` wins, a failure rolls back silently
   (BR-APP-039); aria `fav.add` / `fav.remove`, `aria-pressed`.
8. Viewed eye (`card.viewedTitle`) when `viewed` and not compact; `status_text` as a warn tag at the photo bottom.
9. DEV-019 flag `dev019OneDistanceFormatter` (default off, owned by KV-FE-018): with it on, the metro distance uses the
   shared distance formatter instead of «· 1 500 м».
10. Card CSS: `content-visibility: auto` with an intrinsic size of 420 px, tokens from KV-FE-011, tone classes `good`,
    `high`, `same`, `mixed`, `no_repair`, `suspicious`, `check`.

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| loading | list first page pending | skeleton: shimmer photo + bars 62 % / 80 % / 35 % |
| priced | `price` present | server `price` split, `card.downPayment` «первый взнос» when `price_kind = down_payment` |
| negotiable | `price` null | `card.negotiable` «Цена договорная» |
| market chip | verdict exists | `listing.marketDelta` «{delta} к рынку»; `same` → `fmt.marketSameShort` «≈ обычная»; `mixed` → `fmt.marketMixedShort` «≈ спорно»; compact card: the short label only («−12%») |
| badge | per priority | `card.suspiciousCheap` «Подозрительно дёшево», `card.checkPrice` «Проверьте цену», `card.ownerVerified` «Хозяин ✓», `card.belowMarket` «Ниже рынка», `card.owner` «Хозяин» |
| facts | always | `fmt.area` «{area} м²», `fmt.floorOf` «{floor}/{total} эт.», `fmt.floor` «{floor} эт.», `fmt.pets` «🐾 можно с животными» |
| location | any part present | district · landmark · `fmt.metroDist` «{metro} · {m} м» or `fmt.centerKm` «{km} км до центра» |
| viewed | `seen[id] ?? item.viewed` | aria `card.viewedTitle` «Вы открывали это объявление» |
| favourite | toggle | aria `fav.add` «В избранное» / `fav.remove` «Убрать из избранного» |
| photo error | image fails | placeholder (ImageOff icon), no text |
| disabled | favourite request in flight | heart ignores taps |

## Interaction

- Tap the card → `onOpen(id, item)` (the caller adds the id to session "seen" and passes the card as preview).
- Horizontal photo swipe inside the card (`.strip` is excluded from swipe-back and sheet drag, KV-FE-013).
- No animation except the photo fade-in (`loaded` class) and the shimmer; reduced motion stops the shimmer.
- Responsive: full column width up to 608 px; compact variant 112 px photo for the map card.

## Telegram integration

TMA-025 (favourite haptics). Nothing else: opening is in-app.

## Storage and analytics

- Storage: none (session maps live in KV-FE-023).
- Analytics: first loaded photo → `markFirstContent()` (starts the lazy PostHog load, KV-FE-035); no events.

## Files

- `frontend/packages/ui/src/listing/{ListingCard,PhotoStrip,Photo,FavButton,ListingCardSkeleton}.tsx` (new)
- `frontend/packages/ui/src/listing/{format,verdict,images}.ts` (new)
- `frontend/packages/types/src/legacy.ts` (`ListingPreview`, if not added by KV-FE-021)
- `frontend/packages/ui/tests/listing/{format,verdict,images}.test.ts`, `ListingCard.test.tsx`

## API contract

- `ListingPreview` (`08` §1.8): strict keys `id`, `favorite`, `photos_preview[]`, `metro_km`, `center_km`,
  `median_delta`; read also `title`/`short_title`, `price`, `price_kind`, `viewed?`, `district_name`, `landmark`,
  `metro`, `area_total`, `floor`, `floors_total`, `market`, `pets_ok`, `is_owner?`, `owner_verified?`, `video`, `age`,
  `status_text`, `median_tone`.
- API-011 `POST /api/listings/:id/favorite` (no body) → `200 {"favorite": boolean}`; any error → rollback.
- RES-001 / RES-002: `/media/<n>/<i>.jpg?e=<unix>&s=<32 hex>` and `.s.jpg` with the same signature (BR-SEO-038,
  Q-API-024).

## Business rules

- Kept: BR-APP-026, BR-APP-027, BR-APP-029, BR-APP-030, BR-APP-039, BR-APP-040, BR-APP-059.
- Defect fix `APPROVED` (policy): LB-APP-039.
- DEV-019 `PROPOSED` (flag in KV-FE-018; card test `todo('DEV-019 PROPOSED')`).

## Acceptance criteria

- For the fixtures of KV-QA-002 the card text (price, chip, badge, facts, age, location) equals the legacy card string
  for string in ru, uz and en.
- `median_tone: "weird"` with `median_delta: -0.12` shows «−12% к рынку» in the neutral tone (LB-APP-039), never "+12%".
- A `price: null` card shows «Цена договорная»; a listing with no photos shows the placeholder; a broken image falls
  back to the placeholder without retry.
- On Save-Data or lite mode only `.s.jpg` is requested; otherwise `srcset` has 480w and 800w.
- Favourite: optimistic fill, server `false` reverts, network error reverts; double tap during the request is ignored.
- Visual: cards in the `feed`, `feed-dark-uz`, `feed-uzs-en-lite` and `gl-pin-click` baselines match (photo ratio,
  badge position, heart, eye, chip colours, line clamping).

## Tests

- Unit: `format.test.ts` (price split with `(…)` and `/мес`, down payment, facts combinations, metro 0.04 / 0.7 / 1.6
  km, centre fallback, age split), `verdict.test.ts` (each tone, +0.9, unknown tone both signs), `images.test.ts`
  (thumbnail derivation, slow network, lite, non-`/media` URL).
- Component: `ListingCard.test.tsx` (badge priority table, compact variant hides dots/badge/eye, video badge,
  favourite optimistic/rollback with a mocked toggle).

## Edge cases

- `title` without « · », `short_title` only; `price` with several « · » parts; `age` without « · ».
- `photos_preview` with absolute CDN URLs (no thumbnail derivation, plain `src`).
- `metro_km` is `null` but `metro` is set → centre distance; both `null` → district and landmark only.
- Very long landmark: the location line ellipsises, never wraps the card height.

## Security

- SEC-REQ-021: every server string rendered as text; no HTML from `price`, `title` or `status_text`.
- SEC-REQ-019: only `/media/…` relative URLs and the configured CDN hosts are used as image sources; others are
  dropped and the placeholder shown.
- `referrerPolicy="no-referrer"` on every photo (signed URLs never leak through Referer).

## Definition of done

`make ci-frontend` green; unit and component tests green (or added when KV-FE-010 lands); side-by-side review of the
card in the listed baselines recorded in the PR; parity gate G4 for F-FEED-001, F-OWNER-002, F-MEDIA-001 and F-FAV-001
ticked (`15` §4); the `09` rows updated; PR reviewed by the other developer.
