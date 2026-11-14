# WP-23 — Gates and shell

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
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
  the `GateRedirector` that chooses between them, the retry timers of the access gate, and the shared `CityList`
  with the nearest-city search.
- Shell (SCR-006): `AppShell`, `TopBar` with all its variants, `TabBar`, `ViewToggle`, `MiniTitle`,
  `useMiniChrome`, the two slot hosts, and the "last search address" memory that keeps filters across tabs.
- Pull-to-refresh (SCR-010), toast (SCR-042), confirm helper (SCR-043), crash screen (SCR-045),
  `[locale]/error.tsx`, `app/global-error.tsx`, `[locale]/not-found.tsx`, the session-expired screen.
- Primitives in `@homi/ui`: `BottomSheet` + `useSheetDrag`, `SubPageFrame` + `useSwipeBack`, `Chip`
  (`HeaderChip`, `FilterChip`), `SegmentedControl`, `ChoiceList`, `ErrorState`, `EmptyState`, `RadarIcon`.
- App wrappers in `features/shell/`: `RouteSheet`, `RouteOverlay`, `SubPage`, `ToastHost`, `PullToRefresh`;
  `lib/ui/toast.ts`, `lib/ui/feedback.ts`, `lib/ui/confirm.ts`.
- The first Server Action over `PATCH /settings` (`locale`, `city`).

**Out.**

- Boot-failure screen, Telegram adapter, session bootstrap, BackButton and SettingsButton wiring, deep-link
  parsing, location service — WP-21. This package only consumes them.
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
| Defects and flags | DEC-36 | LB-APP-027 and LB-APP-035 are `DEV` rows (DEV-016, DEV-023): both branches are written and tested, the flags `dev016ErrorToastOnFailure` and `dev023CityCountsIncludeDaily` stay off |
| Brand | DEC-40, 25 §2 rule 5 | The bot name and links come from `lib/brand`; no brand word is written in a component |
| Access | DEC-43 | The gate is built for all five reasons although the mode is "open" |
| Acceptance | DEC-46, 25 §9 | The acceptance checklist below is ticked in ru / uz / en and light / dark |
| Baseline | 25 §8.1 | The no-access texts changed after the audited release; the strings quoted below are those of the audit and are replaced by the re-baselined audit of WP-02 where it differs |

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
  (`use-search-params.md`): `AppShell` reads the address inside one.
- `router.push` / `router.replace` take `{ scroll: false }` (`use-router.md`).

### Gates

`features/gates/resolveGate.ts` is a pure function; `GateRedirector` (Client Component mounted in
`[locale]/layout.tsx`) calls it on every change of session, `me`, reference data or address and navigates with
`router.replace`.

| Order | Condition | Result |
| ----- | --------- | ------ |
| 1 | `status = 'booting'` | no redirect; the current route renders its loading state |
| 2 | `status = 'outside'` | `routes.outside()` |
| 3 | `status = 'expired'` | `SessionExpiredScreen` rendered in place of the route (not a route) |
| 4 | `status = 'denied'` | `routes.noAccess(reason)`, in the locale of the full Telegram language mapping |
| 5 | `ready`, the user has no chosen locale and none was picked in this launch | `routes.welcomeLanguage()` |
| 6 | `ready`, more than one city, `me` says the city is not chosen, none picked in this launch, address is not a listing | `routes.welcomeCity()` |
| 7 | `ready` and the address is a gate route | the remembered return address, else `routes.feed()` |

- `features/gates/gateState.ts` (module memory, this launch only): `returnTo`, `localePicked`, `cityPicked`,
  `isGatePending()`. The launch redirect of WP-21 (listing deep link, `?news=`) must not fire while the language
  gate is pending; WP-21 left the hook for it: `GateRedirector` registers
  `setLaunchGate(() => !isGatePending())` (`lib/deeplinks/launch.ts`) when it mounts.
- Rows 5 and 6 read the flags of `me` per the WP-11 contract (legacy `locale_chosen`, `city_chosen`); row 6 fires
  only on a strict "not chosen" (Q-APP-013).
- Gate routes have no parent: `parentOf()` returns `null` for `/welcome/*`, `/no-access` and `/outside`, so
  BackButton stays hidden there (fix `routes.ts` of WP-20 in this PR if it differs). `TelegramButtons` of WP-21
  also hides BackButton while `status = 'expired'`.
- `features/gates/useBootRetry.ts` owns the timers of BR-APP-054 and calls `retry()` of the session bootstrap. It
  needs from `useSession()` the outcome of the last attempt (`error?: UiError`); add it to the provider of WP-21 in
  this PR if it is missing.

### Shell

`app/[locale]/(main)/layout.tsx` (Server Component, reads nothing per request) renders
`<AppShell sheet={sheet} overlay={overlay}>{children}</AppShell>`. `AppShell` is a Client Component:

```text
MiniTitle            search list only
TopBar               variant from shellVariantOf(pathname, searchParams)
{children}           the page
ViewToggle           / and /map, hidden while drawing
PullToRefresh        indicator
TabBar
{overlay}            @overlay slot (below sheets)
{sheet}              @sheet slot
```

- `features/shell/shellVariant.ts`: `shellVariantOf()` → `search-list` (`/`, `/filters…`, `/sort`, `/city`),
  `map` (`/map`), `map-drawing` (`/map` with `draw=1`), `saved`, `radars`, `settings`, `none` (`/listing/…`:
  the listing covers the chrome). The active tab follows the same mapping.
- `lib/ui/shellState.ts` (module store): `lastSearchHref`, `lastSavedHref` (written by `AppShell` whenever the
  address is a search or saved root), `areaTooSmall` (written by WP-28), `refreshHandlers` (pull-to-refresh),
  and the one-shot draw request `requestDraw()` / `consumeDrawRequest()` (set by the filters sheet of WP-25,
  consumed by the map of WP-28, which then opens drawing as a pushed `draw=1` layer so Back can cancel it).
  Legacy keeps filters, sort and the list/map choice in memory across tabs; here the search tab returns to
  `lastSearchHref`, and the radar «+» passes the query of `lastSearchHref` to `routes.radarNew(q)`.
- `TopBar` holds no data: it reads `useSearchState()` (WP-22) for the deal, polygon and active-filter count and
  calls `switchDeal`, `normalizeSort`, `countActiveFilters`, `filtersSummary` of `@homi/search`.
- The search-list variant has a `chips` region that renders nothing here; WP-24 mounts `FeedHeader` in it.
- `RouteSheet`, `RouteOverlay` and `SubPage` are wrappers that later route files use around their content; they
  connect the `@homi/ui` primitives to `useBack()`, `tg.haptic` and the platform check of WP-21.
- `RouteSheet` takes `presentation: 'layer' | 'standalone'`. `layer` (default) is the sheet in the `@sheet` slot:
  backdrop, drag-to-close, × and Back all call `back()`. `standalone` is the same content on a direct load of a
  sheet address (`/filters`, `/filters/<kind>`, `/sort`, `/city`, the radar sheets): there is no page below, so no
  backdrop tap and no drag-to-close; × and Back go to `parentOf(pathname, searchParams)` of WP-20, which keeps the
  search state and returns `/map` when `from=map`, else `/`. `RouteOverlay` has the same two presentations.

### Primitives (`frontend/packages/ui/src/`)

| Component | Contract |
| --------- | -------- |
| `BottomSheet` | Props `open`, `onClose`, `dismissible` (default `true`), `variant: 'full' \| 'compact'`, `title`, `header`, `footer`, `closeLabel`, `onDragStart`. Built on the WP-20 `Sheet` (Radix Dialog). Sticky header and footer; `useSheetChrome()` writes their heights to `--fsheet-head` / `--fsheet-foot` |
| `useSheetDrag` | Drag on the handle area only: start 6 px, close at 25 % of the sheet height or 0.5 px/ms, settle 200 ms, backdrop dims with the drag. Exported constants |
| `useBodyClass` | Ref-counted `body.sheet-open` and `body.locked` |
| `SubPageFrame` | Fixed layer (`--z-subpage`), 24 % slide-in, header with a shadow when scrolled, optional hint, `bare` mode |
| `useSwipeBack` | Rightward swipe: start 10 px, close at 33 % of the width or 0.5 px/ms, settle 180 ms; option `enabled`; never starts inside `[data-no-swipe]`, `input`, `textarea`, `select` or a map container |
| `HeaderChip`, `FilterChip` | `HeaderChip`: highlighted state, optional count badge, `aria-label`. `FilterChip`: `aria-pressed`. Long labels ellipsise |
| `SegmentedControl` | Two or three options, one selected; compact size for the map top bar |
| `ChoiceList` | Radio list with a ✓ on the selected row |
| `ErrorState` | `kind: 'offline' \| 'server'`, `title`, `text`, `retryLabel`, `onRetry`, `tall`; icons WifiOff / CloudOff |
| `EmptyState` | `image`, `title`, `hint`, `action`; the image box is 120 px even when the asset is missing |

All gesture hooks read their latest callbacks through refs, settle instantly under `prefers-reduced-motion`, and
take haptics as callbacks. `@homi/ui` imports nothing from Telegram, routing or the catalogues; texts are props.

### Toast, feedback, confirm

- `lib/ui/toast.ts`: `showToast(message, scope = 'app')`, `dismissToast(scope)`. `message` is a string, an object
  `{ text, action, run }`, or `{ key, values }` (translated by the host). One toast per scope; a new one replaces
  the old and restarts the timer.
- `features/shell/ToastHost.tsx` (`scope` prop, default `'app'`; mounted in `[locale]/layout.tsx` so gates have it;
  WP-25 mounts a second host with scope `sheet` inside the filters sheet). Built on the Radix Toast primitive of
  WP-20 with swipe disabled — verify before use that it allows one replaced toast; otherwise a plain
  `role="status"` element. The behaviour below decides, not the primitive.
- `lib/ui/feedback.ts`: `failed()` plays `tg.haptic.error()` and, when `dev016ErrorToastOnFailure` is on, shows
  `{ key: 'common.saveFailed' }`; `saved()` plays `tg.haptic.success()`.
- `lib/ui/confirm.ts`: `confirmText(text): Promise<boolean>` delegates to `tg.confirm` (native from Telegram 6.2,
  `window.confirm` otherwise — the gate is WP-21's).

### Settings action

`lib/actions/settings.ts`: `updateSettings(input: { locale?: Locale; city?: string }, auth?)` → `PATCH /settings`,
returning `ActionResult` (WP-22). Called through `useAction()`, so header mode passes the token. WP-31 extends the
input type with the other fields.

## Files

New, under `frontend/packages/ui/src/`:

- `components/{BottomSheet,SubPageFrame,Chip,SegmentedControl,ChoiceList,ErrorState,EmptyState}.tsx`
- `hooks/{useSheetDrag,useSwipeBack,useBodyClass,useSheetChrome}.ts`, `icons/RadarIcon.tsx`, `index.ts` (exports)
- `frontend/packages/ui/tests/{gestures,BottomSheet,SubPageFrame,ErrorState,Chip}.test.tsx`

New, under `frontend/app/`:

- `features/shell/{AppShell,TopBar,TabBar,ViewToggle,MiniTitle,PullToRefresh}.tsx`
- `features/shell/{RouteSheet,RouteOverlay,SubPage,ToastHost}.tsx`
- `features/shell/{useMiniChrome,usePullToRefresh,shellVariant}.ts`
- `features/gates/{GateRedirector,OutsideScreen,NoAccessScreen,LanguagePicker,WelcomeCity}.tsx`
- `features/gates/{SessionExpiredScreen,CrashScreen}.tsx`
- `features/gates/{resolveGate,gateState,accessReason,useBootRetry}.ts`
- `features/city/CityList.tsx`, `features/city/nearestCity.ts`
- `lib/ui/{toast,feedback,confirm,shellState}.ts`, `lib/actions/settings.ts`
- `app/[locale]/dev/ui/page.tsx` (gallery; `notFound()` unless `NEXT_PUBLIC_APP_ENV` is `local`, `ci` or
  `staging` — `ci` is the value of the end-to-end build since WP-21, and `crash.spec.ts` here and
  `errors.spec.ts` of WP-32 use the gallery; WP-33 removes it or confirms the guard). It is the one route file
  added after WP-20, whose tree is otherwise closed
- `tests/{shell,gates,city,ui}/*.test.ts(x)`, `e2e/{gates,shell,crash}.spec.ts`

Changed:

- `app/[locale]/layout.tsx` (mount `GateRedirector`, `ToastHost`), `app/[locale]/(main)/layout.tsx` (`AppShell`)
- `app/global-error.tsx`, `app/[locale]/{error,not-found}.tsx`, `app/[locale]/{outside,no-access}/page.tsx`,
  `app/[locale]/welcome/{language,city}/page.tsx` (placeholders of WP-20 replaced)
- `lib/navigation/routes.ts` (only if `parentOf` needs the gate rule), `lib/session/*` (only if `error` or
  `refresh` is missing). `features/shell/TelegramButtons.tsx` of WP-21 already hides BackButton in the expired
  state and is not changed
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json` (new keys below)

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
2. `Chip`, `SegmentedControl`, `ChoiceList`, `ErrorState`, `EmptyState`, `RadarIcon` with their tests; export them.
3. `useBodyClass`, `useSheetDrag`, `useSheetChrome`, `BottomSheet` (full, compact, non-dismissible) with gesture
   tests on synthetic pointer events; gallery entries.
4. `useSwipeBack`, `SubPageFrame` with tests; gallery entry.

Part B — feedback and wrappers.

5. `lib/ui/toast.ts`, `ToastHost` (mounted in the root layout), `lib/ui/feedback.ts` with both flag branches,
   `lib/ui/confirm.ts`; tests with fake timers.
6. `RouteSheet`, `RouteOverlay`, `SubPage`; show one of each from the gallery through real routes
   (`/filters`, `/settings/theme` placeholders) to prove close-by-Back, drag, swipe and backdrop.

Part C — shell.

7. `shellVariant.ts`, `lib/ui/shellState.ts`, `AppShell` in `(main)/layout.tsx` with `TabBar` (replace navigation,
   `resetDepth()`, last-address memory, `long` label rule, lens).
8. `TopBar` variants: search list, map, map with area, drawing, saved, radars, settings; deal switch.
9. `ViewToggle`, `MiniTitle`, `useMiniChrome` and the "first tap only expands" rule on tab bar, toggle and title.
10. `usePullToRefresh`, `PullToRefresh` with its guards; a temporary handler on the feed placeholder for the test.
11. `e2e/shell.spec.ts`; tick the shell lines of the checklist.

Part D — gates and error screens.

12. `lib/actions/settings.ts` (`locale`, `city`).
13. `resolveGate.ts`, `gateState.ts`, `GateRedirector`, `useBootRetry.ts`; the `setLaunchGate` registration for
    the launch redirect of WP-21.
14. `OutsideScreen` and `/outside`.
15. `accessReason.ts`, `NoAccessScreen` and `/no-access`.
16. `LanguagePicker` and `/welcome/language`.
17. `nearestCity.ts`, `CityList`, `WelcomeCity` and `/welcome/city`.
18. `SessionExpiredScreen`; BackButton hidden in that state.
19. `CrashScreen`, `[locale]/error.tsx`, `app/global-error.tsx`, `[locale]/not-found.tsx`; new keys in the three
    `homi` catalogues.
20. `e2e/gates.spec.ts`, `e2e/crash.spec.ts`; run the acceptance checklist; update the queue and the handoff.

## Behaviour to reproduce

### Gate order and timers (03 §1.4, BR-APP-054, BR-APP-055)

- Legacy order: no `initData` → outside; access refused → no access; language not chosen → language picker;
  otherwise the shell. The first-launch city choice comes after the language and waits while a listing is open
  (BR-APP-055): a launch by a listing link shows the listing first and the city page after the listing is closed.
- While the session is being created the shell renders with skeletons (legacy: the shell with `meta = null`).
- A failed sign-in attempt that is a network error, a timeout or a server error is retried after 1, 3, 7, 15 and
  30 s. After the fifth failure the content area shows `ErrorState` (offline or server, texts below) with
  «Повторить», which resets the counter — the visible equivalent of the legacy feed error.
- A refusal is re-checked 3 times at 2.5 s, never for `blocked`. `tg.onVisible` (return to the app) resets both
  counters and retries at once, also for `blocked`.
- When a later attempt succeeds, the gate route is left automatically (row 7). No reload happens anywhere.
- An expired session is never retried by these timers; it is the state WP-21 raises (LB-APP-047, owned there).

### Outside Telegram (SCR-002, `/outside`)

- Trigger: no `initData` after the SDK wait of WP-21. A late SDK that brings `initData` starts the session and the
  gate leaves the page.
- One sentence, no buttons, no Back: `app.openViaBot` «Откройте приложение через бота в Telegram.» (uz «Ilovani
  Telegram boti orqali oching.», en «Open the app via the bot in Telegram.»).
- No API request, no session request, no analytics. The language is the locale of the address.
- In development the emulator of WP-21 overlays its form on this page.

### No access (SCR-003, `/no-access`)

- Reason from the sign-in answer per the WP-11 contract; whitelist `private | invite | full | blocked | join`;
  anything else, a missing or non-string value renders as `private`. The `reason` in the address is informative;
  the screen trusts the session state only.
- Layout: Lock icon, title, text, optional checking line, list of large buttons.

  | Reason | Title (`noAccess.title.*`) | Text (`noAccess.text.*`) |
  | ------ | -------------------------- | ------------------------ |
  | `private` | «Бот приватный» | «Приложение сейчас доступно только владельцу.» |
  | `invite` | «Закрытая бета» | «Войти можно по ссылке-приглашению: откройте её и нажмите «Старт» в боте.» |
  | `full` | «Мест пока нет» | «Все места в бете заняты. Попробуйте позже.» |
  | `blocked` | «Нет доступа» | «Доступ к приложению закрыт.» |
  | `join` | «Сначала — бот» | «Нажмите «Старт» в боте — после этого приложение откроется.» |

- Checking line `noAccess.checking` «Только что нажали «Старт»? Подождите пару секунд — проверяем доступ…» while
  an automatic re-check is pending; never for `blocked`; buttons stay enabled.
- Buttons, in order:
  - «📢 Открыть пост в канале» (`noAccess.openPost`) only when the start parameter carries a channel and a post
    (`l_<id>-[seo-]<channel>-<post>`, TMA-011); opens `channelPostUrl()`.
  - Main button: «Перейти в бота» (`noAccess.toBot`) opens `noAccessStartUrl(source, number)` of WP-21 (payload
    `s_<source>[--l<id>]`) when
    `brand.botUsername` is set, the start parameter is an `l_…` link and the reason is not `blocked`; `<source>`
    is `web`, a campaign code, `seo` or `share` (parser of WP-21). Otherwise «Вернуться в бот» (`noAccess.back`)
    calls `tg.close()`.
  - «Написать в поддержку» (`settings.support`) opens `supportUrl()` only when reference data carries a support
    account; while it is unknown the row is absent and nothing spins.
- The page appears in the Telegram language with the full mapping (`uz*` → `uz`, `en*` → `en`, else `ru`), as
  legacy does for this screen only; the pre-session detector itself is WP-21's (BR-APP-050, LB-APP-032).
- No Back; Telegram shows Close. Links go through `tg.openLink` (1.5 s same-address debounce, TMA-028).
- Whether any reason is active in production is unknown for legacy (Q-APP-014) and "none" for HOMI today.

### Language picker (SCR-004, `/welcome/language`)

- Layout: Globe icon; `h1` in the Telegram language — «Выберите язык» / «Tilni tanlang» / «Choose a language»
  (a constant in the component, not catalogue text, because the catalogue language is what is being chosen); a
  subtitle with the other two phrases joined by « · »; one button per locale of the reference data, the Telegram
  language first, the rest in server order; the first button is accent-coloured.
- Empty locale list (should not happen): the three known locales with «Русский», «Oʻzbekcha», «English».
- Tap: all buttons disabled; `updateSettings({ locale })`; on success `gateState.localePicked = true`,
  `patchMe({ locale, locale_chosen: true })` of WP-21 (not a re-read: on stubs `GET /me` keeps the old locale and
  the locale guard would turn the address back) and the address is replaced by the return address in the chosen
  locale (next-intl router, verify before use). No page reload: the launch counter of analytics does not restart.
- Failure: buttons enabled again and `failed()` — error haptic only, as legacy (LB-APP-027); with
  `dev016ErrorToastOnFailure` also the toast `common.saveFailed` «Не получилось сохранить».
- No Back. A second tap while saving is ignored.

### First-launch city (SCR-005, `/welcome/city`) and `CityList`

- Blocking page: title `city.firstTitle` «Где ищете жильё?», no close button, no checkmark, no Back, nothing to
  drag or tap away. Legacy shows it as a sheet over the feed; the page form is the accepted visual difference of
  25 §3.2.
- `CityList` props: `cities`, `stats`, `current`, `showCheck`, `showLocate`, `onPick(code)`. Rows: city name
  (server string) and, when stats exist for the city, `city.counts` «{rent} аренда · {sale} продажа» —
  long-term rent and sale only (LB-APP-035). With `dev023CityCountsIncludeDaily` the line is `city.countsDaily`.
  Stats still loading or failed: rows without the line.
- Location row, only when the adapter can request a location (TMA-035): «Определить по геопозиции»
  (`city.locate`) → «Определяем…» (`city.locating`) with a spinner, row disabled. Results:
  - denied → `city.locateDenied` «Нет доступа к геопозиции — выберите город из списка. Разрешить можно в
    настройках Telegram.»;
  - failure or the 12 s timeout of WP-21 → `city.locateFail` «Не получилось определить, где вы, — выберите город
    из списка.»;
  - no city in range → `city.locateFar` «Рядом с вами наших городов пока нет — выберите из списка.»;
  - found → success haptic and the city is picked at once.
- Nearest city (BR-APP-056, `nearestCity.ts`): towns within 16 km; then regions within 110 km; then towns within
  110 km; otherwise none. A region is what the contract marks as one (legacy: `zoom < 11`, Q-APP-004). Distances
  are haversine; coordinates never leave the device and are in no request or event.
- Pick on this page: `pickCity()` of `@homi/search` on the default filters (rule BR-APP-009, owned by WP-22),
  `updateSettings({ city })` with errors ignored, `homi-city` written through `lib/storage`,
  `gateState.cityPicked = true`, then the feed address with the city. A result that arrives after the page was
  left is dropped.
- With one city in the reference data the page is never shown.

### Shell (SCR-006)

- Top bar variants:
  - search list: title tabs «Аренда» / «Продажа» (`deal.rent_long`, `deal.sale`; daily rent counts as «Аренда»)
    and the chips region;
  - map: compact segmented deal control, lasso button (aria `map.area` «Обвести на карте»), filters button (aria
    `sheet.title` «Фильтры») with a badge of the active filter groups (rule BR-APP-011, owned by WP-22);
  - map with an area: pill «Своя область» (`map.areaOn`) and × (aria `map.areaRemove`), which clears the polygon;
  - drawing: `map.areaHint` «Обведите пальцем, где искать» or, after a too-small stroke, `map.areaSmall`
    «Обведите покрупнее»; sub-hint `map.areaMove` «Двумя пальцами — двигать карту»; «Отмена»
    (`map.areaCancel`), which closes the `draw` layer;
  - saved: title tabs «Избранное» / «Смотрели» (`app.saved.favorites`, `app.saved.history`), replace navigation;
  - radars: `h1` «Радар» (`tab.subs`) and «+» (aria `sheet.createTitle` «Новый радар»);
  - settings: `h1` «Настройки» (`tab.settings`).
- Deal switch (title tabs and map control): `switchDeal()` — the new deal's defaults, geography kept (rule
  BR-APP-002), sort back to `new` when unavailable (rule BR-APP-023); light haptic; scroll to top; tapping the
  active deal does nothing.
- Tab bar: «Поиск», «Избранное», «Радар», «Настройки» (`tab.search`, `tab.favorites`, `tab.subs`,
  `tab.settings`) with Search, Heart, `RadarIcon`, Settings at 24 px; a label longer than 13 characters gets the
  `long` class; the lens position is the CSS variable `--tab`.
- Tab press: light haptic, `nav.tab(href)` of WP-21 (a replace that also calls `resetDepth()`) to the tab's
  address (search → `lastSearchHref`, saved → `lastSavedHref`), scroll to top. Pressing the active tab scrolls
  to top. A press therefore ends the
  radar-return mode of WP-30, as legacy.
- View toggle: floating button showing the target — «Карта» (`app.view.map`) on the list, «Список»
  (`app.view.list`) on the map; keeps the search parameters; hidden while drawing; search tab only.
- Collapsing chrome: on the search list with no layer open, scrolling down more than 24 px past the anchor adds
  `html.chrome-mini`; scrolling up 24 px removes it; within 60 px of the top it is always expanded. While
  collapsed, the first tap on a tab, the toggle or the mini title only expands (light haptic). Leaving the list
  removes the class.
- Mini title: `«<deal> · <filtersSummary>»` (rule BR-APP-064 and the whole-city label of LB-APP-026, both WP-22's).
- Before reference data arrives: deal tabs render, nothing city-dependent does, no `undefined` text.
- Layout: one phone column, content limited to 608 px, no width breakpoints; paddings from `--top-inset`,
  `--bottom-inset`, `--tabbar-h`; `html.fullscreen` puts the mini title into Telegram's header row; `html.lite`
  collapses by translate and shows no mini title (rules of WP-20). Z-order: top bar 10, toggle 29, tab bar 30,
  mini title 31, sub-page 40, overlay slot 45, sheet backdrop 50, toast 60.
- The root tabs have no Back; BackButton and SettingsButton are WP-21's and are only observed here.

### Sheets and sub-pages (03 §1.2)

- A sheet closes by ×, backdrop tap, drag down from the handle area, and Back; all four end in `back()`.
  A non-dismissible sheet ignores backdrop and drag.
- Dragging inside the sheet body never closes it. The page under a sheet does not scroll; horizontal chip strips
  (`[data-scroll-x]`) and the sheet body do.
- Two stacked sheets keep `body.sheet-open` until both are closed. Unmounting during a drag removes listeners and
  decrements the class once.
- A sub-page slides in, shows a header shadow when scrolled, closes by Back and by swipe back; swipe back is off on
  Android (platform check of WP-21, TMA-041).
- Haptics: light on chips, switches and buttons, as passed in by the wrappers (TMA-025).

### Pull-to-refresh (SCR-010, BR-APP-058)

- Active when a handler is registered for the current address, the address is a root tab other than `/map` and
  `/settings`, no layer state is open, and `body` has none of `locked`, `sheet-open`, `listing-open`.
- Gesture: one finger, `touchstart` with `scrollY = 0`. The indicator follows at half the finger distance, at
  most 110 px; at 72 px it is armed with one light haptic and disarmed below. Release while armed: spinner for at
  least 700 ms while the handler's promise runs, then settle. Two fingers, or a pull that turns into an upward
  scroll, reset it. Pulls during a refresh are ignored. A rejected handler still settles.
- Effect: the radar tab reloads the radar list, the other tabs re-create their list (handlers come from WP-24,
  WP-29, WP-30). The indicator is `aria-hidden`.

### Toast (SCR-042) and confirm (SCR-043)

- A plain toast closes on tap or after 4 s; a toast with an action shows a button, runs it once and closes, or
  closes after 6 s. A new toast replaces the visible one. It sits above the tab bar or CTA bar
  (`--bottom-chrome`), rises in, and does not animate under reduced motion. If `run` throws, the toast still
  closes and the error goes to `reportError`. Very long text wraps to three lines at most.
- Confirm uses the native dialog. Its four uses and owners: `feed.clearConfirm` «Очистить историю просмотров?»
  (WP-29), `subs.deleteConfirm` «Удалить радар «{name}»?» (WP-30), `hidden.confirmAll` «Снова показывать все
  скрытые объявления и заблокированных авторов?» (WP-31), `chat.restart` (WP-30).
- Failures that only vibrate in legacy (LB-APP-027) call `failed()`: the language picker here; settings saves
  and the hidden list (WP-31); radar mode, unhide, delete and toggle (WP-30); clearing history (WP-29).

### Crash, not found, session expired (SCR-045, 03 §1.6)

- Crash: any render exception below the root layout shows the shrug mascot, `crash.title` «Что-то пошло не так»,
  `crash.text` «Ошибка записана. Обновите приложение — обычно это помогает.» and «Обновить» (`crash.reload`),
  which calls `location.reload()` as legacy. uz «Nimadir xato ketdi» / «Yangilash»; en «Something went wrong» /
  «Reload». It calls `reportError(error, { kind: 'render' })` once per error.
- `app/global-error.tsx` covers a failure of the root layout: own document, inline styles, the same three texts
  hard-coded in ru / uz / en and chosen from the first segment of the address (default ru), dark when the system
  scheme is dark. It uses no catalogue and no provider.
- Not found: `error.notFound` and a button `error.toSearch` to the feed. An address whose first segment is not a
  locale is redirected by `proxy.ts` (WP-20); the experimental `global-not-found` convention is not enabled.
- Session expired: `error.sessionExpired` and «Закрыть» (`common.close`), which calls `tg.close()`. No retry
  button, no Back, no further request from this screen.
- List and screen errors use `ErrorState`: offline (`offline`, `timeout`) — «Нет связи» (`error.offline`),
  «Проверьте интернет и попробуйте ещё раз.» (`error.offlineText`); otherwise — «Не загрузилось»
  (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через минуту.» (`error.serverText`); button
  «Повторить» (`error.retry`).

## Tests

Unit (Vitest):

- `resolveGate`: the truth table of the Design section, including listing address with the city gate pending,
  `localePicked` / `cityPicked` overriding a stale `me`, and leaving a gate route when ready.
- `useBootRetry` with fake timers: 1 / 3 / 7 / 15 / 30 s then stop; 3 × 2.5 s for `join`; none for `blocked`;
  visibility resets both counters and retries once; an expired session schedules nothing.
- `accessReason`: five reasons, unknown string, `null`, number, array → `private`; main-button choice for
  `l_123`, `l_123-web`, `l_123-fb12`, `l_123-seo-chan-45`, no start parameter, no bot name, `blocked`.
- `nearestCity`: inside 16 km; region within 110 km preferred over a farther town; town within 110 km; none;
  missing region flag → town; empty list → `null`.
- `shellVariantOf` for every route of 25 §3.2; toast store: 3 999 ms visible, 4 000 ms gone, 6 000 ms with an
  action, replacement restarts the timer, scopes are isolated; `failed()` with the flag off and on.

Component (Vitest + Testing Library):

- `useSheetDrag`: below threshold settles back; distance threshold; velocity threshold; a callback replaced after
  mount is the one called; reduced motion. `BottomSheet`: backdrop tap, non-dismissible, body-class ref count.
- `useSwipeBack`: thresholds; `enabled = false`; start inside `[data-no-swipe]`.
- `ErrorState` kinds; `HeaderChip` badge and highlight; `FilterChip` `aria-pressed`.
- `TopBar`: one render per variant in three locales; the deal callback is not fired for the active deal; badge
  count. `TabBar`: `long` class in uz and en; a press while collapsed only expands.
- `useMiniChrome`: 24 px hysteresis, 60 px top zone, `expand()` result, cleanup removes the class.
- `PullToRefresh`: no start at `scrollY > 0`; no start with each body class; one haptic at 72 px; 700 ms minimum
  with a resolved promise; no handler → no listeners.
- `LanguagePicker`: order and headings for Telegram `ru`, `uz-UZ`, `en-US`, `de`; disabled while saving; failure
  with the flag off (haptic only) and on (toast).
- `NoAccessScreen`: each reason in each locale; support row absent without an account; post row only for channel
  links; checking line never for `blocked`.
- `CityList`: each location outcome with a mocked adapter; counts with and without stats; the DEV-023 line with the
  flag on. `CrashScreen` and `SessionExpiredScreen`: texts and the single action.

End to end (Playwright, fake Telegram, stubs; every spec in cookie mode and header mode):

- `gates.spec.ts`: no Telegram object → `/outside`, no request to `/bff/*`; `POST /bff/session` fulfilled with a
  `join` refusal twice and then passed through → checking line, shell without reload; `blocked` → no request for
  10 s, then one after a visibility change; first launch (the stub scenario `first_launch` of WP-11, set with
  the `homi_stub_scenario` cookie that WP-22 forwards — it reaches `me` in both session modes) → pick `en` →
  one Server Action request and the `/en/…` address (the `PATCH /settings` body is sent by the server and is
  asserted in the unit test of `updateSettings` against a fake API); city gate → pick → feed address
  with the city; launch with `startParam: 'l_<number>'` → listing first, city page after Back; sign-in answering
  "too old" → session-expired screen, «Закрыть» calls the fake `close`.
- `shell.spec.ts`: tab round trip keeps the search parameters; collapse on scroll and first tap expands; view
  toggle list → map → list; deal switch keeps `districts`; pull on the feed calls the handler; a sheet route opened
  and closed by drag, backdrop, × and BackButton.
- `crash.spec.ts`: the gallery's "throw" button → crash screen in the address locale → «Обновить» reloads.

## Acceptance checklist

Run in ru, uz and en, light and dark, in the emulator and (shell lines) inside Telegram on staging.

Gates

- [ ] Opened without Telegram: only «Откройте приложение через бота в Telegram.», no button, no API request.
- [ ] Each of the five refusal reasons shows its title and text; an unknown reason shows the `private` pair.
- [ ] The checking line shows during the three automatic re-checks and never for `blocked`.
- [ ] After access is granted the app opens by itself, without a reload.
- [ ] «Перейти в бота» carries `s_web--l123` for `l_123-web` and `s_share--l123` for `l_123`; without a start
      parameter the button is «Вернуться в бот» and closes the app.
- [ ] «📢 Открыть пост в канале» appears only for a channel-and-post start parameter and opens that post.
- [ ] «Написать в поддержку» appears only when a support account is known.
- [ ] First launch: the language page shows the heading in the Telegram language, the other two in the subtitle,
      the Telegram language as the first, accent button.
- [ ] Picking a language switches the address and all texts without a reload; a failed save re-enables the buttons.
- [ ] With several cities and no chosen city the city page blocks the app: no ×, no Back; only a pick leaves it.
- [ ] Location: denied, failed and "too far" each show their text; success picks the nearest city at once.
- [ ] City rows show «N аренда · M продажа» when counts are known and no line when they are not.
- [ ] A launch by a listing link shows the listing first; the city page appears after the listing is closed.
- [ ] Five failed start attempts end in «Нет связи» or «Не загрузилось» with «Повторить»; returning to the app
      retries at once.
- [ ] Expired session: «Сессия устарела — закройте и откройте приложение снова» and «Закрыть», which closes the app.

Shell

- [ ] Each top-bar variant shows the texts and controls listed for its tab; the map filters badge counts the
      active groups.
- [ ] Rent ↔ sale keeps districts, zones and a drawn area and resets the rest; tapping the active deal does nothing.
- [ ] The four tabs switch with a light haptic and scroll to top; BackButton stays hidden on every tab.
- [ ] Leaving the search tab and coming back restores the same filters, sort and list/map view.
- [ ] «Карта» / «Список» switch the view and keep the filters; the button is hidden while drawing.
- [ ] Scrolling the list down collapses the chrome to the one-line title; scrolling up or reaching the top
      expands it; the first tap on a collapsed tab bar, toggle or title only expands.
- [ ] Long tab labels (uz, en) do not overflow at 320 px.
- [ ] Pull-to-refresh arms at 72 px with one haptic, spins at least 0.7 s, and does nothing on the map, on
      settings and under any sheet or listing.
- [ ] A sheet closes by ×, backdrop, drag and BackButton; the page under it does not scroll.
- [ ] A sheet address loaded directly shows the standalone presentation: no backdrop tap, no drag; × and Back go to
      the parent address with the search parameters kept.
- [ ] A sub-page closes by BackButton and by swipe back on iOS and Desktop; no swipe back on Android.
- [ ] Lite graphics: the chrome collapses without the morph and without the mini title.

Feedback and errors

- [ ] A plain toast leaves after 4 s or on tap; a toast with an action after 6 s; the action runs once; a new
      toast replaces the old one.
- [ ] The confirm helper opens Telegram's native dialog (the browser's outside Telegram).
- [ ] A forced render error shows «Что-то пошло не так» with «Обновить», which reloads; one error report is queued.
- [ ] An unknown address inside the app shows «Такой страницы нет» with the way back to search.
- [ ] `dev016ErrorToastOnFailure` and `dev023CityCountsIncludeDaily` are off in `lib/flags.ts`; both branches are
      covered by tests.

## Handoff

Empty.
