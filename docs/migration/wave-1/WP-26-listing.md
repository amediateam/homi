# WP-26 — Listing screen

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-24 |
| Size | ≈ 3 000 changed lines (upper end of the PR rule), L |
| Behaviour reference | `03` §2 (SCR-018, SCR-019, SCR-020, SCR-022, SCR-023), §1.2, §1.12, §3.3–§3.5, §4, §5; `05` §1.7; `08` §1.8; task files KV-FE-063 … KV-FE-071, KV-FE-029, KV-FE-030 — behaviour, texts, edge cases and test ideas only; their file layout, navigation stack, API paths and transport are not taken |
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
translation, share, hide, block and report.

**Out.**

- The fullscreen spot map SCR-021 and the mini-map itself: WP-28. This package leaves `location/page.tsx` as the
  WP-20 placeholder and renders a `SpotMapSlot` box in the location section.
- The card, `Photo`, `PhotoStrip`, `FavButton`, the favourite action, `verdict.ts`, `badges.ts`, the preview cache
  and the rules BR-APP-026, BR-APP-027, BR-APP-039, BR-APP-040 with LB-APP-039: WP-24 (used here).
- Money, date and distance formatters with their flags (BR-APP-031, LB-APP-025, LB-APP-031): WP-22 (used here).
- `RouteSheet`, `BottomSheet`, `useSwipeBack`, `ErrorState`, toast, `failed()`: WP-23. The `tg` facade, link
  allow-list, deep-link builders, Back wiring: WP-21. The system sheets SCR-044 are only triggered here.
- The «Скрытое» list that reads what is hidden here: WP-31. Event transport and screen names: WP-32.

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| DEC-32, 25 §2 rule 3 | Rebuilt from the audit; no legacy code or CSS is copied |
| DEC-36, `09` §4.2–§4.3 | The five defects above are fixed without a flag. `dev051RentedUndo` and `dev010RealtorVoteWording` are written with both branches and stay off; `dev014TashkentDates`, `dev016ErrorToastOnFailure`, `dev019OneDistanceFormatter`, `dev001AnyForbiddenShowsAccess` are consumed through the helpers of WP-22 and WP-23 |
| DEC-44, 25 §3.1 | The server part fetches with the session cookie and passes `initial` to one Client Component, which fetches for itself when the server had no session |
| 25 §3.2 | `/listing/[number]` is a page opened over the page below; `photos`, `market`, `actions` are its own addresses; Back closes viewer or sheet first, then the listing |
| 25 §3.4 | Cookie mode and header mode use the same screen code; mutations are Server Actions that take the token as an argument in header mode |
| 25 §4.1 | Listings are addressed by their public number; `503 source_unavailable` shows the "could not load" state with retry |
| 25 §4.2, DEC-48 | Methods used: `GET /listings/{number}`, `POST …/contact`, `POST …/translation`, `POST …/share`, `PUT`/`DELETE /hidden/listings/{number}`, `PUT`/`DELETE /listings/{number}/blocked-author`, `POST /listings/{number}/reports`. The view is recorded by the API on the read; the client sends nothing for it |
| 25 §8.1, Q-APP-024 | The report-detail step and the `price_kind: business` label come from the re-baselined audit of WP-02 (see "Behaviour to reproduce") |
| DEC-40, 25 §2 rule 5 | Bot name, support account and the methodology link come from the brand layer and the reference data, never inline |
| DEC-46 | Acceptance is the functional checklist below |

## Design

Read before coding (`frontend/app/node_modules/next/dist/docs/01-app/`):
`03-api-reference/03-file-conventions/{parallel-routes,intercepting-routes,layout,dynamic-routes,default}.md`,
`02-guides/{authentication-with-cache-components,preserving-ui-state,preventing-flash-before-hydration,lazy-loading}.md`,
`03-api-reference/04-functions/{use-params,use-search-params}.md`.

### Routes

Paths are under `frontend/app/app/[locale]/(main)/`. The two trees import the same components; route files hold no
logic.

| Route file | In `listing/[number]/` (direct load) and in `@overlay/(.)listing/[number]/` (opened over a page) |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `layout.tsx` | `<Suspense fallback={<ListingScreen />}><ListingServer params={params} /></Suspense>` and `{children}` |
| `page.tsx` | `null` |
| `photos/page.tsx` | `PhotoViewerRoute` |
| `market/page.tsx` | `MarketSheetRoute` |
| `actions/page.tsx` | `ListingActionsRoute` |
| `location/page.tsx` | WP-20 placeholder, not touched here (WP-28) |

Why a layout and not a page:

- `layout.md` states that layouts do not re-render on navigation. The listing therefore stays mounted while the
  child changes between `null`, the viewer and a sheet, in both trees. A page would be replaced by its sub-route.
- `parallel-routes.md`: on soft navigation a slot keeps its active subpage. `intercepting-routes.md`: the
  intercepted tree is used on soft navigation, the plain tree on a hard load of the same address. Whether `(.)`
  counts the `(main)` group as a level is checked in WP-20 (verify before use).
- `dynamic-routes.md`: with Cache Components a layout must not await `params` at its top level. The layout passes
  the `params` promise to `ListingServer`, which awaits it inside the `<Suspense>` boundary.
- `layout.md`: layouts cannot read search parameters. The photo index `i` and the actions step are read in Client
  Components with `useSearchParams()`.
- Whether a `[number]` layout is remounted when the number changes is not stated in the bundled docs (verify before
  use). `ListingServer` renders `<ListingScreen key={number} …>` so the reset is guaranteed (fix of LB-APP-003).

### Data flow

1. A card, map card, radar find or hidden item calls `router.push(routes.listing(number))` (callers' packages).
   WP-24 has put the card data into `lib/data/previewCache.ts`.
2. The fallback instance `<ListingScreen />` (no `initial` prop) reads the number with `useParams()`, renders the
   preview from the cache at once, or `ListingSkeleton` when there is none (deep link, direct load). It never
   fetches.
3. `ListingServer` (async Server Component): awaits `params`; with a session cookie calls
   `serverApi()` → `GET /listings/{number}` and renders `<ListingScreen key number initial={result} />`; without a
   cookie (header mode, first request of a launch) renders it with `initial={null}`.
4. `useListing(number, initial)` in the resolved instance: `initial.ok` → details; `initial === null` → fetch through
   `bffFetch('listings/<number>')` with `useResource(['listing', number], …)`; `initial.ok === false` → the error
   state. «Повторить» always refetches through `bffFetch` (both modes). The answer is also written to the resource
   cache so `photos`, `market` and `actions` children read it without a second request.
5. The swap from the fallback instance to the resolved one must not move anything: hero photo index and scroll
   offset are kept per number in `features/listing/viewState.ts` and restored in a layout effect.
6. A different number in the answer (legacy merge redirect, `useListingLoader` behaviour of SCR-018): seed the
   resource cache of the new number with the same answer, then `router.replace(routes.listing(newNumber))`. No
   second request, no stale state (new key).
7. On mount with a number: add it to the `seen` session map (`useSessionMap('seen')`, the eye of BR-APP-040).
8. `reportSource(meta.source)` is called by the fetch paths of WP-22, so the demo marker shows on stub answers.

Field names below are the legacy ones of `08` §1.8, used as meanings; the v1 names are those of the generated
`@homi/types` (WP-12). A missing field is fixed in the contract spec in the same PR.

### Components and modules (`frontend/app/features/listing/`)

| File | Content |
| ---- | ------- |
| `ListingServer.tsx` | server part described above |
| `ListingScreen.tsx` | client; fixed layer with scrollable `main`; sections in legacy order; CTA bar; swipe-back; body class `listing-open` |
| `useListing.ts`, `viewState.ts` | resource hook; per-number hero index and scroll offset |
| `ListingSkeleton.tsx` | `ListingSkeleton` (shimmer hero + three bars) and `SectionSkeleton` (3 or 4 lines) |
| `ListingHero.tsx`, `ListingTitleRow.tsx`, `KeyFacts.tsx` | hero strip with counter and video label; title, place, share, favourite, «⋯»; fact tiles |
| `sections/MarketBlock.tsx`, `market/marketText.ts` | block, scale position, context line, warnings; pure text builders for block and sheet, including the total rooms function |
| `sections/{FactsSection,StatsSection,HistorySection,HistoryDate}.tsx` | facts grid, stats cells, history sentence or timeline, date and time cell |
| `sections/{LocationSection,NearbySection,SpotMapSlot}.tsx` | location rows, «Рядом», the 2:1 placeholder that links to `routes.listingLocation(number)` |
| `sections/{AuthorSection,DescriptionSection,SourcesSection,OriginalText}.tsx` | author, description, channel chips, original text with translation |
| `translation/{useTranslation,translationCache}.ts` | state per number and locale: `{ text, shown, pending, failed }` |
| `cta/{ListingCtaBar.tsx,useContact.ts}` | price, delta or note, primary action; contact link lifetime and the call flow |
| `share/useShareListing.ts` | prepared message, fallback link, lock |
| `openOriginal.ts` | `openOriginal(number, url, src)`: `tg.openLink`, then `original_opened` only if it opened |
| `viewer/{PhotoViewerRoute,PhotoViewer,ZoomableImage}.tsx`, `viewer/gestures.ts` | viewer, zoomable slide, pure gesture maths |
| `market/{MarketSheetRoute,MarketSheet}.tsx` | `RouteSheet` without a × button |
| `actions/{ListingActionsRoute,ListingActionsSheet,ActionRow,ReportDetailForm}.tsx`, `actions/useListingActions.ts` | menu, report and detail steps; results, toasts, undo |
| `closeListing.ts` | closes the sheet steps and the listing in one move (see below) |

Outside the feature folder: `splitPhones(text)` in `frontend/packages/utils/src/phone.ts` (pure, exported from
`@homi/utils`); `backBy(steps)` added to `frontend/app/lib/navigation/history.ts`.

### Server Actions and reads

| Function | File | v1 method | Used result |
| -------- | ---- | --------- | ----------- |
| `requestContact(number)` | `lib/actions/listing.ts` | `POST /listings/{number}/contact` | call link and its expiry |
| `translateListing(number)` | `lib/actions/listing.ts` | `POST /listings/{number}/translation` | translated text |
| `prepareShare(number)` | `lib/actions/listing.ts` | `POST /listings/{number}/share` | prepared message identifier |
| `hideListing`, `unhideListing` | `lib/actions/hidden.ts` | `PUT`, `DELETE /hidden/listings/{number}` | — |
| `blockAuthor`, `unblockAuthor` | `lib/actions/hidden.ts` | `PUT`, `DELETE /listings/{number}/blocked-author` | hidden listing numbers, author label |
| `reportListing(number, { reason, detail? })` | `lib/actions/reports.ts` | `POST /listings/{number}/reports` | `hidden` flag (an empty success counts as `false`) |

All have the signature `(input, auth?)` → `ActionResult<T>` and are called through `useAction()` (WP-22). The read
`GET listings/{number}` is added to `lib/api/bffAllowList.ts` if WP-22 did not list it.

### Layers, Back and z-order

- Viewer and sheets are opened with `router.push(…, { scroll: false })`; `back()` of `useBack()` closes them. The
  report and detail steps are `useLayerState('step')` values `report` and `detail`, so Back walks
  detail → report → menu → listing → page below.
- After hide, block, a `rented` report or a `fraud` report that hid the listing, the sheet and the listing close
  together: `closeListing()` calls `backBy(steps)` with `steps` = open step layers + the actions route + the
  listing. `backBy` falls back to `router.replace(parentOf(routes.listing(number)))` when the app's depth is
  smaller (direct load).
- Swipe-back (`useSwipeBack` of `@homi/ui`): only when data is shown, the pathname is exactly the listing address
  and no step layer is open; never on Android. Its close is `back()`.
- Z-order uses the tokens of WP-20 (legacy ladder of `03` §3.6): the listing layer 45, the CTA bar 20 inside that
  layer, sheets 50, toast 60, viewer 100. `PhotoViewer`, `MarketSheet` and `ListingActionsSheet` are **portalled to
  `document.body`** so they compare with the toast and the tab bar in the root stacking context (Radix dialogs do
  this by default — verify before use). The CTA bar and the status banner stay inside the listing layer.
- `PhotoViewer` sets the body class `locked` while open; `ListingScreen` sets `listing-open` (pull-to-refresh of
  WP-23 and the nudges of WP-30 stay off under it, as in SCR-010).
- The viewer and both sheets are loaded with `next/dynamic` from Client Components (`lazy-loading.md`).

### Flags and new texts

| Flag (default off) | Off — legacy | On |
| ------------------ | ------------ | -- |
| `dev051RentedUndo` | «Отметили: уже сдано» without an action | the toast gets «Вернуть», which unhides. Withdrawing the vote needs a v1 method that 25 §4.2 does not list: a `todo` test marks it |
| `dev010RealtorVoteWording` | `report.agentHint`, `toast.reportedAgent` | `report.agentHintReview`, `toast.reportedAgentReview` |

New keys, `homi` layer of `@homi/i18n` (uz wording is confirmed by the reviewer):

| Key | ru | uz | en |
| --- | -- | -- | -- |
| `market.v3.rooms0` | «тоже студии» | «ham studiya» | «also studios» |
| `market.v3.roomsN` | «тоже {n}-комн.» | «ham {n} xonali» | «also {n}-room» |
| `report.agentHintReview` | «Проверим номер — если это риелтор, отметим его» | «Raqamni tekshiramiz — rieltor boʻlsa, belgilaymiz» | «We’ll check the number and mark it if it’s an agent» |
| `toast.reportedAgentReview` | «Спасибо, проверим» | «Rahmat, tekshiramiz» | «Thanks, we’ll check» |

## Files

New unless marked.

- `frontend/app/app/[locale]/(main)/listing/[number]/{layout,page}.tsx`, `photos/page.tsx`, `market/page.tsx`,
  `actions/page.tsx` (replace the WP-20 placeholders)
- `frontend/app/app/[locale]/(main)/@overlay/(.)listing/[number]/{layout,page}.tsx`, `photos/page.tsx`,
  `market/page.tsx`, `actions/page.tsx` (replace the WP-20 placeholders)
- `frontend/app/features/listing/**` as in the table above
- `frontend/app/lib/actions/{listing,hidden,reports}.ts`
- `frontend/app/lib/api/bffAllowList.ts`, `frontend/app/lib/navigation/history.ts` (changed)
- `frontend/packages/utils/src/phone.ts`, `frontend/packages/utils/src/index.ts` (changed),
  `frontend/packages/utils/tests/phone.test.ts`
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json` (changed: four keys)
- `frontend/app/tests/listing/*.test.ts(x)`, `frontend/app/e2e/{listing-open,listing-contact,listing-actions,photo-viewer}.spec.ts`

## Steps

1. Read the Next.js files named in "Design" and the re-baselined SCR-018 and SCR-023 sections of `03` (WP-02).
2. `ListingServer`, `ListingScreen` shell, `useListing`, `viewState`, skeletons; both `layout.tsx` and `page.tsx`.
   Open from a feed card, Back closes. Commit.
3. Loading and error states; the number redirect; `seen` map. Unit tests of `useListing`. Commit.
4. Hero, status banner, title row (favourite wired to `FavButton`), key facts. Commit.
5. Market block and `marketText.ts` with tests. Commit.
6. Facts, stats, history with `HistoryDate`. Commit.
7. Location rows, «Рядом», `SpotMapSlot`. Commit.
8. Author, description. `splitPhones` with tests. Sources, original text, translation with `translateListing`.
   Commit.
9. `useContact`, `requestContact`, CTA bar, calls from the bar, the author row and the text. Commit.
10. `useShareListing`, `prepareShare`. Commit.
11. `gestures.ts`, `ZoomableImage`, `PhotoViewer`, `photos/page.tsx` in both trees. Commit.
12. `MarketSheet`, `market/page.tsx` in both trees. Commit.
13. `backBy`, `closeListing`, actions `lib/actions/{hidden,reports}.ts`, `useListingActions`, the menu. Commit.
14. Report step, then the detail step from the re-baselined audit. Both flags with tests. Commit.
15. Swipe-back, body classes, portals and z-order check against the toast and the tab bar. Commit.
16. Playwright specs in both session modes; tick the checklist on staging in ru, uz, en, light and dark.

## Behaviour to reproduce

### Loading and error states

SCR-019. Applies to the listing; the children wait for the same resource.

| State | Trigger | Rendering |
| ----- | ------- | --------- |
| Skeleton | no preview and no answer yet | shimmer hero and three bars; swipe-back off |
| Preview | card data in the cache, answer pending | hero, title, key facts, market delta from the preview; `SectionSkeleton` of 3 lines (facts, stats, history) and 4 lines (author, description, source); shimmer in place of the CTA action |
| Loaded | answer arrived | all sections; photos from the full set |
| Not found | `not_found` | only the text `listing.loadFailed` «Объявление не загрузилось» (uz «Eʼlon yuklanmadi», en «Couldn’t load the listing»); no button; Back closes |
| Offline | `offline`, `timeout` | tall `ErrorState`: `error.offline` «Нет связи», `error.offlineText` «Проверьте интернет и попробуйте ещё раз.», `error.retry` «Повторить» |
| Server | `server`, `source_unavailable`, `rate_limited` | tall `ErrorState`: `common.loadFailed` «Не загрузилось», `error.serverText` «Сервер не ответил. Попробуйте ещё раз через минуту.», «Повторить» |
| Forbidden | `forbidden` | the server state above; with `dev001AnyForbiddenShowsAccess` the mapping of WP-22 sends the user to the access screen |
| Unauthorized | `unauthorized` | `bffFetch` re-authenticates once (WP-21); if that fails the session-expired screen of WP-23 shows |

An answer that arrives for a number the user has already left is dropped (keyed instance).

### Screen blocks, top to bottom

SCR-018. Every server string is rendered as text, never as HTML.

1. **Hero.** `PhotoStrip` of WP-24 with the counter «N / M» (no key; hidden for one photo) and, for a video, the big
   label `listing.watchVideo` «Смотреть видео в Telegram». Tap on a photo: light haptic,
   `router.push(routes.listingPhotos(number, index))`. Tap on a video with the answer loaded and the post not
   deleted: `openOriginal(…, 'video')`; with `post_deleted` or before the answer: the viewer. No photos: the
   placeholder of `Photo`, no counter.
2. **Status banner** from `status_text`, when present.
3. **Title row.** `h1` = the part of `title` (else `short_title`) before « · »; an empty title renders nothing.
   Line «district · landmark». Buttons: share (aria `listing.share` «Поделиться», only when `brand.botUsername` is
   set), favourite (`FavButton`, aria `fav.add` / `fav.remove`), «⋯» (aria `actions.menu` «Ещё») →
   `router.push(routes.listingActions(number))`.
4. **Key facts** tiles: rooms (plural `listing.rooms`), `listing.m2`, floor `n/total` (`listing.floor`), building
   `listing.newBuilding` when the market code is `new`, else `listing.secondary` (`listing.building`). Nothing when
   all four are absent.
5. **Market block** (BR-APP-028): shown only when `verdict.ts` returns a verdict **and** `median` is truthy **and**
   `median_value` and `median_delta` are not null. Title `market.title` «Сравнение с районом», `market.titleNear`
   «Сравнение с похожими рядом» (scope `near`) or `market.titleCity` «Сравнение с городом» (scope `city`). ⓘ button
   (aria `market.how` «Откуда эта цифра») → `router.push(routes.listingMarket(number))`. Verdict text and tone from
   `verdict.ts` (BR-APP-027 and LB-APP-039 are WP-24's). Scale labels `market.cheaper` «дешевле», `market.median`
   «обычно {value}{unit}», `market.pricier` «дороже»; unit `unit.m2Month`, `unit.m2` or `unit.month`; values through
   `useMoney().format`. Marker position `clamp(4, 96, 50 + delta / 0.4 × 50)` %; own value =
   `median_own ?? (metric m2 ? price_per_m2 : price_usd)`; no marker when it is null (never «$NaN»). On the first
   show of a number in this launch the marker starts at 50 % and moves after two frames; no transition with reduced
   motion or lite. Context line by scope and metric (`market.ctxPerson`, `market.ctxNear` / `ctxNearSale`,
   `market.ctxM2`, `market.ctxCity` / `ctxCitySale`, `market.ctxDistrict` / `ctxDistrictSale`; for tone `mixed`
   with a place value also `market.ctxPlace`). Warnings: tone `suspicious` → `market.noteSuspicious`; tone `check`
   with a server note → that note.
6. **Facts** `details.facts` «Факты»: server order; icon by key (`type`, `rooms`, `area`, `land`, `floor`,
   `building`, `renovation`, `furniture`, `appliances`, `per_m2`, `commission`, `conditions`), any other key → the
   house icon; a value longer than 18 characters spans both columns; React key = key + index; empty → no section.
7. **Stats** (BR-APP-068): days on market — 0 → `details.today` «Сегодня» + `details.onMarket` «на рынке», else N +
   plural `details.daysOnMarket`; publications (plural `details.publications`); channels only when > 1
   (`details.channels`); views only when non-zero (`details.views`, number through `formatNumber`).
8. **History** (BR-APP-069): no entries → hidden. One entry → `details.history` «История» with the sentence
   `details.historySingle` «Опубликовано {date} в @{channel}. Повторов и изменений цены пока не было.»; the
   `@channel` part is a button when the entry has a link (sentence split at the placeholder, no HTML). Several →
   `details.priceHistory` «История цены»: rows of date, time, text · @channel, price (`useMoney().format`) and ±%
   — green when negative, orange when positive, nothing when null. Rows with a link open the post
   (`openOriginal(…, 'price_history')`). Date and time come from `formatShortDate` / `formatTime` of WP-22:
   device time zone by default, `Asia/Tashkent` with `dev014TashkentDates` (LB-APP-025). Because the device zone is
   unknown on the server, `HistoryDate` follows `preventing-flash-before-hydration.md` when the flag is off (the
   inline script needs the request nonce of WP-21; a fixed-width empty cell filled after hydration is the fallback).
9. **Location** `listing.location` «Расположение»: with coordinates — `SpotMapSlot` (2:1 box, aria
   `listing.mapOpen`, tap → `router.push(routes.listingLocation(number))`) and the hint `listing.mapApprox` «Место
   примерное: по кварталу, ориентиру или метро из объявления»; without coordinates neither. Place row; centre
   distance `fmt.centerKm` «{km} км до центра» (one decimal). `listing.nearby` «Рядом»: the metro first when it is
   within 1.5 km, then the server places in order; distances through `formatDistance` of WP-22 (legacy wording
   `near.here` «рядом», `near.m` «{m} м», `near.km` «{km} км»; BR-APP-031 and the `dev019OneDistanceFormatter`
   branch live there) with the `~` prefix when `(geo_radius_m ?? 500) ≥ 400`. Fix of LB-APP-016: icons for `metro`,
   `park`, `school`, a default pin for any other kind; React key = kind + name + index.
10. **Author** `listing.whoPosts` «Кто размещает»: owner text; offers (with a link → button,
    `openOriginal(…, 'offers')`; without → text); the display phone as a button with class `ph-mask` (medium
    haptic, call with `src: 'author'`); `listing.published` «Опубликовано {when}» from the part of `age` after the
    first « · », else the whole string.
11. **Description** `listing.description` «Из объявления»: the summary as text with line breaks kept; hidden when
    empty.
12. **Source** `listing.source` «Источник»: chips `@handle` → `openOriginal(…, 'sources')`. Disclosure
    `listing.originalText` «Текст оригинала», only with a non-empty original text, closed on every new number.
    Inside: the text in a `<pre>` with class `ph-mask`; `splitPhones` finds Uzbek numbers (optional `998` prefix,
    known operator and city codes, separators space, hyphens, dot, underscore) and **only the number equal to the
    listing's phone** is a call button (`src: 'text'`), the others stay text (BR-APP-035). A `copy` event on the
    text sends `original_copied`.
13. **Translation** (BR-APP-034): not offered in `ru`. In uz and en: `listing.translate` «Перевести» → pending
    `listing.translating` «Перевожу…» (disabled) → translated text with `listing.machineTranslation` «Перевод
    сделан ИИ» and the button `listing.showOriginal` «Показать оригинал». The first tap calls `translateListing`,
    later taps toggle without a request. Any error or an empty text → `listing.translateFailed` «Не получилось
    перевести»; the next tap retries. State is cached per number and locale, so another listing never shows it
    (LB-APP-003) and returning to the first listing restores it.
14. **CTA bar** (fixed bottom). Left: price main part + period, or `listing.negotiable` «Договорная» without a
    price; below it the verdict short label when a price note exists, else `listing.marketDelta` «{delta} к рынку»
    (`fmt.marketSameShort` «≈ обычная», `fmt.marketMixedShort` «≈ спорно»), and the note (bracket text and the
    remaining « · » parts). Price parts and the price-kind label come from the contract or from the card helper of
    WP-24, as on the card. Right (BR-APP-032), in priority: answer pending → shimmer; phone → `listing.call`
    «Позвонить»; contact link → `listing.write` «Написать», or `listing.writePaid` «Номер платный» when the contact
    is paid; post deleted → no action; else `listing.openPost` «Открыть пост» → `openOriginal(…, 'button')`.

### Contact

BR-APP-033, TMA-029, TMA-040; fix of LB-APP-028.

- `useContact` keeps `{ url, receivedAt, expiresAt? }` in memory. Stale = `expiresAt − 2 min` passed when the
  contract gives an expiry, else 8 min after receipt (legacy lifetime 10 min). While the document is visible a
  timer refreshes a stale link through `requestContact`; `tg.onVisible` refreshes on return. Refresh errors are
  ignored and the old link stays.
- «Позвонить» (medium haptic): fresh link → `tg.call(phone, url)`; stale → refresh, then call (on failure with the
  old link); **no link** → `requestContact` on demand, then call; if that fails → `failed()` and nothing is logged.
- `tg.call` tries `tel:` first on Android and opens the call page when the app was not left within 1.2 s; elsewhere
  it opens the call page. `contact_call { listing_id, via: 'tel' | 'browser', src? }` is sent **only when something
  opened**.
- «Написать» / «Номер платный»: `tg.openLink(contactUrl)`; `contact_write { listing_id }` only when it opened (the
  1.5 s same-address guard of WP-21 makes a double tap one open, one event).
- If the contract carries no raw number (DEV-007 is decided on the API side), the `tel:` attempt and the in-text
  call button are skipped and every call uses the contact link.

### Share

BR-APP-038, TMA-030, TMA-031. Tap: ignored while locked; light haptic; `listing_shared { listing_id }` (before
trying, as legacy); `prepareShare` → `tg.shareMessage(id)`; on any error, an old client or `false` →
`tg.shareUrl(botStartAppUrl(number), text)` with `text` = title · price main + period · price-kind label ·
district (empty parts dropped). The lock holds during the share and 1.5 s after. No toast in any outcome.

### Photo viewer

SCR-020. Opens at `i` (default 0); closes with × (aria `common.close` «Закрыть»), Back, or a swipe down past
110 px. Black layer, `role="dialog"`, aria `viewer.title` «Фото»; horizontal snap strip positioned before the first
paint; counter «N / M» for more than one photo. Full-size images (no thumbnail downgrade); a failed image shows the
`Photo` placeholder and paging still works. Paging updates `i` with `window.history.replaceState` (no new history
entry). `ZoomableImage`: pinch up to 4× around the midpoint; double tap (within 300 ms) toggles 1× ↔ 2.5× around
the tap; pan only when zoomed, clamped to the image; the strip is locked while zoomed; at 1× a vertical drag fades
the background through `--drag` and closes past 110 px, else springs back; leaving a slide resets its zoom; an
orientation change resets to 1×. Easing 0.25 s `cubic-bezier(.2,.9,.3,1)`; none with reduced motion. Fix of
LB-APP-004: handlers read `onZoom`, `onDrag`, `onClose` through refs updated on every render.

### Market sheet

SCR-022. Closes with backdrop, drag (start 6 px, close at 25 % of height or 0.5 px/ms) or Back; it has **no ×**.
Title `market.how` «Откуда эта цифра»; a demo scale whose dot slides to its place over 1 s (not with reduced motion
or lite).

- Paragraph 1, the sample: scope `near` → plural `market.v3.found` «Мы нашли {n} похожих квартир рядом: {alike}.»
  with the rooms phrase («тоже двухкомнатные»), the class phrase `market.v3.jk` / `market.v3.house` («тоже в ЖК»)
  and `market.v3.within` «не дальше {dist}» (`market.v3.m` from 100 m in steps of 100, else `market.v3.km`);
  otherwise plural `market.v3.district` or `market.v3.city`. A null sample size counts as 0.
- Rooms phrase, fix of LB-APP-015 — a total function: 1, 2, 3 → `market.v3.rooms1…3`; ≥ 4 → `market.v3.rooms4`;
  0 → `market.v3.rooms0`; any other number → `market.v3.roomsN` with `n` rounded; null → omitted. An unexpected
  value is reported once per launch with `reportError(…, { kind: 'data' })`.
- Paragraph 2, the median: `market.v3.half` or `market.v3.halfM2` (`market.v3.perM2`, `market.v3.perM2Month`).
- Paragraph 3, own price and conclusion: `market.v3.own` / `ownM2` plus one of `mixed`, `suspicious`, `check`
  (with the server note), `same`, `noRepair`, `pricier`, `cheaper`; «в N раза» (`market.v3.times`) from +90 %, else
  `market.v3.pct`. An unknown tone concludes by the sign of the delta.
- Footer: `market.v3.asking` «Цены из объявлений — после торга бывает дешевле» · `market.v3.updated` «обновлено
  {ago}» (`market.info.agoNow` «только что» under 2 min, plural `agoMin` under 60 min, `agoHour` under 48 h, then
  `agoDay`; a future time counts as now; omitted without a valid time) · `market.info.more` «Подробнее» →
  `tg.openLink(brand.links.methodology[locale])`. HOMI has no methodology page in Wave 1, so the link is `null`
  and «Подробнее» is **not rendered** until the brand layer gets an address.

### Actions sheet

SCR-023, BR-APP-036, BR-APP-037. Closes with ×, backdrop, drag, Back, or a successful action. While a request runs
(`busy`) taps are ignored. Every action: light haptic on tap, success or error haptic on the result.

Menu, title `actions.title` «Объявление»:

- `actions.hide` «Скрыть объявление» — `actions.hideHint` «Больше не покажем ни его, ни его копии».
- `actions.block` «Заблокировать автора» — `actions.blockHintPhone` «Не показывать объявления с номера {label}»
  (class `ph-mask`), `actions.blockHintSource` «Не показывать объявления из {label}», or `actions.blockHint` «Не
  показывать его объявления»; plus « — » and plural `actions.blockCount` «скроет {n} объявлений» when the author
  has 20 or more listings.
- `actions.report` «Пожаловаться» — `actions.reportHint` «Сдано, риелтор, ошибка или обман» → step `report`.
- `actions.support` «Написать в поддержку» — `actions.supportHint` «Уже сдано, мошенник или это ваше объявление —
  разберёмся»: only when the reference data gives a support account; `tg.openLink(supportUrl(number))`, then close.

Report step, title `report.title` «Что не так?», back chevron aria `actions.back` «Назад»:

- `report.rented` «Уже сдано» — `report.rentedHint` «Объявление больше не актуально».
- `report.agent` «Это риелтор, а не хозяин» — `report.agentHint` «Отметим номер как риелторский»; hidden when the
  listing says it is not from an owner (`is_owner === false`).
- `report.wrong_data` «Неверные данные» — `report.wrong_dataHint` «Цена, район или комнаты не совпадают».
- `report.fraud` «Мошенничество или спам» — `report.fraudHint` «Просят предоплату, чужие фото, реклама».

Detail step (`step=detail`): added by a legacy release after the audited one (25 §8.1). The audit of this step is
written by WP-02; take from it, without guessing: which reasons open the step and whether it can be skipped; the
title, field label, placeholder, button and error texts with their keys; the length limits and trimming of
`detail`; what Back and a drag do with typed text; the toasts. The request is `reportListing(number, { reason,
detail })`. If WP-02 is not merged when this step is reached, stop at step 13 of "Steps" and write the Handoff.

The same release adds the `price_kind: business` label. Its text, key and placement on the CTA bar and in the share
text come from the re-baselined SCR-018 section; the card half is WP-24's.

Results (`useListingActions`):

| Action | Effect | Toast |
| ------ | ------ | ----- |
| Hide | number into the `hidden` map; `closeListing()` | `toast.hidden` «Объявление скрыто» + `toast.undo` «Вернуть» → `unhideListing` |
| Block | the number and every number of the answer (de-duplicated) into `hidden`; `closeListing()` | `toast.blocked` «Автор {label} заблокирован» + «Вернуть» → `unblockAuthor` |
| Report `fraud`, answer says hidden | as hide | `toast.reportedFraud` «Спасибо, посмотрим. Это объявление у вас скрыли» + «Вернуть» → `unhideListing` |
| Report `rented` | number into `hidden`; `closeListing()` | `toast.reportedRented` «Отметили: уже сдано», no action (see `dev051RentedUndo`) |
| Report `agent` | sheet closes | `toast.reportedAgent` «Отметили номер как риелторский» |
| Other reports | sheet closes | `toast.reported` «Спасибо! Посмотрим» |
| Any failure | nothing changes, sheet stays | `common.saveFailed` «Не получилось сохранить» |
| Undo | removes the numbers from `hidden` at once; on failure puts them back | on failure `common.saveFailed` |

Hidden numbers disappear from the feed, favourites and the map of this launch (their packages read the map); the
history list keeps them. A result always applies to the number the sheet was opened for.

### Events and privacy

`listing_shared`, `original_opened` (`src`: `button`, `video`, `sources`, `price_history`, `offers`),
`original_copied`, `contact_call`, `contact_write` go through `track()`; `listing_id` is the listing number. No
phone, text, link token or position is ever passed to `track()` or `reportError()` (TMA-009, SEC-REQ-047). Phone
texts, the original text and block hints carry `ph-mask`. Links open only through `tg.openLink`, whose allow-list
is WP-21's (SEC-REQ-019).

## Tests

**Unit (Vitest).**

- `frontend/packages/utils/tests/phone.test.ts`: `+998 90 123 45 67`, `(90) 123-45-67`, `901234567`,
  `998901234567`, `90.123.45.67`, `90_123_45_67`; unknown code `12 345 67 89`; long digit runs; two numbers in one
  line.
- `tests/listing/useListing.test.ts`: `initial.ok`; `initial === null` fetches once; each `UiError` → its state;
  redirect seeds the new number and sends no second request; late answer dropped; retry uses `bffFetch`.
- `tests/listing/marketText.test.ts`: marker 4 % for −0.6, 50 % for 0, 75 % for +0.2, 96 % for +0.5; context-line
  branches; rooms 0, 1, 2.5, 4, 7, null; radius 0.05 / 0.34 / 1.26 km; ago at 1 min, 5 min, 3 h, 49 h, future.
- `tests/listing/gestures.test.ts`: scale clamp 1–4; pan clamp; double-tap window and distance; close at 110 px.
- `tests/listing/useContact.test.ts` (fake timers, visibility): refresh at 8 min only when visible; refresh by
  contract expiry; refresh error keeps the link; on-demand fetch; failure sends no event; both Android outcomes.
- `tests/listing/useShareListing.test.ts`: prepared path; old client; action failure; `shareMessage` false; lock
  with fake timers; fallback text for rent, sale with a price kind, no price.
- `tests/listing/useListingActions.test.ts`: each row of the results table; undo failure; both flag branches
  (`withDevFlags`); `todo` for the vote withdrawal.
- `tests/listing/useTranslation.test.ts`: not offered in ru; fetch then toggle; failure then retry; keyed by number
  and locale; empty text is a failure.

**Component (Vitest + Testing Library).**

- `ListingScreen.test.tsx`: skeleton, preview, loaded, not found, offline, server; video tap with and without a
  deleted post; share hidden without a bot name; no `h1` without titles.
- `KeyFacts.test.tsx`, `StatsSection.test.tsx`: ru plurals for 1, 2, 5, 11, 21; 0 days; channels 1 and 2; views 0.
- `FactsSection.test.tsx`: icon table, unknown key, duplicate keys, 18 and 19 characters.
- `HistorySection.test.tsx`: none, one with and without a link, several with −, 0, +, null; both date flags.
- `NearbySection.test.tsx`: metro at 1.5 and 1.51 km; kind `hospital`; two `school`; `~` at radius 500, not at 300.
- `MarketBlock.test.tsx`: visibility rules; no marker without an own value; animation once per number.
- `MarketSheet.test.tsx`: every conclusion branch; no × button; «Подробнее» absent with a `null` link, present and
  opening the link with a value.
- `OriginalText.test.tsx`: only the matching number is a button; copy event; `ph-mask` present.
- `ListingCtaBar.test.tsx`: the priority table of BR-APP-032; negotiable; note.
- `PhotoViewer.test.tsx`: start index, counter, `locked` class, replaced `onClose` is honoured (LB-APP-004).
- `ListingActionsSheet.test.tsx`: hint variants (phone, source, none, 19 and 20 listings); support row with and
  without an account; `agent` filter; busy guard; step order with Back.

**End to end (Playwright, fake Telegram, stubs, cookie mode and header mode).**

- `listing-open.spec.ts`: feed card → listing over the feed → Back to the same scroll position; direct load of the
  address; redirect fixture; not-found fixture; `503` fixture then retry; uz: translate and toggle; Settings button
  closes the listing.
- `photo-viewer.spec.ts` (touch): open photo 3 of 7, page, double tap, swipe down closes; Back closes the viewer
  before the listing; direct load of `photos?i=2`.
- `listing-contact.spec.ts`: iOS platform opens the call link; Android with a staying app opens it after 1.2 s;
  no link → one contact request; events recorded by the fake.
- `listing-actions.spec.ts`: hide → toast → «Вернуть»; block; report `fraud` hidden; report failure; Back from the
  report step returns to the menu; after hide the feed shows without the card and history length is unchanged.

## Acceptance checklist

Run every line in ru, uz and en, in light and dark, on staging; attach screenshots to the PR.

Opening and states

- [ ] A feed card opens the listing over the feed with its preview at once; details replace it without moving the
      hero, the title or the scroll position.
- [ ] The listing opens the same way from the map card, favourites, history, a radar strip and the hidden list.
- [ ] A direct load of the listing address shows the skeleton, then the listing; Back goes to the feed.
- [ ] Not found shows only «Объявление не загрузилось»; Back closes it.
- [ ] Offline shows «Нет связи» with «Повторить»; a server or source failure shows «Не загрузилось»; retry loads.
- [ ] A redirected number shows the surviving listing with one request and no leftover state.
- [ ] The demo-data marker is visible while the answer comes from a stub.
- [ ] The opened listing has the «viewed» eye in the feed afterwards.

Blocks

- [ ] Hero: counter «N / M», photo swipe, video label; a video tap opens the post, or the viewer for a deleted post.
- [ ] Status banner shows the server text when present.
- [ ] Title row: title, «district · landmark», share (only with a bot name), favourite toggles, «⋯» opens the sheet.
- [ ] Key facts show rooms, m², floor, building; nothing when all are absent.
- [ ] Market block: three titles by scope; verdict, scale, «обычно …», context line, warnings; hidden without a
      median value; no «$NaN» anywhere.
- [ ] Facts grid in server order; a long value spans the row; an unknown key has the house icon.
- [ ] Stats: «Сегодня на рынке» for 0 days; channels only above 1; views only when non-zero; correct plurals.
- [ ] History: one entry is the sentence with a tappable @channel; several are the timeline with green and orange
      percentages; dates follow the device time zone.
- [ ] Location: hint, place, centre distance, «Рядом» with metro within 1.5 km and `~` for approximate places; an
      unknown kind renders with the default icon.
- [ ] Author: owner, offers (links open), phone button calls, «Опубликовано …».
- [ ] Description shows the summary with line breaks; hidden when empty.
- [ ] Source: channel chips open the post; «Текст оригинала» opens; only the listing's own number is a call button.
- [ ] Translation: absent in ru; in uz and en «Перевести» → «Перевожу…» → text with «Перевод сделан ИИ» →
      «Показать оригинал»; a failure shows «Не получилось перевести» and the next tap retries.
- [ ] Opening another listing never shows the previous translation or an open original text.

Contact and share

- [ ] CTA shows «Позвонить», «Написать», «Номер платный», «Открыть пост» or nothing, by the priority rule.
- [ ] «Позвонить» on Android tries the dialer, then the call page; elsewhere the call page opens.
- [ ] After 8 minutes on the screen a call still opens a working link; a listing without a link fetches one on tap.
- [ ] A failed link fetch gives the error haptic and no `contact_call` event.
- [ ] «Написать» opens the chat once on a double tap.
- [ ] Share opens Telegram's picker; on an old client or a failure the share link opens; a double tap shares once.

Viewer and sheets

- [ ] The viewer opens at the tapped photo; pinch to 4×, double tap 2.5×, pan when zoomed, no paging while zoomed.
- [ ] Swipe down past 110 px closes; less springs back; × and Back close the viewer and leave the listing open.
- [ ] The market sheet opens from ⓘ, has no ×, closes by backdrop, drag and Back; all three paragraphs and the
      footer read correctly; «Подробнее» is absent while the methodology link is not set.
- [ ] Actions menu shows hide, block (right hint, count from 20 listings), report, support (only with an account).
- [ ] Hide closes the listing, removes the card, shows «Объявление скрыто»; «Вернуть» brings it back.
- [ ] Block hides all the author's listings, shows «Автор … заблокирован»; «Вернуть» restores them.
- [ ] Report step lists four reasons («Это риелтор…» absent for a non-owner listing); each gives its toast; `rented`
      and a hidden `fraud` close the listing.
- [ ] The detail step behaves as the re-baselined audit describes.
- [ ] Any failed action shows «Не получилось сохранить» and changes nothing.
- [ ] Back order: detail → report → menu → listing → page below; the Settings button closes everything.
- [ ] Swipe right closes the listing on iOS and desktop, never on Android, and not while a layer is open.
- [ ] Viewer and sheets are above the CTA bar and the tab bar; the toast is above the sheets.

Flags, modes, quality

- [ ] With `dev051RentedUndo` on (test build) the `rented` toast has «Вернуть»; with `dev010RealtorVoteWording` on
      the realtor hint and toast use the review wording. Both are off in the merged build.
- [ ] Every scenario above passes in cookie mode and in header mode.
- [ ] No phone number, original text or contact link appears in analytics events or error reports.
- [ ] Unit, component and end-to-end tests of this package are green in CI.

## Handoff

Empty.
