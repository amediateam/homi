# WP-26 — Listing screen

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #81 on 2026-11-17; production track: the regular deploy; then the manual checks inside Telegram on staging) |
| Depends on | WP-24 |
| Size | ≈ 3 000 changed lines (upper end of the PR rule), L |
| Behaviour reference | `03` §2 (SCR-018, SCR-019, SCR-020, SCR-022, SCR-023), §1.2, §1.12, §3.3–§3.5, §4, §5; `05` §1.7; `08` §1.8 and the row of API-016; `02` BR-API-101, BR-API-156; `09` F-REPORT-001; task files KV-FE-063 … KV-FE-071, KV-FE-029, KV-FE-030 — behaviour, texts, edge cases and test ideas only; their file layout, navigation stack, API paths and transport are not taken |
| Needs from the production track | nothing on stubs. When WP-43 fixes the host of the call page, that host joins the link allow-list of WP-21 |

## Goal

A listing opens over the feed, the map, the saved lists, a radar sheet or the hidden list, and loads directly by its
address. It shows every block of the legacy listing screen with its loading and error states, the photo viewer, the
market sheet and the actions sheet (hide, block the author, report, support), and it calls, writes, translates and
shares through `/api/v1` on stubs. The five client defects of this screen are fixed.

## Scope

**In.** SCR-018 (screen), SCR-019 (loading and errors), SCR-020 (photo viewer), SCR-022 (market sheet), SCR-023
(actions sheet with the report and report-detail steps). Rules BR-APP-028, BR-APP-032 … BR-APP-038, BR-APP-068,
BR-APP-069. Defects LB-APP-003, LB-APP-004, LB-APP-015, LB-APP-016, LB-APP-028. Server Actions for contact,
translation, share, hide, block and report. The stub entries `100018` … `100021` with the listing-screen variants and
the per-m² fix of `100008` and `100009`, as a backend commit of this package (D-1).

**Out.**

- The fullscreen spot map SCR-021 and the mini-map itself: WP-28. This package leaves `location/page.tsx` as the
  WP-20 placeholder and renders a `SpotMapSlot` box in the location section.
- The card, `Photo`, `PhotoStrip`, `FavButton`, the favourite action, `verdict.ts`, `badges.ts`, the preview cache
  and the rules BR-APP-026, BR-APP-027, BR-APP-039, BR-APP-040 with LB-APP-039: WP-24 (used here; `PhotoStrip` gets
  four optional props for the hero, D-14).
- Money, date and distance formatters with their flags (BR-APP-031, LB-APP-025, LB-APP-031): WP-22 (used here).
- `RouteSheet`, `BottomSheet`, `useSwipeBack`, `ErrorState`, toast, `failed()`: WP-23. The `tg` facade, link
  allow-list, deep-link builders, Back wiring: WP-21. The system sheets SCR-044 are only triggered here.
- The «Скрытое» list that reads what is hidden here: WP-31. Event transport and screen names: WP-32. The focus rules
  of the full-screen layers beyond the listing's minimal handling: WP-33 (KI-41).
- The owner states of the listing, built on the seams of this package and nothing rebuilt: the CTA actions of
  `features/listing/cta/ListingCtaBar.tsx` (`ctaActionOf`), the sections, the title row and the child routes
  `contact`, `owner` (WP-83) and `requests` (WP-82); `owner.mine` swaps the CTA bar for the panel's footer (SCR-059,
  WP-82) (*added by the owner-cabinet plan*).

## Decisions that bind this package

| Topic | Source | Consequence here |
| ----- | ------ | ---------------- |
| Rebuild | DEC-32, 25 §2 rule 3 | Built from the audit; no legacy code or CSS is copied |
| Defects and flags | DEC-36, `09` §4.2–§4.3 | The five defects above are fixed without a flag. `dev051RentedUndo` and `dev010RealtorVoteWording` are written with both branches and were off as built; the actions route is the one reader of both. `dev014TashkentDates` (read by `ListingScreen` for `HistoryDate`), `dev001AnyForbiddenShowsAccess` (`useListing` calls `onForbidden()` once the session is ready) and `dev016ErrorToastOnFailure` (through `failed()`, for the contact failures only: the actions sheet shows its failure toast always, D-6) are consumed through the helpers of WP-22 and WP-23. `dev019OneDistanceFormatter` is not read on this screen: it switches the card's metro label (`formatMetroLabel`), and «Рядом» always uses `formatDistance`. Since the intake of `index-CIa0Ldj2.js` (DEC-58, which amends DEC-36 for what legacy adopted): `dev051RentedUndo`, `dev014TashkentDates` and `dev016ErrorToastOnFailure` are on by default; the realtor toast has a flag of its own, `dev010AgentMarkedToast`, on by default; `dev010RealtorVoteWording` stays off and keeps only the hint; the contact failures ask `failed()` for the haptic alone. Both branches of each flag stay written and tested (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `lib/flags.ts`, `useListingActions` and `useContact` for a later package (`wave-1/baseline.md`, built code behind the pin, row 21, row 22, row 24 and row 27)) |
| Rendering | DEC-44, 25 §3.1 | The server part fetches with the session cookie and passes `initial` to one Client Component keyed by the number, which fetches for itself when the server had no session |
| Routes | 25 §3.2 | `/listing/[number]` is a layout rendered over the page below; `photos`, `market`, `actions` are its own addresses; Back closes viewer or sheet first, then the listing |
| Session modes | 25 §3.4 | Cookie mode and header mode use the same screen code; mutations are Server Actions that take one input object and, in header mode, the token as an argument (D-7) |
| API conventions | 25 §4.1 | Listings are addressed by their public number; `503 source_unavailable` shows the "could not load" state with retry |
| Methods | 25 §4.2, DEC-48 | `GET /listings/{number}`, `POST …/contact`, `POST …/translation`, `POST …/share`, `PUT`/`DELETE /hidden/listings/{number}`, `PUT`/`DELETE /listings/{number}/blocked-author`, `POST /listings/{number}/reports` and, since the intake of `index-CIa0Ldj2.js`, `DELETE /listings/{number}/reports`, the undo of «Уже сдано» (DEC-68; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `lib/actions/reports.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 22)). The API records the view on the read; the client sends nothing for it |
| The author's number | DEC-52, WP-12 | The card answer has no number and no call link, and the numbers in its texts are masked. «Позвонить», «Показать номер» and a masked number in the text call `POST …/contact` on the tap and only then show the digits or open the call link. Nothing asks for a contact without a tap, so no number is in the server-rendered page. On by decision, no flag |
| Baseline | 25 §8, Q-APP-024, `wave-1/baseline.md` | The behaviour is that of the pinned release `index-DY_DH7h-.js`. Two parts came after the release first audited: the report-detail step (`index-BNLZFfL0.js`; SCR-023, BR-APP-036, API-016) and the `business` price kind, which on this screen shows only in the share text (`index-Dbpp463V.js`; SCR-018, BR-APP-038). Both are specified below from the audit. The details the audit left open were settled by a read-only look at the legacy source (D-30); a value marked HOMI below is a deliberate departure. Since `index-CBlEKxdL.js` the layer has an entrance and a leave animation (*added by the intake of `index-CBlEKxdL.js`*). Since `index-CIa0Ldj2.js`: the "gone" screen, the day limit, the report toasts, the floor tile, Tashkent dates, the close control without the SDK, the sale switch (*added by the intake of `index-CIa0Ldj2.js`*) |
| Brand | DEC-40, 25 §2 rule 5 | Bot name, support account and the methodology link come from the brand layer and the reference data, never inline |
| Developer answers of 2026-11-17 | D-1, D-2 | The stub variants and the per-m² fix are in this PR («В PR WP-26»). `splitMaskedPhones` lives in the app, `frontend/app/lib/phone/masked.ts` («lib приложения»): no package or lockfile change |
| Acceptance | DEC-46, 25 §9 | The functional checklist below, in three locales and two themes |

## Design

Read before coding (`frontend/app/node_modules/next/dist/docs/01-app/`):
`03-api-reference/03-file-conventions/{parallel-routes,intercepting-routes,layout,dynamic-routes,default}.md`,
`02-guides/{authentication-with-cache-components,preserving-ui-state,lazy-loading}.md`,
`02-guides/preventing-flash-before-hydration.md`, `03-api-reference/04-functions/{use-params,use-search-params}.md`.

### Routes

Paths are under `frontend/app/app/[locale]/(main)/`. The two trees import the same components; route files hold no
logic.

| Route file | In `listing/[number]/` (direct load) and in `@overlay/(.)listing/[number]/` (opened over a page) |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `layout.tsx` | `<Suspense fallback={null}><ListingLayer params={params} presentation=… screen={<ListingServer params={params} />}>{children}</ListingLayer></Suspense>`: `presentation="standalone"` in the direct tree, `"layer"` in `@overlay`; the `params` promise is passed on, never awaited in the layout |
| `page.tsx` | `null` |
| `photos/page.tsx` | `<Suspense fallback={null}><PhotoViewerRoute /></Suspense>`, identical in both trees |
| `market/page.tsx` | `<Suspense fallback={null}><MarketSheetRoute /></Suspense>`, identical in both trees |
| `actions/page.tsx` | `<Suspense fallback={null}><ListingActionsRoute /></Suspense>`, identical in both trees |
| `location/page.tsx` | WP-20 placeholder, not touched here (WP-28); it renders inside the layer |

`ListingLayer` (client) reads its number from its own `params` with `use(params)`, provides it to the screen and the
child routes through `ListingLayerContext`, holds the `RouteOverlay` and keys it — and with it the
`<Suspense fallback={<ListingScreen number={number} />}>` around `ListingServer` — by number and opening (D-20, D-11).

Why a layout and not a page:

- `layout.md` states that layouts do not re-render on navigation. The listing therefore stays mounted while the
  child changes between `null`, the viewer and a sheet, in both trees. A page would be replaced by its sub-route.
- `parallel-routes.md`: on soft navigation a slot keeps its active subpage. `intercepting-routes.md`: the
  intercepted tree is used on soft navigation, the plain tree on a hard load of the same address; `(.)` under
  `(main)/@overlay` does not count the group as a level (WP-20, `e2e/foundation.spec.ts`). Verified in this package:
  the interception rewrite's `Next-Url` condition matches any address under the locale, so a soft navigation **from**
  a directly loaded listing or one of its children to a listing address is intercepted as well. It mounts an
  `@overlay` copy over the standalone one, which the `children` slot keeps. Hence the latch of "Layers" (X1) and the
  duplicate copy of KI-56.
- `dynamic-routes.md`: with Cache Components a layout should not await `params` at its top level (that prevents
  prerendering). The layout passes the `params` promise on; `ListingLayer` reads it with `use()` under the layout's
  `<Suspense fallback={null}>`, and `ListingServer` awaits it inside its own boundary.
- `layout.md`: layouts cannot read search parameters. The photo index `i` and the actions step are read in Client
  Components with `useSearchParams()`; the actions sheet reads the step from `window.location.search` at the moment it
  navigates (see "Actions sheet").
- Verified: the browser keys a dynamic segment by its value (`create-segment-key.browser.js` re-exports
  `createRouterCacheKey`, name, value and type), so every number has its own layout instance and its own bfcache
  entry; the server build's key, without the value (`name|type`), is used only to resume HTML. `useParams()` is
  app-global (one context for the whole app), so a hidden copy of listing A would read B's number while B is open:
  the listing reads its number from its layout's `params`. `ListingLayer` still keys the layer by number and opening
  (D-11, KI-42), and `ListingServer` renders `<ListingScreen key={number} …>`, so nothing of another listing survives
  (fix of LB-APP-003).

### Data flow

1. A card, map card, radar find or hidden item calls `router.push(routes.listing(number))` (callers' packages).
   WP-24 has put the card data into `lib/data/previewCache.ts`.
2. The fallback instance `<ListingScreen number={number} />` (no `initial` prop; the number from `ListingLayer`'s own
   `params`) shows the details the resource already holds, else the preview from the cache, else `ListingSkeleton`
   (deep link, direct load). It never fetches.
3. `ListingServer` (async Server Component): awaits `params`; an address without a valid number → `notFound()`; with
   a session cookie (`getSessionToken() !== null`) it calls `serverApi()` → `GET /listings/{number}` through
   `toRecord` (a preview body counts as a server failure) and renders
   `<ListingScreen key={number} number={number} initial={result} />`; without a cookie (header mode, the first
   request of a launch) or on `unauthorized` it renders the same with `initial={null}`. Nothing is cached.
4. `useListing(number, { initial })` in the resolved instance reads the resource `useResource(listingKey(number), …)`
   — the string key `listing:${number}` (D-18), value `{ listing, source }` (`ListingRecord`):
   - `initial.ok` → details. The server's `initial` seeds the store during render, and the seed is announced by its
     commit, so the child routes and the layer that committed earlier see it (a `useResource` fix of this package).
   - `initial === null` → one read through `bffFetch('listings/<number>')` once the session is `ready` (header mode
     waits for it; `bffFetch` re-authenticates once, WP-21).
   - Any other failed result → its error state, without a browser read. A server `forbidden` with
     `dev001AnyForbiddenShowsAccess` calls `onForbidden()` once, after the session is `ready` (it does nothing
     before).
   - «Повторить» scrolls the layer to the top and always reads through `bffFetch`, in both modes, showing the preview
     or the skeleton while it runs; from then on the server's failure no longer counts.
   - Data on screen wins over an error: a failed background refetch of a stale entry keeps the details.
   - When the last reader of an entry without data leaves, `useResource` forgets it (review B2), so a later opening
     never shows an earlier failure: it seeds from its server answer, or shows the preview or the skeleton while it
     reads.
   - The children (`photos`, `market`, `actions`) read the same entry with `useListingRecord(number)`, which never
     reads itself: no second request.
5. The layer that scrolls (`RouteOverlay`) sits outside the swapped boundary, so the swap from the fallback instance
   to the resolved one moves no scroll. `viewState.ts` keeps only the hero index for one opening, so the resolved
   hero starts where the fallback one was; it is forgotten when the listing closes, and every opening starts at the
   top and at photo 1 (legacy, D-11). `ListingLayer` bumps an `opening` counter when the listing is hidden (bfcache
   `<Activity>`) or left, and keys the overlay by number and opening — never by `bfcacheId`, because opening
   `/photos` is a push.
6. A different number in the answer (legacy merge redirect, `useListingLoader` behaviour of SCR-018): `seedResource`
   writes the same answer into the new number's entry, then `router.replace(routes.listing(newNumber))`, once per
   instance. A child route or an actions step opened over the alias's preview is stepped back over first (`backBy`
   of the entries above the listing, read from the live address), so the replace takes the alias's own entry and Back
   reaches the page below (review X3); at depth 0 nothing can be stepped over and the replace drops the child — a
   direct load of `/listing/100016/photos` lands on the bare `/listing/100001`. No second browser read (in cookie
   mode the replace renders the server part once more, D-9); no stale state (new key). For the one render before the
   replace the screen shows the target's details under the alias number.
7. The resolved instance calls `markSeen(number)` (the `seen` session map, the eye of BR-APP-040).
8. `bffFetch` and `useAction` report `meta.source` (WP-22); the server's `initial` is reported by `<SourceReporter>`
   in the resolved instance's loaded state, so the demo marker shows on stub answers.

Field names below are the legacy ones of `08` §1.8, used as meanings; the v1 names are those of the generated
`@homi/types` (WP-12). Where the two differ, the contract of WP-12 says: `title` is already the short form (no
`short_title`, no split at « · »); `age` is `posted.label` and `posted.when`; `market_code` is `market.code`;
`median` and the `median_*` fields are the object `comparison` (`null` when there is no comparison; `value`, `own`,
`n`, `metric`, `scope`, `rooms`, `near_class`, `radius_km`, `district`, `place_value`, `note`, `updated`,
`has_reason`, `price_usd`, `price_per_m2`; `comparison.value` is never null), while the delta and the tone stay in
`market.median_delta` and `market.tone`; `history` is `price_history` (`change_pct` a percent, not a fraction);
`owner` is `owner_label`; `original_text`, `original_url`, `post_deleted` are `original.text`, `original.url`,
`original.deleted`; the card has no phone and no call link (DEC-52) — `contact.has_phone`, `contact.contact_url`
and `contact.contact_paid` are what it carries, and `phone`, `phone_display`, `call_url` and `expires_at` come from
`getContact`; the price parts are `price.display`, `price.period`, `price.alt`, `price.notes`, `price.kind`. The
action names `getContact`, `translate` and `prepareShare` are the ones WP-22 reserved.

### Components and modules (`frontend/app/features/listing/`)

| File | Content |
| ---- | ------- |
| `ListingServer.tsx` | server part described above |
| `ListingLayer.tsx` | client; the one owner of `RouteOverlay` for a listing address in both trees: the number from `use(params)`, `ListingLayerContext`, the opening key, the fallback, the child routes (dropped for good by the standalone copy once an overlay copy has shown), focus (D-12), the body class `listing-open`, the swipe gate |
| `ListingScreen.tsx` | client; the fallback and the resolved instance; every state of SCR-019; the preview and the loaded screen share one body (hero, banner, title row, key facts, the sections in legacy order, the CTA bar fixed inside the layer) |
| `useListing.ts` | `useListing`, `useListingRecord` (the children's read-only view), `ListingLayerContext`, `ListingLayerValue`, `useListingNumber`, `ListingView` |
| `listingData.ts` | the contract types, `ListingRecord`, `ListingInitial`, `listingKey`, `isListingDetails`, `toRecord`, `placeLine`; no `"use client"` (the server part imports it) |
| `viewState.ts` | the hero index of one opening (`heroIndexOf`, `rememberHeroIndex`, `forgetView`) |
| `ListingSkeleton.tsx` | `ListingSkeleton` (shimmer hero + three bars) and `SectionSkeleton` (3 or 4 lines) |
| `ListingHero.tsx`, `ListingTitleRow.tsx`, `KeyFacts.tsx` | hero strip with counter and video label; title, place, share, favourite, «⋯»; fact tiles |
| `sections/controls.ts` | the `PhoneControl` and `TranslationControl` types the sections take |
| `sections/MarketBlock.tsx`, `market/marketText.ts` | block, scale position, context line, warnings (`resetMarkerShows` for tests); pure text builders for block and sheet, including the total rooms function |
| `sections/{FactsSection,StatsSection,HistorySection,HistoryDate}.tsx` | facts grid, stats cells, history sentence or timeline, date and time cell |
| `sections/{LocationSection,NearbySection,SpotMapSlot}.tsx` | location rows with «Рядом» inside (`nearbyRows` exported for the location's own visibility), the 2:1 placeholder that links to `routes.listingLocation(number)` |
| `sections/{AuthorSection,DescriptionSection,SourcesSection,OriginalText}.tsx` | author, description, channel chips with the disclosure, whose child is the original text with translation |
| `translation/{useTranslation,translationCache}.ts` | state per number and locale: `{ text, shown, pending, failed }` (`EMPTY_TRANSLATION` is the server snapshot) |
| `cta/{ListingCtaBar.tsx,useContact.ts}` | price, delta or note, primary action (`ctaActionOf`); `useContact` (the contact fetched on a tap and its lifetime) and `useListingContact` (every contact control: its lock, haptics, call flow and events). WP-83 extends `ctaActionOf` with the request states of an owner listing; WP-82 swaps the bar for the panel's footer when `owner.mine` (*added by the owner-cabinet plan*) |
| `share/useShareListing.ts` | prepared message, fallback link and its text (`shareText`), lock (`SHARE_LOCK_MS`) |
| `openOriginal.ts` | `openOriginal(number, url, src)`: `tg.openLink`, then `original_opened` only if it opened; no haptic |
| `viewer/{PhotoViewerRoute,PhotoViewer,ZoomableImage}.tsx`, `viewer/gestures.ts` | viewer route, viewer, zoomable slide, pure gesture maths |
| `market/{MarketSheetRoute,MarketSheet}.tsx` | `RouteSheet` without a × button |
| `actions/{ListingActionsRoute,ListingActionsSheet,ActionRow,ReportDetailStep}.tsx`, `actions/useListingActions.ts` | the route (step, step opening, flags), menu, report and detail steps (`BLOCK_COUNT_FROM`, `REPORT_DETAILS`), the sheet's toast host; results, toasts, undo |
| `closeListing.ts` | `stepLayersOf`, `closeActions(number, step)` and `closeListing(step)`: close the sheet steps, and the listing, in one move (see below) |

The viewer, the market sheet and the actions sheet are loaded with `next/dynamic` and `ssr: false` from their
routes (`lazy-loading.md`): they are portalled, so they have no server HTML.

Outside the feature folder:

- `splitMaskedPhones(text)` and `MASKED_PHONE` in `frontend/app/lib/phone/masked.ts` (D-2; tests
  `frontend/app/tests/phone/masked.test.ts`): they cut a text into plain parts and masked numbers — the fixed form of
  WP-12, `+998 ** *** ** NN` or `+** *** ** NN` — and give each number's last two digits. A raw number is never
  turned into a control.
- `backBy(steps)` in `frontend/app/lib/navigation/history.ts`: steps back over `steps` entries at once, never below
  the first entry of this launch, and resolves with the steps taken once the `popstate` has landed (500 ms at most).
  `closeListing` replaces the address with the feed, and `closeActions` with the listing, when fewer were taken.
- `useCloseOnce(close)` in `frontend/app/lib/navigation/useCloseOnce.ts`, moved out of `RouteSheet` (review B1): a
  close once per address, re-armed when the copy is hidden or unmounted and when the address changes. `RouteSheet`,
  the nested city picker of `CityPickerSheet`, the photo viewer and the actions sheet's chevron use it.
- `frontend/app/lib/data/useResource.ts`: `seedResource(key, data)` (the redirect); a render-time seed announced by
  its commit, whether or not that user reads; an entry without data forgotten when its last reader leaves (B2).
- `PhotoStrip` (WP-24) takes `initialIndex`, `onActiveChange`, `onPhotoTap` and `tapLabel` for the hero (D-14); the
  card's defaults do not change.
- `BottomSheet` takes `leading` (the control left of the compact title), and `RouteSheet` passes it on and takes
  `onClose`, which replaces the one `back()` of the ×, the backdrop, the drag and Escape, still once per address;
  Telegram's BackButton keeps `back()` (D-15). `@homi/ui` exports 28 more lucide icons and `prefersReducedMotion`.
- `DemoDataMarker` sits at `--z-listing + 1` (46): above the listing layer, below the sheets' backdrop (D-16).
- `contact_call.src` of `lib/analytics/events.ts` allows `'text' | 'author'` (D-17).
- `linkHosts()` of `lib/telegram/links.ts` adds the host of `NEXT_PUBLIC_API_URL` (D-8, see "Contact").

### Server Actions and reads

| Function | File | v1 method | Used result |
| -------- | ---- | --------- | ----------- |
| `getContact({ number })` | `lib/actions/listing.ts` | `POST /listings/{number}/contact` | number, display number, call link and its expiry; called only from a tap |
| `translate({ number })` | `lib/actions/listing.ts` | `POST /listings/{number}/translation` | translated text |
| `prepareShare({ number })` | `lib/actions/listing.ts` | `POST /listings/{number}/share` | prepared message identifier |
| `hideListing`, `unhideListing` | `lib/actions/hidden.ts` | `PUT`, `DELETE /hidden/listings/{number}` | — |
| `blockAuthor`, `unblockAuthor` | `lib/actions/hidden.ts` | `PUT`, `DELETE /listings/{number}/blocked-author` | hidden listing numbers, author label |
| `reportListing({ number, reason, detail? })` | `lib/actions/reports.ts` | `POST /listings/{number}/reports` | `hidden` flag (an empty success counts as `false`) |

All take one input object `({ number, … }, auth?, locale?)` → `ActionResult<T>`, in the shape of
`lib/actions/favorites.ts` (D-7), and are called through `useAction()` (WP-22). An input that fails its check sends
no request: `reportListing` takes a `detail` with `wrong_data` and only with it (an absent or `undefined` detail
counts as none, `detail: null` is refused). `hidden.ts` keeps its own copy of the number check, because a
`"use server"` file can export only async functions. The read `GET listings/{number}` is already in
`lib/api/bffAllowList.ts`, and `tg.call`, `tg.shareMessage` and `tg.shareUrl` exist (WP-21, WP-22): neither is
changed here (D-8).

### Layers, Back and z-order

- Viewer and sheets are opened with `router.push(…, { scroll: false })`; `back()` of `useBack()` closes them. The
  report and detail steps are `useLayerState('step')` values `report` and `detail`, so Back walks
  detail → report → menu → listing → page below.
- The viewer's ×, Escape and swipe down share one `useCloseOnce(back)`; the actions sheet's chevron has its own,
  apart from the sheet's ×. A double tap before the navigation has landed therefore steps back once (review B1).
- The actions sheet's ×, backdrop and drag close all its steps at once through `RouteSheet`'s `onClose`:
  `closeActions()` = `backBy(step layers + the actions route)`, then `nav.replace(routes.listing(number))` when fewer
  were taken. After hide, block, a `rented` report or a `fraud` report that hid the listing, the sheet and the
  listing close together: `closeListing()` = `backBy(step layers + actions + listing)`, then
  `nav.replace(routes.feed())` when fewer were taken (direct load). History never grows.
- Both sheets use `presentation="layer"` in both trees, so they are portalled in both; portalled children have no
  server HTML.
- Swipe-back (`useSwipeBack` of `@homi/ui`) and the body class `listing-open` are held by `ListingLayer`. The swipe
  is on only when the screen shows data (preview or details), the pathname is exactly the listing address (no child
  route open) and the app pushed a page below (`useDepth() > 0`: an overlay copy over a directly loaded listing has
  only that copy under it, review X2); never on Android. Its close is `back()`. Rows that scroll sideways (the hero
  strip, the source chips, the viewer strip) and the `SpotMapSlot` carry `data-no-swipe` (D-28).
- The layer slides in from 24 % and opacity 0 over 250 ms and leaves the same way over 200 ms ease-in (legacy since
  `index-CBlEKxdL.js`; `listing.css:1-35`, `layers.js:10-15` at r31; `03` SCR-018). A close by swipe-back ends at
  once, because the finger has already moved the layer out. Under lite graphics or reduced motion there is neither
  animation. A new opening during the leave cancels it. How the leave is sequenced with the route change is decided by
  the package that builds it (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `RouteOverlay`,
  `ListingLayer` and `closeListing` for a later package (`wave-1/baseline.md`, built code behind the pin, row 5)).
- While the SDK is absent the layer shows the fallback close, the app's own cross labelled `common.close`, in every
  state — skeleton, preview, details, "gone", day limit and the error states. It closes like Back and goes when the
  SDK arrives (legacy since `index-CIa0Ldj2.js`, `05` TMA-047; *added by the intake of `index-CIa0Ldj2.js`*; a parity
  item of `RouteOverlay` for a later package (`wave-1/baseline.md`, built code behind the pin, row 19)).
- The listing of a launch link that is a sale over a feed that is not: when it closes — by Back, swipe, the fallback
  close or `closeListing` — the feed's address is replaced by the sale defaults of the feed's own city instead of a
  plain Back (DEC-65). Legacy switches the feed while the listing is open (`03` BR-APP-108); here the page under an
  intercepted layer cannot change its address while the layer shows. Another listing opened meanwhile drops the switch
  (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `launch.ts` and the close path of the listing for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 16)).
- A soft navigation from a directly loaded listing address is intercepted into `@overlay` (see "Routes"). Once an
  overlay copy of a listing has shown, the standalone copy renders its child routes no more, for the rest of its life
  (a latch, not a toggle; review X1): after a depth-0 close of a directly loaded child (the replace with the listing)
  its portalled viewer or sheet would otherwise stay above the overlay copy, and the actions sheet would be dead.
  The standalone copy keeps rendering its screen; the overlay copy covers it (KI-56).
- Z-order uses the tokens of WP-20 (legacy ladder of `03` §3.6): the listing layer `--z-overlay` 45 (an alias of
  `--z-listing`), the CTA bar `--z-cta` 20 inside that layer, the demo marker 46, sheets `--z-backdrop` 50, toast 60
  (the app's host, and the actions sheet's own host inside the sheet), viewer `--z-viewer` 100. `PhotoViewer` is
  portalled to `document.body` with `createPortal`, `MarketSheet` and `ListingActionsSheet` through `RouteSheet`'s
  layer portal, so they compare with the toast and the tab bar in the root stacking context. The CTA bar and the
  status banner stay inside the listing layer. Nothing that wraps the slots gets a transform, filter or z-index.
- `PhotoViewer` sets the body class `locked` while open; `ListingLayer` sets `listing-open` while visible
  (pull-to-refresh of WP-23 and the nudges of WP-30 stay off under it, as in SCR-010); `BottomSheet` sets its own
  `sheet-open`.
- Focus (D-12, KI-41 in part): on each opening the layer focuses its root (`tabIndex=-1`, `preventScroll`, no visible
  ring); on close it gives the focus back to the element that had it, when that is still in the document. The
  viewer dialog does the same. Everything else is WP-33's.

### Flags and new texts

| Flag | Off | On |
| ---- | --- | -- |
| `dev051RentedUndo` — on by default since the intake of `index-CIa0Ldj2.js` (DEC-58) | «Отметили: уже сдано» without an action (legacy up to `index-CBlEKxdL.js`) | the toast gets «Вернуть», which calls `unreportListing` (`DELETE /listings/{number}/reports`: only the `rented` report is withdrawn, DEC-68) and un-hides the listing (legacy since `index-CIa0Ldj2.js`; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListingActions` and `lib/actions/reports.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 22); as built the flag is off and its undo only un-hides; WP-34 closed it) |
| `dev010AgentMarkedToast` — new, on by default (DEC-58) | always `toast.reportedAgent` (legacy up to `index-CBlEKxdL.js`) | `toast.reportedAgent` «Отметили номер как риелторский» when the answer has `agent_marked`, else `toast.reportedAgentNoted` «Спасибо, учёл вашу отметку» (legacy since `index-CIa0Ldj2.js`; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListingActions` for a later package (`wave-1/baseline.md`, built code behind the pin, row 24)) |
| `dev010RealtorVoteWording` — off | `report.agentHint` | `report.agentHintReview`: the hint only. `toast.reportedAgentReview` is no longer used once the toast follows `agent_marked`; as built this flag also switched the toast to it (WP-34 removed the text and that branch) |

New keys, `homi` layer of `@homi/i18n` (uz values as written here; the «makler» / «ham» question is in "Open for the
reviewer", D-13):

| Key | ru | uz | en |
| --- | -- | -- | -- |
| `market.v3.rooms0` | «тоже студии» | «ham studiya» | «also studios» |
| `market.v3.roomsN` | «тоже {n}-комн.» | «ham {n} xonali» | «also {n}-room» |
| `report.agentHintReview` | «Проверим номер — если это риелтор, отметим его» | «Raqamni tekshiramiz — rieltor boʻlsa, belgilaymiz» | «We’ll check the number and mark it if it’s an agent» |
| `toast.reportedAgentReview` | «Спасибо, проверим» | «Rahmat, tekshiramiz» | «Thanks, we’ll check» |
| `listing.showPhone` | «Показать номер» | «Raqamni koʻrsatish» | «Show number» |

## Files

New, under `frontend/app/`, unless marked:

- `app/[locale]/(main)/listing/[number]/layout.tsx`, `photos/page.tsx`, `market/page.tsx`, `actions/page.tsx`
  (replace the WP-20 placeholders; `page.tsx` stays `null`)
- `app/[locale]/(main)/@overlay/(.)listing/[number]/layout.tsx`, `photos/page.tsx`, `market/page.tsx`,
  `actions/page.tsx` (same)
- `features/listing/**` as in the table above
- `lib/actions/{listing,hidden,reports}.ts`, `lib/phone/masked.ts`, `lib/navigation/useCloseOnce.ts`
- `tests/listing/*.test.ts(x)` (the 29 files of "Tests"), `tests/actions/{listing,hidden,reports}.test.ts`,
  `tests/phone/masked.test.ts`, `tests/helpers/details.ts` (`detailsOf`, `contactOf`: the stub details of `100001`
  over `previewOf()`, texts masked as the API sends them)
- `e2e/{listing-open,listing-contact,listing-actions,photo-viewer}.spec.ts`

Changed, under `frontend/app/`:

- `lib/data/useResource.ts` with `tests/data/useResource.test.tsx`; `lib/navigation/history.ts` (`backBy`) with
  `tests/navigation/history.test.tsx`; `lib/telegram/links.ts` with `tests/telegram/links.test.ts`;
  `lib/analytics/events.ts` (`contact_call.src`)
- `features/feed/PhotoStrip.tsx` with `tests/feed/PhotoStrip.test.tsx`; `features/shell/RouteSheet.tsx` with
  `tests/shell/route-sheet.test.tsx`; `features/shell/DemoDataMarker.tsx` with `tests/shell/demo-marker.test.tsx`;
  `features/city/CityPickerSheet.tsx` (the shared `useCloseOnce`)
- `tests/filters/FiltersSheetRoute.test.tsx` (stubs `scrollIntoView`, which jsdom lacks, for the pets-entry apply
  cases that threw under load)
- `e2e/foundation.spec.ts` (the portalled children have no server HTML; the viewer and the market sheet are checked
  outside the listing), `e2e/back.spec.ts` (opens the viewer from the hero photo); `README.md`

Changed elsewhere:

- `frontend/packages/ui/src/components/BottomSheet.tsx` with `tests/BottomSheet.test.tsx`,
  `frontend/packages/ui/src/icons/index.ts`, `frontend/packages/ui/src/index.ts`
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json` (five keys) with `tests/catalogue.test.ts`
- `backend/resources/fixtures/v1/listings/catalog.json` (`100018` … `100021`; the per-m² comparisons of `100008` and
  `100009`), `backend/tests/Feature/Api/V1/Listings/CardContractTest.php`,
  `backend/tests/Feature/Api/V1/Listings/ContactTranslationShareContractTest.php`, the class docblock of
  `backend/app/Services/Sources/Stub/StubListingSource.php`, the reserved-number note of `docs/api/README.md`
- `.github/workflows/frontend-e2e.yml` (`NEXT_PUBLIC_API_URL` in the env of the end-to-end step)

Needed no change: `lib/api/bffAllowList.ts` (`listings/:number` is allowed), `lib/telegram/` calls and shares (WP-21),
`features/shell/RouteParamPlaceholder.tsx` (`ListingPlaceholder` stays for the shell tests).

## Steps

1. Read the Next.js files named in "Design" and the SCR-018 and SCR-023 sections of `03` (they describe the pinned
   release); settle the open legacy details (D-30).
2. `ListingServer`, `ListingLayer`, the `ListingScreen` shell, `useListing`, `viewState`, skeletons; both
   `layout.tsx`; the `useResource` seed announcement and `seedResource`. Open from a feed card, Back closes.
3. Loading and error states; the number redirect; `markSeen`. Unit tests of `useListing`.
4. Hero (`PhotoStrip`'s hero props), status banner, title row (favourite wired to `FavButton`), key facts.
5. Market block and `marketText.ts` with tests.
6. Facts, stats, history with `HistoryDate`.
7. Location rows, «Рядом», `SpotMapSlot`.
8. Author, description. `splitMaskedPhones` in `lib/phone/masked.ts` with tests. Sources, original text,
   translation with `translate`.
9. `useContact`, `useListingContact`, `getContact`, CTA bar; the tap flows of the bar, of «Показать номер» and of a
   masked number in the text; the API host in `linkHosts()` and the CI variable.
10. `useShareListing`, `prepareShare`.
11. `gestures.ts`, `ZoomableImage`, `PhotoViewer`, `PhotoViewerRoute`, `photos/page.tsx` in both trees.
12. `MarketSheet`, `MarketSheetRoute`, `market/page.tsx` in both trees.
13. `backBy`, `closeListing` / `closeActions`, `RouteSheet`'s `leading` and `onClose`, actions
    `lib/actions/{hidden,reports}.ts`, `useListingActions`, the menu.
14. Report step, then the detail step with its Back order. Both flags with tests.
15. Swipe-back, body classes, portals and z-order check against the toast and the tab bar; the existing specs that
    read the placeholder markup.
16. The stub variants `100018` … `100021` and the per-m² fix with their contract tests (D-1).
17. Playwright specs in both session modes; tick the checklist on staging in ru, uz, en, light and dark.

## Behaviour to reproduce

### Loading and error states

SCR-019. Applies to the listing. The viewer, the market sheet and the actions sheet render at once; their content
waits: the viewer opens over the preview photos while the answer is pending (an empty dialog before either), the
market sheet shows a section skeleton, the menu a generic block hint.

| State | Trigger | Rendering |
| ----- | ------- | --------- |
| Skeleton | no preview and no answer yet | shimmer hero and three bars; swipe-back off |
| Preview | card data in the cache, answer pending | hero, title, key facts (no building tile) from the preview; `SectionSkeleton` of 3 lines and of 4 lines; no market block; the CTA bar with the card's price and market chip and a shimmer in place of the action |
| Loaded | answer arrived | all sections; photos from the full set |
| Not found | `not_found` | a block with `role="alert"`: the `SearchX` icon, the text `listing.gone` «Этого объявления уже нет — квартиру, похоже, сдали или продали» (uz «Bu eʼlon endi yoʻq — uy, shekilli, ijaraga berilgan yoki sotilgan», en «This listing is gone — the flat has probably been rented out or sold») and the button `listing.goneFresh` «Смотреть свежие» (uz «Yangilarini koʻrish», en «See the latest»): a light haptic, then the layer closes; a directly loaded listing goes to the feed. No retry; Back closes. Legacy since `index-CIa0Ldj2.js` (`03` SCR-019); as built: only the text `listing.loadFailed` «Объявление не загрузилось», no button (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `ListingScreen` for a later package (`wave-1/baseline.md`, built code behind the pin, row 17)) |
| Day limit | `rate_limited` with `reason: "daily"` | tall `ErrorState`: `error.dayLimit` «Лимит на сегодня», `error.dayLimitText` «За сутки открыто очень много объявлений. Попробуйте позже — Радар продолжит присылать новые в чат.», «Повторить» (DEC-59; legacy since `index-CIa0Ldj2.js`, `03` SCR-008; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListing` and `ListingScreen` for a later package (`wave-1/baseline.md`, built code behind the pin, row 18)) |
| Offline | `offline`, `timeout` | tall `ErrorState`: `error.offline` «Нет связи», `error.offlineText` «Проверьте интернет и попробуйте ещё раз.», `error.retry` «Повторить» |
| Server | `server`, `source_unavailable`, `rate_limited` without the reason | tall `ErrorState`: `common.loadFailed` «Не загрузилось», `error.serverText` «Сервер не ответил. Попробуйте ещё раз через минуту.», «Повторить» |
| Forbidden | `forbidden` | the server state above; with `dev001AnyForbiddenShowsAccess` `onForbidden()` sends the user to the access screen once the session is ready |
| Unauthorized | `unauthorized` | `bffFetch` re-authenticates once (WP-21); if that fails the session-expired screen of WP-23 shows. A server `unauthorized` is read again in the browser |

An error state replaces the whole screen (legacy): no hero, title or CTA, and no swipe-back. The not-found text and
the error state clear Telegram's header with `--top-inset`. «Повторить» scrolls the layer to the top and shows the
preview or the skeleton until the answer. A failed background refetch keeps loaded details on screen. An answer that
arrives for a number the user has already left is dropped (keyed instance; the resource aborts it), and a failure is
forgotten with its last reader, so a later opening of the same number never starts from it.

### Screen blocks, top to bottom

SCR-018. Every server string is rendered as text, never as HTML. Haptics follow the legacy table (D-27): light for
the hero, share, «⋯», ⓘ, the history links, the source chips, the disclosure, «Перевести» / «Показать оригинал»,
`SpotMapSlot`, the viewer's swipe-down close, a step opening and every action start; medium for every contact control
(«Позвонить», «Показать номер», the revealed number, a masked number, «Написать», «Номер платный», «Открыть пост»);
success or error on an action result; error on every contact failure; none for the offer links, the chevron,
«Вернуть» and Telegram Back.

1. **Hero.** `PhotoStrip` of WP-24 with the hero props (D-14) and the counter «N / M» (no key), shown only when the
   photo array on screen has more than one item (legacy: a one-photo preview shows none). M is the preview's
   `photos.count` while the answer is pending, then the length of the full set (D-24). For a video, the big label
   `listing.watchVideo` «Смотреть видео в Telegram» under the strip's ▶. Every tap plays the light haptic, also when
   it then opens the post. With the answer loaded, a video, the post not deleted and `original.url` set, a tap calls
   `openOriginal(…, 'video')`; otherwise — no video, `original.deleted`, no address (D-23) or the answer still
   pending — it calls `router.push(routes.listingPhotos(number, index))`. The pending video tap opening the viewer over
   the preview photos is a deliberate departure (HOMI): legacy plays the haptic and does nothing. The hero does not
   follow the viewer's photo when it closes (legacy). No photos: the placeholder of `Photo`, no counter.
2. **Status banner** from `status_text`, when present.
3. **Title row.** `h1` = `title` as it is (D-3); an empty title renders no `h1`. Line «district · landmark»
   (`placeLine`; the contract's `place` stands in for an unknown district). Buttons, in legacy order: share (aria
   `listing.share` «Поделиться», only when `botStartAppUrl(number)` is not null, i.e. `brand.botUsername` is set),
   favourite (`FavButton variant="plain"`, aria `fav.add` / `fav.remove`), «⋯» (aria `actions.menu` «Ещё») →
   `router.push(routes.listingActions(number))`.
4. **Key facts** tiles: rooms (plural `listing.rooms`), `listing.m2`, floor `n/total` (`n` without a total,
   `listing.floor`), building (`listing.building`): `listing.newBuilding` when `market.code` is `new`, else
   `listing.secondary`. The building tile needs `market.code`, which only the details carry: none in the preview,
   none for `null`. A tile is left out when its value is unknown or zero (rooms, area, floor; a studio's `rooms: 0`
   has no tile). Nothing when no tile is left. Since legacy release `index-CIa0Ldj2.js` the floor is the exception
   (`03` BR-APP-110): `floor: 0` gives the tile `listing.floorGround` «Цокольный этаж» and a negative floor
   `listing.floorBasement` «Подвал», both with an empty caption; only `null` leaves the tile out (*added by the intake
   of `index-CIa0Ldj2.js`*; a parity item of `KeyFacts` for a later package (`wave-1/baseline.md`, built code behind
   the pin, row 26); WP-35 closed it).
5. **Market block** (BR-APP-028, D-4): shown only in the loaded state, when `verdict.ts` returns a verdict **and**
   `comparison !== null` **and** `market.median_delta !== null`. Title `market.title` «Сравнение с районом»,
   `market.titleNear` «Сравнение с похожими рядом» (scope `near`) or `market.titleCity` «Сравнение с городом» (scope
   `city`). ⓘ button (aria `market.how` «Откуда эта цифра») → `router.push(routes.listingMarket(number))`. Verdict
   text and tone from `verdict.ts` (BR-APP-027 and LB-APP-039 are WP-24's). Scale labels `market.cheaper` «дешевле»,
   `market.median` «обычно {value}{unit}», `market.pricier` «дороже»; unit `unit.m2Month` for metric `m2` with
   `has_reason`, `unit.m2` for `m2`, else `unit.month`; values through `useMoney().format`. Marker position
   `clamp(4, 96, 50 + delta / 0.4 × 50)` %; own value = `comparison.own ?? (metric m2 ? comparison.price_per_m2 :
   comparison.price_usd)`; no marker when it is null (never «$NaN»); the marker is labelled with the own price,
   without a unit. On the first render that has a median of a number in this launch the marker starts at 50 % and
   moves after two frames (0.7 s) while the verdict fades in after 0.45 s; later shows start in place (HOMI: legacy
   counted its first mount, the preview, so on the card → listing path its marker never ran). No transition with
   lite graphics or reduced motion (`motion.css`). Context line, the first that applies: metric `person` →
   `market.ctxPerson`; scope `near` → `market.ctxNear` / `ctxNearSale`; metric `m2` with `has_reason` →
   `market.ctxM2`; scope `city` → `market.ctxCity` / `ctxCitySale`; else `market.ctxDistrict` / `ctxDistrictSale`.
   Arguments: `{rooms}` `""`, `1`–`3` or `4+` (any other number rounded); `{cls}` `market.clsJk` / `market.clsHouse`;
   `{km}` with one decimal; `{district}` `comparison.district`; `{n}` the sample size (0 when null). For tone `mixed`
   with a place value the line adds `market.ctxPlace` with `{place}` = `useMoney().format(place_value)`. Warnings:
   tone `suspicious` → `market.noteSuspicious`; tone `check` with a server note → that note.
6. **Facts** `details.facts` «Факты»: server order; icon by key (`type`, `rooms`, `area`, `land`, `floor`,
   `building`, `renovation`, `furniture`, `appliances`, `per_m2`, `commission`, `conditions`), any other key → the
   house icon; a value longer than 18 characters spans both columns; React key = key + index; empty → no section.
7. **Stats** (BR-APP-068): days on market — 0 → `details.today` «Сегодня» + `details.onMarket` «на рынке», else N +
   plural `details.daysOnMarket`; publications (plural `details.publications`); channels only when > 1
   (`details.channels`); views only when known and non-zero (`details.views`, number through `formatNumber`).
8. **History** (BR-APP-069): no entries → hidden. One entry → `details.history` «История» with the sentence
   `details.historySingle` «Опубликовано {date} в @{channel}. Повторов и изменений цены пока не было.», with a date
   and no time; the `@channel` part is a button when the entry has a link (sentence cut at placeholders, no HTML).
   Several → `details.priceHistory` «История цены»: rows of date, time, text · @channel (a null `text` is left out
   with its « · »), price (`useMoney().format`) and the change. `kind` colours the row's dot only for `published`,
   `price_down` and `price_up` (any other value: a faded dot). `change_pct` is a percent shown as the number locale
   gives it, up to three fraction digits, `+` only when positive and no space before «%» («-7,4%», «+5%», «0%»);
   negative is green with the down icon, zero and positive are orange with the up icon, null shows nothing (legacy,
   D-30). Rows with a link open the post (`openOriginal(…, 'price_history')`). Date and time come from
   `formatShortDate` / `formatTime` of WP-22: device time zone by default, `Asia/Tashkent` with
   `dev014TashkentDates` (LB-APP-025). Because the device zone is unknown on the server, `HistoryDate` renders a
   fixed-width empty cell on the server and at hydration and fills it after hydration (the fallback of
   `preventing-flash-before-hydration.md`; a client-only mount fills it at once); with the flag on the server renders
   the Tashkent value (D-29). The flag is on by default since the intake of `index-CIa0Ldj2.js`: legacy formats these
   dates in Asia/Tashkent itself since that release (DEC-58); the device-zone branch stays, tested, behind the flag
   off (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `lib/flags.ts` for a later package
   (`wave-1/baseline.md`, built code behind the pin, row 27)).
9. **Location** `listing.location` «Расположение»: with coordinates — `SpotMapSlot` (2:1 box, aria
   `listing.mapOpen`, light haptic, tap → `router.push(routes.listingLocation(number))`) and the hint
   `listing.mapApprox` «Место примерное: по кварталу, ориентиру или метро из объявления»; without coordinates neither.
   Place row; centre distance `fmt.centerKm` «{km} км до центра» (one decimal). `listing.nearby` «Рядом»: the metro
   row first, only when `km !== null && km <= 1.5` (D-22), then the server places in order; distances through
   `formatDistance` of WP-22 (legacy wording `near.here` «рядом», `near.m` «{m} м», `near.km` «{km} км»; BR-APP-031
   lives there, and it has no `dev019OneDistanceFormatter` branch) with the `~` prefix on every row, the metro row
   included, when `(geo_radius_m ?? 500) ≥ 400`. A non-empty `nearby[].note` is rendered under the name in small
   muted text (legacy, D-30). Fix of LB-APP-016: icons for `metro`, `park`, `school`, a default pin for any other
   kind; React key = kind + name + index. The heading stays while any row is left, also when «Рядом» is empty;
   nothing at all → no section.
10. **Author** `listing.whoPosts` «Кто размещает»: owner text; offers (with a link → button,
    `openOriginal(…, 'offers')`, no haptic; without → text); when `contact.has_phone`, the button `listing.showPhone`
    «Показать номер», which becomes the display number (class `ph-mask`, call with `src: 'author'`) after its tap —
    see "Contact"; `listing.published` «Опубликовано {when}» with `posted.when`, else `posted.label` (D-3).
11. **Description** `listing.description` «Из объявления»: the summary as text with line breaks kept; hidden when
    empty or only whitespace.
12. **Source** `listing.source` «Источник»: chips `@handle` → `openOriginal(…, 'sources')` (the row scrolls sideways
    and carries `data-no-swipe`). Disclosure `listing.originalText` «Текст оригинала», only with an original text
    that is not empty or only whitespace, closed on every new number. Inside: the translation controls (block 13),
    then the text in a `<pre>` with class `ph-mask`. The server has masked every phone number in it (WP-12);
    `splitMaskedPhones` finds them, and while `contact.has_phone` each masked number is a button that does what
    «Показать номер» does. After the answer the masked numbers whose last two digits are those of the listing's
    number show its display form and call on tap (`src: 'text'`); the other masked numbers stop being buttons and
    stay masked — BR-APP-035 in its new form: **only the listing's own number** is ever shown. After an answer
    without a number they stay buttons that open the call link. A `copy` event on the text, translated or not,
    sends `original_copied`; before the tap the copied text holds the masked form.
13. **Translation** (BR-APP-034), inside the open disclosure: not offered in `ru`. In uz and en: `listing.translate`
    «Перевести» → pending `listing.translating` «Перевожу…» (disabled) → translated text with
    `listing.machineTranslation` «Перевод сделан ИИ» under it and the button `listing.showOriginal` «Показать
    оригинал». The first tap calls `translate`, later taps toggle without a request. Any error or an empty text →
    `listing.translateFailed` «Не получилось перевести»; the next tap retries. The translated text goes through
    `splitMaskedPhones` too (D-21). State is cached per number and locale for the launch, so another listing never
    shows it (LB-APP-003), returning to the first listing restores it, and an answer that comes after the listing
    closed shows when it opens again. The server and the hydration render show the untranslated state.
14. **CTA bar** (fixed bottom inside the layer). Left: price main part + period, or `listing.negotiable`
    «Договорная» without a price; below it the verdict's short label and the note when the price has notes, else
    `listing.marketDelta` «{delta} к рынку» (`fmt.marketSameShort` «≈ обычная», `fmt.marketMixedShort` «≈ спорно»).
    The note is `price.notes` joined with « · ». Price parts come from the contract, as on the card; `price.alt` is
    not rendered (D-25). The bar shows no price-kind label — neither «первый взнос» nor the business label: on this
    screen the label is only in the share text (`03` SCR-018). Right (BR-APP-032), in priority: answer pending →
    shimmer; `contact.has_phone` → `listing.call` «Позвонить»; contact link → `listing.write` «Написать», or
    `listing.writePaid` «Номер платный» when the contact is paid; post deleted, or `original.url === null` (D-23) →
    no action; else `listing.openPost` «Открыть пост» → `openOriginal(…, 'button')`. With no action the bar keeps its
    price side and an empty right cell of the same width (HOMI; legacy shows only a placeholder).

### Contact

BR-APP-033, BR-APP-035, TMA-029; fix of LB-APP-028; DEC-52. The refresh on return to the app (TMA-040) that
legacy used for its call link is not built: nothing is fetched without a tap.

The card has no number and no call link (WP-12); `contact.has_phone` only says that `getContact` can give them.
Nothing asks for a contact before a tap, so the server-rendered page, the preview and the resource cache of the
listing hold no number.

- `useContact(number)` holds `null` until the first successful `getContact`, then `{ phone, phoneDisplay, url,
  receivedAt, expiresAt }` in memory, in the screen instance that asked. An empty `phone` or `phone_display` counts
  as missing. Stale = `expiresAt − 2 min` passed when the expiry can be read, else 8 min after receipt (legacy
  lifetime 10 min). There is no timer and no refresh on return to the app: a stale contact is fetched again by the
  next tap. `reveal()` returns a fresh contact as it is and calls `getContact` otherwise (concurrent taps share one
  request); when a refetch fails the old contact is returned.
- «Позвонить» (medium haptic): `reveal()`, then `tg.call(phone, url)`. No contact — the request failed or answered
  `contact_unavailable` (no number any more, or the user's daily limit of WP-43) → `failed()` and nothing is
  logged.
- «Показать номер» in the author section (medium haptic): `reveal()`. With a number in the answer the button
  becomes the display number (`phone_display`, else the number itself), and a tap on it calls (`src: 'author'`).
  With no number in the answer (the source gives only a call link, Q-API-062) the tap opens the call link as
  «Позвонить» does and the button stays. No contact → `failed()`.
- A masked number in the original text does the same (block 12 above), with `src: 'text'`.
- Each contact control ignores a tap while its previous tap runs and for 1.5 s (`LINK_DEBOUNCE_MS`) after it ends —
  no haptic, no request, no event — so a double tap is one open and one event, and a repeat that `tg.openLink` would
  refuse never reads as a failure. The lock covers the whole tap, so a slow `getContact` or the 1.2 s wait on Android
  does not let a second tap through. The locks are per control.
- `tg.call` tries `tel:` first on Android and opens the call page when the app was not left within 1.2 s; elsewhere
  it opens the call page. `contact_call { listing_id, via: 'tel' | 'browser', src? }` is sent **only when something
  opened**: no `src` from the CTA (legacy), `author` from the author row (D-17), `text` from the original text.
  When the answer carries no number, the `tel:` attempt is skipped and every call uses the call link.
- «Написать» / «Номер платный»: `tg.openLink(contactUrl)`; `contact_write { listing_id }` (the number on screen) only
  when it opened. A `contact_url` that `tg.openLink` refuses → `failed()`, no `contact_write` (D-23).
- These contact failures keep the haptic alone (a default of the integrator: the developer's answer on the flags did not name them): `failed()` is called without the toast, whatever
  `dev016ErrorToastOnFailure` says, because legacy shows no toast there, also since `index-CIa0Ldj2.js` (*added by the
  intake of `index-CIa0Ldj2.js`*; a parity item of `useContact` for a later package (`wave-1/baseline.md`, built code
  behind the pin, row 21)).
- Different from legacy by decision (DEC-52): legacy has the number in the card — it shows it in the author
  section at once, prints the numbers of the post in the original text and refreshes the call link on a timer.
  HOMI shows no digit before the tap and fetches nothing without one.
- The call page is on the API host: the stub answer of `POST …/contact` (WP-12) gives `call_url` as
  `{api}/call/…`. `linkHosts()` of `lib/telegram/links.ts` adds the hostname of `NEXT_PUBLIC_API_URL`, read inside the
  function and spelled out so Next.js inlines it (an empty or malformed value adds nothing), tested in
  `telegram/links.test.ts`. The end-to-end build sets the variable in `.github/workflows/frontend-e2e.yml` (D-8). A
  `contact_url` on any other host is refused by the same list until its host is added (see "Needs from the
  production track").

### Share

BR-APP-038, TMA-030, TMA-031. Tap: ignored while locked; light haptic; `listing_shared { listing_id }` (before
trying, as legacy); `prepareShare` → `tg.shareMessage(id)`. The fallback is
`tg.shareUrl(botStartAppUrl(number), text)`, taken only when the client cannot send a prepared message (an old
client), `prepareShare` fails or `shareMessage` throws; a `false` from a picker that was shown ends quietly (D-5;
`05` TMA-030 uses no result). `text` = title · price main + period · price-kind label · district (empty parts
dropped). The price-kind label is the card's (`priceKindLabel` of WP-24) without its leading «· »: «первый взнос» for
`down_payment`, «цена за бизнес, помещение в аренде» for `business` (since legacy release `index-Dbpp463V.js`), left
out for any other kind (BR-APP-038, BR-API-156); `price.alt` is not used (D-25). This is the only place the label
appears on the listing screen; the title row and the CTA bar do not render it (`03` SCR-018). Without the details or
the preview the link goes with an empty text. The lock holds during the share and 1.5 s after (`SHARE_LOCK_MS`), and
is released when the listing is hidden or left. A rejection inside the flow is reported as
`reportError(e, { kind: 'error', where: 'share' })`, with no text. No toast in any outcome.

### Photo viewer

SCR-020. Opens at `i` (default 0; clamped to the photos there are, anything else is the first photo); closes with ×
(aria `common.close` «Закрыть»), Escape, Back, or a swipe down past 110 px — ×, Escape and the swipe down once per
address. Black layer, `role="dialog"`, aria `viewer.title` «Фото», faded in over 0.2 s (not with reduced motion);
horizontal snap strip positioned before the first paint, and again while the user has not paged, so a photo set that
grows while open (preview → full set) still opens at the asked photo; counter «N / M» for more than one photo. The
dialog takes the focus on open and gives it back on close. Full-size images (no thumbnail downgrade); only the shown
slide and its two neighbours hold an image; a failed image shows the `Photo` placeholder and paging still works.
Paging writes `i` into the current address, locale included, with `window.history.replaceState` (no new history
entry). Shown again from its cached route, the viewer opens at the address's `i`. `ZoomableImage` (legacy, D-30,
unless marked HOMI):

- Touch only (no double click). A tap is a one-finger touch that moved at most 8 px. Double tap: the second tap
  within **less than** 300 ms and **less than** 30 px of the first toggles 1× ↔ 2.5× around the tap; while zoomed a
  tap within 300 ms zooms back to 1× without a distance test.
- Pinch runs between 0.8× and 4× around the moving midpoint and snaps back to 1× below 1.05× on release; the strip
  locks when a zoom settles. Pan only when zoomed, clamped to the image (HOMI: legacy clamps to the slide box, so a
  letterboxed photo pans past its edge).
- The close drag works only at 1×, is decided once after 8 px (down and more vertical than horizontal), fades the
  background by `min(1, dy / 275)` through `--drag` (the bar by `1 − 3 × drag`) and closes past 110 px with a light
  haptic, else springs back. A sideways drag at 1× is the strip's.
- Leaving a slide, hiding the viewer and an orientation change (`orientationchange`) reset the zoom to 1× (the last
  two are HOMI additions). Easing 0.25 s `cubic-bezier(.2,.9,.3,1)`; none while a finger moves and none with reduced
  motion.
- Fix of LB-APP-004: the listeners are bound once and read `onZoom`, `onDrag`, `onClose` through a ref updated on
  every render.

### Market sheet

SCR-022. A compact `RouteSheet` that closes with backdrop, drag (start 6 px, close at 25 % of height or 0.5 px/ms) or
Back; it has **no ×**. Title `market.how` «Откуда эта цифра». While the listing's answer is pending it shows a section
skeleton. A demo scale: its dot slides from the centre to the listing's place over 1 s after 0.2 s and the own price
fades in over 0.3 s at 1 s; transitions started two frames after the paragraphs are there stand in for legacy's
keyframes, with the same timing, and play again on every showing of the sheet; none with lite graphics or reduced
motion (`motion.css`). Texts are legacy (D-30) unless marked HOMI:

- Paragraph 1, the sample: scope `near` → plural `market.v3.found` «Мы нашли {n} похожих квартир рядом: {alike}.»;
  `{alike}` joins with «, » the rooms phrase (only when the metric is not `m2`), the class phrase `market.v3.jk` /
  `market.v3.house` («тоже в ЖК»; none for another class) and `market.v3.within` «не дальше {dist}» (always). The
  radius: `km = radius_km ?? 0`; under 1 km `market.v3.m` with `max(100, round(km × 10) × 100)` (null and 0 give
  «100 м»; 0.95–0.999 km gives «1000 м», the legacy quirk, a reviewer question), else `market.v3.km` with one
  decimal. Otherwise plural `market.v3.district` or `market.v3.city`. A null sample size counts as 0.
- Rooms phrase, fix of LB-APP-015 — a total function: 1, 2, 3 → `market.v3.rooms1…3`; ≥ 4 → `market.v3.rooms4`;
  0 → `market.v3.rooms0`; any other number → `market.v3.roomsN` with `n` rounded; null → omitted. An unexpected
  value is reported once per launch through `reportError(…, { kind: 'error' })`, with no value in the report — the
  kinds of the facade are `error`, `rejection`, `render` and `i18n` (WP-20, WP-32).
- Paragraph 2, the median: `market.v3.half` or `market.v3.halfM2`, the value in the per-m² wrapper
  (`market.v3.perM2`, `market.v3.perM2Month` with `has_reason`).
- Paragraph 3, own price and conclusion: `market.v3.own` / `ownM2` (the own value in the same per-m² wrapper) + « — »
  + one of `mixed` (the place value in the same wrapper), `suspicious`, `check` (with the server note, joined by one
  space), `same`, `noRepair`, `pricier`, `cheaper`. `{how}` = `market.v3.times` from +90 % with
  `x = round((1 + delta) × 10) / 10` in the number locale («в 2,3 раза»), else `market.v3.pct` with
  `round(|delta| × 100)` («на 12%»). An unknown tone, `good`, and `mixed` without a place value conclude by the sign
  of the delta; a zero delta reads «дешевле». Without an own value the paragraph is left out (HOMI: legacy prints an
  empty value).
- Footer: `market.v3.asking` «Цены из объявлений — после торга бывает дешевле» · `market.v3.updated` «обновлено
  {ago}» (`market.info.agoNow` «только что» under 2 min, plural `agoMin` under 60 min, `agoHour` under 48 h, then
  `agoDay`; a future time counts as now; omitted without a valid time; measured from when the sheet opened) ·
  `market.info.more` «Подробнее» → `tg.openLink(brand.links.methodology[locale])`. HOMI has no methodology page in
  Wave 1, so the link is `null` and «Подробнее» is **not rendered** until the brand layer gets an address (HOMI:
  legacy always renders it).
- A sheet without a verdict, a comparison or a median delta — reachable only by a typed address, since ⓘ shows only
  with the block — shows only the asking line (HOMI: legacy renders no sheet).

### Actions sheet

SCR-023, BR-APP-036, BR-APP-037. Three steps: menu → report → detail. Closes with ×, backdrop or drag from any
step (all steps at once, `closeActions`), with Telegram Back on the menu, or after a successful action. Back —
Telegram's and the header chevron (aria `actions.back` «Назад»), which is shown on the report and detail steps but not
on the menu — goes one step: detail → report → menu → listing. The dialog's title, which is also its accessible name,
follows the step: `actions.title`, `report.title`, `report.detailTitle`. While a request runs (`busy`) every row is
disabled on every step and the root carries `aria-busy`; after a success the sheet stays busy while it closes.
Opening a step belongs to the route: it plays the light haptic, and ignores the tap while busy or when the address
already holds that step (a double tap pushes once). The step the sheet closes from is read from the address at that
moment, not from the router, which follows a pushed step only in a transition. Haptics: light when the report or the
detail step opens and when an action starts, success or error on the result.

Menu, title `actions.title` «Объявление»:

- `actions.hide` «Скрыть объявление» — `actions.hideHint` «Больше не покажем ни его, ни его копии».
- `actions.block` «Заблокировать автора» — by `author.kind`, with the label as the server gives it (no added `@`):
  `actions.blockHintPhone` «Не показывать объявления с номера {label}» (class `ph-mask`), `actions.blockHintSource`
  «Не показывать объявления из {label}», or `actions.blockHint` «Не показывать его объявления» for any other kind and
  while the details are pending; plus « — » and plural `actions.blockCount` «скроет {n} объявлений» when the author
  has 20 or more listings.
- `actions.report` «Пожаловаться» — `actions.reportHint` «Сдано, риелтор, ошибка или обман», with a › arrow → step
  `report`.
- `actions.support` «Написать в поддержку» — `actions.supportHint` «Уже сдано, мошенник или это ваше объявление —
  разберёмся»: only when the reference data gives a support account (`bot.support_username`); light haptic,
  `tg.openLink(supportUrl(username, number))` of WP-21, then the sheet closes whatever the link returned.

Report step, title `report.title` «Что не так?», back chevron aria `actions.back` «Назад»:

- `report.rented` «Уже сдано» — `report.rentedHint` «Объявление больше не актуально».
- `report.agent` «Это риелтор, а не хозяин» — `report.agentHint` «Отметим номер как риелторский»; hidden when the
  listing says it is not from an owner (`is_owner === false`) and, since legacy release `index-CIa0Ldj2.js`, when the
  author is not a phone (`author.kind !== "phone"`, a missing author included) (*added by the intake of
  `index-CIa0Ldj2.js`*; a parity item of `ListingActionsSheet` for a later package (`wave-1/baseline.md`, built code
  behind the pin, row 25)).
- `report.wrong_data` «Неверные данные» — `report.wrong_dataHint` «Цена, район или комнаты не совпадают»; with a
  › arrow. A tap opens the detail step and sends nothing.
- `report.fraud` «Мошенничество или спам» — `report.fraudHint` «Просят предоплату, чужие фото, реклама».

`rented`, `agent` and `fraud` are sent at once as `reportListing({ number, reason })`.

Detail step (`step=detail`; since legacy release `index-BNLZFfL0.js`; SCR-023, BR-APP-036, F-REPORT-001): title
`report.detailTitle` «Что именно неверно?» (uz «Aynan nima notoʻgʻri?», en «What exactly is wrong?»), the back
chevron, and five rows in this order, without icons or arrows (the uz and en values are those of `03` SCR-023):

| Detail code | Title `report.d_<code>` | Hint `report.d_<code>Hint` |
| ----------- | ----------------------- | -------------------------- |
| `price` | «Цена» | «Другая сумма или валюта» |
| `rooms` | «Комнаты, площадь или этаж» | «Не совпадают с постом или квартирой» |
| `place` | «Район или место на карте» | «Квартира в другом районе» |
| `photos` | «Фото» | «Фото не от этой квартиры» |
| `other` | «Другое» | «Тип жилья, ремонт, условия» |

A tap sends `reportListing({ number, reason: 'wrong_data', detail: <code> })` at once; there is no text field, no
confirm button and no analytics event. The client never sends `wrong_data` without a detail and never a detail with
another reason (BR-API-101, WP-13). The eleven keys are legacy keys of the pinned release and arrive with the
import of WP-20.

Results (`useListingActions`):

| Action | Effect | Toast |
| ------ | ------ | ----- |
| Hide | number into the `hidden` map; `closeListing()` | `toast.hidden` «Объявление скрыто» + `toast.undo` «Вернуть» → `unhideListing` |
| Block | the number and every number of the answer (de-duplicated) into `hidden`; `closeListing()` | `toast.blocked` «Автор {label} заблокирован» (the answer's label as it is, else the author's, D-26) + «Вернуть» → `unblockAuthor` |
| Report `fraud`, answer says hidden | as hide | `toast.reportedFraud` «Спасибо, посмотрим. Это объявление у вас скрыли» + the button `toast.showForMe` «Показывать у меня» → `unhideListing` (the label is legacy since `index-CIa0Ldj2.js`; as built «Вернуть»; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListingActions` for a later package (`wave-1/baseline.md`, built code behind the pin, row 23)) |
| Report `rented` | number into `hidden`; `closeListing()` | `toast.reportedRented` «Отметили: уже сдано» + «Вернуть» → `unreportListing` and the number out of `hidden` at once; a failed undo hides it again with `common.saveFailed`. With `dev051RentedUndo` off: no action ("Flags and new texts"; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListingActions` for a later package (`wave-1/baseline.md`, built code behind the pin, row 22)) |
| Report `agent` | `closeActions()` | per `dev010AgentMarkedToast`: `toast.reportedAgent` «Отметили номер как риелторский» when the answer has `agent_marked`, else `toast.reportedAgentNoted` «Спасибо, учёл вашу отметку»; with the flag off always the first (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListingActions` for a later package (`wave-1/baseline.md`, built code behind the pin, row 24)) |
| Other reports, `wrong_data` with any detail included | `closeActions()` | `toast.reported` «Спасибо! Посмотрим» |
| Any failure | nothing changes, sheet stays, error haptic | `common.saveFailed` «Не получилось сохранить» in the sheet's own toast host, always, whatever `dev016ErrorToastOnFailure` says (D-6, legacy `03` SCR-023) |
| Undo | removes the numbers from `hidden` at once; on failure puts them back | on failure the error haptic and `common.saveFailed` |

Success toasts go to the app's host, shown as the close starts, so they outlive the sheet. A sheet closed or left
while its request runs (×, Telegram Back) is not navigated again: the result still applies to its listing and its
toast, success or failure, shows in the app's host. Hidden numbers disappear from the feed, the favourites and the
search map of this launch (those packages read the `hidden` session map); the history list keeps them. A result
always applies to the number the sheet was opened for.

### Events and privacy

`listing_shared`, `original_opened` (`src`: `button`, `video`, `sources`, `price_history`, `offers`),
`original_copied`, `contact_call`, `contact_write` go through `track()`; `listing_id` is the listing number. No
phone, text, link token or position is ever passed to `track()` or `reportError()` (TMA-009, SEC-REQ-047). Phone
texts, the original text and the phone block hint carry `ph-mask`; the block toast's label cannot (the toast takes
plain text, D-26) and shows only the server-masked form. Links open only through `tg.openLink`, whose allow-list is
WP-21's (SEC-REQ-019).

## Tests

Selectors are data attributes (`data-route`, `data-layer`, `data-listing-number`, `data-listing-state`,
`data-section`, `data-cta-action`, `data-step`, `data-action-row`, …), never `data-listing`, which the feed specs
count. The digit check of the stub number (`100001`, raw `+998 00 000 00 67`) looks for its concrete forms —
`+998000000067`, `000000067`, `000 00 67`, `000-00-67`, `+998 00 000-00-67` (D-10).

**Unit (Vitest)**, under `frontend/app/tests/` unless marked.

- `phone/masked.test.ts` (`splitMaskedPhones`): `+998 ** *** ** 67` and `+** *** ** 67` are found with their last
  two digits; two masked numbers in a line; one at the start and one at the end of a text; left as text: `**`,
  `5 ** 7`, `** *** **` without digits, `$1 ***`, and a raw `+998 00 000 00 67` (the API never sends one; the
  function does not turn it into a control).
- `listing/useListing.test.tsx`: `initial.ok`; `initial === null` reads once when the session is ready; each
  `UiError` → its state; a server `forbidden` with `dev001…` calls `onForbidden()` only once the session is ready,
  once; retry reads through `bffFetch`, shows the preview or the skeleton meanwhile, scrolls the layer to the top and
  ignores the server failure from then on; the redirect seeds the new number with no second browser read; over an
  open child it steps back first (`photos` → `backBy(1)`, `actions?step=report` → `backBy(2)`) and replaces once
  after, at the bare alias it replaces at once, at depth 0 it still replaces (X3); late answer dropped; after a
  failed read and an unmount, a reopening with `initial.ok` is loaded with no browser read, header mode shows the
  skeleton while it reads and the fallback the preview (B2); a failed background refetch keeps the details, in both
  modes (T1).
- `data/useResource.test.tsx`: a subscriber that committed before the seeding instance, in an earlier commit, sees
  the seeded data; a seed counts as fresh from its commit; `seedResource`; an entry with only an error is dropped
  when its last user leaves and a later `initial` seeds without a read; an entry with data is kept, also after a
  failed refetch.
- `listing/listingData.test.ts`, `listing/openOriginal.test.ts`: `toRecord` (a preview body is a `server` failure),
  `placeLine`, `listingKey`; `original_opened` only when the link opened, no haptic.
- `listing/marketText.test.ts`: marker 4 % for −0.6, 50 % for 0, 75 % for +0.2, 96 % for +0.5; context-line branches
  and their order (T4); rooms 0, 1, 2.5, 4, 7, null; radius 0.05 → «100 м», 0.34 → «300 м», null and 0 → «100 м»,
  0.97 → «1000 м», 1.26 → «1,3 км» (en «1.3 km»); the joiners; `howText` 0.95 → «в 2 раза», 1.26 → «в 2,3 раза»,
  −0.12 → «на 12%»; the per-m² wrapper; ago at 1 min, 5 min, 3 h, 49 h, future.
- `listing/gestures.test.ts`: scale clamp, pinch 0.8–4 and the snap below 1.05; pan clamp; double tap (299 ms /
  29 px yes, 300 ms / 30 px no; zoomed: time only); tap slop 8 px; drag axis; drag progress; close at 110 px (110 no,
  111 yes).
- `listing/useContact.test.tsx` (fake timers, visibility): no request on mount, after 10 minutes without a tap or on
  return to the app; the first `reveal()` sends one; a fresh contact sends none; a contact stale by the 8 minutes or
  by the contract's expiry is fetched again on the next tap — a 30-minute expiry is fresh until 28 minutes, so the
  two rules are told apart (T6) — and a failed refetch returns the old one; two concurrent taps share one request.
- `listing/useListingContact.test.tsx`: the flows of «Позвонить», «Показать номер», the revealed number and a masked
  number; `contact_unavailable` → `failed()` and no event; both Android outcomes; an answer without a number never
  tries `tel:` and opens the call link; a refused `contact_url` → `failed()`, no `contact_write`; a second tap during
  a slow request or within 1.5 s after it does nothing, one after it works; `contact_call.src` `text`, `author` and
  none, through the real `AuthorSection`, `OriginalText` and `ListingCtaBar`.
- `listing/useShareListing.test.tsx`: prepared path; old client; `prepareShare` failure; `shareMessage` throws →
  fallback; `false` ends quietly; the 1.5 s lock by value (T5), released when the route is hidden; fallback text for
  rent, a sale with `down_payment`, a commercial listing with `business`, an unknown kind (no label part), no price.
- `listing/useListingActions.test.tsx`: each row of the results table; failures in the sheet's host whatever
  `dev016…` says; undo failure; the busy guard; a result after the sheet was left; both branches of both flags
  (`withDevFlags`); `todo` for the vote withdrawal. Since the intake of `index-CIa0Ldj2.js` the `todo` becomes tests:
  the undo of `rented` calls `unreportListing`, and a failed undo hides the listing again (*added by the intake of
  `index-CIa0Ldj2.js`*; a parity item of `useListingActions` for a later package (`wave-1/baseline.md`, built code
  behind the pin, row 22)); the `fraud` label (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of
  `useListingActions` for a later package (`wave-1/baseline.md`, built code behind the pin, row 23)); both `agent`
  toasts in both states of `dev010AgentMarkedToast` (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of
  `useListingActions` for a later package (`wave-1/baseline.md`, built code behind the pin, row 24)); no `agent` row
  for a `source` author and without an author (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of
  `ListingActionsSheet` for a later package (`wave-1/baseline.md`, built code behind the pin, row 25)).
- `listing/closeListing.test.ts`: `stepLayersOf`; `closeActions` and `closeListing` with the real `backBy` over jsdom
  history, and their replace fallbacks.
- `listing/useTranslation.test.tsx`: not offered in ru; fetch then toggle; failure then retry; keyed by number
  and locale; empty text is a failure; the server render is untranslated.
- `actions/{listing,hidden,reports}.test.ts`: the input checks (`wrong_data` ⇔ detail, no request on a bad input),
  an empty success → `hidden: false`, the token in header mode.
- Shared files: `navigation/history.test.tsx` (`backBy`), `telegram/links.test.ts` (the API host; an empty or
  malformed value refused without a throw), `shell/route-sheet.test.tsx` (`leading`, `onClose` once per address),
  `shell/demo-marker.test.tsx` (46), `feed/PhotoStrip.test.tsx` (the hero props),
  `frontend/packages/ui/tests/BottomSheet.test.tsx` (`leading`), `frontend/packages/i18n/tests/catalogue.test.ts`
  (the five keys).

**Component (Vitest + Testing Library), in `frontend/app/tests/listing/`.**

- `ListingScreen.test.tsx`: skeleton, preview, loaded, not found — the "gone" block and its button (*added by the
  intake of `index-CIa0Ldj2.js`*; a parity item of `ListingScreen` for a later package (`wave-1/baseline.md`, built
  code behind the pin, row 17)) —, the day limit (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of
  `useListing` and `ListingScreen` for a later package (`wave-1/baseline.md`, built code behind the pin, row 18)),
  offline, server (with the top inset); video tap
  with and without a deleted post and while pending; no `h1` without a title; the counter rule (a one-photo preview
  with a count of 5 shows none); none of the digit forms in the document, the masked form shown.
- `ListingScreen.wiring.test.tsx` (the real layer, the resolved screen and one child route, the real `next/dynamic`):
  block order; the preview's section skeletons and pending CTA; share hidden without a bot name, first in the row
  with one; the z ladder and the portals (the viewer in `body` at `--z-viewer`, the sheets outside the overlay at
  `--z-backdrop`); before a tap no digit form in the document, after «Показать номер» one request, the own number in
  the author row and in the text, the other number masked, nothing in the resource, the events or the error reports;
  ×, Escape and × again in one act close once, a new `?i=` re-arms (B1).
- `ListingLayer.test.tsx`: the number from `params` (invalid → skeleton only); the context reaches a child; the
  opening reset; focus to the root and back; `listing-open`; the swipe gate (none in an error state, none at depth 0
  — X2); the standalone copy drops its child routes for good once an overlay copy has shown, and keeps them without
  one (X1).
- `KeyFacts`, `StatsSection`: ru plurals for 1, 2, 5, 11, 21; 0 days; channels 1 and 2; views 0 and null.
- `ListingTitleRow`: the button order; share only with `onShare`; «⋯» plays the light haptic.
- `FactsSection`: icon table, unknown key, duplicate keys, 18 and 19 characters.
- `HistorySection`: none; one with and without a link, no time; several with −7.4, 0, +5 and null (the `Intl` output,
  `data-change`), the dot by kind; both date-flag branches (`HistoryDate`).
- `NearbySection`: metro at 1.5 and 1.51 km; kind `hospital`; two `school`; `~` at radius 500, not at 300, on the
  metro row too; a note under the name.
- `LocationSection` (with `SpotMapSlot`), `SourcesSection`: rows with and without coordinates; the chips; the
  disclosure closed on a new number.
- `MarketBlock`: visibility rules; no marker without an own value; the marker label without a unit; animation once
  per number.
- `MarketSheet`: every conclusion branch; no ×; «Подробнее» absent with a `null` link, opens the link otherwise; no
  own paragraph without an own value; only the asking line without a verdict; the skeleton while pending.
- `OriginalText`: before the tap every masked number is a button and no digit form of a phone is in the document;
  after it only the number with the matching last two digits shows the digits and calls, the others are masked
  text; an answer without a number opens the call link; `has_phone: false` → masked numbers are plain text; copy
  event; `ph-mask` present; the translated text is split the same way.
- `AuthorSection` (with `DescriptionSection`): «Показать номер» only with `has_phone`; it becomes the display number
  after the tap; with an answer without a number the button stays and the link opens; a failed request leaves the
  button; offers without haptic.
- `ListingCtaBar`: the priority table of BR-APP-032 with `has_phone`; no post address → none; negotiable; note.
- `PhotoViewer`: start index, counter, `locked` class, a replaced `onClose` is honoured (LB-APP-004); paging keeps
  the locale segment; the swipe-down close plays the light haptic; zoom reset when the slide is hidden; a double tap
  zooms around the tapped point and a zoomed photo pans only to its edges (T2); zoomed, a second tap within 300 ms
  anywhere goes back to 1×, and the drag direction is decided once (T3).
- `ListingActionsSheet`: hint variants (phone, source, none, 19 and 20 listings); support row with and without an
  account; `agent` filter; busy guard; step order with Back; the chevron absent on the menu and present on the two
  other steps, two quick chevron taps going back one step (B1); the title and accessible name per step; «Неверные
  данные» opens the detail step without a request; each of the five rows sends `wrong_data` with its code;
  `rented`, `agent`, `fraud` send no detail.

**Backend (Pest)**, in `backend/tests/Feature/Api/V1/Listings/`: `CardContractTest.php` (the shape and no-phone tests
over `100018` … `100021`; the masking dataset with `100021`, whose second number `…99` stays masked; the contact,
history, stats, market and author variants; the per-m² comparisons of `100008` and `100009`),
`ContactTranslationShareContractTest.php` (`100021`'s contact answer; `100018` … `100020` answer
`404 contact_unavailable`).

**End to end (Playwright, fake Telegram, stubs; every spec in cookie mode and header mode).**

- `listing-open.spec.ts`: feed card → listing over the feed with its preview at once, then the details → Back to
  the same scroll position; direct load: the skeleton, then the listing, Back to the feed; the reserved numbers of
  WP-12 — `100016` (answers as `100001` with one read and replaces the address), `999404` (only the not-found text),
  `999503` (`503`, fails again on «Повторить»); retry: the scenario `source_unavailable` (cookie of WP-22) set once
  the session is ready on an ordinary number, cleared before «Повторить»; uz (the `uz` scenario and
  `/uz/listing/100001`): translate with one request and toggle back without another; Telegram's SettingsButton
  closes the listing; a direct load of `/ru/listing/100001/market` shows the market text, the backdrop closes it to
  the listing (X1) and Back then goes to the feed.
- `photo-viewer.spec.ts` (touch): photo 3 of 8 on `100001` from the hero, paging replaces the address
  (`/ru/listing/100001/photos?i=N`, history does not grow), a double tap zooms and unzooms, a swipe down closes;
  Telegram's Back closes the viewer before the listing; a direct load of `photos?i=2` opens at «3 / 8» and pages in
  its locale, × closes it to the listing (X1) and Back then goes to the feed.
- `listing-contact.spec.ts`: on a direct load the served HTML, the `/bff/listings/<number>` answer and the visible
  page hold none of the digit forms, the original text (the disclosure opened) shows `+998 ** *** ** 67`, and no
  contact request was sent; «Показать номер» → one Server Action request → the digits in the author row and in the
  text; «Позвонить» afterwards sends no second request: iOS opens the call link (the fake Telegram records `openLink`
  with the call address), Android (`launchApp(page, { platform: 'android' })`) with a staying app opens it after
  1.2 s; «Позвонить» as the first tap → one request, then the call; on `100021` the second number stays masked; the
  withdrawn listing `100015` shows neither button; on `100018` «Написать» tapped twice opens the chat once and asks
  for no contact. The analytics events are not visible to this spec before WP-32
  (the `track` facade of WP-20 only keeps its calls in memory): they are asserted in `useListingContact.test.tsx`
  and, from WP-32 on, in `journal.spec.ts`.
- `listing-actions.spec.ts`: hide → toast → «Вернуть»; after hide the feed lacks the card and the history length is
  unchanged; block: every listing of the author leaves the feed, the toast names the author by the server's label;
  report `fraud` hidden: the sheet and the listing close; report failure (scenario `source_unavailable` set right
  before the tap): the sheet stays on its step with «Не получилось сохранить»; «Неверные данные» → the detail step,
  its chevron returns to the reasons, Telegram Back to the menu, «Цена» → «Спасибо! Посмотрим»; a direct load of
  `/ru/listing/100001/actions` shows the phone block hint and Telegram Back closes it to the listing (X1), then to
  the feed; a direct load of `actions?step=report`: its × closes the sheet to the listing, Back then to the feed.

## Acceptance checklist

Run every line in ru, uz and en, in light and dark, on staging; attach screenshots to the PR.

- [ ] A feed card opens the listing over the feed with its preview at once; details replace it with no jump.
- [ ] The listing opens the same way from the map card, favourites, history, a radar strip and the hidden list.
- [ ] A direct load of the listing address shows the skeleton, then the listing; Back goes to the feed.
- [ ] A direct load of the listing's photos, market or actions address shows the child over the listing; closing it
      shows the listing, and the next Back goes to the feed.
- [ ] Not found shows «Этого объявления уже нет — квартиру, похоже, сдали или продали» with «Смотреть свежие», which
      returns to the feed; Back closes it too (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of
      `ListingScreen` for a later package (`wave-1/baseline.md`, built code behind the pin, row 17); as built: only
      «Объявление не загрузилось»).
- [ ] The day limit (`429` with `reason: "daily"`, scenario `daily_limit`) shows «Лимит на сегодня» with its text and
      «Повторить» (DEC-59; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListing` and
      `ListingScreen` for a later package (`wave-1/baseline.md`, built code behind the pin, row 18)).
- [ ] Without the SDK (`launchApp(page, { sdk: false })`) the listing has a close cross in its skeleton, content and
      error states, and it goes when the SDK arrives (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of
      `RouteOverlay` for a later package (`wave-1/baseline.md`, built code behind the pin, row 19)).
- [ ] A reload inside one launch does not reopen the listing of the launch link (*added by the intake of
      `index-CIa0Ldj2.js`*; a parity item of `launch.ts` and `LaunchRedirector` for a later package
      (`wave-1/baseline.md`, built code behind the pin, row 15)).
- [ ] Offline shows «Нет связи» with «Повторить»; a server or source failure shows «Не загрузилось»; retry loads.
- [ ] Opened again after a failure, the listing shows its preview or skeleton, not the old error.
- [ ] A redirected number shows the surviving listing with one request and no leftover state.
- [ ] The demo-data marker is visible while the answer comes from a stub.
- [ ] The opened listing has the «viewed» eye in the feed afterwards.
- [ ] Hero: counter «N / M», photo swipe, video label; a video tap opens the post, or the viewer if it is deleted.
- [ ] Status banner shows the server text when present.
- [ ] Title row: title, «district · landmark», share (only with a bot name), favourite toggles, «⋯» opens the sheet.
- [ ] Key facts show rooms, m², floor, building; nothing when all are absent. `floor: 0` shows «Цокольный этаж» and a
      negative floor «Подвал» (the stub listings `100022` and `100023`; *added by the intake of `index-CIa0Ldj2.js`*;
      a parity item of `KeyFacts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 26); WP-35 closed it).
- [ ] Market block: three titles by scope; verdict, scale, «обычно …», context line, warnings; hidden without a
      comparison; no «$NaN» anywhere.
- [ ] Facts grid in server order; a long value spans the row; an unknown key has the house icon.
- [ ] Stats: «Сегодня на рынке» for 0 days; channels only above 1; views only when non-zero; correct plurals.
- [ ] History: one entry is the sentence with a tappable @channel; several are the timeline with green and orange
      percentages; dates follow the device time zone.
- [ ] Location: hint, place, centre distance, «Рядом» with metro within 1.5 km and `~` for approximate places; an
      unknown kind renders with the default icon (component test; WP-12 allows only park and school).
- [ ] Author: owner, offers (links open), «Показать номер» (only for a listing with a phone) shows the number
      after the tap and the number then calls, «Опубликовано …».
- [ ] Description shows the summary with line breaks; hidden when empty.
- [ ] Source: channel chips open the post; «Текст оригинала» opens with every phone number masked to its last two
      digits; a tap on a masked number reveals the listing's own number there, which then calls; other numbers stay
      masked.
- [ ] Before any tap no phone number is visible on the screen or present in the page source.
- [ ] Translation: absent in ru; in uz and en «Перевести» → «Перевожу…» → text with «Перевод сделан ИИ» →
      «Показать оригинал»; a failure shows «Не получилось перевести» and the next tap retries.
- [ ] Opening another listing never shows the previous translation or an open original text.
- [ ] CTA shows «Позвонить», «Написать», «Номер платный», «Открыть пост» or nothing, by the priority rule.
- [ ] «Позвонить» fetches the contact on the tap; on Android it tries the dialer, then the call page; elsewhere
      the call page opens.
- [ ] After 8 minutes on the screen a second «Позвонить» fetches a fresh link and opens it.
- [ ] A failed contact request gives the error haptic and no `contact_call` event.
- [ ] «Написать» opens the chat once on a double tap.
- [ ] Share opens Telegram's picker; on an old client or a failure the share link opens; closing the picker without
      sending opens nothing more; a double tap shares once.
- [ ] The share link's text carries «первый взнос» or «цена за бизнес, помещение в аренде» for those price kinds;
      the title row and the CTA bar show no price-kind label.
- [ ] The viewer opens at the tapped photo; pinch to 4×, double tap 2.5×, pan when zoomed, no paging while zoomed.
- [ ] Swipe down past 110 px closes; less springs back; ×, Escape and Back close the viewer and leave the listing
      open, also on a quick double tap of ×.
- [ ] The market sheet opens from ⓘ, has no ×, closes by backdrop, drag and Back; three paragraphs and the footer
      read correctly; «Подробнее» is absent while the methodology link is not set.
- [ ] Actions menu shows hide, block (right hint, count from 20 listings), report, support (only with an account).
- [ ] Hide closes the listing, removes the card, shows «Объявление скрыто»; «Вернуть» brings it back.
- [ ] Block hides all the author's listings, shows «Автор … заблокирован»; «Вернуть» restores them.
- [ ] The report step lists four reasons («Это риелтор…» absent for a non-owner listing); each gives its toast;
      `rented` and a hidden `fraud` close the listing.
- [ ] «Неверные данные» opens «Что именно неверно?» and sends nothing; its five rows (Цена; Комнаты, площадь или
      этаж; Район или место на карте; Фото; Другое) show their hints; a tap sends the report and shows «Спасибо!
      Посмотрим»; the chevron and Telegram Back return to «Что не так?».
- [ ] Any failed action shows «Не получилось сохранить» in the sheet and changes nothing.
- [ ] Back order: detail → report → menu → listing → page below; the Settings button closes everything.
- [ ] Swipe right closes the listing on iOS and desktop, never on Android, not while a layer is open and not on a
      directly loaded listing.
- [ ] An opening listing slides in from 24 % and fades in over 250 ms (this line and the five after it:
      *added by the intake of `index-CBlEKxdL.js`*; a parity item of `RouteOverlay`, `ListingLayer` and `closeListing`
      for a later package (`wave-1/baseline.md`, built code behind the pin, row 5)).
- [ ] Telegram Back closes the listing with the leave: it slides out to 24 % and fades over 200 ms.
- [ ] A close by `closeListing` (hide, block, a `rented` report, a `fraud` report that hid the listing) plays the same
      leave.
- [ ] A swipe right closes the listing at once, with no leave after the finger lifts.
- [ ] Under lite graphics and under reduced motion the listing opens and closes with no animation.
- [ ] A listing opened while another is leaving cancels the leave and shows the new one.
- [ ] Viewer and sheets are above the CTA bar and the tab bar; the toast is above the sheets.
- [ ] As built by this package: with `dev051RentedUndo` on (test build) the `rented` toast has «Вернуть»; with
      `dev010RealtorVoteWording` on the realtor hint and toast use the review wording; both were off in the merged
      build. The next line replaces this one for the defaults since the intake of `index-CIa0Ldj2.js`.
- [ ] Since the intake of `index-CIa0Ldj2.js` (DEC-58) the defaults are: `dev051RentedUndo` on — «Отметили: уже сдано»
      has «Вернуть», it sends `DELETE /listings/{number}/reports` and the listing is back, and a failed undo hides it
      again; `dev010AgentMarkedToast` on — a realtor vote says «Отметили номер как риелторский» only with
      `agent_marked`, else «Спасибо, учёл вашу отметку»; `dev010RealtorVoteWording` off — the review hint only;
      `dev014TashkentDates` on. Each flag still has both branches tested (*added by the intake of
      `index-CIa0Ldj2.js`*; a parity item of `lib/flags.ts` and `useListingActions` for a later package
      (`wave-1/baseline.md`, built code behind the pin, row 22, row 24 and row 27)).
- [ ] The `fraud` toast's button reads «Показывать у меня»; the realtor reason is absent for a channel author (*added
      by the intake of `index-CIa0Ldj2.js`*; a parity item of `useListingActions` and `ListingActionsSheet` for a
      later package (`wave-1/baseline.md`, built code behind the pin, row 23 and row 25)).
- [ ] Every scenario above passes in cookie mode and in header mode.
- [ ] No phone number, original text or contact link appears in analytics events or error reports.
- [ ] Unit, component and end-to-end tests of this package are green in CI.

## Handoff

- **Steps 1–17 are done** on `wp-26-listing` (from `main` = `3b98be2`, after #80) in the commits below. It ran as
  plain subagents, at most three at a time, each owning its own
  files, between one shared-first wave and one integration wave; the orchestrator ran the gates between the waves.
  Two independent review rounds followed, each with its fixes. The decisions taken before the build (D-1 … D-30),
  the shared interface contract and the legacy details are reports kept with the session, not committed.
  - `8d8b8f1` shared-first (W0): the listing types (`listingData.ts`), `sections/controls.ts`, `openOriginal`, the
    test helper `tests/helpers/details.ts`, the 28 icons and `prefersReducedMotion` of `@homi/ui`, the five `homi`
    keys, `contact_call.src`.
  - `ca5f5a2`: `tests/filters/FiltersSheetRoute.test.tsx` stubs `scrollIntoView` for the pets-entry apply cases (a
    WP-25 test whose 350 ms timer threw in jsdom under load).
  - `ab33858` wave 1: A — the layer, the screen shell, `useListing`, `viewState`, hero, title row, key facts,
    `PhotoStrip`'s hero props, the `useResource` seed announcement and `seedResource`; B — the Server Actions,
    `marketText`, `gestures`, `backBy`, the API host of `linkHosts()` and the CI variable, `BottomSheet` / `RouteSheet`
    (`leading`, `onClose`), the demo marker; C — the eleven sections and `splitMaskedPhones`.
  - `d2280b5` backend (W2-D): the stub entries `100018` … `100021`, the per-m² fix, the contract tests,
    `docs/api/README.md`.
  - `830b541` wave 2: A — contact and translation; B — viewer and market; C — actions, share and close.
  - `82719e1` wave 3: the screen wired end to end; `e2e/foundation.spec.ts` and `e2e/back.spec.ts` adjusted.
  - `23ec0bf` review round 1 fixes (B1, B2); `99b032a` review round 2 fixes (X1, X2, X3, T1 … T6).
  - `cb5c977` this specification, the known issues, the phase-3 notes §X, the app README; `f4badd0` the four
    end-to-end specs (step 17); `fed314d` the stub catalogue formatted as `vp check` writes it (two coordinates of
    `100021`, values unchanged).
  - **Mutation checks:**
    - W1-A: the two-commit seed test fails on the old `useResource`. W2-C: removing the share lock's reset, or the
      route's double-push guard, fails one test each. W2-B: the swipe-close-then-show-again test fails without its
      fix.
    - Round 1: with the old `useResource.ts`, `PhotoViewerRoute.tsx` and `ListingActionsRoute.tsx` exactly the five
      new tests fail.
    - Round 2: every new test fails against at least one broken version — the X1 latch turned into a toggle or
      removed, the `depth > 0` guard removed, the redirect replacing at once, the error check moved above the data
      check (T1), the tap point or the pan clamp of the zoom broken (T2, T3), the context-line branches reordered
      (T4), the share lock changed to 150 ms or 15 s (T5), `isStale` taking the earlier of the two rules (T6). Two new
      tests pin current behaviour and pass on the old code too (the standalone copy without an overlay copy keeps
      its children; the bare alias replaces at once).
  - Size: 121 files, +13 780 / −141 against `main`, of which tests are +8 431 and the stub catalogue +682. The
    header's estimate was 3 000.
  - The checklist lines stay unticked: every line also asks for ru / uz / en and light / dark, and several for
    Telegram on staging (Next, item 3).
- **Checks** (from `frontend/` unless marked):
  - **W0:** `@homi/i18n` 111 and `@homi/ui` 120 tests, lint and typecheck clean; app typecheck exit 0; the whole app
    project 122 files / 1745 (a rerun: the first run met the WP-25 timer that `ca5f5a2` stubs).
  - **`ab33858`:** `make ci-frontend` → types:check, lint, typecheck, every build and the unit tests clean: app 141
    files / 2035, `@homi/search` 238 + 1 todo, `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 111,
    `@homi/api-client` 14, `@homi/utils` 2.
  - **`d2280b5`** (from `backend/`): `php artisan test --compact` → 749 tests, 745 passed, 4 skipped;
    `tests/Feature/Api/V1/Listings` 122 passed; Pint passed. No new media, so no `sources:publish-stub-media`.
  - **`830b541`:** `make ci-frontend` clean, app 152 files / 2269 + 1 todo; the packages as above.
  - **`82719e1`:** the app project 153 files / 2281 + 1 todo, `pnpm -r lint`, the app typecheck and
    `pnpm --filter app build` (183 pages) clean.
  - **`23ec0bf`:** the app project 153 files / 2287 + 1 todo; ESLint and the app typecheck clean.
  - **`99b032a`:** `make ci-frontend` clean: app 153 files / 2304 + 1 todo; the packages as above.
  - **`fed314d`** (the final gates): `make ci-frontend` clean — app 153 files / 2304 + 1 todo, `@homi/search` 238 +
    1 todo, `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 111, `@homi/api-client` 14, `@homi/utils` 2 (a first run
    failed in `@homi/search` on a missing `node_modules/.vitest-cache` file, two package runs sharing the cache; the
    rerun was clean). From `backend/`: `composer ci:check` clean — Pint, PHPStan 0 errors, Pest 749 (745 passed, 4
    skipped), `openapi:check`; its first run found the catalogue's format, fixed in `fed314d`.
  - **End to end**, each file alone against a local `next start` of the `99b032a` build (the later commits change
    no app code), started with the mkcert CA, with a pause between files (KI-32): foundation 19, back 11, feed 19,
    launch 5, shell 16, filters 20, boot-failure 6, crash 4, session 7, smoke 2; city 6, gates 8, csp 2 and data 5
    on a rerun alone (sign-ins stuck at `booting` while the machine was loaded, load average up to about 90); the
    new listing-open 16, photo-viewer 6, listing-contact 14 and listing-actions 14 (some tests rerun alone once for
    the same reason). 180 tests in 18 files. Earlier builds: foundation, feed, launch and gates on `ab33858`; foundation, back, feed,
    launch, gates, csp and shell on `82719e1`.
- **Corrections made in this specification (rule 6)**, by section:
  - **Scope:** the stub variants and the per-m² fix are in (D-1); `PhotoStrip`'s hero props; the focus rules beyond
    the minimal handling are WP-33's.
  - **Binding decisions:** where each flag is read; `dev016` only through `failed()` for the contact (D-6); one input
    object per Server Action (D-7); the developer's two answers (D-1, D-2); the legacy details settled (D-30).
  - **Routes:** the `ListingLayer` wrapper with its `use(params)` number, its key by number and opening and the
    child pages in their own `<Suspense>`; the three "verify before use" bullets answered (the browser keys a segment
    by its value; `useParams()` is app-global; the direct tree's soft navigations are intercepted too).
  - **Data flow:** the fallback shows cached details, the preview or the skeleton; `notFound()` and `toRecord` in
    the server part; the string key, the announced seed, the session wait, `onForbidden()` once ready, «Повторить»,
    the data-before-error rule, the forgotten failure (B2), `useListingRecord`; `viewState` holds only the hero index
    of one opening (D-11) and the opening counter; the redirect's `seedResource`, its step back over a child (X3) and
    "no second browser read" (D-9); `markSeen`; `SourceReporter`. The field mapping gains `has_reason` and the
    percent unit of `change_pct`.
  - **Components and modules:** `ListingLayer`, `listingData`, `sections/controls`, the exports of every module, the
    `next/dynamic` children; outside the folder `lib/phone/masked.ts` (D-2), `backBy`'s result, `useCloseOnce`
    shared (B1), the `useResource` changes, the shared component props (D-14, D-15), the marker's z (D-16), D-17, D-8.
  - **Server Actions:** input objects, the input check, `hidden.ts`'s own number check; `bffAllowList.ts` and the
    `tg` calls need no change (D-8).
  - **Layers:** the close-once guards (B1), `closeActions` and `onClose`, `presentation="layer"` in both trees, the
    swipe gate with `depth > 0` (X2), the latch of the standalone copy (X1), the token names of the ladder, the
    portals, focus (D-12).
  - **Flags and new texts:** the uz question goes to the reviewer (D-13).
  - **Files and Steps:** the real file lists (`lib/phone`, `useCloseOnce`, the test helper, the backend fixture and
    tests, `docs/api/README.md`, the workflow, the changed shared files, the adjusted specs); `packages/utils` and
    `bffAllowList.ts` dropped; the steps as they ran.
  - **Behaviour:** SCR-019 (the children render at once, the preview row, the error replaces everything, the top
    inset); a haptics paragraph (D-27); block 1 (counter rule, D-24, D-23, the pending video tap, the hero not
    following the viewer); block 3 (title whole, D-3; share by `botStartAppUrl`); block 4 (building from details
    only; zero tiles left out); block 5 (D-4 visibility, own value, unit, context order and arguments, the marker
    label, the first render with a median, lite); block 8 (`change_pct` as given, the dot by kind, D-29); block 9
    (D-22, the note, `~` on the metro, the heading rule); block 10 (`posted.when`, no haptic on offers); blocks 11–13
    (whitespace, the controls inside the disclosure, D-21, the translation cache); block 14 (notes, D-25, D-23, the
    empty cell); Contact (empty strings, the display fallback, the whole-tap lock per control, `src` per control,
    D-23, the API host and the CI variable); Share (D-5, D-25, the lock release, `reportError`); Photo viewer (the
    legacy gesture values, Escape, focus, the neighbours, `i` clamped and kept, the HOMI resets); Market sheet (the
    skeleton, the demo transitions on every showing, the joiners, the radius rule, the wrappers, the conclusion
    rules, "updated" from the opening, the HOMI departures); Actions (the route owns step opening, the step from the
    address, busy rules, the block hint by kind and label, the support row, the sheet's failure toast — D-6 — and the
    success toast in the app's host, a result after leaving); Events (no `ph-mask` on the toast label, D-26).
  - **Tests:** the real file names (`.tsx` for the hooks, `useListingContact`, `ListingScreen.wiring`), the phone
    tests' path (D-2), the digit forms (D-10), the review-round cases, the backend tests, the e2e facts (photo 3 of 8
    on `100001`, the `uz` scenario, the Android platform, the direct-load children in cookie mode).
  - **Acceptance checklist:** four lines (a directly loaded child closed onto the listing; a reopening after a
    failure; a picker closed without sending; a quick double ×) and the swipe line (not on a directly loaded
    listing).
- **Assumption mismatches** (`docs/ai/reports/phase-3-notes.md` §X): AM-71 (`@homi/utils` is not a dependency of
  the app), AM-72 (the `[number]` segment is keyed by its value; `useParams()` is app-global), AM-73 (`failed()`
  toasts only under `dev016`), AM-74 (the share fallback on a `false` picker answer), AM-75 (the stub catalogue had
  no listing-screen variants and wrong per-m² comparisons), AM-76 (`useResource` takes a string key and did not
  announce a render-time seed), AM-77 (soft navigations from the direct tree are intercepted), AM-78 (the legacy
  details the first text had wrong), AM-79 (the end-to-end build had no `NEXT_PUBLIC_API_URL`).
- **Decisions of the implementation** (no ADR):
  - **One layer owner:** `ListingLayer` holds the overlay, the number, the opening key, focus, the body class and the
    swipe gate in both trees; route files hold no logic.
  - **One body:** the preview and the loaded screen share one tree, so the hero keeps its photo when the details
    replace the preview. The error states replace it.
  - **Resource rules** (`useResource`, for every user): a render-time seed is announced by its commit; an entry
    without data is forgotten with its last reader; a seed counts as fresh from its commit.
  - **Contact:** held in the screen instance only (DEC-52), never in a module map; the lock is per control and covers
    the whole tap; `src: 'author'` from the author row (D-17).
  - **Children:** the viewer, the market sheet and the actions sheet are client-only `next/dynamic` imports and
    portalled; the actions route, not the sheet, opens a step, reads the flags and guards a double push; the step to
    close from is read from the address.
  - **Failures:** the actions sheet toasts its own failures in its own host (D-6); contact failures go through
    `failed()`; success toasts go to the app's host as the close starts.
  - **Motion:** lite graphics drop the market transitions in JavaScript; reduced motion drops them through
    `motion.css` (calling `prefersReducedMotion()` during render would throw on the server); the viewer checks it in
    its handlers. The market sheet's demo runs on every showing.
  - **Fixtures:** `100018` … `100021` are Tashkent-region long-rent apartments outside the default set, so the feed
    counts of the end-to-end specs do not change; their photos reuse existing stub media.
  - **Tests:** the `ListingScreen` wiring test renders the real layer and the real `next/dynamic` children; styling
    and spacing are HOMI's own (the legacy sweep has no CSS values for these blocks).
- **Review findings** (reports kept with the session, not committed):
  - **Round 1** (on `82719e1`; behaviour, conformance and security), fixed in `23ec0bf`:
    - B1 (low): the viewer's ×, Escape and swipe down, and the actions sheet's chevron, called `back()` with no
      once-guard, so a quick second close also closed the listing (or walked report → menu → listing).
      `useCloseOnce` moved to `lib/navigation` and guards both.
    - B2 / SPEC-01 (medium, the same defect found twice): an entry holding only a failed read survived its last
      reader, so a reopening of that number showed the old error in the fallback, ignored a good server answer and
      read again. `release()` forgets an entry without data.
    - Rejected: SEC-1 (the four end-to-end specs missing at `82719e1`: they are step 17 of this branch).
  - **Round 2** (on the tree of `23ec0bf`; tests and cross-cutting), fixed in `99b032a`:
    - X1 (medium, reported high): after a direct load of a listing child, a depth-0 close replaced the address with
      the listing, Next intercepted that into `@overlay`, and the portalled viewer or sheet of the standalone copy
      stayed on top — the actions sheet dead, the viewer back at photo 1, a second close going to the feed. The
      standalone copy now drops its child routes once an overlay copy has shown (a latch).
    - X2 (low): a directly loaded listing gets a second overlay copy on every soft navigation to a listing address,
      and an iOS swipe on such a copy at depth 0 uncovered the standalone duplicate. Swipe back needs `depth > 0`;
      the duplicate itself is KI-56.
    - X3 (low): the merge redirect replaced an open child's entry, so Back stopped on the alias, which redirected
      again. The redirect now steps back over the child first.
    - T1 … T6 (low): tests that could not fail — data and an error at once in `useListing`, the zoom's translate,
      the zoomed double tap and the drag axis, the order of the context-line branches, the share lock by value, the
      expiry rule against the 8 minutes. Each now has a test that fails on the broken version.
    - Rejected: T7 (a non-fraud report answered `hidden: true`): the contract cannot answer that
      (`ReportResultResource`, `StoreReportRequest`'s hiding reasons are `rented` and `fraud`).
- **Open for the reviewer:**
  - **Share fallback (D-5):** a `false` from a picker that was shown ends quietly, as `05` TMA-030 uses no result;
    the first text fell back to the share link on `false`, which would open a second share window after the user
    closed the first.
  - **uz wording (D-13):** `report.agentHintReview` says «rieltor» where the legacy uz catalogue says «makler» in
    eight places; `market.v3.rooms0` / `roomsN` read «ham studiya» / «ham {n} xonali» while their legacy siblings have
    no «ham» («1 xonali» … «4 va undan koʻp xonali»). Written as the spec gave them.
  - **Legacy departures (HOMI):** the radius label reads «1000 м» for 0.95–0.999 km (the legacy rule kept; a fix
    would read «1,0 км» from 0.95); the pan is clamped to the image (legacy: to the slide box); lite graphics turn the
    market animations off (legacy: only reduced motion); a video tap while the answer is pending opens the viewer
    (legacy does nothing); `contact_call.src = 'author'` from the author row (legacy sends none); the market sheet
    leaves the own paragraph out without an own value and shows only the asking line without a verdict (legacy
    prints an empty value and renders no sheet).
  - **Direct load (X2):** every soft navigation to a listing address from a directly loaded one mounts a second
    overlay copy (KI-56). The proposed fix turns a direct load into "feed + pushed listing" once the session is
    ready, as `LaunchRedirector` does for launch links; it changes the depth-0 contract of `useBack` and the
    direct-load case of `e2e/foundation.spec.ts`, so it needs a spec or ADR line first.
  - **Redirect at depth 0:** a direct load of a child of an alias (`/listing/100016/photos?i=2`) lands on the bare
    `/listing/100001`, not its photos. Replacing with the same child of the new number would be a spec decision. In
    the one render before the redirect, taps carry the alias number.
  - **Contact in the fallback (KI-57):** a contact revealed in the fallback instance (cached details while the server
    part streams) is dropped when the resolved instance replaces it: one more tap and one more `getContact`, which
    counts toward a daily limit of WP-43; the disclosure closes again too.
  - **Flags in `ListingScreen`:** it reads `devFlags.dev014TashkentDates` itself, while WP-25's rule keeps the flag
    reads in route files (`…SheetRoute`; here `ListingActionsRoute`).
  - **Contact details:** a refetch that answers `contact_unavailable` returns the old contact (the rule says only "a
    failed refetch returns the old one"); the locks are per control, so a link-only «Показать номер» followed by
    «Позвонить» within 1.5 s meets `openLink`'s refusal and plays the error haptic; «Открыть пост» on a refused post
    host plays no error haptic (D-23 covers `contact_url` only).
  - **Market details:** `{rooms}` of 3.5 reads «4», not «4+» (rounded); `{rooms}` null reads «-комн. · район …» and a
    near comparison without a radius «до  км» (both legacy); `roomsPhrase(-1)` reads «тоже -1-комн.» and is
    reported once; "updated" is not refreshed when a cached sheet is shown again; under lite and reduced motion the
    marker still starts at 50 % and jumps after two frames (legacy mechanics).
  - **Viewer:** an orientation change is heard through `orientationchange` only, not `screen.orientation`.
  - **Actions:** an `agent` report answered `hidden: true` closes the sheet only (unreachable today, T7); a support
    account that fails `supportUrl`'s pattern renders a row that does nothing; «Вернуть» after a block un-hides every
    number of the answer, also one hidden earlier by its own hide; the block toast's label cannot carry `ph-mask`
    (D-26); the support row's light haptic is HOMI's (legacy unverified).
  - **Key facts:** a studio (`rooms: 0`) gets no rooms tile, as area and floor at zero; legacy is unverified.
  - **Focus:** the layer root also takes the focus on a direct load; it has no visible ring.
  - **Not covered by an automated test:** the texts per locale; the share button in CI (`frontend-e2e.yml` sets no
    `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`); the support row end to end (`TELEGRAM_SUPPORT_USERNAME` is blank); the
    restore of focus on a real unmount; the swipe back end to end; the preview state in cookie mode (it comes in
    the same server response as the details, so only header mode can hold it in `listing-open.spec.ts`).
- **For later packages:**
  - **WP-27, WP-28:** the map card opens the listing with `router.push(routes.listing(number))` after the preview is
    cached. WP-28's `SpotMap` replaces `sections/SpotMapSlot.tsx` (keep the button, aria `listing.mapOpen`, the
    light haptic, `data-no-swipe` and the push of `routes.listingLocation(number)`). Its `SpotMapRoute` reads the
    listing with `useListingRecord(useListingNumber())`, which never reads — not `useListing()`, which reads and needs
    the server's `initial` — and renders inside `ListingLayer` as a child route: portal its fullscreen to `body` as
    the viewer does; on a direct load the standalone copy drops it once an overlay copy has shown (X1).
  - **WP-29, WP-30, WP-31:** open the listing with `router.push(routes.listing(number))` after `setPreview`, so the
    preview shows at once. What is hidden lives in the `hidden` session map (`hide`, `unhide` of
    `lib/data/sessionMaps.ts`); the favourites, the feed and the map leave those numbers out, the history keeps them.
    WP-31 extends `lib/actions/hidden.ts`, whose actions take `{ number }` (D-7) and whose number check is a private
    copy.
  - **WP-32:** the events are `listing_shared`, `original_opened` (five `src` values), `original_copied` (also on a
    translated text), `contact_call { listing_id, via, src? }` — `src` none from the CTA, `author` from the author row
    (now sent), `text` from the original text — and `contact_write`. `reportError` contexts carry no text
    (`where: 'share'`; the unusual rooms value is reported without it). `ph-mask` is on the author's number, the
    original `<pre>` and the phone block hint, not on the block toast's label.
  - **WP-33:** the focus rules of the full-screen layers (KI-41): the listing layer and the viewer dialog take the
    focus on open and give it back on close, the viewer closes on Escape; the Tab order of the page below and a focus
    trap are open. The manual lines inside Telegram.
  - **WP-43:** `linkHosts()` admits the host of `NEXT_PUBLIC_API_URL`; a call page on another public origin must join
    `LINK_HOSTS` (the production track names it, WP-43 "Needs from the production track" item 4), or every call link
    is refused and the call fails with the error haptic. A `contact_url` on another host is refused the same way. The
    daily limit answers `contact_unavailable` → `failed()`. A link-only answer makes «Показать номер» open the call
    link.
- **Known issues:** KI-41 (partly done here: minimal focus on the listing layer; the rest is WP-33's), KI-42
  (resolved for the listing layer), KI-43 (the listing's part done), KI-56 (low: the duplicate overlay copy on a
  direct load), KI-57 (low: a contact revealed in the fallback instance), KI-58 (info: the stub listing methods ignore
  the `access_*` scenarios).
- **Next:**
  1. ~~Review and merge~~ (merged in #81 on 2026-11-17, `95315fd`, after green `frontend`, `backend` and
     `frontend-e2e` — 180 passed in one run); the follow-up docs PR records this status, the queue row, `CLAUDE.md`,
     `.ai/memory/current-state.md` (the catalogue has 20 base listings) and the memory.
  2. The production track deploys (the regular deploy; nothing else on stubs).
  3. Check inside Telegram on staging: the swipe back on iOS and never on Android, BackButton and SettingsButton,
     the haptics, the call on Android (`tel:` first), the share picker, the viewer's gestures. Run the checklist in
     ru / uz / en, light and dark; WP-33 runs the manual lines.
  4. Set the status to `DONE`. WP-29 (saved lists) and WP-30 (radars) depend on this package; WP-27 and WP-28 open
     and extend it.
