# WP-23 — Gates and shell

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #68 on 2026-11-16; production track: the regular deploy; then the manual checks inside Telegram on staging) |
| Depends on | WP-22 |
| Size | ≈ 3 000 changed lines, L — the largest package of stage B; the steps are grouped in four parts (A–D) and each part ends in a mergeable state, so the package can change hands midway |
| Behaviour reference | `03` §1.2 (back, gestures, collapsing chrome), §1.4 (render gating), §1.6 (error layers), §2 screens SCR-002 … SCR-006, SCR-010, SCR-042, SCR-043, SCR-045, §3.4 (constants), §3.6 (z-index, safe areas); `05` TMA-011, TMA-013, TMA-022, TMA-025, TMA-026, TMA-035, TMA-039, TMA-040; task files KV-FE-012, KV-FE-013, KV-FE-014, KV-FE-031 (nearest city), KV-FE-036, KV-FE-040, KV-FE-041, KV-FE-042, KV-FE-043, KV-FE-044, KV-FE-045, KV-FE-046 — behaviour, texts, edge cases and test ideas only; their file layout, layer stack, API paths and transport are not taken |
| Needs from the production track | Nothing beyond the regular deploy. The access gate runs in mode "open" (DEC-43), so the no-access screen cannot be reached on staging or production; it is accepted on stubs and in the end-to-end suite |

## Goal

After this package the Mini App has its frame and every state a user can meet before the first listing: the four
gates as routes (outside Telegram, no access, first-launch language, first-launch city), the session-expired and
crash screens, the app shell with top bar, tab bar, list/map toggle and collapsing chrome, pull-to-refresh, the
toast and confirm helpers, and the sheet and sub-page primitives with the legacy gestures that every later package
builds on. Every route under `(main)` still shows its WP-20 placeholder inside the real shell.

## Scope

**In.**

- Gates: `/outside` (SCR-002), `/no-access` (SCR-003), `/welcome/language` (SCR-004), `/welcome/city` (SCR-005),
  the `GateRedirector` that chooses between them, the retry timers of the sign-in and of the access gate
  (`useBootRetry`), the quiet wait of a gate page (`GateWait`), and the shared `CityList` with the nearest-city
  search.
- Shell (SCR-006): `AppShell`, `TopBar` with all its variants, `TabBar`, `ViewToggle`, `MiniTitle`,
  `useMiniChrome`, the two slot hosts, and the "last search address" memory that keeps filters across tabs.
- Pull-to-refresh (SCR-010), toast (SCR-042), confirm helper (SCR-043), crash screen (SCR-045),
  `[locale]/error.tsx`, `app/global-error.tsx`, `[locale]/not-found.tsx`, the session-expired screen.
- Primitives in `@homi/ui`: `BottomSheet` + `useSheetDrag` + `useSheetChrome`, `useBodyClass`, `SubPageFrame` +
  `useSwipeBack`, `Chip` (`HeaderChip`, `FilterChip`), `SegmentedControl`, `ChoiceList`, `ErrorState`,
  `EmptyState`, `RadarIcon` and the lucide icons the apps use, re-exported (`icons/index.ts`).
- App wrappers in `features/shell/`: `RouteSheet`, `RouteOverlay`, `SubPage`, `ToastHost`, `PullToRefresh`;
  `lib/ui/toast.ts`, `lib/ui/feedback.ts`, `lib/ui/confirm.ts`.
- The first Server Action over `PATCH /settings` (`locale`, `city`).
- The dev gallery `/dev/ui` that shows the primitives and the wrappers on a device and in the end-to-end suite.

**Out.**

- Boot-failure screen, Telegram adapter, session bootstrap, BackButton and SettingsButton wiring, deep-link
  parsing, location service — WP-21. This package consumes them and changes them only where a gate needs it: the
  session's `pending` and the re-check of a refusal, the locale guard on gate routes, `launchPending()`, the
  SettingsButton rule, the campaign code of the launch parser and the language of the update screen (see Files).
- Feed header chips and lists — WP-24. Filters, sort and city sheets — WP-25 (it wraps `CityList` in a sheet).
- Map view, lasso and the "area too small" signal — WP-27, WP-28 (the top-bar variants for them are built here).
- Radar «+» target, settings pages — WP-30, WP-31. Nudges — WP-30, WP-31.
- Screen tracking and the transport of `reportError` — WP-32.
- The settings language page and the reload removal for currency (LB-APP-041) — WP-31; the first-launch picker
  here already works without a reload.

## Decisions that bind this package

| Topic | Source | Consequence here |
| ----- | ------ | ---------------- |
| Routes | DEC-44, 25 §3.2 | The four gates are routes; boot failure, toast, confirms and the crash screen are not. Sheets and overlays are intercepting routes in the `@sheet` and `@overlay` slots; the shell only renders the slots |
| Session | DEC-44, 25 §3.4 | A launch starts without a session: the shell renders skeletons while `useSession().status` is `booting`; one screen implementation serves cookie mode and header mode |
| Interface | DEC-44, 25 §3.6 | Primitives are shadcn/ui and Radix components from WP-20, restyled; the sheet drag with velocity, swipe back and the collapsing header are written on top of them, not replaced by other behaviour |
| Defects and flags | DEC-36, DEC-58 | LB-APP-027 and LB-APP-035 are `DEV` rows (DEV-016, DEV-023): both branches are written and tested. `dev023CityCountsIncludeDaily` stays off. `dev016ErrorToastOnFailure` is on by default since the intake of `index-CIa0Ldj2.js` (DEC-58: legacy shows the failure toast itself since that release) and gates the failure toast only; the success confirmation of destructive actions moves to `dev016SuccessToastOnDestructive`, off (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `lib/flags.ts` and `failed()` for a later package (`wave-1/baseline.md`, built code behind the pin, row 21)) |
| Brand | DEC-40, 25 §2 rule 5 | The bot name and links come from `lib/brand`; no brand word is written in a component |
| Access | DEC-43, DEC-60 | The gate is built for all five reasons although the mode is "open", and for a sixth, `paused`, since the intake of `index-CIa0Ldj2.js` (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `accessReason` and the session types for a later package (`wave-1/baseline.md`, built code behind the pin, row 28)) |
| Acceptance | DEC-46, 25 §9 | The acceptance checklist below is ticked in ru / uz / en and light / dark |
| Baseline | 25 §8, `wave-1/baseline.md` | The texts below are those of the pinned release `index-DY_DH7h-.js`. Its predecessor `index-Dbpp463V.js` removed the beta from two no-access texts (`noAccess.title.invite`, `noAccess.text.full`; SCR-003, API-001); the reason codes and the gate logic did not change. Since `index-CBlEKxdL.js`: the `private` no-access text names the team; the toast can be dragged down and its offset depends on what is below it; swipe-back gained an edge-only zone and a nested-sub-page rule for the owner cabinet (*added by the intake of `index-CBlEKxdL.js`*). Since `index-CIa0Ldj2.js`: the fresh pill and the feed's scroll memory; `paused`; the SEO source with the language; the inline save error of the language picker; a close control without the SDK; the collapsed title of daily rent; failure toasts (*added by the intake of `index-CIa0Ldj2.js`*) |

## Design

### Documents to read first

In `frontend/app/node_modules/next/dist/docs/01-app/`:
`03-api-reference/03-file-conventions/{parallel-routes,default,error,not-found,loading}.md`,
`03-api-reference/04-functions/{use-router,use-search-params}.md`, `02-guides/streaming.md` (section "Push dynamic
access down"), `02-guides/preserving-ui-state.md` (routes are hidden, not unmounted, when `cacheComponents` is on),
`02-guides/server-actions.md`. Facts used from them:

- `error.tsx` must be a Client Component, receives `error` and a retry function, and does not wrap the layout of
  its own segment; errors of the root layout need `app/global-error.tsx`, which renders its own `<html>` and
  `<body>` and gets no global styles (`error.md`). The retry prop is `retry`: the version table of `error.md`
  says it became stable in 16.3.0 (`unstable_retry` was its 16.2 name) and the app runs 16.4.5; `reset` clears
  the boundary without fetching again.
- A hidden route keeps its state and its effects are cleaned up while it is hidden (`preserving-ui-state.md`):
  every listener of this package (scroll, touch, timers) is attached in an effect and removed in its cleanup.
- A Client Component that calls `useSearchParams` in a prerendered route needs a `<Suspense>` boundary
  (`use-search-params.md`): `AppShell` and `GateRedirector` read the address inside one.
- `router.push` / `router.replace` take `{ scroll: false }` (`use-router.md`).
- Next.js 16.4 moves no focus on a navigation, and its route announcer speaks only when `document.title` changes
  (`next/dist/client/components/layout-router.js`, `app-router-announcer.js`); the title is the constant brand name,
  so the gate pages and the full-screen replacements move the focus themselves.
- `notFound()` called after streaming has started keeps the status `200` and renders the not-found UI in the
  response, with a `noindex` tag (`04-functions/not-found.md`, `03-file-conventions/not-found.md`). Thrown with no
  `<Suspense>` boundary above the page, the 16.4.5 build sends its `__next_error__` shell instead (seen on a
  production build), which the client renders without the root layout's head scripts.

### Gates

`features/gates/resolveGate.ts` is a pure function; `GateRedirector` (Client Component mounted in
`[locale]/layout.tsx` inside `<Suspense>`, after `LocaleGuard` and before `LaunchRedirector`, so its replace is
issued last and it reads `launchPending()` before the launch is consumed) calls it on every change of session, `me`,
reference data or address. It owns every navigation into and out of a gate route (D-S-6): `router.replace` of
`@/i18n/navigation` with the target's locale (`nav.replace` cannot switch the locale), then `resetDepth()`, so
BackButton stays hidden on a gate. A target is issued once per address it was issued from. Like `LocaleGuard` it
waits until the launch is prepared, and `LocaleGuard` (WP-21) now returns early on a gate route, so a pick
navigates once.

| Order | Condition | Result |
| ----- | --------- | ------ |
| 1 | `status = 'booting'` | no redirect; the current route renders its loading state |
| 2 | `status = 'outside'` | `routes.outside()` in the address's locale |
| 3 | `status = 'expired'` | `SessionExpiredScreen` rendered in place of the route by `SessionExpired` (not a route) |
| 4 | `status = 'denied'` | `routes.noAccess(reason)`, in the locale of the full Telegram language mapping, `detectLocale(tg.languageCode(), { oneDetector: true })` (D-S-5) |
| 5 | `ready`, the user has no chosen locale and none was picked in this launch | `routes.welcomeLanguage()` |
| 6 | `ready`, more than one city, `me` says the city is not chosen, none picked in this launch, address is not a listing, no launch target still to open (`launchPending()`) | `routes.welcomeCity()` |
| 7 | `ready` and the address is a gate route | the remembered return address, else `routes.feed()` |

- Rows 5, 6 and 7 navigate in `me.locale` (else the address's locale), the locale guard's rule while ready. A row
  whose target is the address already shown (same gate, same locale; for row 4 the same reason) stays.
- `features/gates/gateState.ts` (module memory, this launch only, written only from effects and handlers):
  `returnTo` (the address the first gate was entered from, without the locale and with its whole query; the city
  pick replaces it with the feed of the picked city), `localePicked`, `cityPicked`, `onGate` (a gate page is on
  screen, written by `GateRedirector`), and `isGatePending()` — true while the ready session still needs a locale
  (row 5) or while any gate page is shown. The launch redirect of WP-21 (listing deep link, `?news=`) pushes over
  whatever address it finds (over `/no-access` after a late grant, over `/welcome/city`), so it waits:
  `GateRedirector` registers `setLaunchGate(() => !isGatePending())` (`lib/deeplinks/launch.ts`) when it mounts
  and calls `releaseLaunchGate()` once the address is back in the app. The city choice does not hold the redirect
  back (BR-APP-055): row 6 waits for `launchPending()` instead.
- `launchPending()` (new in `lib/deeplinks/launch.ts`, D-S-8): before `consumeLaunch()` it reads the query captured
  when the module loads (a gate route has none) plus `start_param`; after it, it stays true until the address has
  shown the target's path, and the first read that sees the target forgets it, so Back never makes it pending
  again. The target is `launchTarget(launch)` (a listing, or the filters sheet for `?news=pets`), the one rule
  `LaunchRedirector` now reads too. `history.length` is not used: Chromium caps it at 50, and in Telegram Web the
  Mini App is an iframe that shares the tab's history.
- Rows 5 and 6 read the flags of `me` per the WP-11 contract (legacy `locale_chosen`, `city_chosen`); row 6 fires
  only on a strict "not chosen" (Q-APP-013). With one city, or a failed reference (`cities = []`), the city gate is
  skipped for that launch (D-S-12).
- Gate routes have no parent: `parentOf()` already returns `null` for `/welcome/*`, `/no-access` and `/outside`, so
  `routes.ts` keeps that rule. `TelegramButtons` of WP-21 also hides BackButton while `status = 'expired'`, and now
  shows SettingsButton only while the session is `ready` and the address is not a gate, where settings would bounce
  straight back (D-S-15).
- `features/gates/useBootRetry.ts` owns the timers of BR-APP-054 and calls `retry()` of the session bootstrap. Its
  one instance runs in `GateRedirector` and publishes the outcome through `features/gates/bootRetryStore.ts`
  (`useBootRetryState()`: `failed`, `kind`, `checking`, `retry`), the one place `AppShell` and the gate pages read it
  from, without importing the session or `tg`. It reads from `useSession()` the outcome of the last attempt,
  `error: SessionError | null` (D-S-1: `offline` and `timeout` give the `offline` kind, `server` and `rate_limited`
  the `server` kind), and `pending: boolean`, an attempt in flight, which this PR adds to `lib/session/bootstrap.ts`
  and `SessionProvider.tsx`. `bootstrap.ts` also changes (D-S-2): `retry()` runs from `denied` too (the re-check)
  and returns the attempt in flight instead of starting a second one; a re-check keeps `status: 'denied'` and its
  `reason` while pending, and one that cannot reach the API leaves `denied` with the old reason and `error: null`, so
  it is never taken for a boot failure; a late SDK that brings launch data while `outside` starts the session
  (SCR-002).

### Shell

`app/[locale]/(main)/layout.tsx` (Server Component, reads nothing per request) renders
`<AppShell sheet={sheet} overlay={overlay}>{children}</AppShell>`. `AppShell` is a Client Component:

```text
MiniTitle            search list only
TopBar               the drawn variant (a --top-inset spacer for `none`)
{children}           the page; ErrorState in its place after the sixth failed sign-in
ViewToggle           / and /map, hidden while drawing
PullToRefresh        indicator
TabBar               wherever the variant has a tab
{overlay}            @overlay slot (below sheets)
{sheet}              @sheet slot
```

The chrome (top and bottom parts) reads the address inside `<Suspense>`; the page and the slots stay outside it.
Nothing that wraps the page or the slots carries a transform, a filter or a z-index, because the in-place standalone
sheet and the sub-page are `position: fixed` inside them.

- `features/shell/shellVariant.ts`: `shellVariantOf(pathname, searchParams)` → `search-list` (`/`, and `/filters…`,
  `/sort`, `/city` without `from=map`), `map` (`/map`, and the search sheets with `from=map`), `map-drawing` (`/map`
  with `draw=1`), `saved`, `radars`, `settings`, `none` (a listing loaded directly: it is the page; also the gates,
  `/dev/ui` and unknown addresses, whose not-found screen has its own «К поиску»). That is the variant of an
  address on its own, i.e. of a direct load. A listing or a sheet opened over a page keeps that page's chrome: an
  address that `@sheet` / `@overlay` intercept (`isLayerAddress`: `/filters…`, `/sort`, `/city`, `/listing/…` with
  its children, `/radars/new`, `/radars/found`, `/radars/<id>[/edit]`) reached by a soft navigation keeps the
  variant the shell drew before it (`useDrawnVariant` in `AppShell`), so the page below keeps its top bar, tab bar,
  toggle and spacers, its height and its scroll position; the listing covers it, z 45 over 30, and WP-26's swipe
  back uncovers a whole page. `/radars/new?entry=feed` (WP-30) keeps the feed's chrome under its backdrop. The
  active tab follows the variant (`activeTabOf`). Both read the address through `matchRoute(pathname)` (type
  `RouteMatch`, the existing parser of `lib/navigation/routes.ts`, now exported; the gate match carries its name,
  `{ route: 'gate'; gate: GateName }`) and `searchKeysOf(searchParams)`, also exported (D-S-9).
- `lib/ui/shellState.ts` (module store): `lastSearchHref()`, `lastSavedHref()` (written by `AppShell` through
  `rememberHref(pathname, search)` whenever the address is a search or saved root; a search root is kept with its
  search keys only — the filter keys and `sort`, `searchKeysOf` — so `draw`, `pin`, `from`, `listing` and `utm_*`
  are dropped and a tab press never reopens a layer), `lastSearchQuery()` (the query for `routes.radarNew(q)`,
  D-SH-4), `areaTooSmall()` / `setAreaTooSmall()` / `useAreaTooSmall()` (written by WP-28),
  `registerRefresh(pathname, handler)` / `refreshHandlerFor()` / `useRefreshHandler(pathname)` (pull-to-refresh; a
  late registration attaches the listeners), and the one-shot draw request `requestDraw()` / `consumeDrawRequest()`
  (set by the filters sheet of WP-25, consumed by the map of WP-28, which then opens drawing as a pushed `draw=1`
  layer so Back can cancel it). Legacy keeps filters, sort and the list/map choice in memory across tabs; here the
  search tab returns to `lastSearchHref()`, and the radar «+» passes `lastSearchQuery()` to `routes.radarNew(q)`.
- `TopBar` holds no data: it reads `useSearchState()` (WP-22) for the deal, polygon and active-filter count and
  calls `switchDeal`, `normalizeSort`, `countActiveFilters` of `@homi/search`. The deal switch writes filters and
  sort in one replace through `write(filters, sort)`, which this PR adds to `useSearchState()` (D-SH-2). The mini
  title's summary function is chosen in one place, `miniTitleSummary` in `MiniTitle.tsx` (`filtersSummary`, D-SH-3;
  DEC-66 amends D-SH-3 for daily rent: the summary alone, "Shell (SCR-006)" below).
- The search-list variant has a `chips` region that renders nothing here; WP-24 mounts `FeedHeader` in it.
- `RouteSheet`, `RouteOverlay` and `SubPage` are wrappers that later route files use around their content; they
  connect the `@homi/ui` primitives to `useBack()`, `tg.haptic` and the platform check of WP-21.
- `RouteSheet` takes `presentation: 'layer' | 'standalone'` and passes `title`, `variant`, `header`, `footer`,
  `closeLabel` and `dismissible` to `BottomSheet`. `layer` (default) is the sheet in the `@sheet` slot, portalled:
  backdrop, drag-to-close (with a light impact), ×, Escape and Back all call `back()`, once per address. `standalone`
  is the same content on a direct load of a sheet address (`/filters`, `/filters/<kind>`, `/sort`, `/city`, the
  radar sheets), rendered in place, so the server HTML holds it: there is no page below, so the backdrop is drawn but
  ignores taps and there is no drag-to-close; ×, Escape and Back go to `parentOf(pathname, searchParams)` of WP-20,
  which keeps the search state and returns `/map` when `from=map`, else `/` (a non-dismissible sheet ignores
  Escape). When a drag has slid the sheet out and `back()` leaves the same copy mounted at a new address (a layer
  parameter closed: `pick=city` of WP-25, `step=detail` of WP-26), the sheet is mounted anew and rises again; a
  cached copy hidden after a drag forgets that mark.
- `RouteOverlay` has the same two presentations and two more props: `swipeBack` (off by default; WP-26 turns it on
  once the listing's data shows and no layer is open over it; the fullscreen map of WP-28 never) and `className`
  (raises the layer: WP-28's map at 100). The swipe runs only in the `layer` presentation and never on Android. It
  adds no top inset, as legacy `listing-layer` (WP-26's hero runs under Telegram's header); content that must clear
  the header pads itself with `--top-inset`, as the listing placeholder does. `SubPage` passes `title`, `hint` and
  `bare` to `SubPageFrame`, closes through `back()`, and turns the swipe off on Android.

### Primitives (`frontend/packages/ui/src/`)

| Component | Contract |
| --------- | -------- |
| `BottomSheet` | Props `open`, `onClose`, `dismissible` (default `true`), `variant: 'full' \| 'compact'`, `title`, `header`, `footer`, `closeLabel`, `stacked` (z 60 = `--z-toast` over 50: the city sheet over the filters), `closeOnEscape` (default `dismissible`), `portal` (default `true`; `false` renders the sheet in place, so the server HTML holds it), `onDragStart`, `onDragCommit` (a drag closes it; the owner plays the light impact), `className`. Composes the Radix Dialog parts of WP-20 itself (Portal, Overlay, Content; the WP-20 `Sheet*` parts have no variant, header, footer or drag hooks). Focus moves to the title on open and back to the element that had it on close (Radix has no Trigger here). Sticky header and footer; `useSheetChrome()` writes their heights to `--fsheet-head` / `--fsheet-foot` |
| `useSheetDrag` | Pointer events, so a mouse may drag a sheet header; on the handle area only: start 6 px, close at 25 % of the sheet height or 0.5 px/ms, settle 200 ms, backdrop dims with the drag. Exported constants |
| `useBodyClass` | `useBodyClass(className, active)`, ref-counted per class name: the sheets hold `body.sheet-open` and `body.locked`, WP-26's listing `listing-open` |
| `SubPageFrame` | Fixed layer (`--z-subpage`), 24 % slide-in (`--animate-subpage-in`), header with a shadow when scrolled, optional `back` and `hint`, `bare` mode; `onBack`, `swipeBack`, `onSwipeStart`, `onSwipeCommit`. Its `back` slot carries the fallback close of the audit's TMA-047: the app's own close control while the SDK is absent (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `SubPage` for a later package (`wave-1/baseline.md`, built code behind the pin, row 19)) |
| `useSwipeBack` | Touch events only, as legacy (a mouse drag over a page selects its text): rightward swipe, start 10 px, sideways travel at least 1.5 × the vertical, close at 33 % of the width or 0.5 px/ms, settle 180 ms; option `enabled`; never starts inside `[data-no-swipe]`, `[data-scroll-x]`, `input`, `textarea`, `select`, `[contenteditable]` or a map container. Exported constants. Legacy since `index-CBlEKxdL.js` has three more rules (*added by the intake of `index-CBlEKxdL.js`*): a layer marked `data-edge-swipe` takes the swipe only from the left 24 px and ignores the exclusion list; a touch inside a nested sub-page of the layer is not the layer's; the inline styles are removed 300 ms after the close. Only the owner cabinet uses the first two; they are not built here: WP-81 builds the edge-only rule for the owner form (the option `edgeOnly`), WP-82 the nested sub-page rule for «Отклики» (*added by the owner-cabinet plan*) |
| `HeaderChip`, `FilterChip` | `HeaderChip`: highlighted state, optional count badge, `aria-label`. `FilterChip`: `aria-pressed`. Long labels ellipsise; a plain-text label is also the `title` |
| `SegmentedControl` | Two or three options, always one selected; compact size for the map top bar. In the dark theme the selected segment is `--sep` over `--fill`, not the legacy `color-mix`, which old WebViews lack |
| `ChoiceList` | Radio list (`RadioGroup`, `data-slot="choice-list"`) with a ✓ on the selected row, in the legacy settings-row look (52 px rows, inset separators) |
| `ErrorState` | `kind: 'offline' \| 'server'`, `title`, `text`, `retryLabel`, `onRetry`, `tall`; icons WifiOff / CloudOff |
| `EmptyState` | `image`, `title`, `hint`, `action`, `tall`, `titleAs: 'p' \| 'h1' \| 'h2'` (default `p`; the crash and not-found screens title with an `h1`); the image box is 120 px even when the asset is missing |
| Icons | `icons/index.ts` re-exports the lucide icons the apps use (the D-UI-1 list plus `ArrowUpDown`, `ChevronRight`, `MapPin`, a `MapIcon` alias of `Map`, and the types `LucideIcon`, `LucideProps`); `RadarIcon` is made with `createLucideIcon` |

All gesture hooks read their latest callbacks through refs, settle instantly under `prefers-reduced-motion`
(`hooks/prefersReducedMotion.ts`), and take haptics as callbacks. Reduced motion stops every animation with one rule
in `motion.css` (`*, ::before, ::after { animation: none !important }`, which takes in the WP-20 rule for
`[data-shimmer]` and `[data-spinner]`); `--animate-subpage-in` is in `theme.css`, with the aliases
`--z-mini-title: var(--z-map-card)` and `--z-overlay: var(--z-listing)`; `layout.css` keeps the page under a sheet
still (`body.sheet-open`, `body.locked`). `@homi/ui` imports nothing from Telegram, routing, `next`, next-intl, the
catalogues (`@homi/i18n`), `@homi/search` or `@homi/api-client` (the source guard test is widened to these); texts
are props.

### Toast, feedback, confirm

- `lib/ui/toast.ts`: `showToast(message, scope = 'app')`, `dismissToast(scope, id?)` (with `id`, only that toast),
  `useToast(scope)`, `currentToast(scope)`, `subscribeToasts()`. `message` is a string, an object
  `{ text, action, run }` with `run: () => void | Promise<unknown>` (an undo may return the promise of its Server
  Action), or `{ key, values }` (translated by the host). The store owns the timers. One toast per scope; a new one
  replaces the old and restarts the timer; every toast gets a new `id`, so a replacement rises in again.
- `features/shell/ToastHost.tsx` (`scope` prop, default `'app'`; mounted in `[locale]/layout.tsx` so gates have it;
  WP-25 mounts a second host with scope `sheet` inside the filters sheet): a plain element with `role="status"` and
  `aria-live="polite"`, always in the document, with the toast inside it remounted for every new one. Not the Radix
  Toast primitive of WP-20: it pauses on blur, pointer and focus and defaults to 5 s, while SCR-042 keeps strict
  times (D-T-1); the `@homi/ui` `Toast` doc now says the Mini App does not use it, and its `ToastViewport` sits at
  the host's offset. A toast closes when its host is hidden or unmounted.
- `lib/ui/feedback.ts`: `failed(options?: { flags?: DevFlags })` plays `tg.haptic.error()` and, when
  `dev016ErrorToastOnFailure` is on, shows `{ key: 'common.saveFailed' }`; the flags are an options object, so
  `promise.catch(failed)` reads the app's flags. `saved()` plays `tg.haptic.success()`. Since the intake of
  `index-CIa0Ldj2.js` the flag is on by default (DEC-58), and a caller may ask for the haptic alone — the contact
  failures of the listing, where legacy shows no toast, and the language picker, which shows its own line (*added by
  the intake of `index-CIa0Ldj2.js`*; a parity item of `failed()` and its callers for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 21)).
- `lib/ui/confirm.ts`: `confirmText(text): Promise<boolean>` delegates to `tg.confirm` (native from Telegram 6.2,
  `window.confirm` otherwise — the gate is WP-21's).

### Settings action

`lib/actions/settings.ts`, the first `'use server'` file:
`updateSettings(input: { locale?: Locale; city?: string }, auth?, locale?)` → `PATCH /settings`, returning
`ActionResult` (WP-22) — the `Action<I, T>` shape of `useAction()`, so header mode passes the token (D-S-13).
`locale` is checked by `oneOf` of the `@homi/config` locales, `city` by `referenceCode()` (new in
`lib/actions/validate.ts`: the code shape of `@homi/search`, `^[\w.-]{1,FILTER_LIMITS.codeLength}$`). An input with
no key, or not an object, answers `validation` and sends nothing; one bad key fails the whole input; unknown keys
are dropped from the body. The generated `UpdateSettingsRequest` types `city` as the enum of the stub's three
fixture cities; the action narrows with a documented cast (the API checks the code against `GET /reference`).
WP-31 extends the input type with the other fields.

## Files

New, under `frontend/packages/ui/src/`:

- `components/{BottomSheet,SubPageFrame,Chip,SegmentedControl,ChoiceList,ErrorState,EmptyState}.tsx`
- `hooks/{useSheetDrag,useSwipeBack,useBodyClass,useSheetChrome,prefersReducedMotion}.ts`,
  `icons/{RadarIcon.tsx,index.ts}`
- `frontend/packages/ui/tests/{gestures,BottomSheet,SubPageFrame,ErrorState,Chip,controls}.test.tsx`

Changed, under `frontend/packages/ui/`: `src/index.ts` (exports), `src/components/Sheet.tsx` (comments only: the
app's sheets are `BottomSheet`), `src/components/Toast.tsx` (its doc; the viewport at the toast host's offset),
`src/styles/{theme,motion,layout}.css` (above), `tests/components.test.tsx` (the widened source guard),
`tests/tokens.test.ts` (the two z aliases and the reduced-motion rule, added assertions only).

New, under `frontend/app/`:

- `features/shell/{AppShell,TopBar,TabBar,ViewToggle,MiniTitle,PullToRefresh}.tsx`
- `features/shell/{RouteSheet,RouteOverlay,SubPage,ToastHost}.tsx`
- `features/shell/RefreshProof.tsx` (the stand-in pull-to-refresh handler of the feed placeholder,
  `data-proof="refresh"` with `data-refresh-count`, a 300 ms promise; WP-24 replaces it)
- `features/shell/{useMiniChrome,usePullToRefresh,shellVariant}.ts`, `styles/shell.css` (imported by
  `styles/app.css`: the collapse morph, the lens, the full-screen and lite rules of the chrome)
- `features/gates/{GateRedirector,GateWait,OutsideScreen,NoAccessScreen,LanguagePicker,WelcomeCity}.tsx`
- `features/gates/{SessionExpired,SessionExpiredScreen,CrashScreen}.tsx` (`SessionExpired` is the wrapper of
  D-S-14 that shows the screen in place of the route)
- `features/gates/{resolveGate,gateState,accessReason,useBootRetry,bootRetryStore,useRenderReport}.ts`:
  `accessReason.ts` holds the screen logic only (`noAccessView`, `mainRow`, pure; D-S-4) — the whitelist is
  `accessReason()` / `ACCESS_REASONS` of `lib/session/types.ts`, the links are WP-21's (`launch.postUrl` of the
  parser, `noAccessStartUrl` and `supportUrl` of `lib/deeplinks/build.ts`); `bootRetryStore.ts` is the module store
  of D-S-3; `useRenderReport.ts` reports a render error once per thrown object, for `CrashScreen` and
  `global-error.tsx`
- `features/city/CityList.tsx`, `features/city/nearestCity.ts`
- `lib/ui/{toast,feedback,confirm,shellState}.ts`, `lib/actions/settings.ts`
- `app/[locale]/dev/ui/page.tsx` with `features/gallery/UiGallery.tsx` (gallery; `notFound()` unless
  `NEXT_PUBLIC_APP_ENV` is `local`, `ci` or `staging` — `ci` is the value of the end-to-end build since WP-21, and
  `crash.spec.ts`, `shell.spec.ts` here and `errors.spec.ts` of WP-32 use the gallery; WP-33 removes it or confirms
  the guard). The guard blocks the rendering only: the import is static, so a production build still emits the
  gallery's client chunk under `.next/static`. It is the one route file added after WP-20, whose tree is otherwise
  closed
- `tests/{shell,gates,city,ui,actions,gallery}/*.test.ts(x)`, `tests/helpers/gestures.ts`,
  `e2e/{gates,shell,crash}.spec.ts`

Changed:

- `app/[locale]/layout.tsx` (`SessionExpired` around the page, `GateRedirector` inside `<Suspense>` between
  `LocaleGuard` and `LaunchRedirector`, `ToastHost` last), `app/[locale]/(main)/layout.tsx` (`AppShell`)
- `app/global-error.tsx`, `app/[locale]/{error,not-found}.tsx`, `app/[locale]/{outside,no-access}/page.tsx`,
  `app/[locale]/welcome/{language,city}/page.tsx` (placeholders of WP-20 replaced);
  `app/[locale]/(main)/[...rest]/page.tsx` (`notFound()` from an async child under `<Suspense>`; its stale «404»
  comment now says 200 + `noindex`, AM-57)
- the placeholders the gallery proves the wrappers on: `(main)/filters/page.tsx` and
  `(main)/@sheet/(.)filters/page.tsx` (`RouteSheet`, standalone and layer), both `listing/[number]/layout.tsx`
  (`RouteOverlay`, standalone and layer), `(main)/settings/theme/page.tsx` (`SubPage`), `(main)/page.tsx`
  (`RefreshProof`);
  `features/shell/RoutePlaceholder.tsx` (`framed` for a placeholder inside a `RouteSheet`, `className`),
  `features/shell/RouteParamPlaceholder.tsx` (the listing placeholder pads `--top-inset`),
  `features/shell/SearchProof.tsx` (the printed query gets `break-all`: unwrapped, a drawn polygon's query widened
  the layout viewport and pushed the fixed map bar off-screen)
- `lib/navigation/routes.ts` (`matchRoute`, `RouteMatch`, `GateName` and `searchKeysOf` exported, the gate match
  carries its name; `parentOf` unchanged), `lib/search/useSearchState.ts` (`write(filters, sort)`, D-SH-2),
  `lib/reference/useReference.ts` (`useCitiesStats(): { stats: Record<string, CityStats> | null; loaded }`,
  D-S-12), `lib/actions/validate.ts` (`referenceCode()`)
- `lib/session/bootstrap.ts` (D-S-2: `pending`, `retry()` from `denied` returning the attempt in flight, the
  re-check that keeps `denied`, the late SDK while `outside`), `lib/session/SessionProvider.tsx` (`pending`),
  `lib/session/LocaleGuard.tsx` (returns early on a gate route, D-S-6)
- `lib/deeplinks/launch.ts` (`launchPending()`, `launchTarget()`) and `features/shell/LaunchRedirector.tsx` (reads
  `launchTarget()`); `lib/deeplinks/parse.ts` of WP-21, fixed: `sourceOf()` returns the whole campaign code
  (`l_123-fb12` → `fb12`, so «Перейти в бота» carries `s_fb12--l123`, as KV-FE-042, KV-FE-037, `04` BOT-031 and
  WP-52 expect) and reads `seo` only as `-seo` followed by `-` or the end (`l_123-seoul_flats-45` → `share`);
  `source` is read only by `accessReason.ts`
- `features/shell/TelegramButtons.tsx` of WP-21 already hides BackButton in the expired state; it now also hides
  SettingsButton unless the session is ready and the address is not a gate (D-S-15), in its own effect; the click
  handlers and the BackButton rule are unchanged
- `boot/boot.js` and the generated `boot/inline.generated.ts`: the update screen picks its texts in `show()`, not
  in `render()`, because `LocaleGuard` may move `/uz` → `/ru` while the document still streams
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json` (new keys below), `packages/i18n/tests/catalogue.test.ts`
- the tests of the changed modules (`tests/{session,deeplinks,reference,search,boot}/…`) and
  `e2e/foundation.spec.ts` (D-S-16, see Tests)

New keys (`homi` layer; uz and en are proposals for the reviewer):

| Key | ru | uz | en |
| --- | -- | -- | -- |
| `error.sessionExpired` | «Сессия устарела — закройте и откройте приложение снова» | «Seans eskirdi — ilovani yopib, qayta oching» | «The session has expired — close the app and open it again» |
| `error.notFound` | «Такой страницы нет» | «Bunday sahifa yoʻq» | «This page doesn’t exist» |
| `error.toSearch` | «К поиску» | «Qidiruvga» | «Back to search» |
| `city.countsDaily` | «{rent} аренда · {daily} посуточно · {sale} продажа» | «{rent} ijara · {daily} kunlik · {sale} sotuv» | «{rent} rent · {daily} daily · {sale} sale» |

## Steps

Part A — primitives (mergeable alone; nothing in the app changes yet).

1. Read the documents listed under Design and the cited task files; add the dev gallery page with its guard.
2. `Chip`, `SegmentedControl`, `ChoiceList`, `ErrorState`, `EmptyState`, `RadarIcon` and the icon re-exports with
   their tests; export them.
3. `useBodyClass`, `useSheetDrag`, `useSheetChrome`, `BottomSheet` (full, compact, non-dismissible) with gesture
   tests on synthetic pointer events; gallery entries.
4. `useSwipeBack`, `SubPageFrame` with tests; gallery entry.

Part B — feedback and wrappers.

5. `lib/ui/toast.ts`, `ToastHost` (mounted in the root layout), `lib/ui/feedback.ts` with both flag branches,
   `lib/ui/confirm.ts`; tests with fake timers.
6. `RouteSheet`, `RouteOverlay`, `SubPage`; show one of each from the gallery through real routes
   (`/filters`, `/listing/42`, `/settings/theme` placeholders) to prove close-by-Back, drag, swipe and backdrop.

Part C — shell.

7. `shellVariant.ts`, `lib/ui/shellState.ts`, `AppShell` in `(main)/layout.tsx` with `TabBar` (replace navigation,
   `resetDepth()`, last-address memory, `long` label rule, lens).
8. `TopBar` variants: search list, map, map with area, drawing, saved, radars, settings; deal switch.
9. `ViewToggle`, `MiniTitle`, `useMiniChrome` and the "first tap only expands" rule on tab bar, toggle and title.
10. `usePullToRefresh`, `PullToRefresh` with its guards; a temporary handler on the feed placeholder for the test
    (`RefreshProof`).
11. `e2e/shell.spec.ts`; map the shell lines of the checklist to the tests that prove them.

Part D — gates and error screens (two commits: D1 steps 12, 13, 18, 19 and `crash.spec.ts`; D2 steps 14 – 17 and
20).

12. `lib/actions/settings.ts` (`locale`, `city`).
13. `resolveGate.ts`, `gateState.ts`, `GateRedirector`, `useBootRetry.ts` with `bootRetryStore.ts`; `pending` and
    the re-check in the session bootstrap; the `setLaunchGate` registration and `launchPending()` for the launch
    redirect of WP-21.
14. `OutsideScreen` and `/outside`.
15. `accessReason.ts`, `NoAccessScreen` and `/no-access`.
16. `LanguagePicker`, `GateWait` and `/welcome/language`.
17. `nearestCity.ts`, `CityList`, `WelcomeCity` and `/welcome/city`.
18. `SessionExpiredScreen` with its `SessionExpired` wrapper; BackButton hidden in that state; SettingsButton shown
    only while ready and off the gates.
19. `CrashScreen`, `useRenderReport`, `[locale]/error.tsx`, `app/global-error.tsx`, `[locale]/not-found.tsx`; new
    keys in the three `homi` catalogues.
20. `e2e/gates.spec.ts`, `e2e/crash.spec.ts`; run the acceptance checklist; update the queue and the handoff.

## Behaviour to reproduce

### Gate order and timers (03 §1.4, BR-APP-054, BR-APP-055)

- Legacy order: no `initData` → outside; access refused → no access; language not chosen → language picker;
  otherwise the shell. The first-launch city choice comes after the language and waits while a listing is open
  (BR-APP-055): a launch by a listing link shows the listing first and the city page after the listing is closed.
- While the session is being created the shell renders with skeletons (legacy: the shell with `meta = null`).
- A failed sign-in attempt that is a network error, a timeout or a server error (`429` included) is retried after
  1, 3, 7, 15 and 30 s: six attempts in all (≈ 0 / 1 / 4 / 11 / 26 / 56 s, D-S-3). After the sixth failure the
  content area shows `ErrorState` (offline or server, texts below) with «Повторить», which resets the counter and
  signs in again — the visible equivalent of the legacy feed error. A gate page waiting for the session shows the
  same `ErrorState` (`GateWait`).
- A refusal is re-checked 3 times at 2.5 s, never for `blocked`; the store's `checking` is true while a re-check
  is scheduled or running. `tg.onVisible` (return to the app) resets both counters and retries at once, also for
  `blocked`, only while the session is not `ready`; a second visibility event while an attempt is in flight starts
  no other. `expired` and `outside` schedule nothing.
- When a later attempt succeeds, the gate route is left automatically (row 7). No reload happens anywhere.
- An expired session is never retried by these timers; it is the state WP-21 raises (LB-APP-047, owned there).

### Outside Telegram (SCR-002, `/outside`)

- Trigger: no `initData` after the SDK wait of WP-21. A late SDK that brings `initData` starts the session from
  this page and the gate leaves it once the session is decided. Meanwhile the user is inside Telegram, so
  `OutsideScreen` (a Client Component) shows the quiet wait of the other gates (`GateWait`; `ErrorState` with
  «Повторить» after the sixth failed sign-in) instead of the sentence. The server snapshot of the session is not
  prepared, so the server HTML and the hydration pass are the sentence.
- One sentence, no buttons, no Back: `app.openViaBot` «Откройте приложение через бота в Telegram.» (uz «Ilovani
  Telegram boti orqali oching.», en «Open the app via the bot in Telegram.»). The sentence is the page's heading,
  `<h1 data-screen="outside">`, drawn as the legacy line; the root is `<main data-route="outside">`.
- No API request, no session request, no analytics. The language is the locale of the address.
- In development the emulator of WP-21 overlays its form on this page.

### No access (SCR-003, `/no-access`)

- Reason from the sign-in answer per the WP-11 contract; whitelist `private | invite | full | blocked | join`;
  anything else, a missing or non-string value renders as `private`. The `reason` in the address is informative;
  the screen trusts the session state only. Since the intake of `index-CIa0Ldj2.js` the whitelist also holds `paused`
  (DEC-60; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `accessReason` and the session types for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 28)).
- Layout: Lock icon, title, text, optional checking line, list of large buttons; the first button of the list is
  `primary`, the others `secondary` (legacy `.lang-btn:first-child`), so with a post row the post is accented and
  «Перейти в бота» is not. The title (`tabIndex=-1`) takes the focus when the refusal first shows.
- Until the session is `denied` — a direct load still signing in, or the moment between a granted re-check and the
  gate leaving — the page waits quietly (`GateWait`), so no reason flashes; after the sixth failed sign-in it shows
  `ErrorState` (`tall`) with «Повторить» → the boot retry. The four gate pages put the safe-area insets on their
  `<main>`.

  | Reason | Title (`noAccess.title.*`) | Text (`noAccess.text.*`) |
  | ------ | -------------------------- | ------------------------ |
  | `private` | «Бот приватный» | «Приложение сейчас доступно только команде HOMI.» |
  | `invite` | «Вход по приглашению» | «Войти можно по ссылке-приглашению: откройте её и нажмите «Старт» в боте.» |
  | `full` | «Мест пока нет» | «Сейчас все места заняты. Попробуйте позже.» |
  | `blocked` | «Нет доступа» | «Доступ к приложению закрыт.» |
  | `join` | «Сначала — бот» | «Нажмите «Старт» в боте — после этого приложение откроется.» |
  | `paused` | «Бот на паузе» | «Скоро вернёмся. Ваши Радары и избранное на месте.» |

  `paused` is the sixth reason, legacy since `index-CIa0Ldj2.js` (DEC-60): uz «Bot pauzada» / «Tez orada qaytamiz.
  Radarlaringiz va saralanganlaringiz joyida.», en «The bot is paused» / «We’ll be back soon. Your Radars and
  favorites are safe.» It builds no start link, like `blocked`, and is re-checked like the other reasons (*added by
  the intake of `index-CIa0Ldj2.js`*; a parity item of `accessReason` and the session types for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 28)).

  The two texts reworded by `index-Dbpp463V.js` in uz and en: `invite` «Taklif orqali kirish» / «Invite only»;
  `full` «Hozir joy qolmadi. Keyinroq urinib koʻring.» / «All spots are taken right now. Please try again later.».
  No text of this screen mentions a beta in any locale.

  The `private` text is the legacy one since `index-CBlEKxdL.js` with the brand word replaced by the `homi` layer of
  the catalogue: legacy «Приложение сейчас доступно только команде kvadro².» (before it «…только владельцу.»); uz
  «Ilova hozir faqat HOMI jamoasi uchun ochiq.», en «The app is available only to the HOMI team for now.»
  (*added by the intake of `index-CBlEKxdL.js`*).

- Checking line `noAccess.checking` «Только что нажали «Старт»? Подождите пару секунд — проверяем доступ…» while
  an automatic re-check is scheduled or running (`useBootRetryState().checking`); never for `blocked`; buttons stay
  enabled. A plain `<p>`, as legacy, with no live region.
- Buttons, in order:
  - «📢 Открыть пост в канале» (`noAccess.openPost`) only when the start parameter carries a channel and a post
    (`l_<id>-[seo-]<channel>-<post>`, TMA-011); opens `launch.postUrl`, which the launch parser of WP-21 already
    built (`channelPostUrl()` is not called). It also shows for `blocked`, as legacy.
  - Main button: «Перейти в бота» (`noAccess.toBot`) opens `noAccessStartUrl(source, number)` of WP-21 (payload
    `s_<source>[--l<id>]`) when `brand.botUsername` is set, the start parameter is an `l_…` link and the reason is
    neither `blocked` nor `paused`; `<source>` is `web`, the whole campaign code (`fb12`), `seo` or `share` (parser of
    WP-21, fixed here, see Files). Since legacy release `index-CIa0Ldj2.js` the source `seo` is written `seo_en` or
    `seo_uz` when the locale of the address is en or uz, and `seo` in ru; HOMI's bot reads all three (WP-52) (*added
    by the intake of `index-CIa0Ldj2.js`*; a parity item of `accessReason` and `lib/deeplinks/build.ts` for a later
    package (`wave-1/baseline.md`, built code behind the pin, row 29)). The launch is read with
    `parseLaunch(tg.initData(), location.search)`; on `/no-access` the
    query is `?reason=`, so only the start parameter (never `?listing=`) makes this button. Otherwise «Вернуться в
    бот» (`noAccess.back`) calls `tg.close()`.
  - «Написать в поддержку» (`settings.support`) opens `supportUrl(username)` — without the launch's listing number,
    as legacy (`https://t.me/<support>`) and KV-FE-042 — only when reference data carries a support account; while
    it is unknown the row is absent and nothing spins.
  - Haptics: «Перейти в бота» a medium impact (D-S-4); «📢 Открыть пост в канале», «Вернуться в бот» and «Написать в
    поддержку» a light one (legacy `hapticImpact('light')` on every button).
- The page appears in the Telegram language with the full mapping (`uz*` → `uz`, `en*` → `en`, else `ru`;
  `detectLocale(tg.languageCode(), { oneDetector: true })`, D-S-5), as legacy does for this screen and the language
  picker; the pre-session detector itself is WP-21's (BR-APP-050, LB-APP-032).
- No Back; Telegram shows Close. Links go through `tg.openLink` (1.5 s same-address debounce, TMA-028).
- Whether any reason is active in production is unknown for legacy (Q-APP-014) and "none" for HOMI today.

### Language picker (SCR-004, `/welcome/language`)

- Layout: Globe icon; `h1` in the Telegram language by the full mapping
  (`detectLocale(tg.languageCode(), { oneDetector: true })`, legacy `getTelegramLanguage`, TMA-008: the mapping of
  `/no-access`, D-S-5, not the pre-session detector of BR-APP-050, which with DEV-020 off maps `en` to ru; Telegram
  `de` → ru) — «Выберите язык» / «Tilni tanlang» / «Choose a language» (a constant in the component, not catalogue
  text, because the catalogue language is what is being chosen); a subtitle with the other two phrases joined by
  « · »; one button per locale of `useReference().reference.locales` that `@homi/config` knows and that has a
  non-empty name, the Telegram language first, the rest in server order; the first button is accent-coloured. The
  `h1`, each subtitle phrase and each button carry their own `lang` (WCAG 3.1.2). The buttons are a `role="group"`
  named by the heading, which (`tabIndex=-1`) takes the focus when the picker shows. Sizes are the legacy
  `.lang-pick` pixels (Globe circle 64 px, gaps 8 / 10 px, padding 24 px), as on `/no-access`. While the session is
  not `ready` the page shows its skeleton inside `GateWait`.
- Empty locale list (should not happen): the three known locales with «Русский», «Oʻzbekcha», «English».
- Tap: a medium impact (legacy `LanguagePicker.jsx` `pick()`); every button `aria-disabled` (not `disabled`, so the
  tapped button keeps the focus) and the group `aria-busy`; `updateSettings({ locale })`; on success
  `gateState.localePicked = true` and `patchMe({ locale, locale_chosen: true })` of WP-21 (not a re-read: on stubs
  `GET /me` keeps the old locale and the locale guard would turn the address back), and the picker stays disabled.
  It does not navigate (D-S-6): `GateRedirector` replaces the address once, by the next gate when one is due (on a
  first launch with no chosen city, `/<locale>/welcome/city`, row 6) or by the return address, in the chosen
  locale. No page reload: the launch counter of analytics does not restart.
- Failure: buttons enabled again, the error haptic, and the line `common.saveFailed` «Не получилось сохранить» under
  the list (`role="alert"`), cleared by the next pick. No toast here, whatever the flag: `failed()` is asked for the
  haptic alone (legacy since `index-CIa0Ldj2.js`; before it the haptic only, LB-APP-027, and as built a toast with
  `dev016ErrorToastOnFailure`) (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `LanguagePicker` for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 30)). The tapped button still has the focus.
- No Back. A second tap while saving is ignored. A save result arriving after the page was left (unmounted, or
  hidden by `cacheComponents`) is dropped and the buttons are enabled again. A `flags?: DevFlags` prop is the test
  seam of DEV-016.

### First-launch city (SCR-005, `/welcome/city`) and `CityList`

- Blocking page: title `city.firstTitle` «Где ищете жильё?», no close button, no checkmark, no Back, nothing to
  drag or tap away. Legacy shows it as a sheet over the feed; the page form is the accepted visual difference of
  25 §3.2.
- `CityList` props: `cities`, `stats` (`Readonly<Record<code, Pick<CityStats, "counts">>> | null`, the shape
  `useCitiesStats()` returns, not a list), `current`, `showCheck`, `showLocate`, `onPick(code)`, `flags?: DevFlags`,
  `className`. It knows no gate and no sheet: the caller decides what a pick does. Rows: city name (server string)
  and, when stats exist for the city, `city.counts` «{rent} аренда · {sale} продажа» — long-term rent and sale only
  (LB-APP-035). With `dev023CityCountsIncludeDaily` the line is `city.countsDaily`. Stats still loading or failed:
  rows without the line. A light impact on a row tap.
- Location row, only when the adapter can request a location (TMA-035; never in the server HTML or the hydration
  pass): the `LocateFixed` icon (legacy lucide `Navigation`, not re-exported) and «Определить по геопозиции»
  (`city.locate`), a light impact on the tap → «Определяем…» (`city.locating`) with a spinner, the row
  `aria-disabled` (not `disabled`, so the focus of the tap stays on it). The progress and the error are announced
  by an always-present, visually hidden `role="status"` line beside the button, which also describes it
  (`aria-describedby`): a live region inside a button is presentational. The visible error text inside the row is
  `aria-hidden`. Results:
  - denied → `city.locateDenied` «Нет доступа к геопозиции — выберите город из списка. Разрешить можно в
    настройках Telegram.»;
  - failure, or nothing after 12 s → `city.locateFail` «Не получилось определить, где вы, — выберите город из
    списка.»: `CityList` races `tg.location.get()` against its own `LOCATION_TIMEOUT_MS` (12 s) timer, because the
    browser path of WP-21 (`viaBrowser`) passes the timeout to `getCurrentPosition`, which does not count the
    permission prompt;
  - no city in range → `city.locateFar` «Рядом с вами наших городов пока нет — выберите из списка.»;
  - found → success haptic and the city is picked at once.
- A row tapped while a position is on its way wins (the later position picks nothing); a position arriving after
  the list was left (unmounted, or hidden with its route) is dropped.
- Nearest city (BR-APP-056, `nearestCity.ts`): towns within 16 km; then regions within 110 km; then towns within
  110 km; otherwise none; ties by distance, cities without a centre skipped. A region is what the contract marks as
  one (`is_region`, D-S-11; legacy: `zoom < 11`, Q-APP-004). Distances are haversine; coordinates never leave the
  device and are in no request or event.
- Pick on this page (D-S-10): `findCity(code)`, `pickCity()` of `@homi/search` on the default filters (rule
  BR-APP-009, owned by WP-22); `updateSettings({ city })` sent through `useAction` and not awaited, its errors
  ignored (legacy `saveCity(code, true)`); `homi-city` written through `lib/storage`; `gateState.cityPicked = true`
  and `returnTo` = the feed of the picked city with the default sort,
  `routes.feed(toSearchParams(pickCity(defaultFilters(), city)))` (`/?city=andijan`);
  `patchMe({ city, city_chosen: true })`, without which the profile's old city would win `cityFallback`; then
  `GateRedirector` (row 7) replaces the address once. One pick per showing: a double tap or a second row before the
  page leaves is ignored (one `PATCH /settings`, one `patchMe`); a page shown again after it was hidden takes a pick
  again. The title (`tabIndex=-1`) takes the focus when the list shows; while the session is not `ready` the page
  shows its skeleton inside `GateWait`. The gate pickers write `gateState` through module-level helpers
  (`rememberPick()`), because the `react-hooks/immutability` lint rule rejects mutating module state inside a
  component closure.
- With one city in the reference data the page is never shown.

### Shell (SCR-006)

- Top bar variants:
  - search list: title tabs «Аренда» / «Продажа» (`deal.rent_long`, `deal.sale`; daily rent counts as «Аренда»)
    and the chips region. The title tabs are a radio group, like the map's `SegmentedControl` (`role="radiogroup"`
    / `radio`, `aria-checked`, only the checked tab in the Tab order, arrow keys move the focus and the choice, so
    an arrow plays the deal switch's haptic and scroll); neither group has a name yet;
  - map: compact segmented deal control (it shrinks below 210 px when the row is narrower; legacy overflowed a
    320 px screen: 16 + 210 + 8 + 44 + 8 + 44 + 16 = 346 px), lasso button (aria `map.area` «Обвести на карте»),
    filters button (aria `sheet.title` «Фильтры», «Фильтры, 4» while groups are active; no haptic, as legacy) with
    a badge of the active filter groups (rule BR-APP-011, owned by WP-22). Lasso and filters are `HeaderChip`s drawn
    as the 44 px round glass buttons of legacy `icon-round`; a highlighted lasso drops the glass;
  - map with an area: pill «Своя область» (`map.areaOn`) and × (aria `map.areaRemove`), which clears the polygon;
  - drawing: `map.areaHint` «Обведите пальцем, где искать» or, after a too-small stroke, `map.areaSmall`
    «Обведите покрупнее»; sub-hint `map.areaMove` «Двумя пальцами — двигать карту», one line each with an ellipsis
    in the 44 px pill, as legacy `draw-hint`; «Отмена» (`map.areaCancel`), which closes the `draw` layer;
  - saved: title tabs «Избранное» / «Смотрели» (`app.saved.favorites`, `app.saved.history`), buttons with
    `aria-current="page"` (two addresses); a tap on the current tab does nothing, the other is a light haptic and
    `nav.replace`;
  - radars: `h1` «Радар» (`tab.subs`) and «+» (aria `sheet.createTitle` «Новый радар»; WP-30 gives it its action
    and hides it while radars are switched off, DEC-51);
  - settings: `h1` «Настройки» (`tab.settings`);
  - `none`: no top bar, a `--top-inset` spacer.
- Deal switch (title tabs and map control): `switchDeal()` — the new deal's defaults, geography kept (rule
  BR-APP-002), sort back to `new` when unavailable (rule BR-APP-023), written in one replace; light haptic; scroll
  to top; tapping the active deal does nothing.
- Tab bar: «Поиск», «Избранное», «Радар», «Настройки» (`tab.search`, `tab.favorites`, `tab.subs`,
  `tab.settings`) with Search, Heart, `RadarIcon`, Settings at 24 px; a label longer than 13 characters gets the
  `long` class — none of today's ru / uz / en labels does (the longest, uz «Saralangan» and «Sozlamalar», have
  10), so the class never applies yet — and labels also ellipsise; the lens position is the CSS variable `--tab`.
  The lens uses `--sep` instead of the legacy text 9 % / white 12 % mixes and has no inner highlight; collapsed,
  the decorative left ring gives the circle its shadow, and the collapsed view toggle has no ring (legacy draws a
  right one).
- Tab press: on collapsed chrome a press only expands it (`expandChrome()`, light haptic). Otherwise a light haptic
  and `nav.tab(href)` of WP-21 (a replace that also calls `resetDepth()`) to the tab's address (search →
  `lastSearchHref()`, saved → `lastSavedHref()`); the scroll to top runs when the new tab commits (a layout effect
  on the active tab, before the paint), not on the press: `nav.tab` is a transition, and an immediate scroll showed
  the old tab at its top until the new one arrived (legacy switched synchronously, then scrolled). Pressing the
  active tab is a light haptic and a scroll to top, no navigation. A tab change no press asked for (SettingsButton,
  the launch) does not scroll. A press therefore ends the radar-return mode of WP-30, as legacy.
- Scroll memory of the search list (DEC-63; legacy since `index-CIa0Ldj2.js`, `03` BR-APP-105): the search tab is not
  scrolled to the top when a scroll memory matches its list key — the list returns to where it was left (the memory
  itself is WP-24's). A press of the active tab forgets the memory; SettingsButton keeps it. The other tabs still
  arrive at the top (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `TabBar` for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 14)).
- Fresh pill (`03` SCR-063): in the top bar of the search list, «Показать N новых» (plural `app.freshShow`) with an up
  arrow, shown while its count is above 0 and nudges may show; a tap is a light haptic, a scroll to the top and a
  reload of the list from page one. The count and the long-return rule are WP-24's (*added by the intake of
  `index-CIa0Ldj2.js`*; a parity item of `TopBar` for a later package (`wave-1/baseline.md`, built code behind the
  pin, row 13)).
- View toggle: floating button showing the target — «Карта» (`app.view.map`) on the list, «Список»
  (`app.view.list`) on the map; keeps the search parameters; hidden while drawing; search tab only. The tab bar
  stays on the map, so the toggle sits above it on both views (legacy hides the tab bar on the map:
  `.map-mode .tabbar { display: none }`).
- Collapsing chrome: on the search list with no layer open, scrolling down more than 24 px past the anchor adds
  `html.chrome-mini`; scrolling up 24 px removes it; within 60 px of the top it is always expanded. While
  collapsed, the first tap on a tab, the toggle or the mini title only expands (light haptic). Leaving the list
  removes the class. Since `index-CBlEKxdL.js` a listing opened over the list is not such a layer: the chrome
  keeps its state under the open listing and after it closes (`03` §1.2; the effect is `inferred` from the code;
  *added by the intake of `index-CBlEKxdL.js`*; a parity item of `AppShell` for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 6)).
- Mini title: `«<base deal> · <filtersSummary>»` (rule BR-APP-064 and the whole-city label of LB-APP-026, both
  WP-22's); the deal is the title tabs' base deal. For daily rent the title is the summary alone, with no deal word in
  front: «… · Посуточно» (legacy since `index-CIa0Ldj2.js`, `03` BR-APP-064). DEC-66 amends D-SH-3 for it: as built,
  daily rent reads «Аренда · … · Посуточно», chosen when legacy printed «Посуточно» twice (`t('deal.'+deal)` plus the
  summary) (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `MiniTitle` for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 32)). Before the reference data it is the deal alone.
- Before reference data arrives: deal tabs render, nothing city-dependent does, no `undefined` text.
- Layout: one phone column, content limited to 608 px, no width breakpoints; paddings from `--top-inset`,
  `--bottom-inset`, `--tabbar-h`; `html.fullscreen` puts the mini title into Telegram's header row; `html.lite`
  collapses by translate and shows no mini title (rules of WP-20). The root font is 15 px, so Tailwind's rem
  spacing is 6.25 % small (`h-11` = 41.25 px): the shell spells the legacy pixels (round buttons, toggle and draw
  bar 44, area pill and mini title 36, pull indicator 40, the gaps and paddings), so the toggle's collapse math
  (27 px origin, 49 px clip) holds. Z-order: pull indicator 9, top bar 10, toggle 29, tab bar 30, mini title 31,
  sub-page 40, overlay slot 45, sheet backdrop 50, stacked sheet and toast 60.
- The root tabs have no Back; BackButton and SettingsButton are WP-21's, observed here; this package only hides
  SettingsButton on the gates and while the session is not ready (D-S-15).

### Sheets and sub-pages (03 §1.2)

- A sheet closes by ×, backdrop tap, drag down from the handle area, and Back; all four end in `back()`, and
  Escape follows the ×. A non-dismissible sheet ignores backdrop, drag and Escape. A drag that closes a sheet plays
  a light impact.
- Dragging inside the sheet body never closes it. The page under a sheet does not scroll; horizontal chip strips
  (`[data-scroll-x]`) and the sheet body do.
- Two stacked sheets keep `body.sheet-open` until both are closed. Unmounting during a drag removes listeners and
  decrements the class once.
- A sub-page slides in, shows a header shadow when scrolled, closes by Back and by swipe back (a light impact on the
  release that closes it). While it is open the page under it does not scroll: legacy sets `body.subpage-open`
  (`overflow: hidden`) since release `index-BnFvC-Ft.js`, beside the `overscroll-behavior: contain` of the sub-page
  (`03` SCR-033; *added by the intake of that release*, a parity item of `SubPageFrame` for a later package). Swipe back
  is touch only, as legacy (DEC-44): on iOS and on the touch screens of the desktop clients, never by a mouse or
  trackpad; it is off on Android (`tg.isAndroid()`, the platform check of WP-21, TMA-041). The sheet drag takes pointer
  events, so a mouse may drag a sheet by its header.
- While the SDK is absent a sub-page shows the fallback close in its header: the app's own control, labelled
  `common.close`, which goes back like BackButton and disappears when the SDK arrives (legacy since
  `index-CIa0Ldj2.js`, `05` TMA-047; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `SubPage` for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 19)).
- Haptics: light on chips, switches and buttons, as passed in by the wrappers (TMA-025).

### Pull-to-refresh (SCR-010, BR-APP-058)

- Active when a handler is registered for the current address, the address is a root tab (`isRootTab`, which
  includes `/saved/history`) other than `/map` and `/settings` with no layer parameter open (`pullAllowedAt`), and
  `body` has none of `locked`, `sheet-open`, `listing-open`. The listeners are passive and never cancel the scroll.
- Gesture: one finger, `touchstart` with `scrollY = 0`. The indicator follows at half the finger distance, at
  most 110 px; at 72 px it is armed with one light haptic and disarmed below. Release while armed: spinner for at
  least 700 ms while the handler's promise runs, then settle; `touchcancel` ends a pull as a release does, as
  legacy. Two fingers, or a pull that turns into an upward scroll, reset and disarm it (legacy kept it armed;
  KV-FE-046 says no refresh). Pulls during a refresh are ignored. A rejected or throwing handler still settles and
  goes to `reportError(error, { kind: 'rejection', source: 'pull-to-refresh' })` (no `ApiError` / `AbortError` skip
  until the global handler of WP-32).
- Effect: the radar tab reloads the radar list, the other tabs re-create their list (handlers come from WP-24,
  WP-29, WP-30; until then the feed placeholder registers `RefreshProof`). The indicator is `aria-hidden`, styled
  with utilities only, at z 9 (`--z-topbar` − 1); under reduced motion the settle is instant, as `motion.css` drops
  the inline transition.

### Toast (SCR-042) and confirm (SCR-043)

- A plain toast closes on tap or after 4 s; a toast with an action shows a button, runs it once and closes, or closes
  after 6 s. A new toast replaces the visible one. A toast follows a downward drag and fades (`max(0.2, 1 − dy/120)`);
  released past 36 px it closes, otherwise it returns; the host has `touch-action: none`. Its offset depends on what
  is below it (legacy `feedback.css:23-29,77-88` at r31): 20 px above the tab bar and the bottom inset; 78 px above
  them while the view toggle is shown; 16 px above the bottom inset over a sub-page; 88 px above the bottom inset over
  the listing's CTA bar; and inside the filters sheet (scope `sheet`) at `--fsheet-foot` + 10 px, as legacy
  `.fsheet-tip .toast` (D-T-2, amended by the intake of `index-CBlEKxdL.js`; no new token: legacy wrote the offsets as
  literals, and `tokens.css` mirrors the `03` §3.6 table). The drag and the offsets by context are legacy since
  `index-CBlEKxdL.js` (`03` SCR-042; *added by the intake of `index-CBlEKxdL.js`*; a parity item of `ToastHost` for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 4)); before it the toast sat 78 px above the tab
  bar and the bottom inset everywhere outside the filters sheet. It rises in and does not animate under reduced
  motion. If `run` throws (`kind: 'error'`) or its promise rejects (`kind: 'rejection'`), the toast still closes at
  once and the error goes to `reportError` with source `toast`. Very long text wraps to three lines at most; the
  action button is never clamped.
- Look: the 14 px corners and the 10 px action button of legacy `.toast` / `.toast-action`; the shadow is the
  `--shadow-float` token, which lite graphics flattens, not the legacy one-off `0 8px 24px` at 20 % black (accepted
  difference).
- Confirm uses the native dialog. Its four uses and owners: `feed.clearConfirm` «Очистить историю просмотров?»
  (WP-29), `subs.deleteConfirm` «Удалить радар «{name}»?» (WP-30), `hidden.confirmAll` «Снова показывать все
  скрытые объявления и заблокированных авторов?» (WP-31), `chat.restart` (WP-30).
- Failures that only vibrate in legacy (LB-APP-027) call `failed()`: the language picker here; settings saves
  and the hidden list (WP-31); radar mode, unhide, delete and toggle (WP-30); clearing history (WP-29). Since
  `index-CIa0Ldj2.js` legacy shows «Не получилось сохранить» for them itself (LB-APP-027 is fixed there), so
  `failed()` is the error haptic and, with `dev016ErrorToastOnFailure` — on by default (DEC-58) —, the toast. The
  heart of a card joins the callers (WP-24); the contact failures of the listing and the language picker ask for the
  haptic alone (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `failed()` and its callers for a later
  package (`wave-1/baseline.md`, built code behind the pin, row 21)).

### Crash, not found, session expired (SCR-045, 03 §1.6)

- Crash: any render exception below the root layout shows the neutral shrug placeholder (`brand.assets.emptyShrug`,
  D-E-1: no legacy artwork), `crash.title` «Что-то пошло не так» as the heading (`h1`, `EmptyState titleAs`),
  `crash.text` «Ошибка записана. Обновите приложение — обычно это помогает.» and «Обновить» (`crash.reload`),
  which calls `location.reload()` as legacy and takes the focus on mount. uz «Nimadir xato ketdi» / «Yangilash»;
  en «Something went wrong» / «Reload». It calls `reportError(error, { kind: 'render' })` once per thrown object
  (`useRenderReport`). `[locale]/error.tsx` takes `error` only — Next.js 16.4 also passes `retry` and `reset`,
  unused because «Обновить» reloads — and renders `<main data-route="error">` padding the insets: the boundary
  replaces everything below the root layout, `AppShell` included.
- `app/global-error.tsx` covers a failure of the root layout: own document with viewport and charset meta and a
  `<title>`, one `<style>` element (no style attributes, no `<script>`, no nonce; the CSP allows inline styles),
  the shrug as a CSS background, the same three texts hard-coded in ru / uz / en and chosen from the first segment
  of the address (default ru; read with `useSyncExternalStore`, whose server and prerender snapshot is `ru`, since
  the build prerenders `/_global-error`), dark when the system scheme is dark, and the same render report once per
  error. `<main data-route="global-error">` keeps its landmark; `role="alert"` sits on an inner element. It uses no
  catalogue and no provider. A client-side failure of the root layout is not checked in a browser (React clears the
  attributes of `<html>`; the app's stylesheet links may stay).
- Not found: `error.notFound` as the heading (`h1`) over the neutral magnifier placeholder
  (`brand.assets.emptyMagnifier`), and «К поиску» (`error.toSearch`) to the feed: the counted `Link` with `replace`,
  so Back does not return to the not-found page, styled with `buttonVariants`; root `<main data-route="not-found">`,
  no top bar and no tab bar. The catch-all `(main)/[...rest]` throws `notFound()` from an async child under
  `<Suspense>`, as the parameter placeholders do, so an unknown address answers `200` + `noindex` with the normal
  document and its boot script (AM-57). An address whose first segment is not a locale is redirected by `proxy.ts`
  (WP-20); the experimental `global-not-found` convention is not enabled.
- Session expired: `error.sessionExpired` as the heading (`h1`) and «Закрыть» (`common.close`), which calls
  `tg.close()` and takes the focus on mount. No artwork: a centred `section` (`data-screen="session-expired"`,
  `role="alert"`) with a `Button`, not `EmptyState`, whose 120 px image box would stay empty. No retry button, no
  Back, no further request from this screen.
- List and screen errors use `ErrorState`: offline (`offline`, `timeout`) — «Нет связи» (`error.offline`),
  «Проверьте интернет и попробуйте ещё раз.» (`error.offlineText`); otherwise — «Не загрузилось»
  (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через минуту.» (`error.serverText`); button
  «Повторить» (`error.retry`).

## Tests

Unit (Vitest):

- `resolveGate`: the truth table of the Design section, including listing address with the city gate pending,
  a pending launch, `localePicked` / `cityPicked` overriding a stale `me`, rows 5 – 7 in `me.locale`, a target
  already shown, and leaving a gate route when ready. `gateState`: `isGatePending()` for the language gate and while
  a gate page is shown, never for the city gate.
- `useBootRetry` with fake timers: the waits pinned as literals (1 / 3 / 7 / 15 / 30 s, `ErrorState` after the
  sixth failure, then stop); 3 × 2.5 s for `join`; none for `blocked`; `offline` / `timeout` → offline,
  `server` / `rate_limited` → server; visibility resets both counters and retries once; an expired session
  schedules nothing.
- `accessReason`: five reasons, unknown string, `null`, number, array → `private`; main-button choice for
  `l_123`, `l_123-web`, `l_123-fb12` (→ `s_fb12--l123`), `l_123-seo-chan-45`, no start parameter, no bot name,
  `blocked`. `parse.test.ts` (WP-21) pins `fb12` / `tg7` / `ig1234` and `l_123-seoul_flats-45` → `share`.
  Since the intake of `index-CIa0Ldj2.js`: `paused` is the sixth reason and builds no start link (*added by the intake
  of `index-CIa0Ldj2.js`*; a parity item of `accessReason` for a later package (`wave-1/baseline.md`, built code
  behind the pin, row 28)); a `seo` source gives `s_seo_en--l123` in en, `s_seo_uz--l123` in uz and `s_seo--l123` in
  ru (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `accessReason` and `build.ts` for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 29)).
- `nearestCity`: inside 16 km; region within 110 km preferred over a farther town; town within 110 km; none;
  missing region flag → town; empty list → `null`; the 16 and 110 km lines pinned with literal points (15.9 /
  16.1 km, 109.9 / 110.1 km).
- `launchTarget` and `launchPending()`: pending until the push lands and done after Back, at the 50-entry history
  cap too; `updateSettings` against a fake API: the `PATCH` body, header mode's token, no request for an empty or
  malformed input.
- `shellVariantOf` for every route of 25 §3.2, and `isLayerAddress` pinned to the `(.)` folders of the file tree;
  toast store: 3 999 ms visible, 4 000 ms gone, 6 000 ms with an action, replacement restarts the timer, scopes are
  isolated; `failed()` with the flag off and on, and asked for the haptic alone (*added by the intake of
  `index-CIa0Ldj2.js`*; a parity item of `failed()` for a later package (`wave-1/baseline.md`, built code behind the
  pin, row 21)).

Component (Vitest + Testing Library):

- `useSheetDrag`: below threshold settles back; distance threshold; velocity threshold; a callback replaced after
  mount is the one called; reduced motion. `BottomSheet`: backdrop tap, non-dismissible, body-class ref count.
- `useSwipeBack`: thresholds; `enabled = false`; start inside `[data-no-swipe]`.
- `ErrorState` kinds; `HeaderChip` badge and highlight; `FilterChip` `aria-pressed`.
- `TopBar`: one render per variant in three locales; the deal callback is not fired for the active deal; badge
  count. `TabBar`: the `long` rule with crafted messages (no catalogue label is longer than 13 characters); a press
  while collapsed only expands; the scroll once the new tab lands, none for a tab change no press asked for; no scroll
  to the top for the search tab while a scroll memory matches, and a press of the active tab forgets it (*added by the
  intake of `index-CIa0Ldj2.js`*; a parity item of `TabBar` for a later package (`wave-1/baseline.md`, built code
  behind the pin, row 14)). `TopBar`: the pill with a count of 1, 3 and 5 in three locales and none at 0 (*added by
  the intake of `index-CIa0Ldj2.js`*; a parity item of `TopBar` for a later package (`wave-1/baseline.md`, built code
  behind the pin, row 13)). `MiniTitle`: daily rent prints the summary alone (*added by the intake of
  `index-CIa0Ldj2.js`*; a parity item of `MiniTitle` for a later package (`wave-1/baseline.md`, built code behind the
  pin, row 32)).
- `useMiniChrome`: 24 px hysteresis, 60 px top zone, `expandChrome()` result, cleanup removes the class.
- `PullToRefresh`: no start at `scrollY > 0`; no start with each body class; one haptic at 72 px; 700 ms minimum
  with a resolved promise; no handler → no listeners; off on `/map`, `/settings` and with a layer parameter.
- `RouteSheet`, `RouteOverlay`, `SubPage`, `ToastHost`, `AppShell` (`ErrorState` after the sixth failure),
  `TelegramButtons` (SettingsButton hidden again on a gate and while not ready), the gallery page. `SubPage` without
  the SDK shows the fallback close, and it goes when the SDK arrives (*added by the intake of `index-CIa0Ldj2.js`*; a
  parity item of `SubPage` for a later package (`wave-1/baseline.md`, built code behind the pin, row 19)).
- `LanguagePicker`: order and headings for Telegram `ru`, `uz-UZ`, `en-US`, `de`; `aria-disabled` while saving with
  the focus kept; failure: the line under the list and no toast with the flag on and off, cleared by the next pick
  (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `LanguagePicker` for a later package
  (`wave-1/baseline.md`, built code behind the pin, row 30); as built: the haptic only with the flag off, the toast
  with it on); the heading's focus.
- `NoAccessScreen`: each reason in each locale — `paused` among them (*added by the intake of `index-CIa0Ldj2.js`*; a
  parity item of `accessReason` for a later package (`wave-1/baseline.md`, built code behind the pin, row 28)) —, with
  the texts of the pinned release (no value contains «бета» or, ignoring case, «beta»); support row absent without an
  account; post row only for channel
  links; checking line never for `blocked`; `GateWait` and `ErrorState` of both kinds before `denied`.
- `OutsideScreen`: the sentence in three locales, no button, no link, no `fetch`; `GateWait` after a late SDK.
- `CityList`: each location outcome with a mocked adapter, the 12 s bound, the status line and `aria-disabled`;
  counts with and without stats; the DEV-023 line with the flag on. `WelcomeCity`: one pick per showing.
  `CrashScreen` and `SessionExpiredScreen`: texts, the single action and its focus; `global-error.tsx` and
  `not-found.tsx`.

End to end (Playwright, fake Telegram, stubs). Every spec runs in cookie mode. Header mode keeps the token in
memory only (DEC-44), so it repeats the tests that hold the session across soft navigations or carry the token in a
request: in `shell.spec.ts` the tab round trip, the pull and the sheet closed four ways; in `gates.spec.ts` the
first-launch picks through the Server Action and the expired screen; `crash.spec.ts` runs both modes, because the
reload must sign in again; `data.spec.ts` (WP-22) has its own header-mode test. The rest do not depend on the
session mode and run once, as `data.spec.ts` and `session.spec.ts` do: doubling every test pushed the full local
run over the stub user's API limit (120 a minute). The default stub `me` says `locale_chosen: true` and
`city_chosen: true`, so every earlier spec passes the gates untouched; `gates.spec.ts` uses the stub scenario
`first_launch` (both marks `false`), `crash.spec.ts` the scenario `uz`.

- `gates.spec.ts` (8 tests): no Telegram object → `/ru/outside` with the one sentence, no button or link, no
  request to `/bff/*`; `POST /bff/session` fulfilled with a `join` refusal twice and then passed through → the
  refusal at `/en/no-access?reason=join` for a Telegram `en` user (D-S-5), the checking line after each refusal,
  then the feed at `/ru` without a reload (a window mark survives); `blocked` → no checking line and no `/bff`
  request in a measured 10 s window (`launchApp` has no fake clock, and `page.clock` would fake every app timer),
  then exactly one sign-in after a return to the app — a DOM `visibilitychange` with `document.visibilityState`
  overridden, since `tg.onVisible` listens to the document — and «Вернуться в бот» calls the fake `close`; first
  launch (the stub scenario `first_launch` of WP-11, set with the `homi_stub_scenario` cookie that WP-22 forwards —
  it reaches `me` in both session modes), cookie and header mode → the heading in the Telegram language, «English»
  sends one Server Action (in header mode its arguments carry the token and there is no `homi_session` cookie) and
  the address becomes `/en/welcome/city` without a reload, then a city pick sends the second action and opens
  `/en?city=andijan` (the `PATCH /settings` body is sent by the server and is asserted in the unit test of
  `updateSettings` against a fake API); launch with `startParam: 'l_42'` on a first launch → the language page
  first (row 5 holds the launch redirect), then the listing, then Back → `/ru/welcome/city` with no BackButton and
  the counts, then a located pick (a fake position near Andijan) → `/ru?city=andijan`; sign-in answering "too old"
  (`401` with `auth_expired`, fulfilled by the spec, as `session.spec.ts` does) → session-expired screen, «Закрыть»
  calls the fake `close`, no further sign-in. The header-mode expired test takes another path: the session is made
  in header mode, a `/bff/listings/count` read answers `401` and the new sign-in `401 auth_expired`, because
  `launchApp`'s header-mode route answers `/bff/session` in front of any route registered before the launch.
  «Перейти в бота» is not asserted in a browser: CI builds without `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
- `shell.spec.ts` (16 tests): tab round trip keeps the search parameters, the list or map view and the last saved
  list; pull on the feed calls the handler once, a short pull and a pull under a sheet do nothing; a sheet route
  closed by BackButton, backdrop, × and drag, the page below locked (these three in both modes); collapse on scroll
  and first tap expands; view toggle list → map → list with the map bar's lasso, area and filters; «Своя область»
  and its ×; deal switch keeps `districts` and ignores the active deal; a sheet address loaded directly: a backdrop
  tap and a drag leave the address unchanged, × goes to `/?rooms_min=2`. The part B proofs on the gallery: one
  toast host (bottom 140 px = tab bar 62 + 78, z 60), tap, the action once, a replacement; `/filters` closed four
  ways; `/listing/42` closed by Back; `/settings/theme` by Back and by swipe with an iOS User-Agent, no swipe with
  an Android one.
- `crash.spec.ts` (4 tests, ru and uz in cookie and header mode): the gallery's "throw" button → crash screen
  (`[data-route="error"]`, `role="alert"`, title and text in the address locale, one button, `lang` unchanged, no
  page error) → «Обновить» reloads (a main-frame navigation; a window mark is gone) → the gallery again with a
  ready session. The uz runs use the `uz` stub scenario, because the locale guard moves the address to `me.locale`;
  en is not run, as no stub `me` has `locale: en`.
- `foundation.spec.ts` (WP-20, D-S-16): the three locale-redirect tests read the address the document was served
  at (`page.goto`'s response URL), since `page.url()` raced the `/outside` replace, and the `lang` test also lands
  on `/<locale>/outside`; the browser tests (not-found, layers, themes) run inside the fake Telegram with every
  `/bff/session` request aborted, so the session stays `booting` (row 1) and they make no API request; a
  request-level test asserts that an unknown address or parameter is a normal document with the boot script and
  `noindex`.

## Acceptance checklist

Run in ru, uz and en, light and dark, in the emulator and (shell lines) inside Telegram on staging.

Gates

- [ ] Opened without Telegram: only «Откройте приложение через бота в Telegram.», no button, no API request.
- [ ] Each of the five refusal reasons shows its title and text; an unknown reason shows the `private` pair;
      `invite` reads «Вход по приглашению», `full` «Сейчас все места заняты. Попробуйте позже.», and no text mentions
      a beta (SCR-003).
- [ ] `paused` shows «Бот на паузе» with its text and «Вернуться в бот»: no start link, whatever the start parameter
      (DEC-60; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `accessReason` for a later package
      (`wave-1/baseline.md`, built code behind the pin, row 28)).
- [ ] The checking line shows during the three automatic re-checks and never for `blocked`.
- [ ] After access is granted the app opens by itself, without a reload.
- [ ] «Перейти в бота» carries `s_web--l123` for `l_123-web` and `s_share--l123` for `l_123`; without a start
      parameter the button is «Вернуться в бот» and closes the app.
- [ ] A `seo` start parameter builds `s_seo_en--l123` with the interface in en and `s_seo_uz--l123` in uz (*added by
      the intake of `index-CIa0Ldj2.js`*; a parity item of `accessReason` and `build.ts` for a later package
      (`wave-1/baseline.md`, built code behind the pin, row 29)).
- [ ] «📢 Открыть пост в канале» appears only for a channel-and-post start parameter and opens that post.
- [ ] «Написать в поддержку» appears only when a support account is known.
- [ ] First launch: the language page shows the heading in the Telegram language, the other two in the subtitle,
      the Telegram language as the first, accent button.
- [ ] Picking a language switches the address and all texts without a reload; a failed save re-enables the buttons and
      shows «Не получилось сохранить» under the list, with no toast (*added by the intake of `index-CIa0Ldj2.js`*; a
      parity item of `LanguagePicker` for a later package (`wave-1/baseline.md`, built code behind the pin, row 30)).
- [ ] With several cities and no chosen city the city page blocks the app: no ×, no Back; only a pick leaves it.
- [ ] Location: denied, failed and "too far" each show their text; success picks the nearest city at once.
- [ ] City rows show «N аренда · M продажа» when counts are known and no line when they are not.
- [ ] A launch by a listing link shows the listing first; the city page appears after the listing is closed.
- [ ] Six failed start attempts (the first and five retries, D-S-3) end in «Нет связи» or «Не загрузилось» with
      «Повторить»; returning to the app retries at once.
- [ ] Expired session: «Сессия устарела — закройте и откройте приложение снова» and «Закрыть», which closes the app.

Shell

- [ ] Each top-bar variant shows the texts and controls listed for its tab; the map filters badge counts the
      active groups.
- [ ] Rent ↔ sale keeps districts, zones and a drawn area and resets the rest; tapping the active deal does nothing.
- [ ] The four tabs switch with a light haptic and scroll to top; BackButton stays hidden on every tab.
- [ ] Leaving the search tab and coming back restores the same filters, sort and list/map view.
- [ ] The search list keeps its scroll across the other tabs, the map and SettingsButton; a second tap on the search
      tab scrolls to the top (DEC-63; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `TabBar` for a
      later package (`wave-1/baseline.md`, built code behind the pin, row 14)).
- [ ] After a long return «Показать N новых» shows in the top bar of the search list in three locales; a tap reloads
      the list at the top (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `TopBar` for a later package
      (`wave-1/baseline.md`, built code behind the pin, row 13)).
- [ ] The collapsed title of daily rent has no «Аренда» in front (DEC-66; *added by the intake of
      `index-CIa0Ldj2.js`*; a parity item of `MiniTitle` for a later package (`wave-1/baseline.md`, built code behind
      the pin, row 32)).
- [ ] «Карта» / «Список» switch the view and keep the filters; the button is hidden while drawing.
- [ ] Scrolling the list down collapses the chrome to the one-line title; scrolling up or reaching the top
      expands it; the first tap on a collapsed tab bar, toggle or title only expands.
- [ ] Long tab labels (uz, en) do not overflow at 320 px.
- [ ] Pull-to-refresh arms at 72 px with one haptic, spins at least 0.7 s, and does nothing on the map, on
      settings and under any sheet or listing.
- [ ] A sheet closes by ×, backdrop, drag and BackButton; the page under it does not scroll.
- [ ] A sheet address loaded directly shows the standalone presentation: no backdrop tap, no drag; × and Back go to
      the parent address with the search parameters kept.
- [ ] A sub-page closes by BackButton and by swipe back on iOS and on the touch screens of the desktop clients (the
      swipe is touch only); no swipe back on Android.
- [ ] Without the SDK (`launchApp(page, { sdk: false })`) a sub-page shows the fallback close; it closes the sub-page
      and goes when the SDK arrives (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `SubPage` for a
      later package (`wave-1/baseline.md`, built code behind the pin, row 19)).
- [ ] Lite graphics: the chrome collapses without the morph and without the mini title.

Feedback and errors

- [ ] A plain toast leaves after 4 s or on tap; a toast with an action after 6 s; the action runs once; a new
      toast replaces the old one.
- [ ] A toast dragged down past 36 px closes, a shorter drag returns. Its offset follows what is below it: 20 px above
      the tab bar and the bottom inset; 78 px above them while the view toggle is shown; 16 px above the bottom inset
      over a sub-page; 88 px above the bottom inset over the listing's CTA bar
      (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `ToastHost` for a later package
      (`wave-1/baseline.md`, built code behind the pin, row 4)).
- [ ] The confirm helper opens Telegram's native dialog (the browser's outside Telegram).
- [ ] A forced render error shows «Что-то пошло не так» with «Обновить», which reloads; one error report is queued.
- [ ] An unknown address inside the app shows «Такой страницы нет» with the way back to search.
- [ ] `dev023CityCountsIncludeDaily` is off in `lib/flags.ts`; `dev016ErrorToastOnFailure` is on by default since the
      intake of `index-CIa0Ldj2.js` (DEC-58) and `dev016SuccessToastOnDestructive` is off; both branches of each are
      covered by tests (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `lib/flags.ts` and `failed()`
      for a later package (`wave-1/baseline.md`, built code behind the pin, row 21); as built both flags of this
      package are off).

## Handoff

- **Steps 1–20 are done** on `feat/wp-23-gates-and-shell`, in four parts, each ending in a mergeable state: A
  `292e68a` (the `@homi/ui` primitives and the dev gallery), B `bba0937` (toast, feedback, confirm and the route
  wrappers), C `a797ac9` (the shell), and D in two commits, `e36b752` (D1: the settings action, the gate machinery,
  the boot retry and the error screens) and `fb4a2b2` (D2: the four gate screens, `CityList`, `nearestCity`,
  `e2e/gates.spec.ts`). Each part ran as a workflow: implementers in parallel, an integrator, a review (in D1 and D2
  three lenses: spec, correctness, quality), fixes, a final check; the main session re-ran each part's checks.
  Mutation checks where the evidence records them: the D1 review found surviving mutants of the boot-retry waits (the
  test read the module's own constants; now pinned with literals), of the `429` kind (now two series, ending in
  `server` and in `rate_limited`) and of the SettingsButton rule (the extended test now kills it); the D2 review found
  the 16 / 110 km lines unpinned (now literal points), a `NoAccessScreen` `ErrorState` that always used the offline
  texts (both kinds now assert the title) and a `WelcomeCity` guard that no test exercised (removed); the D2
  integrator made the stub refuse `join` four times instead of two, and `gates.spec.ts` failed as it should. The
  checklist lines with the tests that prove them are in the PR description, ticked there where a test proves them; the
  boxes here stay unticked, because every line also asks for light and dark and the emulator, which are manual (Next,
  item 4).
- **Checks** (on `fb4a2b2`, from `frontend/`): `pnpm --filter @homi/ui test` → 8 files, 111 tests passed; `pnpm
  --filter @homi/i18n test` → 10 files, 109 passed; `pnpm --filter app test` → 81 files, 977 passed; `pnpm -r lint`
  and `pnpm -r typecheck` → exit 0; `make ci-frontend` (from the root) → exit 0 (`@homi/types` current; lint,
  typecheck and build of `landing`, `arm` and `app`; tests: app 977, `@homi/search` 238 + 1 todo, `@homi/ui` 111,
  `@homi/i18n` 109, `@homi/testing` 95, `@homi/api-client` 14, `@homi/utils` 2). Playwright, the full `miniapp`
  project against the local API on stubs, `env -u CI pnpm exec playwright test --project=miniapp --workers=1` (85
  tests): 82 passed, 3 failed — `shell.spec.ts:319`, `:330` and `:365`, each waiting for `data-session="ready"`; the
  nginx API log shows `429` on `GET /api/v1/me` and `/api/v1/listings/count` at 18:51:22–18:51:35 and 122 `/api/v1`
  requests in the minute 18:50, over the stub user's 120 a minute (`configureRateLimiting` of `AppServiceProvider`);
  `shell.spec.ts` alone right after → 16 passed (51.3 s). Before the D2 review fixes, the D2 integrator's second full
  run → 85 passed (2.2 min, no `429` in that window); after them, the D2 verifier's full run → 84 passed, 1 failed
  (`shell.spec.ts:319` on `429`s), `shell.spec.ts` alone → 16 passed. `smoke.spec.ts:25` shows a cross as its expected
  `test.fail`. CI (`.github/workflows/frontend-e2e.yml`) starts the API with `CACHE_STORE=array` under PHP's built-in
  server, so the limiter does not accumulate between requests there: the limit is a local-machine problem.
- **Corrections made in this specification (rule 6):** Scope (`GateWait`, `useSheetChrome`, `useBodyClass`, the
  icon re-exports, the gallery, the WP-21 code this package changes); the Next.js facts on focus and on `notFound()`
  outside `<Suspense>`; Gates — `GateRedirector`'s place in the layout, its router and once-per-address rule, the
  locales of rows 4 – 7, a target already shown stays, row 6 waits for `launchPending()`, `gateState.onGate` and the
  wider `isGatePending()`, `releaseLaunchGate()`, `launchPending()` / `launchTarget()`, `parentOf` unchanged, the
  SettingsButton rule, `bootRetryStore.ts`, `error: SessionError | null` and `pending` instead of `error?: UiError`,
  the bootstrap changes of D-S-2; Shell — the drawn variant, `none` for the gates, `/dev/ui` and unknown addresses,
  layers keeping the chrome of the page below (`isLayerAddress`), `matchRoute` / `searchKeysOf` instead of a
  `routeKindOf`, the `shellState` exports and the search keys of `lastSearchHref()`, `write(filters, sort)`,
  `miniTitleSummary`, `RouteSheet`'s standalone presentation (Escape, rendered in place, the remount after a drag),
  `RouteOverlay`'s `swipeBack`, `className` and missing top inset; Primitives — the `BottomSheet` props `stacked`,
  `closeOnEscape`, `portal`, `onDragCommit`, `className`, the Radix parts composed directly, pointer events for the
  sheet drag and touch events for swipe back, `EmptyState` `tall` and `titleAs`, the icons row, the dark
  `SegmentedControl` segment, the `ChoiceList` look, the single reduced-motion rule, the z aliases, the widened
  source guard; Toast — a plain `role="status"` host instead of the Radix Toast, the store's API, `run` typed with a
  promise, `failed(options?)`; the settings action `updateSettings(input, auth?, locale?)` and its validation; Files
  (new `GateWait`, `SessionExpired`, `bootRetryStore`, `useRenderReport`, `prefersReducedMotion`, `RefreshProof`,
  `styles/shell.css`, `UiGallery`; `TelegramButtons` is changed; `lib/session/*`, `launch.ts`, the `parse.ts` fix,
  `useReference`, `validate.ts`, `useSearchState`, `routes.ts`, `boot.js`, the catch-all page and the placeholders
  the wrappers wrap); steps 2, 6, 10, 11, 13, 16, 18 and 19; Behaviour — six attempts, `checking` and the
  visibility rule; `/outside` as a client heading with `GateWait`; the no-access accent, wait, post row
  (`launch.postUrl`, also for `blocked`), support row without a listing number, haptics and the
  start-parameter-only main button; the language picker's full mapping, locale filter, `lang`, group,
  `aria-disabled`, focus, and the next gate instead of a navigation of its own; `CityList`'s props, status line,
  `aria-disabled`, own 12 s bound and a row winning over a late position; the city pick not awaited, its return
  address and one pick per showing; the radio title tabs, the map bar at 320 px and its button names, the one-line
  drawing hint, the saved tabs, the `long` rule that never applies yet, the lens, the tab-press scroll on commit and
  on the active tab, the tab bar on the map, the mini title's base deal, the legacy pixels; Escape and the light
  impact of the sheets, swipe back touch only; `touchcancel`, the disarm, the report and the indicator of
  pull-to-refresh; the toast offset, report kinds and look; the crash, global-error, not-found and session-expired
  screens; Tests — the unit and component additions, and the end-to-end section rewritten to what `shell.spec.ts`,
  `gates.spec.ts`, `crash.spec.ts`, `data.spec.ts` and `foundation.spec.ts` do (not "every spec in cookie mode and
  header mode"); checklist lines "six failed start attempts" and "swipe back on iOS and on the touch screens of the
  desktop clients".
- **Assumption mismatches** (`docs/ai/reports/phase-3-notes.md` §U): AM-59 `notFound()` outside `<Suspense>` serves
  Next.js's `__next_error__` shell without the boot script; AM-60 Next.js moves no focus and announces nothing on a
  replace into a gate; AM-61 every e2e spec in both session modes against the stub user's API limit; AM-62 rem
  spacing under the 15 px root font; AM-63 WP-21's `sourceOf()` dropped the digits of a campaign code; AM-64 the
  browser location request is not bounded by 12 s.
- **Decisions of the implementation** (no ADR), those later packages build on: `GateRedirector` owns every
  navigation into and out of a gate, the pickers never navigate and `LocaleGuard` skips gate routes (D-S-6); the
  boot retry runs once and publishes through a module store that the shell and the gate pages read (D-S-3: six
  attempts, `ErrorState` after the sixth); `lib/navigation/routes.ts` stays the one address parser (`matchRoute`,
  D-S-9); a layer address reached by a soft navigation keeps the chrome of the page below (`isLayerAddress`,
  `useDrawnVariant`); `useBodyClass` is generic and counted per class (D-UI-2); `BottomSheet` composes the Radix
  parts itself and stacks a second sheet with `stacked` (D-UI-3); the toast host is the app's own, not Radix
  (D-T-1), at the legacy offset (D-T-2); swipe back takes touch events, the sheet drag pointer events; the shell
  spells legacy pixels because the root font is 15 px; with one city or a failed reference the city gate is skipped
  for that launch (D-S-12); the crash and not-found screens use the neutral brand placeholders (D-E-1); the gallery
  stays behind the `NEXT_PUBLIC_APP_ENV` guard (D-E-4).
- **Open for the reviewer:**
  - remove the unused `Sheet*` and `Toast*` exports of `@homi/ui` (the app uses `BottomSheet` and its own
    `ToastHost`)?
  - a production build still emits the gallery's client chunk (the guard blocks the rendering only): WP-33 removes
    `/dev/ui` or confirms the guard with that known;
  - the not-found screen has no tab bar, only its «К поиску»: add the tab bar there?
  - the tab bar stays on the map (legacy hides it; WP-28's spec, «between the top bar and the tab bar while
    drawing», assumes it stays); the collapsed view toggle has no ring (legacy draws a right one); the tab-bar lens
    uses `--sep` instead of the legacy colour mixes;
  - should the mini title read «{city} целиком» (`filtersAreaSummary`)? Still open from WP-22;
  - the title-tab radio group and the map's segmented control have no group name, and the map filters button's
    name «Фильтры, 4» is not a catalogue text: add `homi` keys?
  - spacing: the shell, `NoAccessScreen` and `LanguagePicker` spell legacy pixels, the part A primitives do not;
    `--spacing: 4px` in `@theme` grows every primitive to its legacy size (the gallery needs a look): here, or the
    KI candidate below?
  - the drawing hint is one line with an ellipsis, as legacy; uz `map.areaHint` (46 characters) is cut at every
    phone width and en at ≤ 390 px; two lines would be a deliberate deviation from legacy;
  - `--chrome-fullscreen` / `--chrome-mini` of `layout.css` are read by nothing; remove both rules and the
    `packages/ui/tests/tokens.test.ts` assertion that pins them (a test is deleted: needs approval)?
  - `city.countsDaily` uz / en follow the spec table, not legacy `city.counts`; aligned they would read uz
    «{rent} ta ijara · {daily} ta kunlik · {sale} ta sotuv», en «{rent} to rent · {daily} daily · {sale} to buy»;
  - SettingsButton flickers on a gate entry (shown when the session turns ready on `/`, hidden one navigation later
    on `/welcome/language`; seen in the fake Telegram's call log): accept, or give `TelegramButtons` the gate
    decision?
  - BackButton stays available on the crash screen when the history depth is > 0, and pressing it clears Next's
    boundary: keep, or hide it while the boundary shows?
  - a first launch by `?news=pets`: language → feed → the launch opens the filters sheet → row 6 replaces it with
    `/welcome/city`, and the pick returns to the feed of the city, so the pets sheet is lost: should row 6 also wait
    while the launch's sheet is open?
  - the checking line of `/no-access` is a plain `<p>` (legacy) with no live region: announce it (`role="status"`)?
  - `NoAccessScreen` and `LanguagePicker` repeat the legacy `.lang-pick` layout classes: extract one small layout
    component?
  - the city page still spells its spacing in rem classes (`CityList` rows `px-1`, `gap-3`, the 32 px icon as
    `size-8` = 30 px; the `WelcomeCity` title `px-5 pt-2.5 pb-1.5`): spell the legacy `city-sheet.css` pixels too?
  - the no-access screen reads `parseLaunch(tg.initData(), location.search)`, and its query is `?reason=`, so only
    the start parameter (never `?listing=`) can make «Перейти в бота», as the rule above says: confirm;
  - the size: about 6 150 lines of code and styles against the estimate of ≈ 3 000 (against `7792c67`: 151 files,
    +14 774 / −140; the app's tests and e2e 47 files, +7 013; the packages' tests 9 files, +1 609; one generated
    file, `boot/inline.generated.ts`, 1 line).
- **Known-issue candidates** for the follow-up docs PR (KI-32 onward):
  - the full local e2e run (one worker) reaches the one stub user's API limit of 120 a minute: `429` on `/me`, then
    `502` from `/bff/session` and a session left `booting`; each spec passes alone; CI is not affected
    (`CACHE_STORE=array`);
  - Tailwind's rem spacing is 6.25 % small under the 15 px root font: the primitives (`Button` `size-10`,
    `SegmentedControl` `h-9` / `p-1` / `gap-1`, `Chip` `h-9` / `px-3.5`, every `gap-*` / `p-*`) are below their
    legacy sizes; the one-line fix is `--spacing: 4px` in `@theme`, with the gallery checked;
  - the generated `UpdateSettingsRequest` types `city` as the stub's three-city enum; the cast in `settings.ts` goes
    stale once a real reference driver serves more cities;
  - a late SDK (SCR-002, a start while `outside`) skips the DeviceStorage restore: `prepare()` is memoised and
    restored before any SDK existed;
  - every `notFound()` under `<Suspense>` puts two identical `noindex` tags in the client head (Next.js 16.4.5: one
    from the server, one from the client boundary); the catch-all's `__next_error__` shell is fixed here;
  - `/bff/session` answers an API `429` with `502` (its `refusal()` maps only `401` / `403`; the read
    pass-through keeps the status), so a sign-in sees `server`, never `rate_limited`;
  - backend: an unauthenticated `GET /api/v1/me` without `Accept: application/json` answers `500` «Route [login]
    not defined.» instead of `401` (the BFF sends the header, so the app is not affected);
  - `viaBrowser()` of `lib/telegram/location.ts`: `getCurrentPosition`'s timeout does not count the permission
    prompt, so the adapter's promise can stay pending; `CityList` bounds it itself (12 s);
  - `launchPending()` waits for the address to show the launch target: if that push is ever dropped, the launch
    stays pending and row 6 never fires in that launch;
  - the full-screen layers (`RouteOverlay`, `SubPage`) move no focus on open, restore none on close and leave the
    page below in the Tab order (owners WP-26, WP-31; WP-33);
  - `SubPage` and a swipe-enabled `RouteOverlay` keep their layer slid out until unmount; if one ever stays mounted
    across its own `back()`, it needs the remount of `RouteSheet` (WP-26, WP-31);
  - `usePathname` / `useSearchParams` are global, so the page kept below an intercepted layer, and the chrome, read
    the layer's address (under `/listing/42` the feed's `useSearchState()` sees no filters); out of sight under the
    opaque listing, visible during WP-26's swipe back (WP-24, WP-26; since WP-24 the feed list and its top bar hold
    their own search through `useScreenSearchState('feed')`, while `ViewToggle` and `MapBar` still read the global
    address);
  - Playwright with `CI=1` on a developer machine skips the mkcert `NODE_EXTRA_CA_CERTS` that `playwright.config.ts`
    adds otherwise, so every sign-in answers `502` unless the shell exports it: run it locally without `CI` and with
    `--workers=1`.
- **Shared files:** none in this PR besides `.ai/memory/current-state.md` and `.ai/memory/session-handoff.md`, as
  in #61. `CLAUDE.md` "Current state" (the WP-23 sentence) and `.ai/memory/known-issues.md` (the candidates above)
  follow in the follow-up docs PR after the merge, as for WP-20 … WP-22. No CI workflow, lockfile, `package.json`,
  `.env.example` or Vitest / Playwright config is changed.
- **For the next packages:** WP-24 mounts `FeedHeader` in the search list's `chips` region, replaces `RefreshProof`
  with the feed's own handler (`registerRefresh`) and the feed's `SearchProof`, renders `ErrorState` /
  `EmptyState`, and needs "the address of the page below" for `useSearchState()` (the KI candidate above) so the
  list kept under a listing keeps its filters and scroll; WP-25 wraps `CityList` (`showCheck`, `current`, `stats`
  of `useCitiesStats()`) in the city sheet, `stacked` over the filters, builds the filters, sort and city sheets on
  `RouteSheet` (both presentations, the `pick=city` remount), mounts `<ToastHost scope="sheet">` in the filters
  sheet, and calls `requestDraw()` and `updateSettings({ city })`; WP-26 fills the existing `RouteOverlay` of both
  listing layouts and turns `swipeBack` on once the data shows and no layer is open over it, holds `listing-open`
  with `useBodyClass`, uses `RouteSheet`, `failed()` and `ErrorState`, and owns the focus, slid-out and page-below
  candidates of the layer; WP-28 raises `RouteOverlay` with `className` for the fullscreen map (z 100, never
  `swipeBack`), writes `setAreaTooSmall()`, calls `consumeDrawRequest()` and fills the map and drawing top-bar
  variants built here; WP-30 gives the radars «+» its action with `routes.radarNew(lastSearchQuery())`, uses
  `confirmText`, `failed()`, `EmptyState` and `ErrorState`, and its `/radars/new?entry=feed` keeps the feed's
  chrome; WP-31 wraps each settings page in `SubPage` (`/settings/theme` already is), extends `SettingsInput` and
  the body of `updateSettings` with the other keys of `PATCH /settings`, and uses `ChoiceList`, `SegmentedControl`,
  `failed()` and `confirmText` (`hidden.confirmAll`); WP-32 gives `reportError` its transport (the `render`,
  `toast` and `pull-to-refresh` reports of this package), adds the global handler with the `ApiError` /
  `AbortError` skip, and writes `errors.spec.ts` on the gallery; WP-33 decides the gallery, the focus of the
  full-screen layers and the rem-to-pixel fix with the gallery, and runs the manual lines (long tab labels at
  320 px, the lite collapse, light and dark, inside Telegram).
- **Merged** on 2026-11-16 on the developer's «сливай #68» (merge commit `901eaad`), after `frontend` (run
  43887095870) and `frontend-e2e` (run 43887095850, 85 passed) were green on `f12574c`; `frontend` on `main` after
  the merge: run 43888986489, green. This status, the queue row, `CLAUDE.md` ("Current state" and "Layout"), the
  known issues KI-32 … KI-43 (the candidates above; the two local Playwright ones are one entry, KI-32) and the
  memory are in the follow-up docs PR.
- **Next:**
  1. ~~review and merge~~ (done);
  2. ~~the follow-up docs PR~~ (this status, the queue row, `CLAUDE.md`, KI-32 … KI-43, the memory);
  3. the production track deploys — nothing beyond the regular deploy (see the header);
  4. check inside Telegram on staging the lines that need it: the shell lines, long tab labels at 320 px, the lite
     collapse, a real client's native confirm, light and dark; the no-access screen stays unreachable there
     (mode "open", DEC-43);
  5. set the status to `DONE`. WP-24 (feed and listing card) builds on this package.
