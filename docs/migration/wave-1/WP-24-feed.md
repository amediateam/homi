# WP-24 — Feed and listing card

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-23 |
| Size | ≈ 2 300 changed lines, M |
| Behaviour reference | `03` §1.11 (session-only state), §1.12 (server-formatted values), §2 screens SCR-007, SCR-008, SCR-009, §2.1 (shared components), §3.4 (constants), §4 rules listed under Scope; task files KV-FE-047, KV-FE-048, KV-FE-049, KV-FE-023 (session maps and first-paint ideas only) — behaviour, texts, edge cases and test ideas only; their file layout, request cache, API paths and transport are not taken |
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
- Seams for later packages: `previewCache`, `radars/capability`, the generic `ListingFeed` and `useCursorFeed`.

**Out.**

- Filters, quick filter, sort and city sheets behind the chips — WP-25 (the chips link to their WP-20
  placeholders until then). Listing screen — WP-26. Compact card on the map — WP-27 (variant built here).
- Favourites and history screens — WP-29 (they reuse `ListingFeed`). Radar subscribe flow — WP-30.
- Follow and home-screen nudges on the list — WP-30, WP-31. Screen tracking and the PostHog loader — WP-32.
- Filter model, summaries, distance and money formatters, error mapping, session maps — WP-22 (used here).

## Decisions that bind this package

| Topic | Source | Consequence here |
| ----- | ------ | ---------------- |
| Rendering | DEC-44, 25 §3.1 | `(main)/page.tsx` is a Server Component with a static shell; the part that reads the cookie and the search parameters sits inside `<Suspense>`; nothing per-user is cached |
| Two session modes | DEC-44, 25 §3.4, RK-30 | One `ListingFeed`: it takes `initial` when the server had a session and fetches through `/bff/listings` when it did not; both paths are in the end-to-end suite |
| Contract | DEC-41, 25 §4.1–§4.2 | Listings are addressed by `number`; the list ends when `meta.next_cursor` is `null`; `503 source_unavailable` shows the "could not load" state; favourites use explicit `PUT` and `DELETE`, never a toggle |
| Server strings | 25 §4.5, Q-API-062 | The card renders the display strings of the contract; where the contract gives one combined string the legacy split of `03` §1.12 applies; nothing is re-formatted that the server already formatted |
| Demo data | 25 §4.4, RK-27 | Every list answer reports `meta.source`; the marker of WP-20 shows on the feed while the source is `stub` |
| Defects and flags | DEC-36 | LB-APP-039 and LB-APP-042 are fixed unconditionally; LB-APP-038 is a `DEV` row and stays behind its flag |
| Baseline | 25 §8.1 | The badge order and the `price_kind` labels changed after the audited release; the order and labels below are replaced by the re-baselined audit of WP-02 where it differs |
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
  FeedPage({ searchParams })                 static shell
    <Suspense fallback={<FeedSkeleton />}>
      <FeedServer searchParams={searchParams} />     reads cookie + parameters
        → <FeedScreen initial={…} />                 Client Component
```

- `FeedServer`: `readSearchState()` of WP-22 (the server-side wrapper of `fromSearchParams()` of `@homi/search`)
  gives `filters` and `sort`. With a session token it calls
  `serverApi()` for `GET /listings` (`toApiQuery(filters)`, `sort` unless `new`, page size 20) and passes
  `initial = { key, result }`, where `result` is the `ApiResult` (a failure is passed on, not thrown). Without a
  token, or when the address has no city and the server cannot resolve one from `me` (the fallback chain is
  WP-22's), it passes `initial = null`.
- `FeedScreen` (`features/feed/FeedScreen.tsx`): reads `useSearchState()`, builds the list key, registers the
  pull-to-refresh handler and renders `ListingFeed` plus the empty and few-results slot.
- **List key** = canonical query of `toSearchParams(filters, sort)` + `|` + refresh version. `filtersKey()` is not
  used for it, because it ignores `posted_days` (BR-APP-012) and the list must be re-created when that changes.
- `useCursorFeed({ key, path, query, initial, enabled })` → `{ items, status, error, done, loadingMore, loadMore,
  retry }`:
  - adopts `initial` only when `initial.key` equals `key`; otherwise fetches page one through `bffFetch`;
  - `enabled` is `useSession().status === 'ready'`; while the session is booting the list shows skeletons and
    sends nothing;
  - next page with the last `meta.next_cursor`; `null`, a missing cursor, or a cursor equal to the previous one
    ends the list; items are de-duplicated by `number`; no automatic retry after an error; a change of `key`
    aborts the request in flight and drops its result.
- `ListingFeed` (`source: 'feed' | 'favorites' | 'history'`, `path`, `query`, `initial`, `emptySlot`) is generic:
  WP-29 passes other paths. It reads the session maps of WP-22: `favorite = favs[number] ?? item.favorite`,
  `viewed = seen[number] ?? item.viewed`, items in `hidden` are not rendered.
- The sentinel is an `IntersectionObserver` with a root margin of 800 px.

### Card

`features/feed/` holds presentational components without data imports, so the card can be shown with fixture data
(gallery page of WP-23) and reused by WP-26, WP-27, WP-29, WP-31.

| File | Content |
| ---- | ------- |
| `ListingCard.tsx` | Props `item`, `favorite`, `viewed`, `compact`, `eager`, `href`, `onOpen`, `onFavorite`. Compact: one photo, short verdict only, no badge, no eye, no dots |
| `ListingCardSkeleton.tsx` | Shimmer photo and three bars (62 %, 80 %, 35 %) |
| `PhotoStrip.tsx`, `Photo.tsx` | Scroll-snap strip with lazy slides, dots, video badge, placeholder |
| `FavButton.tsx` | Heart with optimistic state |
| `images.ts` | Small-variant derivation and the network rule |
| `cardText.ts` | Price, facts, age and location lines from a card |
| `verdict.ts` | `marketVerdict(item, t)` → `{ tone, text, short }` |
| `badges.ts` | `cardBadge(item)` → `{ kind, tone, key } \| null` |
| `FeedHeader.tsx` | Chip row, mounted in the `chips` region of `TopBar` |
| `FeedEmpty.tsx`, `FewResultsNote.tsx`, `fewResults.ts` | States of SCR-009 and their conditions |
| `useCursorFeed.ts`, `ListingFeed.tsx`, `FeedScreen.tsx` | List machinery |

- The card is a link: `<Link href={routes.listing(number)} prefetch={false} scroll={false}>`, with `Link` from
  `i18n/navigation.ts` (the wrapped one of WP-21, so the push is counted for Back); on click it adds the number
  to `seen`, calls `setPreview(number, item)` and lets the router push. The heart stops the click.
- Photos are plain `<img>` elements, not `next/image`: the addresses are signed and must reach the browser
  unchanged. The lint rule `@next/next/no-img-element` is disabled for `Photo.tsx` with a comment that says why.
- `lib/data/previewCache.ts`: `setPreview(number, card)`, `getPreview(number)`; module memory, last 200 cards;
  read by WP-26 to paint the listing at once.
- `lib/analytics/firstContent.ts`: `markFirstContent()` — called by the first photo that loads; a no-op until
  WP-32 hangs the analytics loader on it.

### Favourites

`lib/actions/favorites.ts`: `setFavorite({ number, on }, auth?)` → `PUT /favorites/{number}` when `on`,
`DELETE /favorites/{number}` otherwise; `ActionResult`. `FavButton` calls it through `useAction()`. Because the
methods are explicit, success keeps the requested state; only a failure changes it back.

### Radar seam

`features/radars/capability.ts` exports two things. `radarsReady = false` is a build-time constant that only
orders the frontend packages: WP-30 flips it when the radar screens exist. `useRadarsEnabled()` is what every radar
entry point asks: it returns `true` only when `radarsReady` is `true` and `useReference().radars_enabled` is
`true` — the server's switch of DEC-51, which WP-22 reads as `false` while the reference data is missing. The
few-results note renders its radar button only when `useRadarsEnabled()` is true and then calls
`subscribe(filters, 'few')` from `features/radars/subscribe.ts`. So that this import compiles before WP-30, this
package creates `subscribe.ts` as a stub with the final signatures: `subscribe(filters, entry, relaxed?)` resolves
`{ ok: false }` and `useHasActiveRadar(filters)` returns `false` (WP-25 imports both too). WP-30 writes the real
bodies and flips the constant.

## Files

New, under `frontend/app/`:

- `features/feed/{ListingCard,ListingCardSkeleton,PhotoStrip,Photo,FavButton}.tsx`
- `features/feed/{FeedHeader,FeedEmpty,FewResultsNote,ListingFeed,FeedScreen}.tsx`
- `features/feed/{useCursorFeed,images,cardText,verdict,badges,fewResults}.ts`
- `features/radars/capability.ts`, `features/radars/subscribe.ts` (stub)
- `lib/data/previewCache.ts`, `lib/actions/favorites.ts`, `lib/analytics/firstContent.ts`
- `tests/feed/{verdict,badges,images,cardText,fewResults,useCursorFeed}.test.ts`
- `tests/feed/{ListingCard,FavButton,FeedHeader,ListingFeed,FewResultsNote,FeedEmpty}.test.tsx`
- `e2e/feed.spec.ts`

Changed:

- `app/[locale]/(main)/page.tsx` (placeholder of WP-20 replaced)
- `features/shell/TopBar.tsx` (mount `FeedHeader` in the `chips` region)
- `app/[locale]/dev/ui/page.tsx` (card states for review)
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json` only if the re-baselined audit adds card labels that the
  legacy catalogue lacks; no new key is planned

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
8. `ListingFeed`: skeletons, cards, sentinel spinner, the two error forms, hidden-item filtering.
9. `(main)/page.tsx` with `FeedServer` under `<Suspense>` and `FeedScreen`; check both session modes by hand.
10. `FeedHeader` in the top bar: chip set, labels, badge, links to the four sheet routes.
11. `fewResults.ts`, `FewResultsNote`, `FeedEmpty` (all three sources), `features/radars/capability.ts`, the flag
    branch of DEV-024.
12. Pull-to-refresh handler and refresh version; scroll to top on a key change.
13. `e2e/feed.spec.ts` in both modes; run the acceptance checklist; update the queue and the handoff.

## Behaviour to reproduce

### Search list (SCR-007)

- The default tab and view. The list belongs to the current filters and sort; any change of them, or a
  pull-to-refresh, re-creates it from page one and scrolls to top.
- Paging (BR-APP-024): pages of 20; the next page loads when the sentinel is within 800 px; the list ends on a
  `null` cursor; an item whose number was already shown is skipped.
- The first two cards load their photo eagerly with high priority; later cards are lazy and use
  `content-visibility: auto` with an intrinsic size of 420 px.
- Listings hidden or blocked in this launch disappear from the list at once (session map `hidden`); the server
  excludes them after the next fetch.
- Opening a card marks it viewed for this launch and opens the listing over the feed; the feed keeps its scroll
  position when the listing is closed.
- Gestures: vertical scroll drives the collapsing chrome of WP-23; horizontal swipe inside a card's photo strip
  moves only the strip (`data-no-swipe`, `data-scroll-x`).

### Header chips (SCR-007)

In this order, in one horizontally scrolling row; each tap gives a light haptic and pushes its route with the
current search parameters:

1. Filters: icon only, aria `sheet.title` «Фильтры», badge with the number of active filter groups (rule
   BR-APP-011, WP-22) when it is above zero → `routes.filters()`.
2. Sort: label `sort.<value>` of the effective sort, e.g. «Сначала новые» (`sort.new`), aria `sort.title`
   «Сортировка» → `routes.sort()`. The label comes from a table with a default, never from a concatenated key.
3. «Своя область» (`map.areaOn`), highlighted, only when a polygon is set → the map with the same parameters
   (replace, as the view toggle).
4. Rooms: «Комнаты» (`head.rooms`) or the summary of `roomsLabel()`, highlighted when set; hidden when every
   selected type is room, commercial or land (rule BR-APP-006, WP-22) → `routes.quickFilter('rooms')`.
5. Price: «Цена» (`head.price`) or the summary of `priceLabel()` → `routes.quickFilter('price')`.
6. Owner → `routes.quickFilter('owner')`. With `owner = any` the chip reads «Кто размещает» (`sheet.who`),
   not highlighted — the fix of LB-APP-042 (legacy showed «Без риелторов» as if a filter were applied). With a
   value it reads «Без риелторов» (`owner.no_agents`) or «Только хозяева» (`owner.owners`), highlighted.
7. City: MapPin and the city name, only when the reference data has more than one city → `routes.city()`.
   Before the reference data arrives the chip is absent.

### Card (SCR-007, 03 §2.1)

- Photo strip: scroll-snap; slides mount lazily (those seen plus the next; pointer-down mounts the next); dots
  when there is more than one photo; a ▶ badge when the listing has a video; no photos → placeholder; a photo that
  fails to load → placeholder, no retry.
- Photos (BR-APP-059): the small variant `.s.jpg` (480 px) is derived only for addresses of the form
  `…/<digits>/<digits>.jpg?…`; other addresses are used as they are. With Save-Data, a connection of 3g or
  slower, or lite graphics only the small variant is requested; otherwise `srcset` offers 480w and 800w with
  `sizes="(min-width: 640px) 608px, calc(100vw - 32px)"` (compact: `112px`). Every photo has
  `referrerPolicy="no-referrer"` and `decoding="async"`.
- Over the photo: the badge (not in compact), the heart, the «viewed» eye (aria `card.viewedTitle` «Вы открывали
  это объявление»), and the status text of the listing as a warning tag at the bottom.
- Badge priority (BR-APP-026), first match wins: «Подозрительно дёшево» (`card.suspiciousCheap`, warn) >
  «Проверьте цену» (`card.checkPrice`, warn) > «Хозяин ✓» (`card.ownerVerified`) > «Ниже рынка»
  (`card.belowMarket`, good) > «Хозяин» (`card.owner`).
- Price line: amount, period, and «· первый взнос» (`card.downPayment`) for a down-payment price; without a price
  «Цена договорная» (`card.negotiable`). The WP-12 contract delivers the legacy split already done:
  `price.display` (amount), `price.period`, `price.kind` (`down_payment`, `business` or `null`), and `price` is
  `null` for a negotiable price — the client does not split a string. The same holds for `title` (already the
  short form), `posted.label` and `posted.when` (the two parts of the age), `market.label`, `market.median_delta`
  and `market.tone`, `pets_ok`, `has_video`, `is_owner`, `owner_verified`, `status_text`.
- Market chip (BR-APP-027): «{delta} к рынку» (`listing.marketDelta`); tone `same` → «≈ обычная»
  (`fmt.marketSameShort`); tone `mixed` → «≈ спорно» (`fmt.marketMixedShort`); compact card: the short label only
  («−12%»). Tones `check`, `suspicious`, `same`, `mixed`, `no_repair`, `good` have their own wording; any other
  case is "pricier", and from +90 % «В {x} раза дороже рынка» (`fmt.marketTimes`); percentages are
  `round(abs(delta) · 100)`. No verdict → no chip.
- Fix of LB-APP-039: an unknown tone is worded by the sign of the delta ("cheaper" below zero, "pricier" above)
  and drawn in the neutral tone; the short label always carries the real sign.
- Facts line: title (first part before « · » when combined), «{area} м²» (`fmt.area`), «{floor}/{total} эт.»
  (`fmt.floorOf`) or «{floor} эт.» (`fmt.floor`), the market string of the listing, «🐾 можно с животными»
  (`fmt.pets`); then the age string.
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
  state before the tap, without text (as legacy). Taps while a request runs are ignored.
- The choice is kept for this launch in `favs` and wins over the flag in list answers.

### Loading and errors (SCR-008, all three sources)

| State | Trigger | What shows |
| ----- | ------- | ---------- |
| First load | no items yet, or the session is still booting | 3 card skeletons with shimmer (static under reduced motion) |
| Next page | sentinel reached | spinner at the sentinel |
| Offline, no items | `offline` or `timeout` | WifiOff, «Нет связи» (`error.offline`), «Проверьте интернет и попробуйте ещё раз.» (`error.offlineText`), «Повторить» (`error.retry`) |
| Server, no items | `server`, `source_unavailable`, `rate_limited`, any other error except `forbidden` | CloudOff, «Не загрузилось» (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через минуту.» (`error.serverText`), «Повторить» |
| Error with items | a later page failed | inline button «Не загрузилось — повторить» (`feed.retry` with `common.loadFailed`); the cards stay |
| No access | `forbidden` on any page | inline button «Нет доступа — повторить» (`feed.retry` with `common.noAccess`) |

- «Повторить» repeats the failed page only. Nothing retries by itself.
- With `dev001AnyForbiddenShowsAccess` on, a `forbidden` answer never reaches the list: the error mapper of WP-22
  sends the user to the no-access screen (LB-APP-045 is owned there).
- `unauthorized` is handled below the list: `bffFetch` re-authenticates once (WP-21, WP-22); if that fails the
  session-expired screen of WP-23 replaces the app.

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
    than are visible now; it runs `switchDeal()` (geography kept).
  - «Включить радар по этому поиску» (`feed.subscribeHere`): only when `useRadarsEnabled()` — so never while
    radars are switched off on the server (DEC-51); hidden when a radar with the same filters exists; disabled
    while its request runs (WP-30).
  - «Другой город» (`feed.otherCity`): only with more than one city; opens `routes.filters()`.
- Search empty (0 visible items and the note not shown): magnifier mascot, «Ничего не нашлось»
  (`feed.nothing`), «Попробуйте ослабить фильтры» (`feed.nothingHint`), «Сбросить фильтры»
  (`feed.resetFilters`), which applies the defaults of the base deal and the current city (rule BR-APP-022,
  WP-22).
- LB-APP-038: with no active filters and city stats not yet loaded, legacy still offers «Сбросить фильтры».
  Flag off: the same. With `dev024ResetOnlyWithActiveFilters` on, that case shows the note's buttons (other deal,
  other city, radar) instead of the reset. When the stats arrive, the plain state is replaced by the note.
- Favourites empty: shrug mascot, «Здесь пока пусто» (`feed.favEmpty`), «Нажмите ♡ на объявлении, чтобы
  сохранить его» (`feed.favEmptyHint`). History empty: «Вы ещё ничего не открывали» (`feed.histEmpty`), «Здесь
  будут объявления, которые вы смотрели» (`feed.histEmptyHint`). Built here, shown by WP-29.
- Neither state shows while an error is shown.

### Server rendering and the two modes

- Cookie mode, session present: the HTML of the page already contains the first cards; the browser sends no
  request for page one. Later pages go through `/bff/listings`.
- First request of a launch (no cookie yet) and header mode: the page shows skeletons until the session is ready,
  then the client fetches page one through `/bff/listings` with the bearer token.
- A server-side failure of page one arrives as `initial.result` and shows the matching error state; «Повторить»
  fetches from the browser.

## Tests

Unit (Vitest, `frontend/app/tests/feed/`):

- `verdict`: each of the six tones; delta +0.9 and above → "in N times"; rounding; unknown tone with a negative
  delta → "cheaper", neutral tone, short «−12%»; unknown tone with a positive delta; no verdict data → `null`.
- `badges`: the priority table (every pair of adjacent ranks), nothing matching → `null`.
- `images`: derivation for a media address with a query; no derivation for a foreign address; Save-Data, `2g`,
  `3g`, lite → small only; otherwise `srcset` with 480w and 800w.
- `cardText`: price from `display` and `period`; `kind: 'down_payment'`; `price: null` → negotiable; facts with
  and without floor total; age from `posted.label` and `posted.when`; location with metro, with centre distance,
  with neither.
- `fewResults`: truth table over source, error, loaded, visible count 0 / 9 / 10, active filters, stats, city
  name; other-deal mapping (rent → sale, daily → sale, sale → rent) and its "more than visible" rule.
- `useCursorFeed`: pages until `null`; duplicate number across pages appears once; missing cursor ends; repeated
  cursor ends; no automatic retry; `retry()` repeats the failed page; key change aborts and drops the old answer;
  matching `initial` sends no request for page one; mismatching `initial` is ignored; `enabled = false` sends
  nothing.

Component (Vitest + Testing Library):

- `ListingCard`: full and compact variants; negotiable; video badge; placeholder without photos; eye only when
  viewed and not compact; link target and `prefetch={false}`.
- `FavButton`: optimistic fill, rollback on failure, taps ignored while busy, haptic style per direction, `PUT`
  versus `DELETE`.
- `FeedHeader`: chip set with and without polygon, with room-less types, with one city, before reference data;
  owner chip for `any`, `no_agents`, `owners`; badge count; labels in three locales.
- `ListingFeed`: three skeletons; each row of the error table; inline retry keeps the cards; hidden items removed;
  favourites source hides items un-favourited in this launch.
- `FewResultsNote`, `FeedEmpty`: every text; button visibility; radar button absent while `radarsReady` is false,
  and — with the constant forced on — absent for `radars_enabled` `false` or missing, present for `true`;
  DEV-024 branch with the flag off and on; favourites and history variants.

End to end (Playwright, fake Telegram, stubs; `e2e/feed.spec.ts` in cookie mode and header mode):

- Cookie mode: after the session refresh the document contains cards and no `/bff/listings` request without a
  cursor was sent. Header mode: page one is requested through `/bff/listings` with `Authorization`.
- Scrolling loads pages until the stub's last page; the number of cards equals the number of distinct listings.
- Changing a search parameter in the address re-creates the list and scrolls to top.
- Heart: a tap fills it and sends one Server Action request, a second tap empties it. The browser never sees the
  `PUT` or `DELETE` itself (the action sends it from the server), so that choice is asserted in the unit test of
  `setFavorite` against a fake API. A failing save — stub scenario `source_unavailable` set through the
  `homi_stub_scenario` cookie of WP-22 right before the tap — returns the heart.
- A tap on a card opens the listing address over the feed; after Back the card shows the eye and the scroll
  position is kept.
- `/bff/listings` fulfilled with `500` for page two → inline «Не загрузилось — повторить»; aborted (offline) for
  page one in header mode → «Нет связи»; `403` → «Нет доступа — повторить».
- Each chip pushes its route with the current parameters; the owner chip reads «Кто размещает» by default.
- Pull-to-refresh sends a new page-one request.
- The demo-data marker is visible on the feed while the listings source is `stub`.

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

- [ ] Price shows amount and period; a down-payment price adds «· первый взнос»; no price shows «Цена договорная».
- [ ] The badge follows the priority: «Подозрительно дёшево», «Проверьте цену», «Хозяин ✓», «Ниже рынка»,
      «Хозяин».
- [ ] The market chip shows «−N% к рынку» / «+N% к рынку», «≈ обычная», «≈ спорно» with the tone colour; an
      unknown tone shows the real sign in the neutral colour.
- [ ] The facts line shows title, area, floor, market and the pets mark when present, then the age.
- [ ] The location line shows district, landmark and the metro within 1.5 km, else the distance to the centre.
- [ ] Photos swipe inside the card with dots; a video listing shows ▶; a listing without photos, and a broken
      photo, show the placeholder.
- [ ] On Save-Data or lite graphics only small photos are requested.
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

Empty.
