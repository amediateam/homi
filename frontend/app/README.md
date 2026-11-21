# frontend/app — the HOMI Mini App

Next.js 16.4 App Router app of the Telegram Mini App (DEC-44). Its plan is `docs/migration/25-wave-1-plan.md` §3; the
packages that build it are WP-20 … WP-33 of `docs/migration/wave-1/README.md`. Read the guide of a Next.js feature in
`node_modules/next/dist/docs/` before using it: this version differs from older ones (`proxy.ts`, `cacheComponents`).

## Layout

| Path | Content |
| ---- | ------- |
| `app/[locale]/` | The route tree of `25` §3.2. `layout.tsx` is the root layout; `(main)/` holds the screens with the `@sheet` and `@overlay` slots inside `AppShell`; `welcome/`, `no-access/`, `outside/` are the gates. Route files only read `params` and mount a component from `features/` |
| `app/[locale]/error.tsx`, `not-found.tsx`, `app/global-error.tsx` | The crash screen below the root layout (`CrashScreen`, «Обновить» reloads); «Такой страницы нет» with «К поиску» (`(main)/[...rest]` throws `notFound()` under `<Suspense>`, so the document keeps the boot script, AM-59); a failed root layout: own `<html>`, one `<style>`, no script, texts by the first path segment |
| `app/[locale]/dev/ui/page.tsx`, `features/gallery/` | The primitives gallery (`UiGallery`) and the listing card's states on fixture data (`CardStates`, WP-24): only in `local`, `ci` and `staging` builds (`NEXT_PUBLIC_APP_ENV`), the not-found screen elsewhere; its "throw" button serves `crash.spec.ts` |
| `app/[locale]/(main)/@sheet/(.)…`, `@overlay/(.)listing/…` | Sheets and the listing layer intercepted from a soft navigation; a hard load renders the page of the same name. Each slot has `default.tsx`, `page.tsx` and `[...rest]` returning `null` |
| `app/bff/session/route.ts` | The session exchange (`25` §3.4): `POST` trades the launch data for the `homi_session` cookie, `GET` reads `/me` with the cookie or a bearer header |
| `app/bff/[...path]/route.ts` | The read pass-through for header mode (`25` §3.5): only the reads of `lib/api/bffAllowList.ts`, same-origin, never cached |
| `boot/` | `stubs.js` and `boot.js` (ES5, inlined by the root layout from the committed `inline.generated.ts`; `build.mjs` writes it before `dev` and `build`): theme and lite class before paint, the engine test, the boot watchdog, «Обновите Telegram», the SDK tag |
| `dev/` | The development Telegram emulator; `build.mjs` turns it into `public/__dev/telegram-emulator.js` (git-ignored) before `next dev` and deletes it before a build |
| `features/` | One folder per feature; route files mount their components |
| `features/shell/` | `AppShell` (the variant of the address by `shellVariantOf`; a layer keeps the chrome of the page below), `TopBar`, `TabBar`, `ViewToggle`, `MiniTitle` and `useMiniChrome` (the collapsing chrome), `PullToRefresh` and `usePullToRefresh`, `RouteSheet` and `RouteOverlay` (layer or standalone; the listing's entrance, leave and own close since WP-36), `SubPage`, `ToastHost` (WP-23); `FallbackClose` (the app's cross while the Telegram SDK is absent, WP-36); the placeholders, `BootGuard`, `TelegramButtons`, `LaunchRedirector`, `FragmentGuard`, `NavigationBinder`, the demo marker (WP-20 … WP-22); `ViewToggle`'s `onIntent` warms the map (WP-27) |
| `features/feed/` | The search list (WP-24): `FeedServer` (page one with the cookie, `readFirstPage`; the small-photo hint of the request), `FeedScreen` (the feed's own search state, the list key, pull-to-refresh, the top on a new key), `feedQuery` (the query and the list key both sides build), `ListingFeed` and `useCursorFeed` (the cursor list WP-29 reuses), the card (`ListingCard`, `PhotoStrip`, `Photo`, `FavButton`, `CardAge` with `minuteClock`, the age that follows the minute since WP-35, `ListingCardSkeleton`, `FeedSkeleton`), `FeedHeader` (the chips of the top bar), `FewResultsNote`, `FeedEmpty`, the pure rules `cardText`, `verdict`, `badges`, `images`, `fewResults`, `inlineSlot`, and `types.ts` (`ListingPreview`, the generated card type) |
| `features/filters/` | The filter sheets (WP-25): `FiltersForm` (the full sheet in the three modes WP-30 reuses; owns its `RouteSheet`, the draft, the nested `pick=city` picker and the sheet's `ToastHost`) with `FiltersFooter`, `QuickFilterForm`, `SortList`, `RoomsPicker` and the seventeen stateless `sections/` (visibility only from `sectionsFor`); `useDraft`, `useLiveStats`, `flow.ts` with `normalizeFlow` (the one validator of a flow answer, server-safe since WP-30; `useLiveStats` re-exports it), `applyFilters` with `onFiltersApplied` (the one apply; WP-28 and WP-30 listen), `newFeatures` (the «Новое» pill); the `…SheetRoute` client glue, the only files here that read `devFlags`, and the server `QuickFilterPage` (`notFound()` for an unknown kind) |
| `features/map/` | The search map (WP-27, WP-28): `MapScreen` (the session's engine — `useEngine`, a spinner, the lazy GL or Leaflet view, Leaflet's failure pill and retry; the points of its own search through `useMapPoints`; the selection and its close rules, the pills, the note, locate, the attribution; drawing as the `draw=1` layer, the draw request, the finished stroke through `applyFilters`), `engine.ts` (the engine rule, `markGlFailed`, `warmMap` of either engine), `MapSelectionCard` with `useCardLayer` (DEV-013), `MapWarmup` (the code warm-up and tile prefetch on the list), the pure `pins`, `camera`, `mask`, `tiles`, `palette`, `tilePrefetch` (one session cap for the list's and Leaflet's prefetch), `useBasemap` (the basemap rule and the session's vector failure, both engines), `markerElements.ts` (the markers' DOM for both engines, text only, LB-APP-020), `map.css` (the markers and the Leaflet icon box); `gl/`: `MapViewGL` (the `next/dynamic` target), `library.ts` (`maplibre-gl`, `pmtiles`, the worker URL), `useMapInstance` (the map, its failures, the camera), `style.ts` (the style builder, rebuilt with a diff), `fonts.ts`, `useClusterIndex` / `useClusterMarkers`, `GlLasso`; `leaflet/`: `MapViewLeaflet` (the `next/dynamic` target), `library.ts` (`leaflet`, `leaflet.markercluster`, `protomaps-leaflet` in order, for the global `L`), `useLeafletMap` with `useLeafletCamera`, `listingLayer` and `useSpiderfy` (clusters, stacks, LB-APP-013), `icons.ts`, `basemap.ts` (raster, vector, the in-map prefetch), `basemapRules.ts`, `useDeferredBasemap`, `useLeafletMask`, `useMyLocation`, `lassoHandlers.ts`; `lasso/`: `polygon.ts` (the pure stroke → polygon rules) and `LassoOverlay` |
| `features/saved/` | The saved tab (WP-29): `server.tsx` (`readSaved`, page one with the cookie and a `renderId` per server render; `FavoritesServer`, `HistoryServer`), `useSavedList` (the list key `savedListKey` of `listKey.ts`: a new render re-creates the list, history's return after the launch opened a listing, pulls, the top and a lost focus on a new key), `FavoritesScreen` and `HistoryScreen` over WP-24's `ListingFeed`, `ClearHistoryButton` («Очистить» with its confirm) |
| `features/listing/` | The listing screen (WP-26): `ListingLayer` (the one owner of the layer in both trees: the number from its own `params`, the key by number and opening, focus, `listing-open`, the swipe gate, the standalone copy's latch over its child routes), `ListingServer` (the read with the cookie, `notFound()` for a bad number), `ListingScreen` (the fallback and the resolved instance, every state of SCR-019, one body for the preview and the details) with `useListing` / `useListingRecord` and `listingData`; the hero, the title row and the key facts; the `sections/`; `cta/` (`useContact`, `useListingContact` — every contact tap — and the CTA bar), `translation/`, `share/`; the child routes, client-only and portalled: `viewer/` (`PhotoViewerRoute`, `PhotoViewer`, `ZoomableImage`, `gestures`), `market/` (`MarketSheet`, `marketText`), `spot/` (WP-28: `SpotMap` — the mini map — `SpotMapRoute` and `SpotMapFullscreen` at `/listing/[number]/location`, `useSpotMap` — the one owner of the container, LB-APP-001 — `spotGeometry`, and the lazy `spotGL` / `spotLeaflet` chunks) and `actions/` (`ListingActionsRoute` with the sheet's flags and step opening, `ListingActionsSheet` with its own toast host, `useListingActions`); `closeListing` (`closeActions` over `backBy`; since WP-36 the leave's constants, `leaveListingRoute` and `closeListing(step, close)`, which ends in the layer's one close), `openOriginal`, `viewState` |
| `features/radars/` | The radars (WP-30): `capability.ts` (`radarsReady`, now `true`, and `useRadarsEnabled`, the one switch of DEC-51), `useRadarsOffRedirect` (the four sheet addresses give way to the tab while radars are off); the data — `normalize.ts` (total and server-safe), `useRadars` (the plain list of the search tab and the tab's list with previews, both through `/bff`; `fetchRadarList`, `putRadar`, `dropRadar`, `refreshRadars`), `match.ts` (`useHasActiveRadar`, `hasRadarFor`, `hasSameRadar`), `useRadarPreviews`, `radarStatus`; the subscribe flow — `subscribe.ts` (the pure `runSubscribe` / `runSaveEdit` / `runRelax` and `useSubscribe()`, which presents the outcome and answers `{ ok }`) with `toasts.ts`; `server.tsx` (`readRadarTab` at request time, the cookie first, with its `renderId`; `RadarTabServer`, `RadarSheetServer`); the tab (`RadarScreen`, `RadarTiles` with `useRadarSwitch`, `RadarEmptyState`, `RadarSoonState`, `RadarSweep`); the sheet (`RadarSheetRoute` — both copies only on the radar's own address, the standalone one yields to a shown `@sheet` copy — `RadarSheet`, `RadarStrip`, `radarReturn`); `RadarCreateSheet` and `RadarEditSheet` over `FiltersForm` (`useSheetRequest`: no close after the user left), `FoundSheet` |
| `features/nudges/` | The offers of a radar on the search tab (WP-30): `NudgeHost` (mounted by `AppShell`, z 35; one slot, return banner > follow nudge > home offer, and the polite live line) over `store.ts` (the slot, `followPending`, `returnPending`; the API of WP-31's home offer), `storage.ts` (`homi-nudge`), `constants.ts`; the follow nudge (`followRules.ts`, `useFollowNudge`, `FollowNudge`), the search visits (`visits.ts`, `homi-visits`), the return banner (`returnRules.ts`, `useReturnNudge`, `ReturnNudge`), the radar card in the list (`feedRadar.ts`, `FeedRadarCard` with `useFeedRadar`, in `ListingFeed`'s inline slot) and `shown.ts` (marked on the first render, LB-APP-050). The rules files are not `followNudge.ts` / `returnNudge.ts`: on macOS those names collide with the components |
| `features/settings/` | `useSettings` (`GET /settings` through `/bff`) and `format.ts` (`digestHours`, `formatDigestHours`) since WP-30, for the radar sheet's digest hint; WP-31 extends both |
| `features/gates/` | `resolveGate` (the gate table), `gateState` (return address, picks, `isGatePending()`), `GateRedirector` (every navigation into and out of a gate; runs `useBootRetry`), `bootRetryStore` (`useBootRetryState()`, `retryBoot()`), `GateWait`, `OutsideScreen`, `NoAccessScreen` with `accessReason.ts` (which rows it shows), `LanguagePicker`, `WelcomeCity`, `SessionExpired` / `SessionExpiredScreen`, `CrashScreen`, `useRenderReport` |
| `features/city/` | `CityList` (rows with counts, the locate row with its own 12 s limit) and `nearestCity` (a town within 16 km, then a region within 110 km, then a town within 110 km); `/welcome/city` uses them; WP-25's `CityPickerSheet` (the `/city` sheet and the nested `pick=city` layer of the filters), `CitySheetRoute` and `useCityPick` / `useSaveCity` (what a pick does: `pickCity`, the sort fallback, `homi-city`, `PATCH /settings`, `patchMe`) |
| `i18n/` | next-intl: `routing.ts`, `request.ts` (locale from `next/root-params`), `navigation.ts` (`Link`, `useRouter` — both counted in the history stack, `usePathname`, `redirect`), `IntlClientProvider.tsx`, `labels.ts` |
| `lib/telegram/` | The only way to Telegram (`tg`); `sdk.ts` alone reads `window.Telegram`. Version gates, the SDK wait, init, theme, links, calls, sharing, location, home screen, DeviceStorage; `chatAccess.ts` (`isNoChat`, `withChatAccess`: write access for HOMI's bot after a `409 no_chat`, else the restart question, WP-30) |
| `lib/session/` | The bootstrap of a launch, `SessionProvider` / `useSession()`, `reauthenticate()`, the in-memory token of header mode, `LocaleGuard`, server-only `getSessionToken()` |
| `lib/navigation/` | `routes.ts` (the only place an address is spelled; `matchRoute` and `searchKeysOf` read one; the reserved `entry` and `trigger` of the radar sheets), `nav`, the history stack, `useBack`, `useCloseOnce`, `closeThen`, `useLayerState`, `address.ts` (`currentAddress()`: a sheet that closes when a request answers checks that the user is still on it), `backHandler.ts` (`takeOverBack`: a layer that closes in its own way takes Telegram's Back, WP-36) |
| `lib/deeplinks/` | `parseLaunch` (start_param, `?listing=`, `?news=`, `?map=`, `?mapdebug`), `launchMapOptions()` (the launch's map options, WP-27), the link builders, the launch gate, `launchTarget` and `launchPending()` (the city gate waits for the launch target) |
| `lib/storage.ts`, `lib/graphics.ts`, `lib/device.ts` | The client storage keys with their policy (DeviceStorage-mirrored, local, or `session` in `sessionStorage` since WP-36); lite graphics; the device rule of lite graphics, which a Server Component can import (`graphics.ts` re-exports it) |
| `lib/security/csp.ts` | The nonce CSP of `proxy.ts` (ADR-0020) and the MapLibre worker's own policy (WP-27) |
| `lib/brand/` | HOMI's name, bot, links and artwork paths; the only place a brand word may appear |
| `lib/flags.ts` | `devFlags`: the 17 `DEV` switches, all off |
| `lib/analytics/events.ts`, `lib/errors/report.ts` | `track` and `reportError` facades (no-ops until WP-32) |
| `lib/analytics/firstContent.ts` | `markFirstContent()`, called by the first card photo that loads, and `firstContentShown()`, which resolves once; WP-32 hangs the analytics loader on it (WP-24) |
| `lib/api/` | `server.ts` (server-only: one typed function per `/api/v1` method, `serverApi()` with the session, `publicApi()` without), `browser.ts` (`bffFetch`), `errors.ts` (`UiError`, the mapping table), `scenario.ts` (stub scenarios outside production), `bffAllowList.ts` |
| `lib/actions/` | `runAction` (the one shape of a Server Action), `validate.ts`, `useAction`; `settings.ts` (`updateSettings`, the first `'use server'` file, WP-23), `favorites.ts` (`setFavorite`, WP-24); `listing.ts` (`getContact`, `translate`, `prepareShare`), `hidden.ts` (hide, block and their undo) and `reports.ts` (`reportListing`) since WP-26; `history.ts` (`clearHistory`) since WP-29; `radars.ts` (`createRadar`, `replaceRadar`, `patchRadar`, `deleteRadar`, `relaxRadar`) and `surveys.ts` (`sendFound`, `sendFoundWhere`) since WP-30, with `invokeAction`, the form of `useAction` for code outside a component; the other actions arrive with the packages that need them (WP-22 "Server Actions") |
| `lib/ui/` | `toast.ts` (one toast per scope, 4 s, 6 s with an action), `feedback.ts` (`failed()`, `saved()`), `confirm.ts` (`confirmText`), `shellState.ts` (the launch's memory: the last search and saved addresses of the tabs, the pull handlers, the drawing request; the bottom marks — toggle, sub-page, CTA bar — that place the app's toast, WP-34) |
| `lib/data/` | `useResource` (the small client data hook; `readResource`, and since WP-30 `seedResource` drops a read in flight and `invalidate` keeps an entry with data but no user as stale), `sessionMaps` (favourites, seen and hidden of this launch), `sources.ts` (which drivers answered the current screen; drives the "demo data" marker), `previewCache` (the last 200 cards opened, for WP-26) |
| `lib/reference/` | The cached reference data (`getReference`, `getCities`), `ReferenceFeed` → `ReferenceProvider`, `useReference()`, `useCityStats()`, `useCitiesStats()` |
| `lib/search/` | `useSearchState`, `useScreenSearchState` (the search of a screen's own address, held under a layer or another tab, KI-43), `readSearchState`, `addressCity`, `searchStateFromHref`, `searchRules` over `@homi/search` |
| `lib/money/useMoney.ts` | `createMoney` of `@homi/i18n/format` bound to the profile's currency and the reference rate |
| `lib/phone/masked.ts` | `splitMaskedPhones` (WP-26): a text cut into plain parts and the masked numbers of the API's `PhoneMasker` (`+998 ** *** ** NN`, `+** *** ** NN`) with their last two digits; found by the masked form only, so a raw number never becomes a control |
| `proxy.ts` | Locale redirect (cookie `NEXT_LOCALE`, else `ru`), then the CSP with a fresh nonce and the security headers; `/maplibre/` gets the worker's policy instead |
| `styles/app.css`, `styles/shell.css`, `styles/motion.css` | Tailwind and `@homi/ui/styles.css` (tokens, themes, lite, motion), then the app's own motion of WP-39 (`motion.css`: the favourite's heart and burst, the countdown ring of an action toast) and the shell's own rules: the tab bar and its lens, the collapsed chrome (`html.chrome-mini`) of the tab bar, top bar, mini title and view toggle, their lite form, long tab labels; then `features/map/map.css`, the map's markers (WP-27) and the Leaflet icon box, font and dark raster (WP-28) |
| `public/brand/` | Placeholder artwork of the legacy sizes; the final files replace them without a code change |
| `public/map-fonts/`, `scripts/copy-maplibre-worker.mjs` | The 12 Noto Sans subsets of the vector basemap's labels with `OFL.txt` (WP-27); the script copies MapLibre's worker and its shared module into `public/maplibre/<version>/` (git-ignored) before `dev` and `build` |
| `tests/`, `e2e/` | Vitest (`pnpm --filter app test`) and Playwright (`pnpm test:e2e` from `frontend/`); `shell.spec.ts`, `gates.spec.ts` and `crash.spec.ts` since WP-23, `feed.spec.ts` since WP-24 (the stub photos answered by `stubMedia` of `@homi/testing/playwright`), `listing-open`, `listing-contact`, `listing-actions` and `photo-viewer.spec.ts` since WP-26, `map.spec.ts` since WP-27 (`data.spec.ts` checks the WP-22 data layer through the map and the feed), `radars`, `radar-subscribe`, `radar-forms`, `follow-nudge`, `return-nudge`, `feed-radar` and `radars-soon.spec.ts` since WP-30 (`radars-soon` is tagged `@radars-off` and runs only with `E2E_RADARS_OFF=1`, against an API with radars switched off) |

Catalogues live in `@homi/i18n` (`frontend/packages/i18n`): the generated `legacy` layer, the hand-written `homi`
layer, and the runtime rules — a missing key renders its path and is reported once, never a throw.

## Rendering and session

- Every document renders at request time so that its scripts carry the CSP nonce (ADR-0020): the root layout reads
  `x-nonce` and exports `instant = false`. An unknown address shows the not-found screen with `noindex` and status
  `200`; `notFound()` is thrown under `<Suspense>`, or Next.js serves a shell without the boot script (AM-59).
- A launch: the SDK wait (3 s at most), the DeviceStorage restore, `ready`/`expand`, the fragment scrub, then a
  valid cookie of the same Telegram user or one sign-in through `/bff/session`. After a sign-in of the launch
  (`useSession().renewed`) cookie mode refreshes the router once, so Server Components render with the new cookie; a
  launch that confirmed the document's cookie does not. Header mode keeps the token in memory only.
  `html[data-session]` mirrors the status (`booting`, `ready`, `outside`, `denied`, `expired`).
- The app server calls the API at `API_URL` (server-only), else `NEXT_PUBLIC_API_URL`.

## Data

- A screen reads on the server with `serverApi()` inside `<Suspense>` and hands the answer to the client as
  `initial` of `useResource` (of `useCursorFeed` for a listing list); without a cookie (header mode) the same read goes
  through `bffFetch` and `/bff/*`. The client adopts `initial` only for the key it was read for, so both sides build
  the key from the same pure module (`features/feed/feedQuery.ts` for the feed), and the hydration render must list
  what the server rendered: the saved city is read through `useSyncExternalStore` (none at hydration), and the feed
  gets the profile city the server read (`profileCity`). A listing list drops a page one adopted before `ready` when
  the launch signed in (`renewed`): it was read with another cookie.
  Every call returns `ApiResult` and never throws for an answer; screens decide by `UiError`.
- Mutations are Server Actions built on `runAction`, called through `useAction` (the header-mode token travels in
  the action's body). Nothing per-user is cached; only `lib/reference` is (`'use cache'`, ten minutes, per locale).
- The search state lives in the address: `useSearchState()` reads and writes the 25 keys and `sort` of
  `@homi/search`, and never touches a reserved parameter.
- Outside production the cookie `homi_stub_scenario` becomes the API's `X-Stub-Scenario`, so a test reaches the
  error and empty states of a server-rendered page.

## Shell and gates

- `AppShell` (`(main)/layout.tsx`) draws the chrome of the address's variant (`shellVariantOf`: `search-list`,
  `map`, `map-drawing`, `saved`, `radars`, `settings`, `none`); a sheet or the listing reached by a soft navigation
  keeps the chrome of the page below.
- `GateRedirector` asks `resolveGate` where the address must be on every change of the session, `me`, the reference
  data or the address, and makes the one navigation into or out of a gate: a replace in the target's locale, then
  `resetDepth`, so BackButton stays hidden. The pickers never navigate: they save, mark `gateState` and patch `me`.
  The launch redirect waits while the language gate is pending or a gate page is shown; the city gate waits for
  `launchPending()`.
- A failed sign-in is retried after 1, 3, 7, 15 and 30 s, and `ErrorState` with «Повторить» shows after the sixth
  failure; a refusal is re-checked three times 2.5 s apart, never for `blocked`; a return to the app retries at once.
- Toasts, haptic feedback and confirmations go through `lib/ui`; the root layout's `ToastHost` shows the `app` scope.

## Commands

```bash
pnpm --filter app dev       # http://localhost:3001, or https://app.homi.loc through the local stack
pnpm --filter app build
pnpm --filter app test      # Vitest project "app"
pnpm --filter app lint
pnpm --filter app typecheck # next typegen && tsc --noEmit
```

On a developer machine the app server reaches `https://api.homi.loc` only if Node trusts the mkcert root: start it
with `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"`; `pnpm test:e2e` does this by itself. In a desktop browser
the emulator offers the launch data of your own dev bot or a fake user for the stub sign-in.

Rules for later packages: every address is built with `routes.*` and navigated with `@/i18n/navigation` or `nav`;
nothing touches `window.Telegram` outside `lib/telegram/sdk.ts`; client storage goes through `lib/storage.ts`;
colours, radii and motion come from the tokens of `@homi/ui` (Tailwind's default palette is removed); a server value
becomes a label through `labelFor` of `@/i18n/labels`; workspace packages never import `lib/flags.ts`; while the
`--spacing` question of AM-62 is open, sizes are the legacy pixels spelled out (`h-[44px]`), not rem utilities, which
the 15 px root font makes 6.25 % small (the primitives and the city page still use rem classes); a screen that
replaces the route moves the focus to its heading or its one action (AM-60).
