# KV-FE-063 — Listing screen: shell, hero, title row, key facts, loading and errors

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | L |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-LISTING-001, F-LISTING-002 |
| Dependencies | KV-FE-013, KV-FE-023, KV-FE-025, KV-FE-047; backend KV-BE-036 (API-008), KV-BE-018 (number resolver, merge redirect); decisions: Q-API-035, Q-API-023 |

## Goal

The listing layer (SCR-018 frame) opens over any tab from a card, a map card, a radar find, a hidden item or a deep
link; it renders the feed preview at once, replaces it with `GET /api/listings/:id`, follows a merge redirect to the
surviving listing, and shows the hero photo strip, the status banner, the title row, the key-fact tiles, the section
slots and the CTA-bar slot. Loading, `404` and error states are SCR-019. The view is keyed by listing id (LB-APP-003
fixed). The body sections are separate tasks (KV-FE-064…KV-FE-071) mounted into the slots created here.

## Legacy reference

- Screens: SCR-018 (`03` §2), SCR-019; `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:47-249` (layout
  `:158-247`, error branches `:112-125`, swipe gating `:89-93`, `listing-open` body class `:96-99`, video tap
  `:148-157`); loader `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:19-65` (redirect, scroll to
  top, `call_url` capture); hero `ListingHero.jsx:12-18` + `$KVADRO_ROOT/demo/app/src/components/PhotoStrip.jsx:22-85`;
  title row `ListingTitleRow.jsx:64-89`; key facts `sections/KeyFacts.jsx:19-53`; skeletons `ListingSkeleton.jsx:5-57`.
- Opening paths: `03` §1.1 (`listingId`, `preview`), `$KVADRO_ROOT/demo/app/src/app/App.jsx:147` (`openListing` adds to
  the session `seen` map); deep links TMA-010, TMA-012 (KV-FE-037).
- Contract: API-008 (`08` §2, models `ListingPreview` / `ListingDetails` in `08` §1.8). Rules BR-API-048 (merge
  redirect), BR-API-095 (view recorded, UNVERIFIED, Q-API-035).
- Defect: LB-APP-003 (stale translation and «original open» after a redirect) → fixed here by keying.
- Visual baselines (KV-QA-019): `listing-open` and `listing-post-deleted` → `SCR-018-*.png`. SCR-019 has no baseline:
  compare against `ListingSkeleton.jsx` and the strings below.

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` and
   `preserving-ui-state.md` (the layer is client state, not a route).
2. `frontend/app/app/(miniapp)/features/listing/ListingLayer.tsx`: registered in the layer stack of KV-FE-025 with
   `onClose`; renders `<ListingScreen key={currentId} …/>`, so every id change (navigation or merge redirect) remounts
   the screen and drops translation, «original open», viewer and sheet state (LB-APP-003).
3. `useListing(id)` in `features/listing/useListing.ts` over the request cache of KV-FE-023: consumes the deep-link
   prefetch (`main.jsx` equivalent), returns `{preview, details, error, reload}`. When `details.id !== requestedId` the
   layer replaces its current id with `details.id` and seeds the cache entry of the new id with the same response (no
   second request, no scroll jump) — BR-API-048.
4. `item = details ?? (preview?.id === id ? preview : null)`; `photos = details?.photos ?? item.photos_preview`;
   `place = [district_name, landmark].filter(Boolean).join(' · ')`.
5. Hero: `PhotoStrip` from `@homi/ui` (KV-FE-047) with `counter`, `label` (big video button) and `total =
   details ? undefined : item.photos_count`; tap → photo viewer (KV-FE-070), or for `video` with details loaded and
   `!post_deleted` → open `original_url` (`original_opened`, `src: video`, KV-FE-065 owns the helper).
6. Status banner from `status_text` (server string, rendered as text). Title row: `h1` = part of `title`
   (`short_title` fallback) before « · »; `place` line; share button only when `meta.bot_username` is known (KV-FE-069
   wires the action); `FavButton` variant `plain` (KV-FE-047, favourite state `favs[id] ?? item.favorite`); «⋯» opens
   the actions sheet (KV-FE-071).
7. Key-fact tiles (`KeyFacts`): rooms (`plural listing.rooms`), `area_total` (`listing.m2`), floor
   `floor/floors_total` (`listing.floor`), building `market_code === 'new'` → `listing.newBuilding` else
   `listing.secondary` (`listing.building`); nothing when all four are absent.
8. Slots in legacy order: market block (KV-FE-066) → facts, stats, history (KV-FE-064; `SectionSkeleton` 3 lines while
   details are pending) → location (KV-FE-067) → author, description, sources (KV-FE-064/065; `SectionSkeleton` 4
   lines) → fixed CTA bar (KV-FE-068). Overlays (viewer, market sheet, spot map, actions) render inside the layer and
   push their own Back handlers (KV-FE-025).
9. Swipe-back with `useSwipeBack` of KV-FE-013 only when `item !== null` and no overlay is open; disabled on Android.
   Body class `listing-open` while mounted (pull-to-refresh and nudges read it, KV-FE-046).
10. On open: add `id` to the session `seen` map (KV-FE-023) and call `trackScreen('listing', {listing_id})`
    (KV-FE-035). Scroll the layer to the top on every new id.

## States and texts

| State | When | Rendering and keys |
| ----- | ---- | ------------------ |
| loading, no preview | no `item` yet (deep link) | full skeleton: shimmer hero + bars 70 % × 22 px, 50 %, 100 % × 64 px; `aria-hidden` |
| loading, preview shown | preview present, details pending | hero, title, key facts and market block from the preview; `SectionSkeleton` blocks of 3 and 4 lines; shimmer CTA |
| success | details loaded | all sections; photos from `photos` (full set) |
| not found | API-008 `404` | plain text `listing.loadFailed` «Объявление не загрузилось» (uz «Eʼlon yuklanmadi», en «Couldn’t load the listing»), no button; only Back closes |
| error | network, timeout, `5xx` | tall `ErrorState` (KV-FE-012): offline `error.offline` «Нет связи» + `error.offlineText`, else `common.loadFailed` «Не загрузилось» + `error.serverText`; button `error.retry` «Повторить» → `reload()` |
| access | `403` | with the DEV-001 flag on: the no-access screen (KV-FE-042); off: the error state |
| session expired | `401` | the session-expired state of KV-FE-036 |
| deleted post | `post_deleted: true` | video tap opens the viewer instead of the post; CTA rules in KV-FE-068 |

Other labels: `listing.share` «Поделиться» (aria), `actions.menu` «Ещё» (aria), `listing.watchVideo` «Смотреть видео в
Telegram», `fav.add` / `fav.remove` (aria of the heart). The photo counter is «N / M» (no key).

## Interaction

- Swipe right closes the listing on iOS and desktop: start 10 px, close at 33 % width or 0.5 px/ms, settle 180 ms;
  ignored inside `.strip`, inputs and `[data-no-swipe]` (`03` §3.4).
- Horizontal photo swipe with scroll-snap in the hero; light haptic on photo tap.
- Telegram Back closes the top overlay first, then the listing (TMA-022). The Settings button closes the listing
  (KV-FE-025, LB-APP-046 fix).
- Layer `position: fixed; inset: 0`, z-index 45 over tabs (`03` §3.6); one column up to 608 px wide; safe areas from
  KV-FE-026; the CTA bar is fixed at the bottom above the bottom inset.
- Reduced motion: no shimmer animation, instant settle.

## Telegram integration

TMA-022 (Back stack), TMA-023 (Settings button closes the layer), TMA-010 / TMA-012 (opened from `start_param` or
`?listing=` with the prefetch), TMA-025 (light haptic on photo tap).

## Storage and analytics

- Storage: none; `seen` is session memory only (`03` §1.11).
- Analytics: `$pageview` screen `listing` with `listing_id` (`03` §3.3); no journal event on open. `original_opened`
  (`src: video`) through the helper of KV-FE-065.

## Files

- `frontend/app/app/(miniapp)/features/listing/{ListingLayer,ListingScreen,ListingHero,ListingTitleRow,KeyFacts,ListingSkeleton}.tsx` (new)
- `frontend/app/app/(miniapp)/features/listing/useListing.ts` (new)
- `frontend/app/tests/listing/{useListing,KeyFacts,ListingScreen}.test.tsx`, `frontend/app/e2e/listing-open.spec.ts`

## API contract

- API-008 `GET /api/listings/:id` → `200 ListingDetails`; strict keys used here: `id` (number), `photos`,
  `photos_preview`, `video`, `post_deleted`, `status_text`, `title` / `short_title`, `district_name`, `landmark`,
  `rooms`, `area_total`, `floor`, `floors_total`, `market_code`, `favorite`, `lat`, `lon`, `geo_radius_m`.
- `id` in the response may differ from the request (merge survivor): switch without a second request.
- Errors: `404 {"detail":…}` → not-found text; `401` / `403` / other → states above. The 15 s timeout of KV-FE-021
  applies.

## Business rules

- Kept: BR-API-048 (merge redirect), BR-API-095 (a view is recorded by the server on open — no client call);
  BR-APP-040 (the viewed eye comes from the session `seen` map, set here).
- LB fix `APPROVED` (policy): LB-APP-003 — the screen is keyed by id; translation and disclosure state never leak.
- DEV-001 `PROPOSED` (via KV-FE-042) for `403`.

## Acceptance criteria

- A feed card opens the layer with its preview in the same frame (no blank state) and swaps in details without
  layout jump of the hero and title.
- A deep link to a merged id renders the survivor's id, and the history/fav state refers to the survivor; exactly one
  API-008 request is sent.
- After a redirect, no translation or open disclosure from the previous listing is visible.
- `404` shows only «Объявление не загрузилось»; a `500` shows the error state and «Повторить» refetches once.
- Swipe-back works on iOS and desktop when no overlay is open, never on Android.
- Visual: side by side with the `SCR-018` baselines (`listing-open`, `listing-post-deleted`) — hero, banner, title row,
  key-fact tiles and section order equal.

## Tests

- Unit `useListing.test.ts`: preview → details; redirect id seeds the cache and triggers no second fetch; `404` vs
  `500` vs `401` mapping; prefetch consumption.
- Component `KeyFacts.test.tsx`: rooms plural ru (1, 2, 5, 21), area, `floor` only, `floor/floors_total`, `market_code`
  `new` / `secondary` / absent, all absent → nothing rendered.
- Component `ListingScreen.test.tsx`: video tap with and without `post_deleted`; share button hidden without
  `bot_username`; skeleton variants.
- E2E `listing-open.spec.ts` (contract mocks of KV-FE-022): open from the feed, Back closes; `listing-post-deleted`
  fixture; redirect fixture (requested 101 → returned 205).

## Edge cases

- `title` missing but `short_title` present; both missing → empty `h1` must not crash (render nothing).
- `photos` empty: hero shows the placeholder of `Photo` (KV-FE-047), no counter.
- The user opens another listing while details for the first are in flight: the late response is dropped (keyed
  remount).
- Withdrawn listing (Q-API-023): rendered with its `status_text` banner; contact rules in KV-FE-068.

## Security

- SEC-REQ-021: every server string (`title`, `status_text`, `district_name`, `landmark`) is rendered as text.
- SEC-REQ-019: `original_url` is opened only when it is `https://t.me/…` (helper of KV-FE-065).
- TMA-009: the deep-link `start_param` never reaches analytics; only the numeric `listing_id` does.

## Definition of done

`make ci-frontend` green; unit, component and E2E tests green (or added when KV-FE-010 lands); visual review of the
SCR-018 baselines and the SCR-019 states recorded in the PR; parity gate G4 for F-LISTING-001 and F-LISTING-002 ticked
(`15` §4); the feature rows in `09` updated; PR reviewed by the other developer.
