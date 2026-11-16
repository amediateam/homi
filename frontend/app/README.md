# frontend/app — the HOMI Mini App

Next.js 16.4 App Router app of the Telegram Mini App (DEC-44). Its plan is `docs/migration/25-wave-1-plan.md` §3; the
packages that build it are WP-20 … WP-33 of `docs/migration/wave-1/README.md`. Read the guide of a Next.js feature in
`node_modules/next/dist/docs/` before using it: this version differs from older ones (`proxy.ts`, `cacheComponents`).

## Layout

| Path | Content |
| ---- | ------- |
| `app/[locale]/` | The route tree of `25` §3.2. `layout.tsx` is the root layout; `(main)/` holds the screens with the `@sheet` and `@overlay` slots inside `AppShell`; `welcome/`, `no-access/`, `outside/` are the gates. Route files only read `params` and mount a component from `features/` |
| `app/[locale]/error.tsx`, `not-found.tsx`, `app/global-error.tsx` | The crash screen below the root layout (`CrashScreen`, «Обновить» reloads); «Такой страницы нет» with «К поиску» (`(main)/[...rest]` throws `notFound()` under `<Suspense>`, so the document keeps the boot script, AM-59); a failed root layout: own `<html>`, one `<style>`, no script, texts by the first path segment |
| `app/[locale]/dev/ui/page.tsx`, `features/gallery/` | The primitives gallery (`UiGallery`): only in `local`, `ci` and `staging` builds (`NEXT_PUBLIC_APP_ENV`), the not-found screen elsewhere; its "throw" button serves `crash.spec.ts` |
| `app/[locale]/(main)/@sheet/(.)…`, `@overlay/(.)listing/…` | Sheets and the listing layer intercepted from a soft navigation; a hard load renders the page of the same name. Each slot has `default.tsx`, `page.tsx` and `[...rest]` returning `null` |
| `app/bff/session/route.ts` | The session exchange (`25` §3.4): `POST` trades the launch data for the `homi_session` cookie, `GET` reads `/me` with the cookie or a bearer header |
| `app/bff/[...path]/route.ts` | The read pass-through for header mode (`25` §3.5): only the reads of `lib/api/bffAllowList.ts`, same-origin, never cached |
| `boot/` | `stubs.js` and `boot.js` (ES5, inlined by the root layout from the committed `inline.generated.ts`; `build.mjs` writes it before `dev` and `build`): theme and lite class before paint, the engine test, the boot watchdog, «Обновите Telegram», the SDK tag |
| `dev/` | The development Telegram emulator; `build.mjs` turns it into `public/__dev/telegram-emulator.js` (git-ignored) before `next dev` and deletes it before a build |
| `features/` | One folder per feature; route files mount their components |
| `features/shell/` | `AppShell` (the variant of the address by `shellVariantOf`; a layer keeps the chrome of the page below), `TopBar`, `TabBar`, `ViewToggle`, `MiniTitle` and `useMiniChrome` (the collapsing chrome), `PullToRefresh` and `usePullToRefresh`, `RouteSheet` and `RouteOverlay` (layer or standalone), `SubPage`, `ToastHost` (WP-23); the placeholders, `BootGuard`, `TelegramButtons`, `LaunchRedirector`, `FragmentGuard`, `NavigationBinder`, the demo marker (WP-20 … WP-22); `SearchProof` / `SearchProofServer`, the WP-22 data proof on the map placeholder until WP-27 |
| `features/feed/` | The search list (WP-24): `FeedServer` (page one with the cookie, `readFirstPage`; the small-photo hint of the request), `FeedScreen` (the feed's own search state, the list key, pull-to-refresh, the top on a new key), `feedQuery` (the query and the list key both sides build), `ListingFeed` and `useCursorFeed` (the cursor list WP-29 reuses), the card (`ListingCard`, `PhotoStrip`, `Photo`, `FavButton`, `ListingCardSkeleton`, `FeedSkeleton`), `FeedHeader` (the chips of the top bar), `FewResultsNote`, `FeedEmpty`, and the pure rules `cardText`, `verdict`, `badges`, `images`, `fewResults`, `inlineSlot` |
| `features/radars/` | `capability.ts` (`radarsReady`, `useRadarsEnabled`) and the `subscribe.ts` stub that WP-30 fills |
| `features/gates/` | `resolveGate` (the gate table), `gateState` (return address, picks, `isGatePending()`), `GateRedirector` (every navigation into and out of a gate; runs `useBootRetry`), `bootRetryStore` (`useBootRetryState()`, `retryBoot()`), `GateWait`, `OutsideScreen`, `NoAccessScreen` with `accessReason.ts` (which rows it shows), `LanguagePicker`, `WelcomeCity`, `SessionExpired` / `SessionExpiredScreen`, `CrashScreen`, `useRenderReport` |
| `features/city/` | `CityList` (rows with counts, the locate row with its own 12 s limit) and `nearestCity` (a town within 16 km, then a region within 110 km, then a town within 110 km); `/welcome/city` uses them, WP-25's city sheet reuses them |
| `i18n/` | next-intl: `routing.ts`, `request.ts` (locale from `next/root-params`), `navigation.ts` (`Link`, `useRouter` — both counted in the history stack, `usePathname`, `redirect`), `IntlClientProvider.tsx`, `labels.ts` |
| `lib/telegram/` | The only way to Telegram (`tg`); `sdk.ts` alone reads `window.Telegram`. Version gates, the SDK wait, init, theme, links, calls, sharing, location, home screen, DeviceStorage |
| `lib/session/` | The bootstrap of a launch, `SessionProvider` / `useSession()`, `reauthenticate()`, the in-memory token of header mode, `LocaleGuard`, server-only `getSessionToken()` |
| `lib/navigation/` | `routes.ts` (the only place an address is spelled; `matchRoute` and `searchKeysOf` read one), `nav`, the history stack, `useBack`, `closeThen`, `useLayerState` |
| `lib/deeplinks/` | `parseLaunch` (start_param, `?listing=`, `?news=`, `?map=`), the link builders, the launch gate, `launchTarget` and `launchPending()` (the city gate waits for the launch target) |
| `lib/storage.ts`, `lib/graphics.ts`, `lib/device.ts` | The client storage keys with their DeviceStorage policy; lite graphics; the device rule of lite graphics, which a Server Component can import (`graphics.ts` re-exports it) |
| `lib/security/csp.ts` | The nonce CSP of `proxy.ts` (ADR-0020) |
| `lib/brand/` | HOMI's name, bot, links and artwork paths; the only place a brand word may appear |
| `lib/flags.ts` | `devFlags`: the 17 `DEV` switches, all off |
| `lib/analytics/events.ts`, `lib/errors/report.ts` | `track` and `reportError` facades (no-ops until WP-32) |
| `lib/api/` | `server.ts` (server-only: one typed function per `/api/v1` method, `serverApi()` with the session, `publicApi()` without), `browser.ts` (`bffFetch`), `errors.ts` (`UiError`, the mapping table), `scenario.ts` (stub scenarios outside production), `bffAllowList.ts` |
| `lib/actions/` | `runAction` (the one shape of a Server Action), `validate.ts`, `useAction`; `settings.ts` (`updateSettings`, the first `'use server'` file, WP-23), `favorites.ts` (`setFavorite`, WP-24); the other actions arrive with the packages that need them (WP-22 "Server Actions") |
| `lib/ui/` | `toast.ts` (one toast per scope, 4 s, 6 s with an action), `feedback.ts` (`failed()`, `saved()`), `confirm.ts` (`confirmText`), `shellState.ts` (the launch's memory: the last search and saved addresses of the tabs, the pull handlers, the drawing request) |
| `lib/data/` | `useResource` (the small client data hook), `sessionMaps` (favourites, seen and hidden of this launch), `sources.ts` (which drivers answered the current screen; drives the "demo data" marker), `previewCache` (the last 200 cards opened, for WP-26) |
| `lib/reference/` | The cached reference data (`getReference`, `getCities`), `ReferenceFeed` → `ReferenceProvider`, `useReference()`, `useCityStats()`, `useCitiesStats()` |
| `lib/search/` | `useSearchState`, `useScreenSearchState` (the search of a screen's own address, held under a layer or another tab, KI-43), `readSearchState`, `addressCity`, `searchStateFromHref`, `searchRules` over `@homi/search` |
| `lib/money/useMoney.ts` | `createMoney` of `@homi/i18n/format` bound to the profile's currency and the reference rate |
| `proxy.ts` | Locale redirect (cookie `NEXT_LOCALE`, else `ru`), then the CSP with a fresh nonce and the security headers |
| `styles/app.css`, `styles/shell.css` | Tailwind and `@homi/ui/styles.css` (tokens, themes, lite, motion), then the shell's own rules: the tab bar and its lens, the collapsed chrome (`html.chrome-mini`) of the tab bar, top bar, mini title and view toggle, their lite form, long tab labels |
| `public/brand/` | Placeholder artwork of the legacy sizes; the final files replace them without a code change |
| `tests/`, `e2e/` | Vitest (`pnpm --filter app test`) and Playwright (`pnpm test:e2e` from `frontend/`); `shell.spec.ts`, `gates.spec.ts` and `crash.spec.ts` since WP-23 |

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
