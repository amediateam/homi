# WP-24 — Feed and listing card

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #71 on 2026-11-17; production track: the photo check of the header, then the regular deploy; then the manual checks inside Telegram on staging) |
| Depends on | WP-23 |
| Size | ≈ 2 400 changed lines, M |
| Behaviour reference | `03` §1.11 (session-only state), §1.12 (server-formatted values), §2 screens SCR-007, SCR-008, SCR-009 and the place of SCR-047 in the list, §2.1 (shared components), §3.4 (constants), §4 rules listed under Scope; `02` BR-API-111, BR-API-156; task files KV-FE-047, KV-FE-048, KV-FE-049, KV-FE-023 (session maps and first-paint ideas only) — behaviour, texts, edge cases and test ideas only; their file layout, request cache, API paths and transport are not taken |
| Needs from the production track | Nothing new. Before the deploy, confirm that the photo addresses in the stub fixtures of WP-12 load on staging and production and that their host is in the `img-src` list of WP-21 |

## Goal

The search tab shows the real feed: the listing card with its photo strip, the header chips, cursor paging, and
every loading, error, empty and few-results state, rendered on the server when the session cookie exists and by
the client otherwise. The card, the favourite button, the verdict and badge rules and the list component are
built once here and reused by favourites, history, the map card and the listing screen.

## Scope

**In.**

- Screens SCR-007 (search list), SCR-008 (loading and error states of every listing list), SCR-009 (search empty,
  few-results note, and the empty states of favourites and history as components).
- Rules owned here: BR-APP-024 (paging), BR-APP-025 (few-results note), BR-APP-026 (badge priority), BR-APP-027
  (verdict wording), BR-APP-030 (location line), BR-APP-039 (favourite toggle), BR-APP-040 («viewed» eye),
  BR-APP-059 (photos).
- Defects owned here: LB-APP-039 and LB-APP-042 fixed; LB-APP-038 behind `dev024ResetOnlyWithActiveFilters`
  (DEV-024, off).
- v1 methods: `GET /listings`, `PUT /favorites/{number}`, `DELETE /favorites/{number}`.
- Seams for later packages: `previewCache`, `radars/capability`, the generic `ListingFeed` and `useCursorFeed`,
  `useScreenSearchState` (the search of a screen's own address, KI-43), and the inline slot of the search list that
  WP-30 fills with the radar card (SCR-047).
- WP-21 and WP-22 code this package changes: the router refresh of `SessionProvider` (only after a sign-in of the
  launch, `SessionState.renewed`), the saved city of `useSearchState` (read hydration-safe, the `profileCity`
  option), the device rule of `lib/graphics.ts` (moved to `lib/device.ts`).

**Out.**

- Filters, quick filter, sort and city sheets behind the chips — WP-25 (the chips push their WP-20
  placeholders until then). Listing screen — WP-26. Compact card on the map — WP-27 (variant built here).
- Favourites and history screens — WP-29 (they reuse `ListingFeed`). Radar subscribe flow — WP-30.
- The follow nudge, the return banner (SCR-046) and the radar card inside the list (SCR-047) — WP-30; the
  home-screen nudge — WP-31. Screen tracking and the PostHog loader — WP-32.
- Filter model, summaries, distance and money formatters, error mapping, session maps — WP-22 (used here).

## Decisions that bind this package

| Topic | Source | Consequence here |
| ----- | ------ | ---------------- |
| Rendering | DEC-44, 25 §3.1 | `(main)/page.tsx` is a Server Component with a static shell; the part that reads the cookie and the search parameters sits inside `<Suspense>`; nothing per-user is cached |
| Two session modes | DEC-44, 25 §3.4, RK-30 | One `ListingFeed`: it takes `initial` when the server had a session and fetches through `/bff/listings` when it did not; both paths are in the end-to-end suite |
| Contract | DEC-41, 25 §4.1–§4.2 | Listings are addressed by `number`; the list ends when `meta.next_cursor` is `null`; `503 source_unavailable` shows the "could not load" state; favourites use explicit `PUT` and `DELETE`, never a toggle |
| Server strings | 25 §4.5, Q-API-062 | The card renders the display strings of the contract; where the contract gives one combined string the legacy split of `03` §1.12 applies; nothing is re-formatted that the server already formatted |
| Demo data | 25 §4.4, RK-27 | Every list answer reports `meta.source` (the browser's pages through `bffFetch`, the server's page one through `SourceReporter`); the marker of WP-20 shows on the feed while an answer of the screen, the listings included, comes from a stub |
| Defects and flags | DEC-36 | LB-APP-039 and LB-APP-042 are fixed unconditionally; LB-APP-038 is a `DEV` row and stays behind its flag |
| Baseline | 25 §8, `wave-1/baseline.md` | The rules below are those of the pinned release `index-DY_DH7h-.js`. Since `index-Dbpp463V.js` «Хозяин» ranks above «Ниже рынка» (BR-APP-026, BR-API-111) and `price.kind: business` has the label `card.businessPrice` (BR-API-156); since `index-DY_DH7h-.js` the search list carries the radar card after its 8th card (SCR-047, built by WP-30 in the slot of this package); since `index-CBlEKxdL.js` the badges have kinds, the verified badge reads «Проверенный хозяин», and the compact card shows a shield (*added by the intake of `index-CBlEKxdL.js`*) |
| Photos | 25 §4.5 | Photo addresses arrive ready from the API; the client only derives the small variant |
| Acceptance | DEC-46, 25 §9 | The checklist below is ticked in ru / uz / en and light / dark |

## Design

### Documents to read first

In `frontend/app/node_modules/next/dist/docs/01-app/`:
`02-guides/authentication-with-cache-components.md`, `02-guides/streaming.md` ("Push dynamic access down"),
`03-api-reference/03-file-conventions/{page,loading}.md`, `03-api-reference/04-functions/use-search-params.md`,
`03-api-reference/02-components/link.md` (`prefetch`), `02-guides/preserving-ui-state.md`,
`02-guides/server-actions.md`. Facts used from them:

- `searchParams` of a page is a promise, and awaiting it or `cookies()` at the top of a page makes everything
  below dynamic (`page.md`, `streaming.md`); the page therefore passes the promise into a component under
  `<Suspense>`.
- `<Link>` prefetches routes as they enter the viewport (`use-router.md`, `link.md`); card links set
  `prefetch={false}`, because a feed would otherwise request one listing route per card.
- With `cacheComponents` the feed route stays mounted but hidden under other routes, and its effects are cleaned
  up while hidden (`preserving-ui-state.md`): the scroll observer and timers live in effects.

### Page and data flow

```text
app/[locale]/(main)/page.tsx
  FeedPage({ searchParams })                 static shell, <div data-route="feed">
    <Suspense fallback={<FeedSkeleton />}>
      <FeedServer searchParams={searchParams} />     reads cookie + parameters (readFirstPage)
        → <FeedScreen initial={…} serverSmallOnly={…} profileCity={…} />   Client Component
          → <ListingFeed …>                          useCursorFeed, cards, states
```

- `FeedServer`: the `searchParams` promise reaches it unawaited; its testable half `readFirstPage(searchParams)`
  returns `{ initial, serverSmallOnly, profileCity }`. `readSearchState()` of WP-22 (the server-side wrapper of
  `fromSearchParams()` of `@homi/search`) gives `filters` and `sort`. With a session token it calls
  `serverApi()` for `GET /listings` with `feedQuery(filters, sort)` of `features/feed/feedQuery.ts`
  (`toApiQuery(filters, { sort, rules: searchRules(), limit: 20 })`; `toApiQuery` drops the sort `new` itself) and
  passes `initial = { key: feedListKey(filters, sort, 0), result }`, where `result` is the `ApiResult` (a failure is
  passed on, not thrown). On an address without a city it reads `GET /me` first and lists the profile's city
  (BR-APP-010); it hands that city to `FeedScreen` as `profileCity`, which the client's server render and hydration
  render use as the profile while `useSession().me` is still `null`, so both build the server's key. The two reads
  run one after the other, because the listings query depends on the city (one API round trip more on such an
  address). Without a token, without `/me` or a profile city, and when `GET /listings` or `/me` answers
  `unauthorized`, it passes `initial = null`: the browser asks for page one after the bootstrap has signed in again
  (WP-21).
- `FeedScreen` (`features/feed/FeedScreen.tsx`): reads `useScreenSearchState('feed', { profileCity })` (the search
  of its own address, KI-43), builds the list key, registers the pull-to-refresh handler
  (`registerRefresh(routes.feed(), …)`) and renders `ListingFeed` plus the empty and few-results slot. A pull bumps
  the refresh version of the search shown; any other search, a return to an earlier one included, starts again at
  version 0, the version of the server's page one. The pull settles when page one of the new list has answered
  (`ListingFeed`'s `onFirstPage`), or when the search changes, the feed is hidden or it unmounts, so the indicator
  never hangs. A new list key scrolls to the top in a layout effect, before the new list is painted, only while the
  feed's own address shows: never on the first render, under a layer or below a sheet loaded directly. It also
  starts `measureScrollPerformance()` of `lib/graphics.ts` once per launch, on the first scroll of the feed (the lite
  measurement of `03` §1.7, which WP-21 left to this package).
- **List key** = canonical query of `toSearchParams(filters, sort)` + `|` + refresh version, built only by
  `feedListKey()` of `feedQuery.ts`, the one function `FeedServer` and `FeedScreen` both call (D2). `filtersKey()` is
  not used for it, because it ignores `posted_days` (BR-APP-012) and the list must be re-created when that changes.
- `useCursorFeed({ key, path, query, initial, enabled, renewed, flags })` → `{ items, status, error, done,
  loadingMore, loadMore, retry, source }` (`status` is `loading` until page one has answered, then `success` or
  `error`; `source` is `meta.source` of the latest answer, the server's included):
  - adopts `initial` (`FeedInitial = { key, result }`) only when `initial.key` equals `key`, at the start of that
    key's list; otherwise fetches page one through `bffFetch`; a later `initial` for the same key (the router
    refresh after a sign-in, a tab tapped back to the list, which re-reads the dynamic page) is not adopted; a failed
    `initial.result` is the error state without a request, and `retry()` asks the browser for page one;
  - a page one adopted while the session was booting is kept once it is ready, unless the launch signed in
    (`useSession().renewed`, WP-21): then it was read with the document's cookie (none, a revoked one, another
    Telegram user's), and the list starts again from page one through `bffFetch`;
  - `enabled` is `useSession().status === 'ready'` and gates sending only: an adopted page one renders on the server
    and in the hydration render whatever the session status (D3); while the session is booting without one the
    list shows skeletons and sends nothing;
  - the caller's `query` decides `limit` (the feed sends 20, WP-29 none); for one key it must serialise the same on
    every render, because a change aborts the pending page and sends it again;
  - next page with the last `meta.next_cursor`; `null`, a missing or empty cursor, or any cursor already sent for
    this list (the previous one included) ends the list, so an A → B → A loop ends too; items are de-duplicated by
    `number`; no automatic retry after an error, and `retry()` asks again for the failed page only; a change of
    `key`, an unmount or a hidden route aborts the request in flight and drops its result (a hidden route keeps its
    items and asks again when shown); a rejection other than that abort shows "could not load";
  - with `dev001AnyForbiddenShowsAccess` on, a `forbidden` page calls `onForbidden()` of `lib/session/bootstrap`
    itself, as `useResource` does; a forbidden `initial` waits for `ready`.
- `ListingFeed` (`source: 'feed' | 'favorites' | 'history'`, `path`, `query`, `listKey` — `key` is React's —,
  `initial`, `serverSmallOnly`, `few`, `emptySlot`, `inline`, `above`, `onFirstPage`, `flags`) is generic: WP-29
  passes other paths. It reads `enabled` and `renewed` from `useSession()` itself, so every caller behaves the
  same. What follows the cards is `listEnd({ source, done, error, visible }, few?.context ?? null)` of
  `fewResults.ts`: `'few'` calls `few.render(visible)` below the cards, `'empty'` renders `emptySlot`; the note is a
  prop of its own because it also stands below a short list and decides the inline slot. `above` (history's
  «Очистить», WP-29) shows above the first card while one is visible; `onFirstPage` is called each time page one of
  the list shown has answered, the adopted one included (the end of a pull). `inline` (a React node, used only with
  `source: 'feed'`) is rendered once, at the place `inlineSlotIndex(visible, done, noteShown)` of
  `features/feed/inlineSlot.ts` gives (`number | null`, the count of visible cards before it): after the 8th
  visible card; with 8 or fewer visible cards after the last one, but only when the list is fully loaded without
  an error and the few-results note is not shown; otherwise not at all. With 9 visible cards it stands after the
  8th and the note below the list (SCR-007, BR-APP-072). It is one keyed row among the cards, so a card hidden above
  it moves it without a remount (the radar card keeps its state). This package passes nothing into it; WP-30 passes
  the radar card. It reads the session maps of WP-22: `favorite = favs.get(number) ?? item.favorite`,
  `viewed = source !== 'history' && (seen.has(number) || item.viewed)`; the search and favourites drop items in
  `hidden`, favourites also those un-favourited in this launch, and history shows every item it gets (legacy
  `ListingFeed.jsx`, WP-29). While its own address shows it renders `SourceReporter` with `source`, because nothing
  else reports the server's page one; under a layer or a sheet it reports nothing, so the feed's `stub` does not
  mark the listing (KI-43).
- The sentinel is an `IntersectionObserver` with a root margin of 800 px. It is observed only while the session is
  ready, the last page succeeded, the list has not ended and no page is loading, and anew after each page: a
  sentinel still in reach asks again, and nothing asks during the boot or after an error.

### Card

The card components of `features/feed/` fetch nothing, so the card can be shown with fixture data (the gallery of
WP-23, `features/gallery/CardStates.tsx`) and reused by WP-26, WP-27, WP-29, WP-31. They write only the launch's
state: `FavButton` saves through `setFavorite` and writes `favs`, and the card's link writes `seen` and the preview
cache.

| File | Content |
| ---- | ------- |
| `ListingCard.tsx` | Props `item`, `favorite`, `viewed`, `compact`, `eager`, `serverSmallOnly`, `href`, `onOpen`, `onFavorite` (`favorite` and `viewed` default to the card's flags; `onFavorite` is `FavButton`'s `onChange`). Compact: one photo, short verdict only, no badge, no eye, no dots, no age (legacy `.lc.compact .lc-ago`); the price-kind label and the status tag stay. For `owner_verified` the compact card shows a `ShieldCheck` (16 px, `--good`, `role="img"` labelled `card.ownerVerified`) after the price and the short verdict (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `ListingCard` for a later package (`wave-1/baseline.md`, built code behind the pin, row 2)) |
| `ListingCardSkeleton.tsx` | Shimmer photo and three bars (62 %, 80 %, 35 %); `FeedSkeleton`, three of them in the list column (`FEED_FRAME`), the page's Suspense fallback |
| `PhotoStrip.tsx`, `Photo.tsx` | Scroll-snap strip with lazy slides, dots, video badge, placeholder; `Photo.tsx` also exports `PhotoPlaceholder` and `PhotoBackdrop` (the blurred copy behind a video photo), so every `<img>` of the card is in that file |
| `FavButton.tsx` | Heart with optimistic state; the `overlay` variant (`full`, `compact`) over a photo and the `plain` one of the listing's title row (WP-26) |
| `images.ts` | Small-variant derivation and the network rule |
| `cardText.ts` | Price, facts, age and location lines from a card |
| `verdict.ts` | `marketVerdict(item, locale, t)` → `{ tone, text, short }` (the locale formats the «x» of `fmt.marketTimes`); `marketChipText(verdict, t)`, the chip's text; `verdictToneOf(market)`, shared with `badges.ts` |
| `badges.ts` | `cardBadge(item)` → `{ kind, tone, key } \| null` |
| `types.ts` | `ListingPreview`, the generated card type every file of the feed imports |
| `FeedHeader.tsx` | Chip row, mounted in the `chips` region of `TopBar` |
| `FeedEmpty.tsx`, `FewResultsNote.tsx`, `fewResults.ts` | States of SCR-009 and their conditions; `fewResults.ts` also gives `listEnd()` (note, empty state or nothing), `FewResultsNote.tsx` also `useFewResultsContext()` and `FewActions` (the note's buttons, which the DEV-024 empty state reuses) |
| `useCursorFeed.ts`, `inlineSlot.ts`, `ListingFeed.tsx`, `FeedScreen.tsx` | List machinery |
| `FeedServer.tsx`, `feedQuery.ts` | Page one with the cookie (`readFirstPage`); the query and list key both sides build |

- The card is a link: `<Link href={routes.listing(number)} prefetch={false} scroll={false}>`, with `Link` from
  `i18n/navigation.ts` (the wrapped one of WP-21, so the push is counted for Back); on click it adds the number
  to `seen`, calls `setPreview(number, item)` and lets the router push. The heart sits beside the link, over the
  photo: a `<button>` may not sit inside an `<a>`, and its label would join the link's name. The focus ring is drawn
  by the card's `<article>` (`:has(a:focus-visible)`; the card holds one link), because the `content-visibility` of
  later cards clips anything drawn outside the link's box.
- Photos are plain `<img>` elements, not `next/image`: the addresses are signed and must reach the browser
  unchanged. The lint rule `@next/next/no-img-element` is disabled per element in `Photo.tsx`
  (`eslint-disable-next-line` with the reason), not for the whole file.
- `lib/data/previewCache.ts`: `setPreview(number, card)`, `getPreview(number)` (`null` when absent); module
  memory in insertion order, last 200 cards, a card set again becomes the newest; read by WP-26 to paint the
  listing at once.
- `lib/analytics/firstContent.ts`: `markFirstContent()` — called by the first photo that loads, it resolves
  `firstContentShown()` once; a no-op until WP-32 hangs the analytics loader on it.

### Favourites

`lib/actions/favorites.ts`: `setFavorite({ number, on }, auth?, locale?)` → `PUT /favorites/{number}` when `on`,
`DELETE /favorites/{number}` otherwise; `ActionResult` (an input that fails its check makes no request and answers
`validation`). `FavButton` calls it through `useAction()`, which passes the locale as for every action of WP-22.
Because the methods are explicit, success keeps the requested state and the answer's flag is not read; only a
failure changes it back, and the rollback writes the state before the tap into `favs` again. `FavButton` reads
`favs` itself, so a parent may pass the server's flag or the merged state.

### Radar seam

`features/radars/capability.ts` exports two things. `radarsReady = false` is a build-time constant that only
orders the frontend packages: WP-30 flips it when the radar screens exist. `useRadarsEnabled()` is what every radar
entry point asks: it returns `true` only when `radarsReady` is `true` and `useReference().radarsEnabled` (the
reference's `radars_enabled === true`) is `true` — the server's switch of DEC-51, which WP-22 reads as `false`
while the reference data is missing. Its signature is `useRadarsEnabled({ ready = radarsReady } = {})`: the option
exists for tests, which cannot flip the constant through a module mock. The few-results note renders its radar
button only when `useRadarsEnabled()` is true and then calls `subscribe(filters, 'few')` from
`features/radars/subscribe.ts`. So that this import compiles before WP-30, this package creates `subscribe.ts` as
a stub with the final signatures: `subscribe(filters, entry, relaxed?)` resolves `{ ok: false }` and
`useHasActiveRadar(filters)` returns `false` (WP-25 imports both too); it also exports `RadarEntry` (the generated
`StoreRadarRequest["entry"]`) and `SubscribeResult { ok }`, which WP-30 widens to the `{ ok, toast }` of its Files.
WP-30 writes the real bodies and flips the constant.

## Files

New, under `frontend/app/`:

- `features/feed/{ListingCard,ListingCardSkeleton,PhotoStrip,Photo,FavButton}.tsx`
- `features/feed/{FeedHeader,FeedEmpty,FewResultsNote,ListingFeed,FeedScreen,FeedServer}.tsx`
- `features/feed/{useCursorFeed,images,cardText,verdict,badges,fewResults,inlineSlot,feedQuery,types}.ts`
- `features/radars/capability.ts`, `features/radars/subscribe.ts` (stub)
- `features/gallery/CardStates.tsx` (the card states on fixture data), `features/gallery/Entry.tsx` (moved out of
  `UiGallery.tsx`)
- `lib/data/previewCache.ts`, `lib/actions/favorites.ts`, `lib/analytics/firstContent.ts`
- `lib/device.ts` (the device rule of lite graphics, which a Server Component can import, D4)
- `lib/search/useScreenSearchState.ts` (the search of a screen's own address, KI-43, D1)
- `tests/feed/{verdict,badges,images,cardText,fewResults,inlineSlot,useCursorFeed,FeedServer}.test.ts`
- `tests/feed/{ListingCard,PhotoStrip,FavButton,FeedHeader,ListingFeed,FeedScreen,FewResultsNote,FeedEmpty}.test.tsx`
- `tests/actions/favorites.test.ts`, `tests/data/previewCache.test.ts`, `tests/analytics/firstContent.test.ts`,
  `tests/radars/capability.test.tsx`, `tests/search/useScreenSearchState.test.tsx`
- `tests/helpers/listing.ts` (`previewOf`, `translator`), `tests/helpers/reference.ts` (`cityOf`, `feedReference`:
  they feed the real `useReference` store)
- `e2e/feed.spec.ts`

Changed, under `frontend/app/`:

- `app/[locale]/(main)/page.tsx` (placeholder of WP-20 replaced)
- `features/shell/TopBar.tsx` (mount `FeedHeader` in the `chips` region; the deal tabs read
  `useScreenSearchState('feed')`), `features/shell/MiniTitle.tsx` (the same hook), `features/shell/RoutePlaceholder.tsx`
  (the feed's links dropped); `features/shell/RefreshProof.tsx` is deleted (the feed registers its own pull handler)
- `features/gallery/UiGallery.tsx` (card states for review; `app/[locale]/dev/ui/page.tsx` only mounts it and is
  unchanged)
- `card.businessPrice` is a legacy key of the pinned release and arrives with the import of WP-20. One `homi` key
  is added: `feed.loading` («Загрузка…», «Yuklanmoqda…», «Loading…»), the list's status line for screen readers
  (`packages/i18n/messages/homi/*.json`, checked in `packages/i18n/tests/catalogue.test.ts`)
- `lib/graphics.ts` (the device rule moved to `lib/device.ts` and re-exported, so no importer changed),
  `lib/search/readSearchState.ts` (`addressCity`)
- `lib/search/useSearchState.ts` (the saved city through `useSyncExternalStore`, the `profileCity` option),
  `lib/storage.ts` (`subscribeStorage`)
- `lib/session/bootstrap.ts` (`SessionState.renewed`) and `lib/session/SessionProvider.tsx` (the router refreshes
  only after a sign-in of the launch)
- `tests/gallery/page.test.tsx`, `tests/search/useSearchState.test.tsx`, `tests/session/{bootstrap,provider}.test.*`,
  `tests/shell/{TopBar,MiniTitle}.test.tsx`, `tests/storage.test.ts`
- `e2e/{back,data,foundation,gates,shell}.spec.ts` (the feed placeholder's links and proof are gone: the chips and
  the cards replace them; `data.spec.ts` runs on `/ru/map`, where `SearchProofServer` stays until WP-27; `gates.spec.ts`
  runs the header-mode expired case there), `e2e/{csp,smoke}.spec.ts` (the stub photos answered by `stubMedia`)
- `README.md`

Changed outside `frontend/app/`:

- `frontend/packages/ui/src/icons/index.ts` (re-exports `ChevronDown`, `Eye`, `ImageOff`, `Play`) and
  `frontend/packages/ui/tests/controls.test.tsx`
- `frontend/packages/ui/src/styles/lite.css` (360 px for a lite card, AM-69) and
  `frontend/packages/ui/tests/tokens.test.ts`
- `frontend/packages/testing/src/playwright.ts` (`stubMedia`, `STUB_MEDIA`, `STUB_JPEG`: the stub photos answered with
  an inline JPEG, because CI has neither the stub CDN's DNS nor its files)
- `backend/app/Http/Controllers/Api/V1/Listings/ListingController.php`, `docs/api/openapi.json` and
  `frontend/packages/types/src/generated/api.ts` (`GET /listings` documents a nullable `meta.next_cursor`, AM-65)
- `.github/workflows/frontend-e2e.yml` (`NEXT_PUBLIC_CDN_URL` on the end-to-end step, so the CSP's `img-src` allows
  the stub photos)

## Steps

1. Read the documents listed under Design and the cited task files; check the generated types of `GET /listings`
   and the favourites methods against the fields named below, and fix the contract spec in this PR if one is
   missing.
2. `images.ts`, `Photo`, `PhotoStrip` with unit tests for the derivation and the network rule.
3. `cardText.ts`, `verdict.ts`, `badges.ts` with unit tests (verdict and badge tables below).
4. `ListingCard` (full and compact) and `ListingCardSkeleton`; card states in the gallery page.
5. `lib/actions/favorites.ts` and `FavButton` (optimistic, rollback, busy) with the `favs` session map.
6. `lib/data/previewCache.ts`; the card as a link that records `seen` and the preview.
7. `useCursorFeed` with its unit tests.
8. `ListingFeed`: skeletons, cards, sentinel spinner, the two error forms, hidden-item filtering; `inlineSlot.ts`
   and the `inline` prop with their tests.
9. `(main)/page.tsx` with `FeedServer` under `<Suspense>` and `FeedScreen`; check both session modes by hand.
10. `FeedHeader` in the top bar: chip set, labels, badge; six chips push the four sheet route patterns
    (`/filters`, `/sort`, `/filters/[kind]` for rooms, price and owner, `/city`), «Своя область» switches to the map.
11. `fewResults.ts`, `FewResultsNote`, `FeedEmpty` (all three sources), `features/radars/capability.ts`, the flag
    branch of DEV-024.
12. Pull-to-refresh handler and refresh version; scroll to top on a key change.
13. `e2e/feed.spec.ts` (the tests whose requests carry the session in both modes, the others once; see Tests); run
    the acceptance checklist; update the queue and the handoff.

## Behaviour to reproduce

### Search list (SCR-007)

- The default tab and view. The list belongs to the current filters and sort; any change of them, or a
  pull-to-refresh, re-creates it from page one and scrolls to top.
- Paging (BR-APP-024): pages of 20; the next page loads when the sentinel is within 800 px; the list ends on a
  `null` cursor; an item whose number was already shown is skipped.
- The first two cards load their photo eagerly with high priority and without the fade-in, so a server-rendered
  photo shows before hydration (legacy faded every photo); later cards are lazy, fade in, and use
  `content-visibility: auto` with an intrinsic size of 420 px. Under lite graphics every full card, the first two
  too, uses it with 360 px (`lite.css` of `@homi/ui`; the pinned release's `.lite .lc:not(.compact)`, AM-69). The
  scroll measurement that can turn lite graphics on (`measureScrollPerformance()`, Android in `auto` only, `03` §1.7)
  starts once per launch, on the first scroll of the feed (`FeedScreen`).
- Listings hidden or blocked in this launch disappear from the list at once (session map `hidden`); the server
  excludes them after the next fetch.
- Opening a card marks it viewed for this launch and opens the listing over the feed; the feed keeps its scroll
  position when the listing is closed.
- Gestures: vertical scroll drives the collapsing chrome of WP-23; horizontal swipe inside a card's photo strip
  moves only the strip (`data-no-swipe`, `data-scroll-x`).

### Header chips (SCR-007)

In this order, in one horizontally scrolling row; the chips are `HeaderChip` buttons (each with `data-chip`), and
each tap gives a light haptic and pushes its route (the area chip replaces, item 3) with the feed's search state,
which always carries the city (`/filters?city=tashkent` from `/ru`). They read the feed's own search
(`useScreenSearchState('feed')`, KI-43), so under a listing or a sheet they keep the feed's.

1. Filters: icon only, aria `sheet.title` «Фильтры», with the count «Фильтры, N» when there is a badge, badge with
   the number of active filter groups (rule BR-APP-011, WP-22) when it is above zero → `routes.filters()`.
2. Sort: label `sort.<value>` of the address's sort, e.g. «Сначала новые» (`sort.new`), through
   `labelFor('sort', …)`; aria «Сортировка, {label}» (`sort.title` and the visible label, WCAG 2.5.3) →
   `routes.sort()`. The label comes from a table with a default, never from a concatenated key; it is not narrowed
   to the sorts on offer, because before the reference data only three are offered.
3. «Своя область» (`map.areaOn`), highlighted, only when a polygon is set → the map with the same parameters
   (`nav.tab`, a replace, as the view toggle).
4. Rooms: «Комнаты ⌄» (`head.rooms`) or the summary of `roomsLabel()`, highlighted when set; hidden when every
   selected type is room, commercial or land (rule BR-APP-006, WP-22) → `routes.quickFilter('rooms')`.
5. Price: «Цена ⌄» (`head.price`) or the summary of `priceLabel()`, highlighted when set (legacy) →
   `routes.quickFilter('price')`.
6. Owner → `routes.quickFilter('owner')`. With `owner = any` the chip reads «Кто размещает» (`sheet.who`),
   not highlighted — the fix of LB-APP-042 (legacy showed «Без риелторов» as if a filter were applied). With a
   value it reads «Без риелторов» (`owner.no_agents`) or «Только хозяева» (`owner.owners`), highlighted.
7. City: MapPin and the city name, only when the reference data has more than one city → `routes.city()`.
   Before the reference data arrives the chip is absent; a city code the reference data does not know keeps the
   chip with MapPin alone and aria `city.title` «Город».

### Card (SCR-007, 03 §2.1)

- Photo strip: scroll-snap; slides mount lazily (the first at once; a scroll mounts the slide reached and the one
  after it, and seen slides stay; pointer-down mounts the next); dots, one per address of `photos.preview` (not
  `photos.count`), when there is more than one photo; a ▶ badge when the listing has a video (a mark hidden from
  assistive technology: the card's link opens the listing, and «Смотреть видео в Telegram» is the listing screen's
  button);
  no photos → placeholder; a photo that fails to load → placeholder, no retry (a new address for the slide, e.g. a
  re-signed one after a refresh, is a new photo).
- Photos (BR-APP-059): the small variant `.s.jpg` (480 px) is derived only for addresses of the form
  `…/<digits>/<digits>.jpg?…`; other addresses are used as they are. With Save-Data, a connection of 3g or
  slower, or lite graphics only the small variant is requested; otherwise `srcset` offers 480w and 800w with
  `sizes="(min-width: 640px) 608px, calc(100vw - 32px)"` (compact: `112px`). Every photo has
  `referrerPolicy="no-referrer"` and `decoding="async"`, the blurred copy behind a video photo too.
- Server-rendered photos (cookie mode): the server cannot read `navigator.connection` or storage, so the server
  render and the hydration render use the card's `serverSmallOnly`, and the client's own answer applies from
  hydration on. `FeedServer` sets it for the first page from the request: `Save-Data: on`, or a Telegram-Android
  performance class below `HIGH` in the User-Agent (the pure rule `isLowEndDevice({ userAgent })` of
  `lib/device.ts`; `lib/graphics.ts` imports a React client hook, which a Server Component's imports may not hold,
  so the device rule lives in its own module and `lib/graphics.ts` re-exports it, D4). Limit:
  what only the client knows — a lite choice or a measured lite result in storage, a connection of 3g or slower,
  an Android device judged by its cores and memory — reaches the first page's photos at hydration, so the browser
  may start them from the full `srcset` first; a hint the client does not confirm (a stored `full` choice) switches
  them to the full set at hydration.
- Over the photo: the badge (not in compact), the heart, the «viewed» eye (aria `card.viewedTitle` «Вы открывали
  это объявление»), and the status text of the listing as a warning tag at the bottom.
- Badge priority (BR-APP-026, BR-API-111), first match wins: «Подозрительно дёшево» (`card.suspiciousCheap`, warn) >
  «Проверьте цену» (`card.checkPrice`, warn) > «Проверенный хозяин» (`card.ownerVerified`; «Хозяин ✓» up to legacy
  release `index-BnFvC-Ft.js`) > «Хозяин» (`card.owner`) > «Ниже рынка» (`card.belowMarket`, good). Before legacy
  release `index-Dbpp463V.js` «Ниже рынка» ranked above «Хозяин»; the pinned order is the one above. The market
  badges come from the verdict, so they need a delta as well (`verdictToneOf`): «Ниже рынка» is the tone `good` with
  a non-null `median_delta`, not any negative delta, and «Подозрительно дёшево» and «Проверьте цену» need one too
  (legacy `format.js` `cardBadge`, BR-APP-026). The badge tone `good` is drawn as the plain frosted tag: the pinned
  release has no green tag for «Ниже рынка»; the warn tags are orange.
- Badge kinds (legacy since `index-CBlEKxdL.js`; `format.js:269-301`, `ListingCard.jsx:60-61`,
  `listing-card.css:168-181` at r31): `warn` for the two price warnings; `verified` for «Проверенный хозяин», drawn
  with a green `ShieldCheck` (15 px, stroke 2.4; padding-left 8 px, gap 5 px); `quiet` for «Хозяин» (`#4b4f57`, weight
  500); «Ниже рынка» has no kind and stays the plain tag. The priority order did not change
  (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `badges.ts` and `ListingCard` for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 1)).
- Compact card (legacy since `index-CBlEKxdL.js`; `ListingCard.jsx:92-97`, `listing-card.css:182-188` at r31): still
  no badge, but for `owner_verified` a `ShieldCheck` (16 px, `--good`) follows the price and the short verdict, with
  `role="img"` and `card.ownerVerified` as its label and title (*added by the intake of `index-CBlEKxdL.js`*; a parity
  item of `ListingCard` for a later package (`wave-1/baseline.md`, built code behind the pin, row 2)).
- Price line: amount, period, and the price-kind label `priceKindLabel(kind)` of `cardText.ts`: «· первый взнос»
  (`card.downPayment`) for `down_payment`, «· цена за бизнес, помещение в аренде» (`card.businessPrice`; uz
  «biznes narxi, joy ijarada», en «business price, premises rented», `03` SCR-007) for `business` (BR-API-156),
  nothing for `null` or any other value (Q-API-065); without a price «Цена договорная» (`card.negotiable`). The full and the compact card
  show the label alike, so it appears in the feed, favourites, history and the map card (SCR-013); on the listing
  screen only the share text carries it (WP-26). The WP-12 contract delivers the legacy split already done:
  `price.display` (amount), `price.period`, `price.kind` (`down_payment`, `business` or `null`), and `price` is
  `null` for a negotiable price — the client does not split a string. The same holds for `title` (already the
  short form), `posted.label` and `posted.when` (the two parts of the age), `market.label`, `market.median_delta`
  and `market.tone`, `pets_ok`, `has_video`, `is_owner`, `owner_verified`, `status_text`. In the generated types
  `price`, `price.period`, `price.kind`, `district`, `landmark`, `metro`, `metro.km`, `center_km`, `is_owner`,
  `market.label`, `market.median_delta`, `market.tone`, `photos.cover` and `status_text` may be `null`;
  `posted.label` and `posted.when` are strings; `PriceKind` is the closed enum `down_payment | business`, so "any
  other value" is a guard only.
- Market chip (BR-APP-027): «{delta} к рынку» (`listing.marketDelta`); tone `same` → «≈ обычная»
  (`fmt.marketSameShort`); tone `mixed` → «≈ спорно» (`fmt.marketMixedShort`); compact card: the short label only
  («−12%»). Tones `check`, `suspicious`, `same`, `mixed`, `no_repair`, `good` have their own wording; `high`
  (a key of the `verdictTone` table, with its own legacy colour) is a known tone that reads "pricier"; any other
  case is "pricier", and from +90 % «В {x} раза дороже рынка» (`fmt.marketTimes`, `x` with one decimal in the
  locale's number format); percentages are `round(abs(delta) · 100)`. No delta or no tone → no verdict → no chip.
- Fix of LB-APP-039: an unknown tone is worded by the sign of the delta ("cheaper" below zero, "pricier" from
  zero up) and drawn in the neutral tone, the colours of `same`; the short label always carries the real sign
  (U+2212 for a minus).
- Facts line: title (the contract already sends the part before « · », so the client does not split it),
  «{area} м²» (`fmt.area`, rounded), «{floor}/{total} эт.» (`fmt.floorOf`) or «{floor} эт.» (`fmt.floor`), the
  market string of the listing, «🐾 можно с животными» (`fmt.pets`); a zero or missing area or floor is left out;
  then the age: `posted.when`, the part legacy shows after « · » (BR-API-072), or `posted.label` when `when` is
  empty — never both.
- Location line (BR-APP-030): `district · landmark · (metro label or «{km} км до центра»)`. The metro label and
  its 1.5 km limit are `formatMetroLabel()` of WP-22 (rule BR-APP-029 and the flag of LB-APP-031 are owned there);
  the centre distance is `fmt.centerKm` with one decimal. A missing part is left out; a long landmark ellipsises.
- «Viewed» eye (BR-APP-040): shown when the listing was opened in this launch or the server says so; never in
  history and never on the compact card.
- Every server string is rendered as text.

### Favourite (BR-APP-039)

- Tap: the heart fills or empties at once; medium haptic when adding, light when removing; aria `fav.add`
  «В избранное» / `fav.remove` «Убрать из избранного», `aria-pressed`.
- The request is `PUT` or `DELETE` for the new state. Success keeps it; any failure returns the heart to the
  state before the tap, without text and without an error haptic (as legacy). Taps while the listing's request runs
  are ignored on every heart of that listing (the card's and, in WP-26, the listing screen's); hearts of other
  listings stay usable.
- The heart is a sibling of the card's link over the photo (8 px inside the photo's top-right corner, 4 px on the
  compact card's photo); its click never reaches the link.
- The choice is kept for this launch in `favs` and wins over the flag in list answers.

### Loading and errors (SCR-008, all three sources)

| State | Trigger | What shows |
| ----- | ------- | ---------- |
| First load | page one has not answered: no adopted server page one while the session boots, or a retry of page one | 3 card skeletons with shimmer (static under reduced motion) |
| Next page | sentinel reached | spinner at the sentinel |
| Offline, no items | `offline` or `timeout` | WifiOff, «Нет связи» (`error.offline`), «Проверьте интернет и попробуйте ещё раз.» (`error.offlineText`), «Повторить» (`error.retry`) |
| Server, no items | `server`, `source_unavailable`, `rate_limited`, any other error except `forbidden` (an `unauthorized` that reaches the list included) | CloudOff, «Не загрузилось» (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через минуту.» (`error.serverText`), «Повторить» |
| Error with items | a later page failed | inline button «Не загрузилось — повторить» (`feed.retry` with `common.loadFailed`); the cards stay |
| No access | `forbidden` on any page | inline button «Нет доступа — повторить» (`feed.retry` with `common.noAccess`), also on page one without cards; with DEV-001 off the session stays `ready` |

- "No items" counts the loaded items, as legacy (`items.length === 0`): when every loaded item is hidden, a failed
  later page still shows the inline retry.
- «Повторить» repeats the failed page only. Nothing retries by itself.
- With `dev001AnyForbiddenShowsAccess` on (off, like every `DEV` flag), a `forbidden` answer does not stay in the
  list: `useCursorFeed` calls `onForbidden()` of `lib/session/bootstrap`, as `useResource` of WP-22 does, and the
  session turns `denied` (LB-APP-045 is owned by WP-22; AM-68). The error mapper `lib/api/errors.ts` and `bffFetch`
  do not do it.
- `unauthorized` is handled below the list: `bffFetch` re-authenticates once (WP-21, WP-22); if that fails the
  session-expired screen of WP-23 replaces the app. The server's page one never carries it: `FeedServer` passes
  `initial = null` instead, and the browser asks after the sign-in.
- For screen readers (WCAG 4.1.3, 2.4.3): the list is `aria-busy` while page one loads; one status line reads
  «Загрузка…» (`feed.loading`) while a page loads and «Не загрузилось» / «Нет доступа» once the inline retry shows
  (`ErrorState` is an alert itself); the sentinel spinner is hidden from them; a retry moves the focus to the list,
  because the button it was on goes away.

### Empty and few results (SCR-009)

- Few-results note (BR-APP-025) shows when all of these hold: source is the search feed; the list is fully loaded
  without an error; fewer than 10 visible items; no active filters; city stats are loaded and the city has a
  name. "Visible" counts after removing hidden items.
  - Title: «Ничего не нашлось» (`feed.nothing`) with 0 items; «Это все объявления об аренде» (`feed.fewRent`,
    daily rent included) or «Это все объявления о продаже» (`feed.fewSale`) otherwise.
  - Hint `feed.fewHint`: «{city}: новых объявлений немного. Включите радар — он пришлёт новые в чат, как только
    появятся.»
  - «Смотреть продажу · N» (`feed.seeSale`) or «Смотреть аренду · N» (`feed.seeRent`): the other deal is sale,
    or long-term rent when the current deal is sale; shown only when that deal has more listings in the city
    than are visible now; it does what the title tabs do (`useDealSwitch` of `TopBar`): `switchDeal()`
    (geography kept, BR-APP-002) and the sort the new deal still offers (`normalizeSort`, BR-APP-023) in one
    replace — a search change is no layer (`25` §3.2) —, a light haptic, then the top of the list.
  - «Включить радар по этому поиску» (`feed.subscribeHere`): only when `useRadarsEnabled()` — so never while
    radars are switched off on the server (DEC-51); hidden when a radar with the same filters exists; a light
    haptic; disabled while its request runs, and enabled again after a rejection (built here; WP-30 gives
    `subscribe` its body).
  - «Другой город» (`feed.otherCity`): only with more than one city; pushes `routes.filters()` with the search
    state (the sheet is a layer), with no haptic, as legacy.
- Search empty (0 visible items and the note not shown): magnifier mascot, «Ничего не нашлось»
  (`feed.nothing`), «Попробуйте ослабить фильтры» (`feed.nothingHint`), «Сбросить фильтры»
  (`feed.resetFilters`), which applies the defaults of the base deal and the current city (rule BR-APP-022,
  `resetAll` of WP-22) and keeps the sort, as legacy (a reset only widens the sorts on offer). The mascots are
  `brand.assets.emptyMagnifier` and `brand.assets.emptyShrug` (the WP-20 placeholders in `public/brand/`, DEC-40),
  not the `packages/ui/src/assets/mascots/` of KV-FE-049.
- LB-APP-038: with no active filters and city stats not yet loaded, legacy still offers «Сбросить фильтры».
  Flag off: the same. With `dev024ResetOnlyWithActiveFilters` on, that case shows the note's buttons (other deal,
  other city, radar) instead of the reset; with no stats yet that can be «Другой город» and the radar alone, or no
  button at all. When the stats arrive, the plain state is replaced by the note.
- Favourites empty: shrug mascot, «Здесь пока пусто» (`feed.favEmpty`), «Нажмите ♡ на объявлении, чтобы
  сохранить его» (`feed.favEmptyHint`). History empty: «Вы ещё ничего не открывали» (`feed.histEmpty`), «Здесь
  будут объявления, которые вы смотрели» (`feed.histEmptyHint`). Built here, shown by WP-29.
- Neither state shows while an error is shown.

### Server rendering and the two modes

- Cookie mode, session present: the HTML of the page already contains the first cards; the browser sends no
  request for page one. Later pages go through `/bff/listings`. This holds for a launch whose document came with
  the session's own cookie (a reload, a later launch): the bootstrap confirms it and the router does not refresh.
- A launch that signs in (the first one, a revoked cookie, another Telegram user's cookie on the same device)
  refreshes the router once at `ready`. A page one the server rendered with the old cookie is dropped at `ready`
  and read through `/bff/listings`; the refresh's server read for the same key is not adopted (one server read
  wasted per such launch). Until `ready`, the HTML of a launch on another user's cookie shows that user's hearts and
  eyes: the server cannot know the launch user, whose data is only in the address fragment (limit).
- First request of a launch (no cookie yet) and header mode: the page shows skeletons until the session is ready,
  then the client fetches page one through `/bff/listings`, with the new cookie or, in header mode, with the
  bearer token. A search changed later in cookie mode gets its page one from the server, in the RSC payload of the
  navigation; header mode asks `/bff/listings`.
- A server-side failure of page one arrives as `initial.result` and shows the matching error state; «Повторить»
  fetches from the browser.

## Tests

Unit (Vitest, `frontend/app/tests/feed/`):

- `verdict`: each of the six tones, and `high`; delta +0.9 and above → "in N times"; rounding; unknown tone with a
  negative delta → "cheaper", neutral tone, short «−12%»; unknown tone with a positive delta; no verdict data →
  `null`; the chip's text.
- `badges`: the priority table (every pair of adjacent ranks), in particular `is_owner` with a `good` verdict →
  «Хозяин» and `owner_verified` with a `good` verdict → «Проверенный хозяин»; «Ниже рынка» from the tone `good` with a
  delta, not from a negative delta; nothing matching → `null`; the kind of each badge (`warn`, `verified`, `quiet`,
  none for «Ниже рынка») and, on the compact card, the shield for `owner_verified` and no tag (the kinds and the
  shield: *added by the intake of `index-CBlEKxdL.js`*; a parity item of `badges.ts` and `ListingCard` for a later
  package (`wave-1/baseline.md`, built code behind the pin, row 1 and row 2)).
- `images`: derivation for a media address with a query; no derivation for a foreign address; Save-Data, `2g`,
  `3g`, lite → small only; otherwise `srcset` with 480w and 800w.
- `cardText`: price from `display` and `period`; `kind: 'down_payment'` and `kind: 'business'` with their labels in
  three locales; `kind: null` and an unknown string → no label; `price: null` → negotiable; facts with
  and without floor total; age from `posted.when`, `posted.label` only without it; location with metro, with centre
  distance, with neither.
- `inlineSlot`: 20 visible → after the 8th; 9 with the note → after the 8th; 9 still loading → after the 8th; 8,
  fully loaded, no note → after the 8th; 8 still loading → none; 5 fully loaded, no note → after the 5th; 5 with the
  note → none; 5 still loading → none; 1 fully loaded → after the 1st; 0 → none (the empty state shows instead).
- `fewResults`: truth table over source, error, loaded, visible count 0 / 9 / 10, active filters, stats, city
  name; `listEnd`; the note's title; other-deal mapping (rent → sale, daily → sale, sale → rent) and its "more
  than visible" rule; `offersReset` with DEV-024 off and on.
- `useCursorFeed`: pages until `null`; duplicate number across pages appears once; missing cursor ends; repeated
  cursor ends, and so does one used earlier; no automatic retry; `retry()` repeats the failed page; key change
  aborts and drops the old answer; matching `initial` sends no request for page one; mismatching `initial` is
  ignored; a later `initial` for the same key is not adopted; `enabled = false` sends nothing; a matching `initial`
  renders while booting, on the server too (D3); a page one adopted while booting is kept at `ready`, and read
  again through the browser when the launch signed in (`renewed`); one adopted while ready is kept whatever
  `renewed` says; a hidden route aborts, keeps its items and asks again when shown; `meta.source`; a forbidden page
  with DEV-001 on.
- `FeedServer` (node): no cookie → nothing read; an address with a city → page one of 20, its key, no `/me`; an
  address without a city → `/me`, then page one of the profile's city as `profileCity`; `unauthorized` from either
  → `initial = null`; any other failure passed on.

Component (Vitest + Testing Library):

- `ListingCard`: full and compact variants; negotiable; video badge; placeholder without photos; eye only when
  viewed and not compact; link target and `prefetch={false}`; the heart beside the link and the link's name
  without the overlays' labels; the focus ring on the article; a server-rendered card takes the server's hint.
- `PhotoStrip`, `Photo`: lazy mounting and the dots; the sideways swipe kept in the strip; the hidden ▶; a failed
  photo and a re-signed address; the network rule, a connection that drops to 3g; eager photos not faded; the
  server render and hydration with and without the server's hint, with no mismatch.
- `FavButton`: optimistic fill, rollback on failure, taps ignored while busy across every heart of the listing,
  haptic style per direction, `PUT` versus `DELETE`.
- `FeedHeader`: chip set with and without polygon, with room-less types, with one city, before reference data, a
  city the reference data does not know; owner chip for `any`, `no_agents`, `owners`; badge count; labels in three
  locales; taps push with the search state; under a listing and under a sheet the chips keep the feed's search
  (KI-43).
- `ListingFeed`: three skeletons; each row of the error table; inline retry keeps the cards; hidden items removed;
  favourites source hides items un-favourited in this launch; an `inline` node renders once at the place of
  `inlineSlotIndex` with `source: 'feed'` and never with the other sources, and keeps its state when a card above
  it is hidden; the status line, `aria-busy` and the focus after a retry.
- `FeedScreen`: the list key of the server's page one equals the browser's in the server render and at hydration
  for any address, profile city and saved city (D2); the server HTML hydrates without a mismatch and keeps its
  cards; the server's small-photo hint reaches the cards; a return to a search pulled before adopts the server's
  page one; the note replaces the empty state when the city's stats arrive.
- `FewResultsNote`, `FeedEmpty`: every text; button visibility; radar button absent while `radarsReady` is false,
  and — with the constant forced on — absent for `radars_enabled` `false` or missing, present for `true`; the radar
  button disabled while `subscribe` runs; the deal switch (geography kept, the sort narrowed, a light haptic, the
  top); the reset keeps the sort; DEV-024 branch with the flag off and on; favourites and history variants.

Elsewhere in `frontend/app/tests/` and the packages: `setFavorite` against a fake API (`PUT` / `DELETE`, the
header-mode token, no request for an input that fails its check or without a session); `useScreenSearchState`
(held under a listing, a sheet and another tab, the live reading of a sheet loaded directly, the map);
`useRadarsEnabled` and the stubs; `previewCache` and `firstContent`; `useSearchState` hydrating with a saved city
and no mismatch; `SessionProvider` refreshing once after a sign-in and never for a confirmed cookie; the lite
intrinsic size in `packages/ui/tests/tokens.test.ts`; `feed.loading` in `packages/i18n/tests/catalogue.test.ts`.

End to end (Playwright, fake Telegram, stubs; `e2e/feed.spec.ts`). The tests whose reads or writes carry the
session run in cookie mode and in header mode (pages to the end, a new search, the heart, a failed page two,
pull-to-refresh). Header mode only: the bearer read, the slow page one's skeletons, page one offline or refused, the
expired session. Cookie mode only: the first launch and the reload. The chips, the card and Back, the demo marker
and the first photos read nothing per session and run once, in cookie mode: one run of the file stays under the
stub user's 120 requests a minute (AM-61). Every test answers the stub photos with `stubMedia` of
`@homi/testing/playwright` (an automatic fixture of `feed.spec.ts`; the helper itself is opt-in per spec).

- Cookie mode, after a reload: the document contains cards, no `/bff/listings` request without a cursor is sent
  and the router does not refresh; on the first launch one page-one request goes through `/bff/listings` and the
  router refreshes once. Header mode: page one is requested through `/bff/listings` with `Authorization` and no
  `homi_session` cookie.
- Scrolling loads pages until the stub's last page, each with the cursor of the page before; the number of cards
  equals the number of distinct listings; another scroll to the end asks for nothing.
- Changing the search (the «Продажа» title tab, a replace of the address) re-creates the list and scrolls to top;
  the test holds the new search's server render, so the old list is seen at its offset first. Cookie mode adopts
  the new search's page one from the RSC payload of the navigation, with no `/bff/listings` page one; header mode
  asks `/bff/listings` with `deal=sale`. The title tabs can be tapped only once the chrome has expanded again.
- Heart: a tap fills it and sends one Server Action request, a second tap empties it. The browser never sees the
  `PUT` or `DELETE` itself (the action sends it from the server), so that choice is asserted in the unit test of
  `setFavorite` against a fake API. A failing save — stub scenario `source_unavailable` set through the
  `homi_stub_scenario` cookie of WP-22 right before the tap — returns the heart.
- A tap on a card opens the listing address over the feed; after Back the card shows the eye and the scroll
  position is kept.
- `/bff/listings` fulfilled with `500` for page two → inline «Не загрузилось — повторить», the cards stay;
  aborted (offline) for page one in header mode → «Нет связи»; `403` → «Нет доступа — повторить» inline, on page two
  and on page one without cards, and the session stays `ready`: with DEV-001 off (every `DEV` flag is a constant
  `false`) no end-to-end test reaches the `denied` branch, which the unit tests cover.
- Header mode on `/ru`: `/bff/listings` answers `401` for page two and the new sign-in is refused as too old → the
  session-expired screen of WP-23 (the case `gates.spec.ts` runs on `/ru/map` since WP-24).
- The filters, sort, rooms, price, owner and city chips each push their sheet route with the address's search and
  its city (`city=tashkent`), with one light haptic, and Back restores the feed; «Своя область» switches to
  `/ru/map` with the same search; the owner chip reads «Кто размещает» by default.
- Pull-to-refresh after page two sends one new page-one request, and the list starts again from it.
- The demo-data marker shows on the feed while an answer of the screen, the listings included, comes from a stub:
  the marker reads every source of the address (the reference and the cities report too), so the test checks it
  beside the listings answer's `meta.source: "stub"`.
- A slow page one (header mode) shows three card skeletons and `aria-busy` until it answers; the first photo of the
  first two cards loads without scrolling, eagerly.

## Acceptance checklist

Run in ru, uz and en, light and dark, in cookie mode and header mode; lines marked (T) also inside Telegram on
staging.

List

- [ ] (T) The search tab opens with listing cards for the default city and deal; the first two photos appear
      without scrolling.
- [ ] First load shows three skeleton cards; further pages load while scrolling, with a spinner at the end, until
      the list ends.
- [ ] No listing appears twice.
- [ ] Changing filters, sort or deal, and pull-to-refresh, start the list again from the top.
- [ ] (T) Opening a card and returning keeps the scroll position and shows the «viewed» eye on that card.
- [ ] The demo-data marker shows while the answers come from stubs.

Chips

- [ ] The chips appear in the order filters, sort, «Своя область» (only with a drawn area), rooms, price, owner,
      city.
- [ ] The filters chip shows a badge with the number of active filter groups and no badge at zero.
- [ ] The sort chip shows the current sort name.
- [ ] The rooms chip is hidden for room-only, commercial-only and land-only searches.
- [ ] The owner chip reads «Кто размещает» when nothing is chosen and is highlighted only with a value.
- [ ] The city chip shows the city name and is absent when there is one city.
- [ ] Each chip opens its sheet route; «Своя область» switches to the map.

Card

- [ ] Price shows amount and period; a down-payment price adds «· первый взнос», a business price «· цена за
      бизнес, помещение в аренде»; no price shows «Цена договорная».
- [ ] The badge follows the priority: «Подозрительно дёшево», «Проверьте цену», «Проверенный хозяин», «Хозяин»,
      «Ниже рынка» — a listing from an owner that is below the market shows «Хозяин».
- [ ] The badges have kinds: the two warnings are orange, «Проверенный хозяин» carries a green shield, «Хозяин» is the
      quiet grey tag, «Ниже рынка» the plain one; the compact card shows no tag, and a shield after the price for a
      verified owner (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `badges.ts` and `ListingCard` for
      a later package (`wave-1/baseline.md`, built code behind the pin, row 1 and row 2)).
- [ ] The market chip shows «−N% к рынку» / «+N% к рынку», «≈ обычная», «≈ спорно» with the tone colour; an
      unknown tone shows the real sign in the neutral colour.
- [ ] The facts line shows title, area, floor, market and the pets mark when present, then the age.
- [ ] The location line shows district, landmark and the metro within 1.5 km, else the distance to the centre.
- [ ] Photos swipe inside the card with dots; a video listing shows ▶; a listing without photos, and a broken
      photo, show the placeholder.
- [ ] On Save-Data or lite graphics only small photos are requested; in cookie mode the first page's photos
      follow the server's hint (Save-Data header, Telegram-Android class) until hydration (limit above).
- [ ] (T) The heart fills at once with a haptic; a failed save empties it again; the state survives scrolling
      away and back.

States

- [ ] Without a connection and without cards: «Нет связи», «Проверьте интернет и попробуйте ещё раз.»,
      «Повторить».
- [ ] On a server error without cards: «Не загрузилось», «Сервер не ответил. Попробуйте ещё раз через минуту.»,
      «Повторить».
- [ ] On an error after cards are shown: «Не загрузилось — повторить» under the cards; the cards stay.
- [ ] On a refused request: «Нет доступа — повторить».
- [ ] No results with filters: mascot, «Ничего не нашлось», «Попробуйте ослабить фильтры», «Сбросить фильтры»,
      which returns the defaults of the current deal group and city.
- [ ] Fewer than 10 results without filters: «Это все объявления об аренде» / «… о продаже» with the city hint;
      0 results: «Ничего не нашлось» with the same hint.
- [ ] «Смотреть продажу · N» / «Смотреть аренду · N» appears only when the other deal has more listings and
      switches the deal keeping the area.
- [ ] «Другой город» appears only with several cities and opens the filters.
- [ ] The radar button of the note is absent in this package (`radarsReady` is false); the test with the constant
      forced on shows it only when the reference data says `radars_enabled: true`.
- [ ] `dev024ResetOnlyWithActiveFilters` is off in `lib/flags.ts`; both branches are covered by tests.

## Handoff

- **Steps 1–13 are done** on `feat/wp-24-feed`, in three parts and a contract fix, each ending in a mergeable
  state: A `8b64b19` (`images`, `cardText`, `verdict`, `badges`, `Photo`, `PhotoStrip`, `ListingCard`,
  `ListingCardSkeleton`, `FavButton` with `setFavorite`, `previewCache`, `firstContent`, the card states of the
  gallery), the fix `9163d26` (`GET /listings` documents a nullable `meta.next_cursor`, step 1, AM-65), B `1d1c964`
  (`useCursorFeed`, `inlineSlot`, `ListingFeed`, `FeedHeader` with `useScreenSearchState`, `fewResults`,
  `FewResultsNote`, `FeedEmpty`, the radar seam, `feedQuery`, `FeedServer`, `FeedScreen`, `lib/device.ts`, the page,
  the `renewed` refresh and the hydration-safe saved city, the e2e specs the page changed), and C `f58cf88`
  (`e2e/feed.spec.ts`, `stubMedia`, the CI variable). Each part ran as a workflow: implementers in parallel (A three,
  B five, C one), a review (A and B three lenses: behaviour, React and accessibility, tests; C two: coverage,
  robustness), fixes, a final check; the main session re-ran the checks of A and B. Mutation checks where the
  evidence records them: in A a network rule read at render time failed the server-markup assertion of
  `PhotoStrip.test.tsx`, and the `FavButton` author broke six behaviours of `FavButton` (no `stopPropagation`, no
  `preventDefault`, no busy check, swapped haptics, no rollback, `favs` ignored) and three of `setFavorite`
  (swapped `PUT` / `DELETE`, no `on` check, a truthy `on`); in B the `useCursorFeed` author broke six behaviours
  (abort, dedupe, used cursor, reset on a new key, `enabled`, DEV-001), the `ListingFeed` author fourteen rules and
  the page author six, and the review fixes ten more (among them the inline key per card, no version reset, `early`
  always true, a synchronous saved-city read, `unauthorized` passed on, a refresh without `renewed`,
  `serverSmallOnly` dropped), each caught by a failing test; in C a build without `window.scrollTo` in
  `FeedScreen`'s layout effect failed the new-search test in both modes (`Expected: 0, Received: 150`), and a server
  started with a foreign CDN host failed the CSP test at the photo poll (`Expected: > 0, Received: 0`: no stub photo
  was asked for; the poll now names that cause). The checklist lines with the tests that prove them are in the PR
  description; the boxes here stay unticked, because every line also asks for ru / uz / en, light and dark and, for
  (T), Telegram on staging (Next, item 4).
- **Checks** (on `1d1c964`, from `frontend/`): `pnpm --filter app test` → 102 files, 1402 tests passed; `pnpm
  --filter @homi/i18n test` → 10 files, 110 passed; `pnpm --filter @homi/ui test` → 8 files, 112 passed; `pnpm -r
  lint`, `pnpm -r typecheck`, `pnpm types:check` and `pnpm --filter app build` → exit 0. Backend on `9163d26` (from
  `backend/`): `php artisan test --compact` → 720 passed, 4 skipped; PHPStan on the controller → 0 errors; Pint
  passed; `pnpm types:check` → exit 0 after the commit. On `f58cf88`: `make ci-frontend` (orchestrator) → exit 0:
  types:check, lint, typecheck and every build clean; unit tests app 102 files / 1402, `@homi/search` 238 + 1 todo,
  `@homi/testing` 95, `@homi/ui` 112, `@homi/i18n` 110, `@homi/api-client` 14, `@homi/utils` 2 passed; `feed.spec.ts`
  alone → 19 passed, `csp.spec.ts` and `smoke.spec.ts` → 4 passed (the smoke test of a telegram.org request is an
  expected `test.fail`), no `429` in those runs (orchestrator). The part C verify run took every file of `app/e2e/`
  alone on the same tree: data 5, back 11, boot-failure 6, crash 4, csp 2, feed 19 (three runs), foundation 19, gates
  8, launch 5, session 7, smoke 2 passed; shell 15 of 16 on the first try with three `429`s (KI-32), 16 passed when
  rerun alone a minute later.
  Screenshots of the feed at 390 px in ru, uz and en, light and dark, were taken locally against the stubs and
  looked at; they are not committed. One `feed.spec.ts` run makes about 100 `/api/v1` requests, so a local run of
  it next to other specs within a minute can meet the stub user's limit of 120 (KI-32); CI is not affected.
- **Corrections made in this specification (rule 6):** Scope (the `useScreenSearchState` seam; the WP-21 and WP-22
  code this package changes); the demo-data row (who reports which answer); Page and data flow — the tree with
  `readFirstPage`, `feedQuery()` / `feedListKey()` on both sides, `/me` first on an address without a city and
  `profileCity`, `unauthorized` → `initial = null`; `FeedScreen` on `useScreenSearchState`, the refresh version per
  search, the pull settling on `onFirstPage` or the cleanup, the scroll to the top before paint and only on the
  feed's own address, `measureScrollPerformance()` on the first scroll; `useCursorFeed`'s `renewed`, `flags` and
  `source`, `enabled` gating sending only (D3), the caller's `limit`, any used cursor ending the list, a later
  `initial` not adopted, the early page one read again after a sign-in, DEV-001 in the hook; `ListingFeed`'s props
  (`listKey`, `serverSmallOnly`, `few`, `above`, `onFirstPage`, `flags`), `enabled` and `renewed` read inside,
  `listEnd`, the visibility per source and the eye, `SourceReporter` on the list's own address, the inline block as
  one keyed row, when the sentinel is observed; Card — the components fetch nothing, the props and their defaults,
  `FeedSkeleton`, `Photo`'s exports and the lint disable per element, `FavButton`'s variants,
  `marketVerdict(item, locale, t)`, `marketChipText`, `verdictToneOf`, the rows of `types.ts`, `inlineSlot.ts`,
  `FeedServer.tsx` and `feedQuery.ts`, `listEnd`, `useFewResultsContext` and `FewActions`, the preview cache's order,
  the heart beside the link and the focus ring on the article; Favourites (`setFavorite`'s `locale`, the validation,
  the rollback into `favs`); Radar seam (`radarsEnabled`, the `ready` option, `RadarEntry`, `SubscribeResult`);
  Files (from the diff against `main`, the deleted `RefreshProof.tsx` and the files outside `frontend/app/`
  included); steps 10 and 13; Behaviour — eager photos without the fade, the lite size (AM-69), the first-scroll
  measurement, the strip's mounting and dots by `photos.preview`, the hidden ▶ and a re-signed address,
  `serverSmallOnly` from `lib/device.ts` and its limit, the delta the market badges need and the plain tag of
  `good`, the fields that may be `null`, `high` and the neutral colours, the title not split and the age from
  `posted.when`; the chips as buttons with the search's city, the sort's aria and table, the price highlight, the
  unknown city, «Своя область» through `nav.tab`; the per-listing busy rule and the heart's place; the skeleton
  trigger, "no items" as loaded items, `unauthorized` in the server row, `403` inline on page one, DEV-001 (AM-68),
  the screen-reader rules; the deal switch as one replace, the radar button disabled here, «Другой город» pushed,
  the reset keeping the sort, the mascots' place, DEV-024 without stats; the two modes (a confirmed cookie, the
  refresh of a sign-in launch, the new cookie, the server's page one of a later search); Tests — the unit and
  component additions and the end-to-end section rewritten to what `feed.spec.ts` does (the mode split, `stubMedia`,
  the six chips and the area chip, `403` with DEV-001 off, the marker's sources, the new search's page one).
- **Assumption mismatches** (`docs/ai/reports/phase-3-notes.md` §V): AM-65 Scramble typed the source cursor of
  `GET /listings` as a plain string, so the contract documented a non-null `meta.next_cursor`; AM-66 the router
  refresh at every launch's first cookie-mode `ready`, signed in or not (`25` §3.4 step 5, WP-21 step 5), re-read
  page one on the server for nothing and could not replace a page one read with a foreign or revoked cookie; AM-67
  WP-22's `useSearchState` read the saved city during render, so the hydration render could list another city than
  the server's page one; AM-68 the DEV-001 redirect is in `useResource`, not in WP-22's error mapper or `bffFetch`;
  AM-69 a lite card's intrinsic size is 360 px in the pinned release, not the 420 px of WP-20's `lite.css` and `03`
  §3.6.
- **Decisions of the implementation** (no ADR), those later packages build on: `useScreenSearchState(screen)`
  gives a screen the search of its own address and holds it under a layer, a sheet or another tab — the feed's
  fix of KI-43, read by `FeedScreen`, `FeedHeader`, the title tabs and `MiniTitle` (D1); one pure module builds the
  query and the list key on both sides (`feedQuery`, `feedSearchKey`, `feedListKey` of `feedQuery.ts`, the canonical
  `toSearchParams` only) (D2); an adopted `initial` renders on the server and at hydration whatever the session
  status, and `enabled` gates sending only (D3); the device rule lives in `lib/device.ts`, and `serverSmallOnly`
  (Save-Data or the Telegram-Android class) seeds only the server and hydration renders of `Photo` (D4);
  `SessionState.renewed` is set when the launch signs in, the router refreshes only then, and a list drops a page
  one adopted before `ready` when it is set; `useSearchState` takes `profileCity` and reads the saved city through
  `useSyncExternalStore` (server snapshot `null`, `subscribeStorage`), so the saved city arrives one render after
  hydration; any cursor already sent ends a list; the inline block is one keyed row; the list state is per hook
  instance (a hidden route keeps its items under `cacheComponents`); a list reports its source only on its own
  address; the heart is a sibling of the card's link and its busy set is per listing; the refresh version is per
  search; `stubMedia` answers the stub photos in end-to-end tests, opt-in per spec and not inside `launchApp`.
- **Open for the reviewer:**
  - every card repeats the area: «2-комн. квартира, 54 м² · 54 м² · 3/9 эт.». WP-12's contract example title is
    "2-комн. квартира, 54 м²" (`WP-12-contract-listings.md` line 99) and the fixtures follow it, while `factsLine`
    follows legacy «title · area · floor · market · 🐾» (`03` line 512, title = the part before « · », BR-API-072):
    shorten the title in the contract and the fixtures, or drop the area when the title carries it? The stub
    100008 also reads «Юнусабад · Юнусабад» (district and landmark equal; data);
  - «Ниже рынка» is drawn as the plain frosted tag of the pinned release although the rule's tone is `good`: keep
    the parity, or a green tag?
  - lite keeps legacy's white top warn badge (`.lite .tag` overrides `.tag.warn`, probably a legacy oversight): keep,
    or `#fff4e6` like the bottom status tag?
  - the heart has `aria-pressed` and also flips its label (`fav.add` / `fav.remove`), as legacy: keep, or a
    constant label (WP-33)?
  - an `--on-photo` colour role in `@homi/ui` would replace the arbitrary white and shadow values of `FavButton`,
    `PhotoStrip` and `ListingCard`;
  - "this listing has a video" is not announced (▶ is hidden): a non-action `homi` key such as `card.hasVideo`
    (WP-33)?
  - does the listing API ever send the tone `high` (BR-API-061 calls it a map tone)? The branch is harmless if not;
  - the cursor guard is stronger than "equal to the previous one" (any used cursor, the empty string): keep?
  - `FewActions` repeats the ten lines of `TopBar`'s `useDealSwitch`: move the deal switch into `lib/search/` after
    the merge?
  - `useHasActiveRadar`: legacy hides the note's radar button for any radar with the same filters, active or not
    (`subs.some(sameFilters)`); WP-30 defines it as an active radar — WP-30 decides;
  - the few-results note and the empty states are not in the `/dev/ui` gallery: add them?
  - `FeedScreen` starts `measureScrollPerformance()` on the first scroll (WP-21 and `lib/graphics.ts` assign it to
    WP-24; this specification did not list it): keep?
  - the gallery's hearts call the real `setFavorite`, so on staging they write to the stub: acceptable?
  - `03` §3.6 (line 1757) records only the 420 px estimate: add the lite rule (360 px) to the audit?
  - the demo marker shows when any answer of the address is a stub, not the listings alone: keep, or report per
    source?
  - `features/gallery/CardStates.tsx` inlines `NEXT_PUBLIC_CDN_URL` at build time, so with the CI variable the
    gallery's photos become absolute stub addresses in CI (they fail there either way; no spec reads them);
  - the new copy `feed.loading`, in particular uz «Yuklanmoqda…», wants a look from whoever owns the copy;
  - visual checks still owed: part A's in the gallery — the compact heart when the text column is taller than
    112 px, the focus ring on a later card, the placeholder over the blurred copy of a broken video photo, the lite
    size — and part B's on the feed, the inline «⌄» after an unset rooms or price chip label (`FeedHeader`'s
    `ml-[6px] inline align-[-2px]`), which the chips' author did not check visually;
  - the size: about 2 660 lines of code and styles against the estimate of ≈ 2 400 (against `d76a0c0`: 96 files,
    +8 169 / −246; code, styles and catalogues 47 files, +2 657 / −140; tests, e2e and the Playwright helper 42
    files, +5 400 / −63).
- **Known-issue candidates** for the follow-up docs PR (KI-44 onward):
  - when `LocaleGuard` replaces the locale segment (a first launch whose Telegram language differs, or `me.locale`
    differs from the address), `<html>` loses the boot and Telegram attributes: the class `fullscreen` goes, and
    `data-scheme` returns to the server's `light` in a dark Telegram; the theme comes back only if the session turns
    ready afterwards, fullscreen never (WP-20's `app/[locale]/layout.tsx` renders `data-scheme="light"`; WP-21's
    boot and `LocaleGuard`) — medium;
  - in the collapsed chrome the mini title's pill touches or covers the «Демо-данные» marker (stub builds only) —
    low;
  - local only: php-fpm stalls — `POST /bff/session` unanswered for about 15 s, the sign-ins logged late in a
    burst, no `429` or `5xx` — seen twice in part C's runs; part B once saw a session still `booting` after 5 s in
    `data.spec.ts` after an idle pause, which the final cold run did not reproduce;
  - `feed.spec.ts` uses about 100 of the stub user's 120 API requests a minute: a new test, a sign-in retry or a
    rerun within the minute meets the limit (KI-32 headroom); split the file or fix KI-32 before it grows;
  - `bffFetch` (`lib/api/browser.ts`) reports `meta.source` through `reportSource`, whose pathname defaults to
    `window.location.pathname` (`lib/data/sources.ts`), so a page loaded while a listing lies over the feed marks
    the listing's address (a KI-43 leftover; with `ViewToggle`, `MapBar` and the WP-22 `SearchProof` on the map
    placeholder until WP-27 the remaining readers of the global `useSearchState()` — KI-43 itself can name
    `useScreenSearchState` as the feed's fix);
  - the local `composer openapi:export` / `openapi:check` fails ("No route to host") when the DB host of
    `backend/.env` is unreachable; with `DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_DATABASE=homi_test
    DB_USERNAME=<os user> DB_PASSWORD= php artisan scramble:export` (the local, migrated `homi_test`) the committed
    `openapi.json` came out byte for byte;
  - until the session is ready, the HTML of a launch on another Telegram user's cookie (a shared device) shows that
    user's hearts and eyes; the server cannot know the launch user, whose data is in the address fragment only;
  - the chips, the mini title and the title tabs get no `profileCity`: on an address without a city they render
    Tashkent on the server and at hydration, then the saved city, and before `ready` they can name the saved city
    while the feed lists the profile's; a city cookie written at sign-in would remove this and the `/me` read;
  - what only the browser knows (a lite choice or measured result in storage, a 3g connection, an Android device
    judged by cores and memory) reaches the first page's photos at hydration, so the browser may start the 800w
    variant first; a cookie mirroring the graphics keys, or `Accept-CH: ECT`, would tell the server;
  - a launch that signs in drops one server read of `/me` and `/listings` (the refresh's page one is not adopted);
    avoiding it needs a refresh-pending signal from `SessionProvider` that holds the `/bff` read;
  - `pnpm --filter app test -- <path>` runs every file (the path is ignored); a filtered run is `pnpm exec vitest
    run --config ../vitest.config.mts --project app <paths>` from `frontend/app`;
  - the OpenAPI document lists no `404` or `503` for `PUT` and `DELETE /favorites/{number}` and no `503` for
    `GET /listings` (documentation only: the answers map through `UiError` at run time).
- **Shared files:** none in this PR besides `.ai/memory/current-state.md` and `.ai/memory/session-handoff.md`, as
  in #68. `CLAUDE.md` "Current state" (the WP-24 sentence) and `.ai/memory/known-issues.md` (the candidates above,
  and the KI-43 update) follow in the follow-up docs PR after the merge, as for WP-20 … WP-23. One CI workflow
  changes, `.github/workflows/frontend-e2e.yml`: the end-to-end step gets `NEXT_PUBLIC_CDN_URL:
  https://cdn.homi.loc`, the stub media base of `backend/.env.example`, because the CSP's `img-src` takes the photo
  host from it and the feed now shows the stub photos (answered by `stubMedia`, since CI has neither that host's DNS
  nor its files). No lockfile, `package.json`, `.env.example` or Vitest / Playwright config is changed.
- **For the next packages:** WP-25 builds the sheets the chips push — each push carries the search state with its
  city (`/filters?city=tashkent` from `/ru`), «Другой город» pushes `routes.filters()` too — and imports
  `subscribe` and `useHasActiveRadar` from the stub; WP-26 paints the listing from `getPreview(number)`, uses
  `markSeen` (the card already marks on click), `FavButton` with `variant="plain"` (the busy set is shared with the
  card's heart) and `ErrorState`, and must keep the feed's scroll and list under the listing: the feed reads
  `useScreenSearchState('feed')` and never scrolls while covered; WP-27 and WP-28 mount the compact `ListingCard`
  on the map and should move `MapBar` and `ViewToggle`, which still read the global address, to
  `useScreenSearchState('map')`; the saved city now arrives one render after hydration, so a reader of
  `useSearchState` on an address without a city sees the profile's or Tashkent first; WP-29 builds favourites and
  history on `ListingFeed` / `useCursorFeed` with `source` `favorites` / `history`, `FeedEmpty` and `above` for
  «Очистить», which has no `setItems` (bump the list key, or add a prop then); WP-30 passes the radar card as
  `inline` (one keyed row after the 8th visible card, kept across hides), flips `radarsReady` in
  `features/radars/capability.ts`, writes `subscribe`'s body with `{ ok, toast }` and decides `useHasActiveRadar`'s
  semantics; WP-31 finds the lite measurement started on the first feed scroll (`FeedScreen`); WP-32 hangs the
  analytics loader on `firstContentShown()`; WP-33 decides `stubMedia` once CI has real stub media, keeps
  `feed.spec.ts` under the request budget, and runs the manual lines.
- **Later specifications that WP-24 makes wrong** (a read-only audit of WP-25 … WP-33 against `1d1c964`; each is
  corrected in that package's own PR when it is taken):
  - WP-29: `initial` is `{ key, result }`, adopted only when `key` equals the list key and only when a key's list
    starts (`WP-29-saved.md:57`); heart and eye are `ListingFeed`'s, `favs.get(number)` and `seen.has(number)`,
    not `seen[number]` (`:78`); `ListingFeed` already has every prop WP-29 needs (`:66`).
  - WP-27: `MapScreen`, `MapBar` and `ViewToggle` should read `useScreenSearchState('map')`, not `useSearchState()`
    (`WP-27-map-gl.md:83`); `map/page.tsx` is no longer a bare placeholder but the home of the WP-22 data proof that
    `data.spec.ts` and the header-mode expired case of `gates.spec.ts` run on, which its PR moves (`:234`).
  - WP-30: `useRadarsEnabled()` reads `useReference().radarsEnabled`, not `radars_enabled`, and tests pass
    `{ ready: true }` (`WP-30-radars.md:169`).
  - WP-26: the contract has no `short_title`; the market block uses `marketVerdict({ market }, locale, t)`; the
    listing's heart is `FavButton` with `variant="plain"` (`WP-26-listing.md:279`).
  - WP-32: `whenFirstContent(timeoutMs)` races the existing `firstContentShown()`; the mark comes from the first
    `Photo` that loads anywhere, not only a feed card (`WP-32-analytics-errors.md:78`).
- **Merged** on 2026-11-17 on the developer's «сливай #71» (merge commit `780aea9`), after `frontend` (run
  43966127819), `frontend-e2e` (run 43966127916, 104 passed) and `backend` (run 43966127625) were green on `6ae7331`;
  on `main` after the merge: `frontend` run 44002675075 and `backend` run 44002675246, green. This status, the queue
  row, `CLAUDE.md` ("Current state" and "Layout"), the known issues KI-44 … KI-53 (the candidates above; the
  `feed.spec.ts` budget joins KI-32, and the `reportSource` pathname joins KI-43, which now names the feed's fix),
  KI-29 resolved (#70) and the memory are in the follow-up docs PR.
- **Next:**
  1. ~~review and merge~~ (done);
  2. ~~the follow-up docs PR~~ (this status, the queue row, `CLAUDE.md`, KI-44 … KI-53, the KI-32 and KI-43 updates,
     the memory);
  3. the production track deploys — before it, confirm that the photo addresses of the stub fixtures load on
     staging and production and that their host is in `img-src` (the header);
  4. check inside Telegram on staging the (T) lines — the first two photos without scrolling, the scroll and the
     eye after a listing, the heart's haptic — and the checklist in ru / uz / en, light and dark; WP-33 runs the
     manual lines;
  5. set the status to `DONE`. WP-25 (filters) and WP-26 (listing screen) build on this package.
