# 03 — Legacy frontend audit: kvadro² Mini App

Scope: the Telegram Mini App `app.kvadro.app` (React 19 + Vite 8), as recovered by decompiling the production bundle.
The recovered tree is `$KVADRO_ROOT/demo/app/`. The audit of 2026-11-09 described release `index-plF_TOcT.js` (prod
`Last-Modified` Sat, 07 Nov 2026 22:05:36 GMT). It is brought up to the pinned release `index-DY_DH7h-.js` (prod
`Last-Modified` Fri, 13 Nov 2026 22:05:41 GMT, SVN r27; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5`;
[`wave-1/baseline.md`](wave-1/baseline.md)). Text added for a later release names that release and cites the code at
the pin ("at the pin"); other line numbers are those of the audited tree. The Telegram WebApp integration is in
[`05-telegram-miniapp-audit.md`](05-telegram-miniapp-audit.md) (`TMA-NNN`). Endpoints are named by `METHOD path`; their
`API-NNN` ids are in `08-api-inventory.md`. The machine-readable screen list is
[`data/screens.json`](data/screens.json).

How this audit was made: by reading the code only. Nothing was built or run, so no item is `RUNTIME_VERIFIED`. The
recovery itself was checked against the production bundle by 79 differential parity scenarios at the audit and by 109
at the pin (57 screens and sheets, ten of them for SCR-046 and SCR-047; 36 filter; 16 GL;
`$KVADRO_ROOT/CLAUDE.md:26-28`). Those ran on mocks that the recovery authors inferred from the code, not on the real
API (`$KVADRO_ROOT/demo/app/tools/parity/README.md`, `$KVADRO_ROOT/CLAUDE.md` "Commands"). Code that the recovery
reconstructed by guesswork carries `// TODO: inferred from build` and is `UNVERIFIED` here; §6 has the list.

Policy (HOMI, 2026-11-09): HOMI **fixes** legacy bugs and logically wrong decisions instead of reproducing them. Every
`LB-APP` item therefore has a `Proposed fix:` line. Proposals are not approved changes. The inventory of existing
behaviour in §1–§4 stays exact.

## 0. Findings that matter most for the migration

1. **No URL routing exists; navigation is state plus a Back-handler stack.** All navigation is React state in one
   component (`$KVADRO_ROOT/demo/app/src/app/App.jsx:51-106`). Telegram's BackButton is driven by a module-level LIFO
   stack (`$KVADRO_ROOT/demo/app/src/lib/telegram/buttons.js:5-35`). A Next.js App Router port must reproduce
   "Back closes the top layer" and survive without URLs (§1.2, `TMA-022`).
2. **Startup is tuned for slow Telegram WebViews.** The pieces are inline ES5 boot scripts allowed by CSP sha256
   (`$KVADRO_ROOT/demo/app/index.html:9-143`), a prefetch of `/api/meta` and the first feed page before React mounts,
   a 3 s SDK wait, a `window.__kvBoot.ok` watchdog, and old-WebView build targets (`chrome80 / safari13.1`). Next.js
   defaults (hydration, framework runtime, modern targets) break most of this; it needs an explicit design (§1.3–§1.5).
3. **Much display text is pre-formatted by the server, but not all of it.** Card price, `age`, `title`, `status_text`
   and map pin `label` arrive as ready strings (`$KVADRO_ROOT/demo/app/src/features/listing/format.js:9-32`). The
   client still formats prices in the market block, price history, presets, typical price and filter summaries with
   its own USD/UZS rules (`$KVADRO_ROOT/demo/app/src/lib/money.js:31-140`). Both paths must agree (BR-APP-060,
   LB-APP-011).
4. **Some crashes come from data, not code paths.** `t()` throws on any missing key
   (`$KVADRO_ROOT/demo/app/src/i18n/index.js:118-121`), and several keys are built from server values (`subs.mode.*`,
   `type.*`, `market.v3.rooms<N>`). `NearbySection` renders an `undefined` icon for unknown `kind`s. A changed API
   enum can therefore white-screen the app (LB-APP-002, LB-APP-015, LB-APP-016).
5. **Session-only state and the map stack need explicit decisions.**
   - Favourites, "seen" and locally hidden maps live only in memory (`App.jsx:65-73`).
   - Eleven `kv-*` localStorage keys (ten at the audit; `kv-visits` since release `index-DY_DH7h-.js`) and their
     Telegram DeviceStorage mirror must keep their names, or users lose client settings (§3.2).
   - The map is two parallel implementations (MapLibre GL and Leaflet) with different behaviour (SCR-011).
   - The radar tab sends 3 requests per subscription (LB-APP-036).

## 1. Architecture

### 1.1 Application shape

- **There is no router.** `App` holds every navigation flag in `useState` (`$KVADRO_ROOT/demo/app/src/app/App.jsx:51-106`):
  - `tab`: `search | favorites | subs | settings`
  - `view`: `list | map`
  - `savedTab`: `favorites | history`
  - `listingId`, plus `preview` (the card data shown at once)
  - `filtersOpen` / `filtersFocus`, `quickFilter`, `sortOpen`, `cityPickerOpen`
  - `editingSub`, `createSubOpen`
  - `drawing`, `areaTooSmall`
  - `toast`, `nudgeCandidate` / `followNudge`, `homeOffer`
  - `radarReturn` / `resume`
  - session maps `favs`, `seen`, `hidden`
- **Render order.** One base layer is chosen by `tab`/`view` (`App.jsx:484-528`). Overlays are rendered after it in a
  fixed JSX order (`App.jsx:546-670`): sort, listing, radar editor, filters, create radar, home nudge, follow nudge,
  quick filter, city picker, first-launch city picker, toast. Later siblings paint on top at equal z-index; the CSS
  z-index layers are in §3.6.
- **Portals.** `MarketSheet` and `FoundSheet` render into `document.body` through `createPortal`
  (`$KVADRO_ROOT/demo/app/src/features/listing/MarketSheet.jsx:161-220`,
  `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:124-182`).
- **Hook order is fragile.** The recovery documents it as fragile and it must not be reordered in the legacy tree
  (`App.jsx:49`, `$KVADRO_ROOT/CLAUDE.md` "Hard constraints"). This does not bind the port.
- **Screen-name precedence for analytics** (`$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:26-44`):
  `listing > radar/edit > radar/new > filters > filters/<kind> > sort > city > map/draw > tab screen`. Tab screens are
  `search/list`, `search/map`, `saved/favorites`, `saved/history`, `subs`, `settings`.
- **Tabs.** Defined in `$KVADRO_ROOT/demo/app/src/app/tabs.js:8-29`:
  - order `search` (Search icon), `favorites` (Heart), `subs` (custom RadarIcon), `settings` (Settings);
  - labels `tab.search` «Поиск», `tab.favorites` «Избранное», `tab.subs` «Радар», `tab.settings` «Настройки»;
  - the active-tab "lens" position is the CSS variable `--tab` (`$KVADRO_ROOT/demo/app/src/app/TabBar.jsx:14-19`).

### 1.2 Screen and sheet stack, Back and gestures

- **Back-handler stack** (`$KVADRO_ROOT/demo/app/src/lib/telegram/buttons.js:5-35`):
  - Every layer that can be closed registers `useEffect(() => pushBackHandler(onClose), [onClose])`.
  - The first push shows `BackButton` and subscribes `onClick`; removing the last handler hides it.
  - Only the top (last pushed) handler runs.
  - Order is mount order, so a sheet opened over the listing screen wins.
- **Layers that register a Back handler:**
  - FiltersSheet (`$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:101`)
  - QuickFilterSheet (`.../filters/QuickFilterSheet.jsx:28`)
  - SortSheet (`.../sort/SortSheet.jsx:52`)
  - CityPicker, except the first-launch variant (`.../city/CityPicker.jsx:22-27`)
  - ListingScreen (`.../listing/ListingScreen.jsx:95`)
  - PhotoViewer (`.../listing/PhotoViewer.jsx:20`)
  - MarketSheet (`MarketSheet.jsx:74`)
  - SpotMapFullscreen (`.../listing/spot/SpotMapFullscreen.jsx:23`)
  - ListingActionsSheet: Back steps detail → reasons → menu → close (`.../listing/ListingActionsSheet.jsx:36-45`)
  - RadarSheet (`.../radar/RadarSheet.jsx:43`) and FoundSheet (`FoundSheet.jsx:88`)
  - SubPage, i.e. all settings sub-pages (`.../settings/SubPage.jsx:17`)
  - Drawing mode (`$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:37-44`)
  - Radar-return mode: Back on the search tab after "open radar feed" restores the previous filters, sort, list view
    and radar sheet (`useTelegramButtons.js:54-79`).
- **No Back handler:** the base tabs, the map selection card (SCR-013, LB-APP-024), the follow, return and home nudges,
  the in-feed radar card, toasts and the first-launch city picker. With an empty stack, Telegram's BackButton is hidden.
- **SettingsButton** (Telegram 7.0+) closes the listing, filters and radar editor and switches to the settings tab
  (`useTelegramButtons.js:10-23`). It does **not** close sort, quick filter, city picker or the create-radar sheet.
- **Swipe-back.** `useSwipeBack` (`$KVADRO_ROOT/demo/app/src/hooks/useSwipeBack.js:24-148`) is a rightward swipe:
  - start threshold 10 px; close at 33% of width or 0.5 px/ms; settle 180 ms;
  - disabled on Android (`:27`) and inside `.strip, .scroll, .leaflet-container, input, textarea, select, [data-no-swipe]`;
  - used by ListingScreen, but only when nothing is open over it (`ListingScreen.jsx:89-93`), and by SubPage
    (`SubPage.jsx:19`).
- **Sheet drag-to-close.** `useSheetDrag` (`$KVADRO_ROOT/demo/app/src/hooks/useSheetDrag.js:41-212`) works on the
  sheet's handle area:
  - start threshold 6 px; close at 25% of height or 0.5 px/ms; settle 200 ms;
  - the backdrop dims with the drag;
  - it blocks page scroll under sheets (allowing horizontal chip strips and the sheet body to scroll) and ref-counts
    `body.sheet-open`.
  - Tapping the backdrop closes every sheet except the first-launch city picker.
- **Collapsing chrome.** Scrolling the search list down by more than 24 px past the anchor adds `html.chrome-mini`; it
  is always expanded within 60 px of the top (`$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js:4-85`). While
  collapsed, the first tap on the chrome (tab, view toggle, mini title) only expands it (`App.jsx:346-358`).

### 1.3 Startup sequence

1. **`index.html`, before any module** (`$KVADRO_ROOT/demo/app/index.html:9-20`): stubs
   `window.__tg__postBackgroundChange` and `window.TelegramGameProxy.receiveEvent`. These are crashes seen in analytics
   on Telegram Android 12.10+ and old iOS (TMA-002).
2. **Boot IIFE** (`index.html:21-143`):
   - creates `window.__kvBoot = { ok: false }` and installs a capturing `error` listener;
   - on its own script failing to load, or an error before `__kvBoot.ok`, it reports `app_error` with `kind: "boot"`
     by XHR to `POST /api/events` (only when initData exists) and replaces `#root` with the "Update Telegram" screen
     (SCR-001);
   - errors from `telegram.org` scripts are reported but do not show that screen (`:140`);
   - a failed `#tg-sdk` load sets `__kvBoot.sdk = "error"` (`:131`).
3. **SDK tag** `<script id="tg-sdk" async crossorigin="anonymous" src="https://telegram.org/js/telegram-web-app.js">`
   with `preconnect` (`index.html:151-152`). Then `<script type="module" src="/src/main.jsx">`. A `nomodule` fallback
   calls `__kvBoot.show()` (`:158-160`).
4. **`main.jsx` module body** (`$KVADRO_ROOT/demo/app/src/main.jsx:20-39`):
   - `installGlobalErrorHandlers()`, which sets `__kvBoot.watching = true` and takes over error reporting;
   - `applyGraphicsMode()` (adds `html.lite`) and `measureScrollPerformance()`;
   - `prefetch('/api/meta')`;
   - `prefetch(feedUrl(defaultFilters('rent_long', getSavedCity()), null))`, then preloads the first photo of the
     first 2 items;
   - if `start_param` / `?listing=` names a listing, `prefetch('/api/listings/<id>')`.
   - `prefetch` does nothing without initData (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:35-43`).
   - Module-load side effects run even earlier: the i18n locale is detected (`$KVADRO_ROOT/demo/app/src/i18n/index.js:57`),
     the theme preference is read (`$KVADRO_ROOT/demo/app/src/lib/telegram/theme.js:20`) and `#tgWebAppData` is read
     from the hash (`$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:119`).
5. **`waitForTelegramSdk(3000, initTelegramApp)`** (`main.jsx:19,40`; `webApp.js:75-108`):
   - resolves at once if the SDK is present, the tag is missing or the SDK failed;
   - otherwise resolves on load, error or a 3 s timeout;
   - without an SDK it posts `web_app_ready` and `web_app_expand` straight to the native bridge (`webApp.js:16-40`);
   - a late SDK that carries initData is adopted and `initTelegramApp` runs again.
6. **`initTelegramApp()`** (`webApp.js:184-202`): `ready()`, `expand()`, `disableVerticalSwipes()` (7.7+),
   `requestFullscreen()` (8.0+ on `ios`/`android`/`android_x`), `html.fullscreen` sync, `applyTheme()`, and the
   `fullscreenChanged` / `themeChanged` listeners.
7. **Mount** `<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>`, then `window.__kvBoot.ok = true`
   (`main.jsx:41-52`).
8. **`useAppBootstrap`** (`$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:38-165`), only with initData:
   - sends `app_launch`, then `GET /api/meta`, which consumes the prefetch;
   - network or 5xx errors retry after 1, 3, 7, 15, 30 s;
   - `403` sets the no-access reason (default `private`); unless the reason is `blocked`, access is re-checked 3 times
     at 2.5 s;
   - `visibilitychange` back to visible resets both retry counters and retries at once.
   - **On success:** `setLocale(meta.locale)`, `setCurrency(meta.currency, meta.usd_uzs)`,
     `setThemePreference(meta.theme)`, server city over local city (without overwriting chosen geography),
     `markAppStarted()`, `initAnalytics(meta.analytics)`, `app_opened`, the `?news=pets` handling, and
     `GET /api/cities`.
9. **First paint** shows the feed for the locally saved city before meta arrives (`App.jsx:52`).
   `useHomeScreenEvents` restores DeviceStorage keys and records the visit day (`$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:23-32`).
   Since release `index-DY_DH7h-.js`, once meta is loaded every search-tab visit is recorded per filter set in
   `kv-visits`, and once the radars are loaded the return banner may send `GET /api/feed/new` (BR-APP-070, BR-APP-071).

### 1.4 Render gating (`App.jsx:228-236`)

The render checks run in this order:

1. No initData: `<div class="empty">{t('app.openViaBot')}</div>` (SCR-002).
2. `noAccessReason` set: `NoAccessScreen` (SCR-003).
3. `meta && !meta.locale_chosen`: `LanguagePicker` (SCR-004).
4. Otherwise the app shell (SCR-006).

While meta is still loading, the shell renders with `meta = null`. Consequences: no city chip, `findCity` returns
`null`, the default sort options apply, and tiles are `undefined`.

### 1.5 Inline boot script and the CSP constraint

- **The constraint.** The server's CSP allows the two inline scripts by sha256, so `index.html` must stay byte-identical
  (`$KVADRO_ROOT/CLAUDE.md` "Hard constraints"; `$KVADRO_ROOT/docs/about.md` §9.1). The legacy CSP header itself is
  set server-side and is not in the material we have (Q-APP-016).
- **What the boot script contains** (`index.html:27-143`):
  - its own texts in ru / uz_Latn / en (`:30-34`);
  - language detection from `kv-locale`, then the Telegram user's `language_code`, where `uz*` gives `uz_Latn` and
    anything else gives `ru` (`:44-59`);
  - a token sanitizer and a stripper for `?…` / `#…` (with `tgWebAppData`) in error sources (`:60-68`);
  - "to the bot": `Telegram.WebApp.close()`, or without the SDK, `GET /api/bot` and a redirect to `https://t.me/<username>`
    (`:91-103`);
  - "try again": `location.reload()`.
- **Port impact.** A Next.js port must either recompute the hashes for every inline script (Next injects its own) or
  move to nonces. TMA-001 and Q-APP-016 track this.

### 1.6 Error handling

| Layer | Behaviour | Evidence |
| ----- | --------- | -------- |
| Boot script | `error` (capture) before `__kvBoot.ok`: XHR `app_error` (kind `boot`), then the "Update Telegram" screen | `index.html:69-142` |
| Global handlers | `error` and `unhandledrejection`. Ignored: "Script error.", errors without text, `ApiError` rejections, `AbortError`. Dedup by `kind|name|message`; max 5 per session. `stage` is `boot` until meta succeeds, then `app`. `screen` comes from `useScreenTracking`. | `$KVADRO_ROOT/demo/app/src/lib/errors.js:68-123` |
| Render errors | `ErrorBoundary` reports `render` (and `posthog.captureException` once analytics is loaded) and shows the crash screen (SCR-045) | `$KVADRO_ROOT/demo/app/src/app/ErrorBoundary.jsx:11-42`, `$KVADRO_ROOT/demo/app/src/lib/analytics.js:192` |
| Telegram callbacks | `safeCallback` re-throws asynchronously so a throw inside an SDK event does not break the SDK | `webApp.js:167-177` |
| API | `ApiError(status, detail)`; `status 0` with `detail` `timeout` or `network`; 15 s timeout; `detail` is taken only when it is a string | `client.js:9-111` |
| Screens | `ErrorState` distinguishes offline (`error.offline`) from server (`common.loadFailed`); the feed shows an inline retry when items already exist | `$KVADRO_ROOT/demo/app/src/components/ErrorState.jsx:13-26`, `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:126-136` |
| Mutations | Most show `common.saveFailed` «Не получилось сохранить» as a toast. Several fail silently with haptic only (LB-APP-027). | §5b |

### 1.7 Graphics: lite mode

- **Mechanism.** `html.lite` is applied before mount (`main.jsx:21`). The user's choice is in `kv-graphics`
  (`full`/`lite`; absent means auto) and a measured result in `kv-graphics-measured` (`lite`)
  (`$KVADRO_ROOT/demo/app/src/lib/graphics.js:8-103`).
- **Auto turns lite on when:**
  - the Telegram-Android User-Agent performance class is not `HIGH`; or
  - Android with ≤ 4 cores or ≤ 3 GB RAM (`graphics.js:47-59`); or
  - an Android scroll measurement has ≥ 20% of 150 frame intervals over 28 ms (`graphics.js:111-158`).
  - iOS never auto-enables lite.
- **CSS effects** (`$KVADRO_ROOT/demo/app/src/styles/lite.css`): no `backdrop-filter`, solid glass, simpler shadows,
  translate-only chrome collapse, no mini title, `content-visibility: auto` on cards, no radar animation.
- **JS effects:**
  - forces Leaflet (`$KVADRO_ROOT/demo/app/src/features/map/engine.js:92-97`);
  - map pixel ratio 1 and smaller tile prefetch budgets;
  - small photos only (`$KVADRO_ROOT/demo/app/src/lib/images.js:24-31`);
  - no PostHog session replay (`analytics.js:126`).

### 1.8 Map engine choice

- **Decision logic** (`$KVADRO_ROOT/demo/app/src/features/map/engine.js:63-97`):
  - `?map=gl|leaflet` persists in `kv-map-v2`; `?map=auto` clears it;
  - a saved `leaflet` gives Leaflet;
  - a saved `gl` gives GL if WebGL is available;
  - otherwise GL needs a WebGL2 context with `failIfMajorPerformanceCaveat: true` **and** no lite mode, else Leaflet.
- **MapLibre is not bundled.** It is loaded with `import(__MAPLIBRE_URL__)`, which resolves to
  `/assets/maplibre-gl-6.11.2/maplibre-gl.mjs` (`$KVADRO_ROOT/demo/app/vite.config.js:18-40`).
- **Fallback.** If the GL chunk fails to load, Leaflet is used. A runtime `onFail` switches the current mount to
  Leaflet; it is not persisted (`$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:17-50`).
- The listing mini-map uses the same engine choice (`$KVADRO_ROOT/demo/app/src/features/listing/spot/SpotMap.jsx:19-58`).

### 1.9 Lazy chunks

- **Map:** `MapViewGL`, `MapView` (Leaflet), `spotGL`, `spotLeaflet`, MapLibre (vendored ESM), `pmtiles`, the
  `leaflet` / `protomaps-leaflet` basemap, and `MapCard` (lasso, selection card, pins)
  (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:28-43`).
- **Analytics:** `posthog-js` plus the `web-vitals-with-attribution`, `exception-autocapture`, `dead-clicks-autocapture`
  and `lazy-recorder` extensions (`analytics.js:128-134`).
- **Prefetch.** After 2.5 s on the list view, `preloadMapView()` and a tile prefetch run so that opening the map is fast
  (`$KVADRO_ROOT/demo/app/src/app/useMapTilePrefetch.js`, `$KVADRO_ROOT/demo/app/src/features/map/tilePrefetch.js:225-251`).

### 1.10 Dependencies and build target

- **Pinned to what production ships** (`$KVADRO_ROOT/demo/app/package.json`): react / react-dom `19.3.0`, posthog-js
  `1.434.15`, leaflet `1.9.4`, leaflet.markercluster `1.5.3`, maplibre-gl `6.11.2`.
- **Ranges** (versions inferred by the recovery): `lucide-react ^1.69.0`, `pmtiles ^4.5.0`, `protomaps-leaflet ^5.1.0`,
  `supercluster ^8.0.1` (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:94`).
- **Build target** `['chrome80','edge80','firefox72','safari13.1']`. It was inferred from bundle syntax (`??` kept,
  `?.` and class fields lowered) and is marked `TODO: inferred from build` (`vite.config.js:66-70`). Status:
  `UNVERIFIED` (Q-APP-001).
- **The original was TypeScript.** `index.html` comments name `main.tsx`, `i18n.ts` and `errors.ts`; the types are
  lost (`RECOVERY.md:22-24`).

### 1.11 State that lives only in memory

Losing a WebView reload loses these:

- `favs`: favourite toggles this session, overriding server flags.
- `seen`: listings opened this session.
- `hidden`: listings hidden or blocked this session.
- `subs` and `cityStats`.
- Since release `index-DY_DH7h-.js`: the previous-visit time per filter hash for the current visit session
  (`sessionVisits`, module scope of `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:119-123`), the hashes for
  which `feed_radar_shown` was sent (`feedRadarShown`, `App.jsx:123-124`) and the pending and shown return banner
  (`App.jsx:115-120`), all at the pin.

All but `sessionVisits` are in `App.jsx` (`:65-90` in the audited tree). The server is the source of truth after a
reload (`item.favorite`, `item.viewed`, and hidden listings filtered server-side). The settings tab's hidden screen
resets `hidden` to `{}` after any change (`App.jsx:499`).

### 1.12 Server-formatted vs client-formatted values

- **Server strings rendered as-is or lightly split by the client:**
  - `title` / `short_title`: first part before « · » (`format.js:9`).
  - `price`: first part, with parentheses removed and split at `/` into amount and period (`format.js:16-32`); the CTA
    bar shows the bracket text and the remaining parts as a note (`$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:21-25`).
  - `age`: second part (`format.js:129-134`).
  - `status_text`, `market`, `district_name`, `landmark`, `owner`, `phone_display`, `summary`, `facts[].label/value`,
    `history[].text`, `offers[].text`.
  - map `label`, injected as HTML in Leaflet and GL stack pins (LB-APP-020).
  - `flow.options[].label/rate`, `meta.*.name`, `settings.locales/currencies[].name`.
- **Client-formatted:** prices in `MarketBlock`, `MarketSheet`, `HistorySection`, typical price, presets, the filter
  summaries and input fields (`money.js`); counts and distances (`format.js`, `$KVADRO_ROOT/demo/app/src/lib/format.js`);
  dates (`i18n/index.js:83-93`).
- **Unverified.** That server strings follow the currency and locale settings is assumed: the app reloads after
  changing either (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:116-127`). Status `UNVERIFIED`
  (Q-APP-011).

## 2. Screens, sheets, modals, overlays and states

Kinds: `screen` = full-screen view or tab page; `sheet` = bottom sheet over a backdrop; `overlay` = floating or
full-screen layer without its own route; `modal` = blocking system dialog; `state` = an alternative rendering of a
screen. Status applies to the entry as a whole. Unless noted, every item is `CONFIRMED` (seen in the recovered code).
Strings are quoted ru / uz_Latn / en where they matter; otherwise by key (values in
`$KVADRO_ROOT/demo/app/src/i18n/locales/{ru,uz_Latn,en}.js`).

### SCR-001 — Boot failure screen «Обновите Telegram» (`state`)

- **Purpose:** replaces a white screen when the bundle cannot load or crashes before React has started (old Telegram
  or old Android System WebView).
- **Opens:**
  - a script under `/assets/` or `/src/` fails to load;
  - an uncaught error (not «Script error.», not from `telegram.org`) before `__kvBoot.ok`;
  - the `nomodule` path (`$KVADRO_ROOT/demo/app/index.html:127-160`).
- **Closes:** never; only reload or leaving.
- **Layout:** full-height centred block, built as inline HTML with inline styles: 🔄 emoji 44 px, h1 22 px, hint
  paragraph, two 48 px pill buttons. Bot button `#ffd23f`; retry button `#f0f0f3` light / `#1c1c1f` dark.
  Dark when `Telegram.WebApp.colorScheme === "dark"` or `prefers-color-scheme: dark` (`index.html:104-125`).
- **Texts** (hard-coded in `index.html:31-33`, not i18n):
  - ru «Обновите Telegram» / «Вернуться в бота» / «Попробовать ещё раз»;
  - uz_Latn «Telegramni yangilang» / «Botga qaytish» / «Qayta urinish»;
  - en «Update Telegram» / «Back to the bot» / «Try again»;
  - plus one explanatory paragraph per language.
- **Actions:**
  - «Вернуться в бота»: `WebApp.close()`, or without the SDK `GET /api/bot` and `location.href = https://t.me/<username>`;
  - «Попробовать ещё раз»: `location.reload()`.
- **APIs:** `POST /api/events` (XHR, `app_error` kind `boot`, only with initData); `GET /api/bot` (no auth).
- **Storage:** reads `kv-locale`.
- **Analytics:** `app_error` (boot), with 7 keys, empty values as `""` (`index.html:80-88`).
- **Localization:** language is `kv-locale` if it is a known locale, else `uz_Latn` when the Telegram language is
  `uz*`, else `ru`. English is shown only when `kv-locale` is `en`.
- **Edge cases:** a `#tg-sdk` load failure only marks `__kvBoot.sdk = "error"` and does not show the screen
  (`index.html:130-132`). Errors inside the Telegram SDK are reported but tolerated (`:140`).
- **Sources:** `$KVADRO_ROOT/demo/app/index.html:21-160`.
- **Status:** CONFIRMED.

### SCR-002 — Outside Telegram: «Откройте приложение через бота» (`state`)

- **Purpose:** the only UI when the page has no initData (opened in a browser, or SDK and hash both empty).
- **Opens:** `!hasInitData()` (`$KVADRO_ROOT/demo/app/src/app/App.jsx:228-230`). **Closes:** never.
- **Layout:** a bare `div.empty` with one sentence and no buttons.
- **Text:** `app.openViaBot`: ru «Откройте приложение через бота в Telegram.» / uz «Ilovani Telegram boti orqali
  oching.» / en «Open the app via the bot in Telegram.».
- **APIs:** none from the screen. Prefetches are skipped (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:35-38`). The
  global error handlers can still post `app_error` with an empty `tma ` header (`$KVADRO_ROOT/docs/api.md` §11).
- **Analytics:** `$pageview` is never sent because `initAnalytics` needs meta.
- **Edge cases:** hooks still run before the gate. Without initData, `useAppBootstrap` returns early
  (`$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:50-52`). The dev-only emulator overlays an initData form on this
  screen (`$KVADRO_ROOT/demo/app/tools/dev/telegram-client.js:1-14`); that is not product behaviour.
- **Sources:** `App.jsx:228-230`.
- **Status:** CONFIRMED.

### SCR-003 — No-access screen (`screen`)

- **Purpose:** explains why `GET /api/meta` answered `403` (closed beta, private bot, blocked user, "press Start first")
  and offers a way out.
- **Opens:** `useAppBootstrap` 403 handler, with `reason = error.detail ?? 'private'`
  (`$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:130-139`).
- **Closes:** automatically when a later meta retry succeeds, which clears `noAccessReason` (`useAppBootstrap.js:77-78`).
- **Layout:** `main.lang-pick` with a Lock icon, h1, text, an optional «checking» line and a list of large buttons
  (`$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:41-87`).
- **Reasons:** `private | invite | full | blocked | join`; anything else renders as `private` (`NoAccessScreen.jsx:13,22`).
- **Titles and texts** (ru, `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:28-37`):

  | Reason | Title (`noAccess.title.*`) | Text (`noAccess.text.*`) |
  | ------ | -------------------------- | ------------------------ |
  | `private` | «Бот приватный» | «Приложение сейчас доступно только владельцу.» |
  | `invite` | «Вход по приглашению» | «Войти можно по ссылке-приглашению: откройте её и нажмите «Старт» в боте.» |
  | `full` | «Мест пока нет» | «Сейчас все места заняты. Попробуйте позже.» |
  | `blocked` | «Нет доступа» | «Доступ к приложению закрыт.» |
  | `join` | «Сначала — бот» | «Нажмите «Старт» в боте — после этого приложение откроется.» |

  The uz and en equivalents are in the locale files, e.g. en «This bot is private», «Invite only», «No spots yet»,
  «No access», «Start with the bot».
- **No beta wording since release `index-Dbpp463V.js`:** two texts were reworded, the reason codes and the gate logic
  stayed (`ru.js:29,35`; `uz_Latn.js:27,33`; `en.js:27,33`;
  `$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md:20-22`):
  - `noAccess.title.invite`: «Закрытая бета» / «Yopiq beta-talqin» / «Closed beta» became «Вход по приглашению» /
    «Taklif orqali kirish» / «Invite only»;
  - `noAccess.text.full`: «Все места в бете заняты. Попробуйте позже.» / «Betada joy qolmadi. Keyinroq urinib koʻring.»
    / «All beta spots are taken. Please try again later.» became «Сейчас все места заняты. Попробуйте позже.» /
    «Hozir joy qolmadi. Keyinroq urinib koʻring.» / «All spots are taken right now. Please try again later.».
- **Checking line:** `noAccess.checking` «Только что нажали «Старт»? Подождите пару секунд — проверяем доступ…».
  Shown while an automatic re-check is pending: 3 tries at 2.5 s, never for `blocked`.
- **Actions:**
  - «📢 Открыть пост в канале» (`noAccess.openPost`): only if `start_param` matches `l_<id>-[seo-]<channel>-<post>`; opens
    `https://t.me/<channel>/<post>` (`$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:48-54`).
  - Main button: «Перейти в бота» (`noAccess.toBot`) opens
    `https://t.me/<bot>?start=s_<source>[--l<listingId>]` when the bot username and a `l_…` source are known and the
    reason is not `blocked`. Otherwise «Вернуться в бот» (`noAccess.back`) calls `WebApp.close()`
    (`NoAccessScreen.jsx:61-73`).
  - «Написать в поддержку» (`settings.support`): `https://t.me/<support>` when `/api/bot` returns `support`.
- **APIs:** `GET /api/bot` (plain `fetch`, no Authorization; `$KVADRO_ROOT/demo/app/src/lib/api/meta.js:15-23`). The
  re-tries of `GET /api/meta` come from the bootstrap.
- **Localization:** before showing, the locale is set from the Telegram language (`useAppBootstrap.js:132`), so this
  screen can appear in en while SCR-001 cannot.
- **Access:** this is the closed-beta gate.
- **Analytics:** no `app_opened` (`$KVADRO_ROOT/docs/api.md` §11). `$pageview` is not sent because analytics is not
  initialised.
- **Edge cases:** `getStartSource()` returns `web`, a campaign code `fb|tg|ig<1-4 digits>`, `seo` or `share`
  (`startParam.js:32-42`). Without a start param the button falls back to "close".
- **Sources:** `NoAccessScreen.jsx:1-88`, `useAppBootstrap.js:127-140`.
- **Status:** CONFIRMED. Whether the gates are active in production is unknown (Q-APP-014).

### SCR-004 — Language picker (first launch) (`screen`)

- **Purpose:** forces an explicit interface language on first launch.
- **Opens:** `meta && !meta.locale_chosen` (`App.jsx:234-236`).
- **Closes:** after a successful save, which reloads the whole page.
- **Layout:**
  - Globe icon;
  - h1 «Выберите язык» / «Tilni tanlang» / «Choose a language», in the Telegram language;
  - a subtitle with the other two phrases joined by « · »;
  - a list of `meta.locales` buttons with the Telegram language first. The first button is accent-coloured by CSS
    (`$KVADRO_ROOT/demo/app/src/styles/misc.css:36-39`).
- **Texts:** hard-coded in the component, not i18n (`$KVADRO_ROOT/demo/app/src/features/onboarding/LanguagePicker.jsx:12-16`).
- **Action:** tap a language: `PUT /api/settings {locale}`, then `saveLocale` (`kv-locale`), then
  `window.location.reload()`.
- **States:** saving disables all buttons. On error: error haptic, buttons re-enabled, no text (LB-APP-027).
- **Storage:** writes `kv-locale` (mirrored to DeviceStorage).
- **Analytics:** none specific.
- **Sources:** `LanguagePicker.jsx:22-64`.
- **Status:** CONFIRMED.

### SCR-005 — First-launch city picker (`sheet`, blocking)

- **Purpose:** asks «Где ищете жильё?» (`city.firstTitle`) when the server does not know the user's city.
- **Opens:** all of: more than one city in `meta.cities`, `meta.city_chosen === false`, not picked this session, and no
  listing open (`App.jsx:257, 660-669`).
- **Closes:** only by picking. `onClose` is a no-op; there is no Back handler and no drag-to-close
  (`$KVADRO_ROOT/demo/app/src/features/city/CityPicker.jsx:22-30`); a backdrop tap is ignored (`:56-61`).
- **Layout:** the same component as SCR-017, with header class `first`, no close button and no selected checkmark.
- **Actions:**
  - city row: `pickCity`, which sets the filter city (clears districts and polygon, adjusts zones / metro /
    below-median), resets the sort if it is now unavailable, and calls `saveCity(code, true)`;
  - «Определить по геопозиции» (SCR-017).
- **APIs:** `PUT /api/settings {city}` (errors ignored, `$KVADRO_ROOT/demo/app/src/lib/city.js:20-27`); `GET /api/cities`
  for the counts.
- **Storage:** writes `kv-city`.
- **Analytics:** the screen name stays the underlying tab (`cityPickerOpen` is false here), so this picker is not
  tracked (LB-APP-037).
- **Sources:** `App.jsx:283-303, 660-669`; `CityPicker.jsx`.
- **Status:** CONFIRMED.

### SCR-006 — App shell: top bar, tab bar, collapsed chrome, view toggle (`screen`)

- **Purpose:** the persistent frame around the four tabs.
- **Layout, top to bottom:**
  - `button.mini-top.glass`: collapsed one-line title `«<deal> · <filtersSummary>»`, search tab only (`App.jsx:446-456`).
  - `header.topbar` (`$KVADRO_ROOT/demo/app/src/app/TopBar.jsx:48-134`). Variants:
    - search list: title tabs «Аренда» / «Продажа» (`deal.rent_long` / `deal.sale`; daily rent counts as «Аренда»)
      plus the FeedHeader chips (SCR-007);
    - map: compact segmented deal control, lasso button (aria `map.area` «Обвести на карте»), filters button with a
      count badge;
    - drawing: hint `map.areaHint` «Обведите пальцем, где искать» or `map.areaSmall` «Обведите покрупнее», sub-hint
      `map.areaMove` «Двумя пальцами — двигать карту», and «Отмена» (`map.areaCancel`);
    - favourites: title tabs «Избранное» / «Смотрели» (`app.saved.*`);
    - radar and settings: h1 with the tab title; the radar tab adds a «+» button (aria `sheet.createTitle` «Новый радар»);
    - map with an area set: pill «Своя область» (`map.areaOn`) and an × (`map.areaRemove`).
  - Base layer: feed, map, radar or settings.
  - Floating `view-toggle`: «Карта» / «Список» (`app.view.*`), search tab only and hidden while drawing
    (`$KVADRO_ROOT/demo/app/src/app/ViewToggle.jsx`, `App.jsx:529`).
  - Pull-to-refresh indicator (SCR-010) and decorative `mini-ring` spans.
  - `nav.tabbar.glass`: 4 tabs with lucide icons at 24 px. Labels longer than 13 characters get class `long`
    (`TabBar.jsx:12-33`).
- **Actions:**
  - tab press: light haptic, clears radar-return, `scrollTo(0,0)`;
  - deal switch: keeps geography, resets other filters (BR-APP-002);
  - view toggle;
  - mini-title tap: expands the chrome.
- **APIs:** `GET /api/subscriptions` on entering the search tab and after radar changes (`App.jsx:173-177`);
  `GET /api/cities` each time the filters sheet opens (`App.jsx:167-171`).
- **Analytics:** `$pageview` for `search/list`, `search/map`, `saved/favorites`, `saved/history`, `subs`, `settings`.
- **Adaptive:**
  - safe-area padding via `--top-inset` / `--bottom-inset` built from Telegram CSS variables;
  - `html.fullscreen` centres the mini title in Telegram's header row (`$KVADRO_ROOT/demo/app/src/styles/chrome.css:223-230`);
  - no width breakpoints; a phone layout only, with the feed limited to a 608 px column (`$KVADRO_ROOT/demo/app/src/lib/images.js:34`).
- **Animation:** the chrome collapses with a `clip-path` morph (translate in lite) over 0.35–0.45 s; the tab lens moves
  with a spring easing (`chrome.css:100-319`).
- **Sources:** `App.jsx:440-545`; `TopBar.jsx`; `TabBar.jsx`; `ViewToggle.jsx`; `$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js`.
- **Status:** CONFIRMED.

### SCR-007 — Search feed: list (`screen`)

- **Purpose:** the main infinite list of listings for the current filters and sort.
- **Opens:** default on start (`tab = 'search'`, `view = 'list'`).
- **Closes:** by switching tab or view.
- **Header chips** (`$KVADRO_ROOT/demo/app/src/features/feed/FeedHeader.jsx:21-62`), in order:
  - filters (icon, aria `sheet.title` «Фильтры», count badge);
  - sort (`sort.<value>`, e.g. «Сначала новые»);
  - «Своя область» when a polygon is set (switches to the map);
  - rooms («Комнаты» / summary), hidden when only room/commercial/land types are selected;
  - price («Цена» / summary);
  - owner: shows «Без риелторов» (`owner.no_agents`) **unhighlighted** when the owner filter is `any`, as a hint
    (LB-APP-042);
  - city (MapPin + name), only when there is more than one city.
- **Cards** (`$KVADRO_ROOT/demo/app/src/components/ListingCard.jsx:32-93`):
  - photo strip with scroll-snap and dots; lazy slide mounting; a ▶ badge for video;
  - badge tag (BR-APP-026), favourite heart, «viewed» eye (aria `card.viewedTitle`), `status_text` warning tag;
  - price `main` + `period` + the price-kind label, or «Цена договорная» (`card.negotiable`). The label
    (`priceKindLabel`, `$KVADRO_ROOT/demo/app/src/features/listing/format.js:35-43`; `ListingCard.jsx:74`) is
    «· первый взнос» (`card.downPayment`) for `price_kind: "down_payment"` and, since release `index-Dbpp463V.js`,
    «· цена за бизнес, помещение в аренде» / «biznes narxi, joy ijarada» / «business price, premises rented»
    (`card.businessPrice`, `ru.js:103`, `uz_Latn.js:101`, `en.js:101`) for `"business"`; any other value has no
    label (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md:14-15`). The same card, and so
    the label, appears in favourites, history and the compact map card (SCR-013);
  - market delta chip (`listing.marketDelta` «{delta} к рынку», or the short verdict);
  - facts line `title · area · floor · market · 🐾`, then age;
  - location line `district · landmark · metro|center distance`.
- **Loading:** 3 skeleton cards on the first page; a spinner at the sentinel for later pages (SCR-008).
- **Pagination:** `GET /api/feed?…&limit=20[&sort][&cursor]`. The next page loads when the sentinel is within 800 px.
  Items are deduplicated by id (`$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:14-63`).
- **Recreation:** the list is re-created (`key`) on any change of filters, sort or `feedVersion` (pull-to-refresh)
  (`App.jsx:516`).
- **Visibility:** hidden listings are filtered locally (`ListingFeed.jsx:81-86`). The first 2 cards load their photo
  eagerly with high priority.
- **Block inside the list** (since release `index-DY_DH7h-.js`): the search list takes an `inline` block and renders it
  after the 8th visible card, or after the last card when the list is shorter, fully loaded and shows no few-results
  note (`ListingFeed.jsx:98-106,128-139` at the pin). That block is the in-feed radar card SCR-047. The return banner
  SCR-046 floats above the list.
- **Actions:**
  - open a card: `openListing(id, item)` adds it to `seen` and passes the card as `preview`;
  - favourite toggle: optimistic `POST /api/listings/:id/favorite`, with the server result applied
    (`$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:17-45`);
  - header chips open SCR-014 to SCR-017.
- **APIs:** `GET /api/feed` (the first page is prefetched in `main.jsx`); `POST /api/listings/:id/favorite`.
- **Storage:** `kv-city` through `getSavedCity` in the initial filters.
- **Analytics:** `$pageview search/list`. The first loaded photo resolves `markFirstContent()`, which starts PostHog
  loading (`$KVADRO_ROOT/demo/app/src/components/Photo.jsx:38-42`).
- **Gestures:** horizontal photo swipe inside cards; pull-to-refresh; collapsing chrome.
- **Sources:** `App.jsx:403-418, 513-527`; `FeedHeader.jsx`; `ListingFeed.jsx`; `useInfiniteFeed.js`; `ListingCard.jsx`;
  `$KVADRO_ROOT/demo/app/src/components/PhotoStrip.jsx`; `Photo.jsx`; `FavButton.jsx`.
- **Status:** CONFIRMED.

### SCR-008 — Feed loading and error states (`state`)

- **Applies to:** search, favourites and history lists (`ListingFeed.jsx:114-141`).
- **First load:** 3 `ListingCardSkeleton`s with a shimmer animation (`$KVADRO_ROOT/demo/app/src/components/ListingCardSkeleton.jsx`).
- **Error with no items** (not 403): `ErrorState` (`$KVADRO_ROOT/demo/app/src/components/ErrorState.jsx:13-26`):
  - offline (`status 0`): WifiOff icon, «Нет связи» (`error.offline`), «Проверьте интернет и попробуйте ещё раз.»
    (`error.offlineText`);
  - otherwise: CloudOff icon, «Не загрузилось» (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через
    минуту.» (`error.serverText`);
  - button «Повторить» (`error.retry`).
- **Error with items, or a 403:** an inline button «Не загрузилось — повторить» or «Нет доступа — повторить»
  (`feed.retry` with `common.loadFailed` / `common.noAccess`).
- **Later pages:** spinner at the sentinel.
- **Status:** CONFIRMED.

### SCR-009 — Feed empty and few-results states (`state`)

- **Search empty** (`ListingFeed.jsx:22-49`): magnifier mascot, «Ничего не нашлось» (`feed.nothing`), «Попробуйте
  ослабить фильтры» (`feed.nothingHint`) and «Сбросить фильтры» (`feed.resetFilters`). Reset gives
  `defaultFilters(baseDeal(deal), city)` (`App.jsx:525`). Shown only when the few-results note is not shown.
- **Few-results note** (`$KVADRO_ROOT/demo/app/src/app/FewResultsNote.jsx:18-59`, `App.jsx:420-439`):
  - **Shown when:** the feed is fully loaded, has no error and fewer than 10 visible items (`FEW_RESULTS`,
    `ListingFeed.jsx:17,89-92`), **and** no active filters, city stats are loaded and the city has a name.
  - **Title:** «Ничего не нашлось» when 0; «Это все объявления об аренде» / «Это все объявления о продаже»
    (`feed.fewRent` / `feed.fewSale`).
  - **Hint:** `feed.fewHint` «{city}: новых объявлений немного. Включите радар — он пришлёт новые в чат, как только
    появятся.».
  - **Buttons:**
    - «Смотреть продажу · N» / «Смотреть аренду · N» (`feed.seeSale` / `feed.seeRent`), only when the other deal has
      more listings in the city;
    - «Включить радар по этому поиску» (`feed.subscribeHere`), hidden when already subscribed;
    - «Другой город» (`feed.otherCity`), which opens the full filters sheet, only with more than one city.
- **Favourites empty:** shrug mascot, «Здесь пока пусто» / «Нажмите ♡ на объявлении, чтобы сохранить его»
  (`feed.favEmpty` / `feed.favEmptyHint`).
- **History empty:** «Вы ещё ничего не открывали» / «Здесь будут объявления, которые вы смотрели» (`feed.histEmpty` /
  `feed.histEmptyHint`).
- **APIs:** subscribing from the note calls `GET /api/subscriptions`, then `POST /api/subscriptions` (entry `few`) or
  `PATCH /api/subscriptions/:id` (BR-APP-041).
- **Edge case:** with 0 active filters but no city stats yet, the plain empty state shows «Сбросить фильтры» although
  there is nothing to reset (LB-APP-038).
- **With the in-feed radar card** (SCR-047, since release `index-DY_DH7h-.js`): on a list of 8 or fewer cards the card
  follows the last one only when the few-results note is not rendered; with 9 cards it stands after the 8th and the
  note below the list (`ListingFeed.jsx:94-106` at the pin).
- **Status:** CONFIRMED.

### SCR-010 — Pull-to-refresh (`overlay`)

- **Purpose:** reloads the current list or the radar list.
- **Active when:** no listing open, not the map, no filters / quick filter / radar editor / create-radar open, and not
  the settings tab (`App.jsx:530-541`). It also checks the body classes `locked`, `sheet-open` and `listing-open`
  (`$KVADRO_ROOT/demo/app/src/components/PullToRefresh.jsx:45-62`).
- **Gesture:** window `touchstart` at `scrollY == 0`. The indicator moves at half the finger distance; it triggers at
  72 px (max 110 px) with a light haptic when armed; the spinner shows for at least 700 ms.
- **Effect:** on the radar tab increments `subsVersion`, otherwise `feedVersion` (`App.jsx:359-365`).
- **Sources:** `PullToRefresh.jsx`.
- **Status:** CONFIRMED.

### SCR-011 — Search map (`screen`)

- **Purpose:** listings on a map with clusters, stacks of identical coordinates, a selection card, lasso drawing and
  "where am I".
- **Opens:** «Карта» view toggle; «Своя область» chip; «Обвести на карте» in filters (drawing mode).
- **Closes:** «Список» toggle or a tab switch. There is no Back handler for the map itself.
- **Engine:** GL (MapLibre) or Leaflet, see §1.8. While the chunk loads, a Suspense spinner shows
  (`$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:39-51`).
- **Data:** `GET /api/map?<filter params>` returns `{points:[{id,lat,lon,label,usd?,tone?,priced?}], total}`.
  - Hidden listings are excluded.
  - Points with the same coordinates (5 decimals) are grouped into "stacks" sorted by `usd`
    (`$KVADRO_ROOT/demo/app/src/features/map/pins.js:9-22`).
  - GL: Supercluster radius 48, maxZoom 17. Leaflet: markercluster radius 48.
- **Pins** show the server `label` with tone classes `good / high / suspicious / check / nego / active`
  (`$KVADRO_ROOT/demo/app/src/styles/map.css:137-158`). There is no client price formatting.
- **Camera:** fits the polygon, else robust point bounds (3%–97% quantiles from 20 points), padding 90/24, maxZoom 14
  (Leaflet scale). A city change jumps the centre.
- **Note** `map.note` «На карте {shown} из {total} · {missing} известен только район» (with plural `map.missing`) shows
  for 6 s when some listings have no coordinates (`$KVADRO_ROOT/demo/app/src/features/map/gl/MapViewGL.jsx:152-174`,
  `$KVADRO_ROOT/demo/app/src/features/map/leaflet/MapView.jsx:200-222`).
- **Locate button** (aria «Где я», `map.locate`): uses LocationManager or browser geolocation (TMA-035). Errors appear
  in the note for 5 s: `map.locateDenied` «Нет доступа к геопозиции. Разрешить можно в настройках Telegram.» or
  `map.locateFail` «Не получилось определить, где вы.». Success flies to zoom ≥ 15 with a blue dot and an accuracy
  circle under 2 km.
- **Gestures:** pan and pinch. GL disables rotation, pitch and keyboard. Taps: pin opens the card, cluster zooms (at max
  zoom opens the card with all leaves), stack spiderfies, background closes the card.
- **Missing states:** there is no loading indicator for points, and no empty or error state. A GL fetch error leaves an
  empty map (LB-APP-008, LB-APP-044).
- **Basemap:** `meta.tiles`:
  - `undefined` (meta not loaded): background colour only;
  - `null`: OSM raster `tile.openstreetmap.org`;
  - a string: a Protomaps vector source, `.pmtiles` or a `{z}/{x}/{y}` template.
  - Attribution «© OpenStreetMap · Protomaps».
- **Labels:** bundled Noto Sans fonts (GL only); label language by locale.
- **APIs:** `GET /api/map`; `GET /api/listings/:id?preview=1` (card); tiles (`RES`, see `08-api-inventory.md`).
- **Storage:** `kv-map-v2`; `kv-map-fit:<lat>,<lon>` (Leaflet only).
- **Analytics:** `$pageview search/map`.
- **Differences between engines a user notices:** label font; attribution; whole-step vs fractional pinch while
  drawing; stack collapse on zoom (Leaflet); max-zoom cluster sort order; basemap delay up to 1.2 s (Leaflet); in-map
  tile prefetch (Leaflet only); theme re-styling.
- **Sources:** `MapScreen.jsx`; `$KVADRO_ROOT/demo/app/src/features/map/engine.js`; `gl/*`; `leaflet/*`; `pins.js`;
  `tilePrefetch.js`; `attribution.js`; `palette.js`.
- **Status:** CONFIRMED. Two style details are inferred (§6).

### SCR-012 — Map area drawing, lasso (`state`)

- **Purpose:** draw a free-hand search area.
- **Opens:**
  - lasso button or «Своя область» pill on the map (`startDrawing`, `App.jsx:325-329`);
  - «Обвести на карте» in the full filters sheet, which saves the city, closes the sheet, switches to the map and starts
    drawing (`App.jsx:393-402`).
- **Closes:**
  - finished stroke: `onDrawn` → `applyFilters({...filters, polygon, districts: [], zones: []})`;
  - «Отмена»;
  - Telegram Back (`$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:37-44`);
  - leaving the map.
- **Gesture** (`$KVADRO_ROOT/demo/app/src/features/map/LassoOverlay.jsx:60-156`):
  - one finger draws with pointer capture; points closer than 4 px are skipped;
  - a second finger cancels the stroke and pans or pinches the map;
  - light haptic on stroke start;
  - success haptic on a valid polygon, error haptic plus `areaTooSmall` otherwise.
- **Validation** (`$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:115-151`): at least 3 points; extent ≥ 40 px on both
  axes; simplified to ≤ 40 vertices; self-intersection replaced by the convex hull; coordinates rounded to 5 decimals.
- **Texts:** the TopBar drawing variant (SCR-006).
- **Mask:** a dimmed world rectangle with the polygon cut out and an outline (`polygon.js:185-228`).
- **Clearing:** the × on the area pill → `setFilters({...filters, polygon: null})` (`App.jsx:339-345`).
- **Analytics:** `$pageview map/draw`.
- **Sources:** `LassoOverlay.jsx`; `gl/GlLasso.jsx`; `leaflet/lassoHandlers.js`; `polygon.js`.
- **Status:** CONFIRMED.

### SCR-013 — Map selection card (`overlay`)

- **Purpose:** preview one listing, or swipe through a stack or a max-zoom cluster.
- **Opens:** tapping a pin, stack or max-zoom cluster.
- **Closes:** × (aria `common.close`), a background tap, entering drawing mode, or new data. **Telegram Back does not
  close it** (LB-APP-024).
- **Layout:** `.map-card.glass` holding a compact `ListingCard` (one photo, `verdict.short`, no badges). For stacks:
  header «{n} из {total}» (`map.stackOf`) and a scroll-snap track that renders only ±1 slots, with a light haptic on
  slot change (`$KVADRO_ROOT/demo/app/src/features/map/MapSelectionCard.jsx:24-124`).
- **Data:** `GET /api/listings/:id?preview=1` for the current and adjacent items, once each. On error the id is
  un-marked for a later retry and the spinner remains (LB-APP-017).
- **Actions:** tap the card to open the listing (SCR-018); favourite toggle.
- **Sources:** `MapSelectionCard.jsx`; `gl/useClusterMarkers.js`; `leaflet/listingLayer.js`.
- **Status:** CONFIRMED.

### SCR-014 — Full filters sheet, search mode (`sheet`)

- **Purpose:** edit every search filter with a live result count and a radar forecast.
- **Opens:**
  - the filters chip or map filters button (`setFiltersOpen(true)`);
  - «Другой город» in the few-results note;
  - start with `?news=pets` (focus on the pets section, `useAppBootstrap.js:115-124`).
- **Closes:** ×, backdrop tap, drag down, Telegram Back, «Показать N», «Включить радар» on success, or «Обвести на
  карте».
- **Layout** (`$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:172-260`):
  - sticky header: × / title «Фильтры» (`sheet.title`) / «Сбросить» (`sheet.reset`);
  - scrollable sections (with a shadow when scrolled);
  - sticky footer with the flow hint and buttons.
  - Header and footer heights are written to `--fsheet-head` and `--fsheet-foot`
    (`$KVADRO_ROOT/demo/app/src/features/filters/sheet/useSheetChrome.js:8-26`); the body gets class `locked`.
- **Sections, in order:**
  1. Deal: segmented «Аренда / Продажа» (`deal.*`); a switch resets other filters and keeps geography
     (`$KVADRO_ROOT/demo/app/src/features/filters/sheet/DealSections.jsx:11-36`).
  2. City: field «Город» + name; opens the nested CityPicker (SCR-017). Only with more than one city
     (`$KVADRO_ROOT/demo/app/src/features/filters/sheet/LocationSections.jsx:9-22`).
  3. Housing «Жильё» (`sheet.housing`): multi-select chips from `TYPES_BY_DEAL[deal]`; the last selected type cannot be
     removed (`DealSections.jsx:80-103`).
  4. Rent term «Срок аренды»: «Надолго» / «Посуточно»; only for rent, and only when daily is selected or the city has
     daily listings (`FiltersSheet.jsx:136`; `DealSections.jsx:42-74`).
  5. Rooms «Комнаты — два числа задают диапазон»: «Любые», 1, 2, 3, 4+ (`$KVADRO_ROOT/demo/app/src/features/filters/RoomsPicker.jsx`).
     Hidden when only room/commercial/land types are selected.
  6. Price «Цена в месяц, $» / «Цена за сутки, $» / «Цена, $» (or «млн сум»):
     - from/to inputs (`$KVADRO_ROOT/demo/app/src/components/inputs/PriceInput.jsx`);
     - «до N» preset chips;
     - the land/house unit hint `sheet.unitPriceHint`;
     - the typical price line `sheet.typical*`;
     - the «📊 Не дороже рынка» chip (`sheet.belowMedian`) with its long hint
     - (`$KVADRO_ROOT/demo/app/src/features/filters/PriceSection.jsx:29-124`).
  7. Where «Где искать» (`LocationSections.jsx:33-131`):
     - «Обвести на карте» / «Своя область на карте» (removes the polygon);
     - zone chips «🏛 Центр», «🏙 Ближе к центру» (multi-select, canonical order);
     - «🚇 Рядом с метро»;
     - label «Или районы:» / «Районы:» / «Районы области (необязательно):»;
     - district chips.
  8. Who posts «Кто размещает»: «Все / Без риелторов / Только хозяева».
  9. Tenant «Кто будет жить»: «Семья / Парни / Девушки», toggle; rent only.
  10. Pets «Животные» with a «Новое» pill: «Не важно / Не запрещены / Разрешены». Choosing one shows a tip toast inside
      the sheet (`sheet.petsTip`, `sheet.petsOnlyTip`) and marks `kv-new-pets`; rent only
      (`$KVADRO_ROOT/demo/app/src/features/filters/sheet/PreferenceSections.jsx:62-94`).
  11. Furniture «Мебель»: «Не важно / С мебелью / Без мебели».
  12. Renovation «Ремонт»: `meta.renovations[deal]` chips.
  13. Floor «Этаж»: «Не первый», «Не последний».
  14. Sale only: area «Площадь, м²» from/to integers capped at 10 000, and market «Дом»: «Не важно / Новостройка /
      Вторичка».
  15. Rent only: appliances «Техника» (`meta.appliances`).
  16. Search mode only: posted «Опубликовано»: «За сутки / За 3 дня / За неделю» (toggle), with the hint «Только для
      ленты: в чат и так приходят лишь новые.».
- **Footer** (`$KVADRO_ROOT/demo/app/src/features/filters/sheet/SheetFooter.jsx`):
  - flow line «📡 Радар: ≈{n} в день» / «📡 Радар: {n} за неделю» / «📡 За неделю таких не было — радар будет
    срабатывать редко»;
  - relax chips `«{label} · {rate}»`; tapping one replaces the filters with `option.filters` and remembers
    `relaxed = code`;
  - «Включить радар» (shows ✓ «Радар включён» when an active radar with the same filters exists; disabled while
    submitting);
  - «Показать» / «Показать {n}» / «Ничего нет».
- **Live data:** `GET /api/feed/count` 250 ms after any change and `GET /api/feed/flow` 500 ms after; in-flight
  requests are aborted (`$KVADRO_ROOT/demo/app/src/features/filters/useLiveFeedStats.js`).
- **Validation:**
  - price parse rules (§3.5; `$KVADRO_ROOT/demo/app/src/lib/money.js:91-101`);
  - area `IntInput` strips non-digits, 0 → null, max 10 000 (`$KVADRO_ROOT/demo/app/src/components/inputs/IntInput.jsx:10-21`);
  - no min ≤ max check (LB-APP-043).
- **Apply:** saves the city to the server if it changed, closes, `applyFilters` (scroll to top, follow-nudge candidate)
  (`App.jsx:385-391`).
- **Subscribe:** `subscribe(next, 'filters', relaxed)` (BR-APP-041).
- **APIs:** `GET /api/feed/count`, `GET /api/feed/flow`, `GET /api/cities`, `GET /api/subscriptions`,
  `POST /api/subscriptions`, `PATCH /api/subscriptions/:id`, `PUT /api/settings`.
- **Storage:** `kv-new-pets`; `kv-city`.
- **Analytics:** `$pageview filters`.
- **Edge cases:**
  - Reset returns to `rent_long` even from daily rent (LB-APP-030).
  - Tenant and pets remain visible for daily rent (LB-APP-029).
  - The `focus` scroll runs 350 ms after open.
- **Sources:** `FiltersSheet.jsx`; `sheet/*`; `PriceSection.jsx`; `RoomsPicker.jsx`; `$KVADRO_ROOT/demo/app/src/features/filters/model.js`;
  `options.js`; `summary.js`.
- **Status:** CONFIRMED.

### SCR-015 — Quick filter sheet: rooms, price, owner (`sheet`)

- **Purpose:** edit one filter from a header chip.
- **Opens:** the rooms, price or owner header chips (`onQuick(kind)`).
- **Closes:** ×, backdrop, drag, Telegram Back, or apply.
- **Layout:** compact sheet `csheet qsheet` with a grab handle, title «Комнаты», the price title, or «Кто размещает».
- **Body by kind:**
  - rooms: RoomsPicker plus the hint;
  - price: the full PriceSection, including the below-market chip;
  - owner: a 3-way segmented control.
- **Footer:** «Сбросить» resets only this filter (price also resets `below_median`), then «Показать {n}» / «Ничего нет».
- **Live count:** `GET /api/feed/count` with a 250 ms debounce.
- **Analytics:** `$pageview filters/<kind>`.
- **Sources:** `$KVADRO_ROOT/demo/app/src/features/filters/QuickFilterSheet.jsx:20-120`.
- **Status:** CONFIRMED.

### SCR-016 — Sort sheet (`sheet`)

- **Purpose:** choose the feed order.
- **Opens:** the sort chip. **Closes:** pick, ×, backdrop, drag, Telegram Back.
- **Options** (`$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-41`):
  - «Сначала новые» `new`, «Сначала дешевле» `cheap`, «Сначала дороже» `expensive`;
  - «Выгоднее к рынку» `deal` («Сначала те, что дешевле обычной цены — ближайших похожих или района»), only for
    apartment-only, non-daily searches in a city whose `median !== false`;
  - «Ближе к центру» `center` («По расстоянию до центра города»), when the city has zones;
  - «Дешевле за м²» `ppm` («По цене за квадратный метр»), sale only.
- **Effect:** `setSort`, close, `scrollTo(0,0)`. The feed is re-created with `sort=<value>`; `new` is omitted from the
  URL.
- **Analytics:** `$pageview sort`.
- **Status:** CONFIRMED.

### SCR-017 — City picker sheet (`sheet`)

- **Purpose:** switch the search city.
- **Opens:**
  - the city header chip (`cityPickerOpen`, `App.jsx:648-659`);
  - the city field inside the full filters sheet, nested over it (`FiltersSheet.jsx:250-257`);
  - the first-launch variant is SCR-005.
- **Closes:** pick, ×, backdrop, drag, Telegram Back.
- **Layout** (`$KVADRO_ROOT/demo/app/src/features/city/CityPicker.jsx:53-133`):
  - «Город» title;
  - optional geolocation row «Определить по геопозиции» / «Определяем…» with a spinner and an error line;
  - city rows with name, «{rent} аренда · {sale} продажа» (`city.counts`; long-term rent and sale only) and a ✓ on the
    current city.
- **Geolocation:** LocationManager or browser (TMA-035), then `findNearestCity` (BR-APP-056). Errors:
  - `city.locateDenied` «Нет доступа к геопозиции — выберите город из списка. Разрешить можно в настройках Telegram.»;
  - `city.locateFail`;
  - `city.locateFar` «Рядом с вами наших городов пока нет — выберите из списка.».
  - Success: success haptic, then the city is picked at once.
- **Effect:**
  - from the header: `pickCity` (geography reset rules) and `PUT /api/settings {city}`;
  - from the filters sheet: only the draft filters change, and the city is saved on «Показать».
- **Storage:** `kv-city`.
- **Analytics:** `$pageview city` (header variant only).
- **Status:** CONFIRMED.

### SCR-018 — Listing screen (`screen`)

- **Purpose:** the full card of one listing: photos, facts, market comparison, history, location, author, source text,
  contact CTA and actions.
- **Opens:**
  - a tap on a feed or favourites card, the map card, a radar find, a hidden item, or a radar strip mini-card
    (`openListing`);
  - a deep link `start_param l_<id>…` or `?listing=<id>` (initial `listingId`, `App.jsx:61`).
- **Closes:** Telegram Back; swipe right (not on Android, and only when nothing is open over it); the Settings button;
  hide / block / report-rented / fraud-hidden actions.
- **Layout** (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:158-247`): a fixed `listing-layer` (z 45)
  holding a scrollable `main.listing`.
  - **Hero** photo strip: counter «N / M»; a big ▶ «Смотреть видео в Telegram» (`listing.watchVideo`) for videos; tap
    opens the viewer, or for a video the original post.
  - **Sheet** body:
    - `status_text` banner;
    - **title row**: h1 title, «district · landmark», share (only when `bot_username` is known), favourite and «⋯»
      (aria «Ещё») (`$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:64-89`);
    - **key facts** tiles: rooms (plural `listing.rooms`), m², floor `n/total`, «Новый / Вторичка» building
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/KeyFacts.jsx:19-53`);
    - **market block** «Сравнение с районом» / «… с похожими рядом» / «… с городом»: info button, verdict, a scale with
      a marker animated from the centre on first show this session, «дешевле … обычно {value}{unit} … дороже», a
      context line, and warnings (`$KVADRO_ROOT/demo/app/src/features/listing/sections/MarketBlock.jsx:85-179`);
    - **facts grid** «Факты», from server `facts[]` with icons; values longer than 18 characters span full width
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/FactsSection.jsx`);
    - **stats cells**: days on market («Сегодня на рынке» when 0), publications, channels (only when > 1), views
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/StatsSection.jsx`);
    - **history**: a single sentence «Опубликовано {date} в @{channel}. Повторов и изменений цены пока не было.» with a
      clickable channel, or the «История цены» timeline (date, time, event text, @channel, price, ±% with a
      good/high colour) (`$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx`);
    - **location** «Расположение»: a non-interactive spot mini-map (2:1, lazy via IntersectionObserver; tap opens the
      fullscreen map), the hint «Место примерное: по кварталу, ориентиру или метро из объявления», place row, centre
      distance, and «Рядом» (metro ≤ 1.5 km plus server `nearby[]` with `~` distances)
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/LocationSection.jsx`, `NearbySection.jsx`,
      `$KVADRO_ROOT/demo/app/src/features/listing/spot/SpotMap.jsx:86-126`);
    - **author** «Кто размещает»: owner text, `offers[]` (links open with `original_opened src=offers`), phone (masked
      for session replay; tap calls) and «Опубликовано {when}» (`sections/AuthorSection.jsx`);
    - **description** «Из объявления» (`summary`);
    - **source** «Источник»: channel chips, then the disclosure «Текст оригинала». Inside: «Перевести / Перевожу… /
      Показать оригинал» (not in ru), «Не получилось перевести», the original or translated text with the author's
      phone as a call button, and «Перевод сделан ИИ» (`sections/SourcesSection.jsx`, `sections/OriginalText.jsx`).
  - **CTA bar** (fixed bottom, z 20): price + period, delta / note, and a primary button «Позвонить» / «Написать» /
    «Номер платный» / «Открыть пост», or a shimmer placeholder (`ListingCtaBar.jsx:17-83`).
- **Data flow:**
  - It renders the feed `preview` at once.
  - `GET /api/listings/:id` replaces it (consuming the prefetch for deep links). The screen scrolls to the top on each
    new id.
  - If the response `id` differs, the screen switches to that id without a refetch (redirect; release `plF_TOcT`,
    `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:19-65`).
- **Contact:**
  - `call_url` is kept with a timestamp and refreshed through `GET /api/listings/:id/call` 8 minutes after receipt, or
    on return to the app when stale (TTL 10 min, `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:22-90`).
  - On Android, `tel:` is tried first, then the call page (`$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:14-40`).
  - «Написать» opens `contact_url`.
- **Share:** a prepared message (`POST /api/listings/:id/share` → `shareMessage(id)`), else
  `t.me/share/url?url=https://t.me/<bot>?startapp=l_<id>&text=<title · price · kind · district>`. Repeat taps are
  locked during sharing and for 1.5 s after (`ListingTitleRow.jsx:28-63`). `kind` is the price-kind label of the
  card (SCR-007): «первый взнос», or «цена за бизнес, помещение в аренде» since release `index-Dbpp463V.js`
  (`ListingTitleRow.jsx:40-49`). This share text is the only place the label appears on the listing screen: the
  title row and the CTA bar do not render it (`ListingTitleRow.jsx:64-89`, `ListingCtaBar.jsx:17-83`), although the
  sync report and the changelog say the label shows "in the title row" / "on the listing screen"
  (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md:15`,
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:53`).
- **Actions menu:** SCR-023.
- **Overlays:** PhotoViewer (SCR-020), MarketSheet (SCR-022), SpotMapFullscreen (SCR-021).
- **APIs:**
  - `GET /api/listings/:id`, `GET /api/listings/:id/call`;
  - `POST /api/listings/:id/translate`, `POST /api/listings/:id/favorite`, `POST /api/listings/:id/share`;
  - plus the actions-sheet calls.
- **Analytics:** `$pageview listing` with `listing_id`; `listing_shared`; `original_opened` (`src` = `button`, `video`,
  `sources`, `price_history`, `offers`); `original_copied`; `contact_call` (`via`, `src`); `contact_write`.
- **Gestures:** swipe-back; horizontal photo strip; tap the mini-map.
- **Localization:** translate is hidden for `ru` (`$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingTranslation.js:22`).
  Dates in history use the device timezone (LB-APP-025).
- **Edge cases:**
  - Video of a deleted post (`post_deleted`) opens the gallery.
  - Without phone, contact or post there is no CTA, only a placeholder.
  - Translation and «original open» state are not reset when `id` changes (LB-APP-003).
  - The call button can silently do nothing (LB-APP-028).
- **Sources:** `ListingScreen.jsx`; `ListingHero.jsx`; `ListingTitleRow.jsx`; `ListingCtaBar.jsx`; `format.js`;
  `sections/*`; `hooks/*`; `spot/SpotMap.jsx`.
- **Status:** CONFIRMED.

### SCR-019 — Listing loading and error states (`state`)

- **No preview yet:** `ListingSkeleton`, a shimmer hero and three bars (`$KVADRO_ROOT/demo/app/src/features/listing/ListingSkeleton.jsx:5-35`).
- **Preview shown, details pending:** `SectionSkeleton` blocks of 3 and 4 lines and a shimmer CTA.
- **404:** plain text «Объявление не загрузилось» / «Eʼlon yuklanmadi» / «Couldn’t load the listing»
  (`listing.loadFailed`), with no button. Only Back closes it (`ListingScreen.jsx:112-122`).
- **Other errors:** a tall `ErrorState` with «Повторить», which bumps `reloadKey`.
- **Gestures:** swipe-back is disabled until there is data (`ListingScreen.jsx:89-93`).
- **Status:** CONFIRMED.

### SCR-020 — Photo viewer (`overlay`)

- **Purpose:** fullscreen gallery.
- **Opens:** tap on a hero photo (not a live video). **Closes:** × (aria `common.close`), Telegram Back, or swipe down
  past 110 px.
- **Layout:** black viewer (z 100); a horizontal snap strip; a bar with × and «N / M»; `aria-label` «Фото»
  (`viewer.title`) (`$KVADRO_ROOT/demo/app/src/features/listing/PhotoViewer.jsx:14-75`).
- **Gestures** (`$KVADRO_ROOT/demo/app/src/features/listing/ZoomableImage.jsx`): pinch zoom up to 4×; double tap to
  2.5×; pan when zoomed (the strip is locked while zoomed); swipe down fades the background through `--drag` and
  closes; zoom resets when leaving a slide.
- **Body class:** `locked`.
- **Edge case:** touch handlers bind once with the first-render callbacks (LB-APP-004).
- **Status:** CONFIRMED.

### SCR-021 — Spot map, fullscreen (`overlay`)

- **Purpose:** an interactive map of the approximate location circle (radius `geo_radius_m ?? 500`).
- **Opens:** tap on the mini-map. **Closes:** × or Telegram Back. There is no swipe gesture.
- **Layout:** the map; a close button; a locate button (aria «Где я»); a bottom card with the bold place name, the line
  «≈ {km} км от вас — место примерное» (`listing.mapFromYou`) or «Место примерное…» or a locate error; and buttons
  «Яндекс Карты» / «Google Карты» (`$KVADRO_ROOT/demo/app/src/features/listing/spot/SpotMapFullscreen.jsx:23-91`).
- **External links:**
  - Yandex `yandex.uz/maps/?ll=…&z=…&pt=…,pm2rdm`, with zoom 17 / 16 / 15 / 13 for radius ≤ 250 / 600 / 1500 m / more;
  - Google `google.com/maps/search/?api=1&query=…`;
  - both open with `openLink` (external browser) (`spot/spotGeometry.js:66-86`).
- **Locate:** fits both the spot and the user.
- **Status:** CONFIRMED.

### SCR-022 — Market explanation sheet «Откуда эта цифра» (`sheet`)

- **Purpose:** explains in plain words how the market verdict was computed.
- **Opens:** the ⓘ button in the market block. **Closes:** backdrop, drag, Telegram Back. It has no × button.
- **Layout:** portal sheet `csheet` with title «Откуда эта цифра» (`market.how`):
  - an animated demo scale (the dot slides to `--to` over 1 s; the tag fades in);
  - paragraph 1, the sample: `market.v3.found` (near: «Мы нашли {n} похожих квартир рядом: {alike}.» with
    «тоже двухкомнатные», «тоже в ЖК», «не дальше {dist}»), `market.v3.district` or `market.v3.city`;
  - paragraph 2, the median: `market.v3.half` / `halfM2`;
  - paragraph 3, own price and conclusion by tone (`market.v3.own*` + `pricier / cheaper / same / mixed / noRepair /
    suspicious / check`, plus `median_note`);
  - footer «Цены из объявлений — после торга бывает дешевле · обновлено {ago} · Подробнее». «Подробнее» opens the
    methodology page for the locale: `kvadro.app/arenda/metodika/`, `/uz/ijara/metodika/` or `/en/rent/methodology/`
    (`$KVADRO_ROOT/demo/app/src/features/listing/MarketSheet.jsx:14-221`).
- **Thresholds:** the «ago» text has steps under 2 min «только что», under 60 min, under 48 h, then days. The ratio is
  shown as «в N раза» from +90%.
- **Edge case:** a `median_rooms` value that is not 1–3 or ≥ 4 throws (LB-APP-015).
- **Status:** CONFIRMED.

### SCR-023 — Listing actions sheet: menu, report and report detail (`sheet`)

- **Purpose:** hide, block the author, report, or contact support.
- **Opens:** «⋯» in the title row. **Closes:** ×, backdrop or drag from any view, Telegram Back on the menu view, or a
  successful action.
- **Views and Back** (`$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:30-45,108-134`): `menu` →
  `report` → `detail`; the third view exists since release `index-BNLZFfL0.js`
  (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md:13-20`).
  - Back goes one step: detail → reasons → menu → close (`goBack`, `ListingActionsSheet.jsx:36-44`). Telegram Back
    (`pushBackHandler(goBack)`, `:45`) and the header back button (ChevronLeft, aria `actions.back` «Назад») call the
    same `goBack`.
  - The header back button is shown on every view except the menu (`:123-129`). Before `index-BNLZFfL0.js` it existed
    only on the report view and went straight to the menu.
  - Title, also the dialog `aria-label` (`:108-110,116`): menu `actions.title` «Объявление» / «Eʼlon» / «Listing»;
    report `report.title` «Что не так?» / «Nima notoʻgʻri?» / «What's wrong?»; detail `report.detailTitle`
    «Что именно неверно?» / «Aynan nima notoʻgʻri?» / «What exactly is wrong?».
- **Menu view** (`ListingActionsSheet.jsx:137-174`), title «Объявление»:
  - «Скрыть объявление» — «Больше не покажем ни его, ни его копии»;
  - «Заблокировать автора» — «Не показывать объявления с номера {label}» / «… из {label}» / «Не показывать его
    объявления», plus « — скроет N объявлений» when the author has 20 or more listings. Phone hints are masked for
    session replay.
  - «Пожаловаться» › «Сдано, риелтор, ошибка или обман»;
  - «Написать в поддержку» — «Уже сдано, мошенник или это ваше объявление — разберёмся», only when `/api/bot` returns
    `support`; opens `t.me/<support>?start=l_<id>`.
- **Report view** (`ListingActionsSheet.jsx:175-191`), title «Что не так?»:
  - «Уже сдано» / «Объявление больше не актуально»;
  - «Это риелтор, а не хозяин» / «Отметим номер как риелторский» (hidden when `is_owner === false`);
  - «Неверные данные» / «Цена, район или комнаты не совпадают» — since `index-BNLZFfL0.js` with a › arrow; a tap
    gives a light haptic and opens the detail view, nothing is sent;
  - «Мошенничество или спам» / «Просят предоплату, чужие фото, реклама».

  The other three reasons are sent at once with `{reason}`.
- **Detail view** «Что именно неверно?» (`ListingActionsSheet.jsx:13-14,192-200`; since `index-BNLZFfL0.js`): five
  rows from `REPORT_DETAILS`, no icons, no arrows. A tap sends `reason: "wrong_data"` with the row's `detail` code
  (`ru.js:201-211`, `uz_Latn.js:194-204`, `en.js:195-205`):

  | `detail` | Title `report.d_<code>` (ru / uz_Latn / en) | Hint `report.d_<code>Hint` (ru / uz_Latn / en) |
  | -------- | ------------------------------------------- | ---------------------------------------------- |
  | `price` | «Цена» / «Narx» / «Price» | «Другая сумма или валюта» / «Summa yoki valyuta boshqa» / «Different amount or currency» |
  | `rooms` | «Комнаты, площадь или этаж» / «Xonalar, maydon yoki qavat» / «Rooms, area or floor» | «Не совпадают с постом или квартирой» / «Post yoki kvartiraga mos emas» / «Don't match the post or the flat» |
  | `place` | «Район или место на карте» / «Tuman yoki xaritadagi joy» / «District or map location» | «Квартира в другом районе» / «Kvartira boshqa tumanda» / «The flat is in another district» |
  | `photos` | «Фото» / «Rasmlar» / «Photos» | «Фото не от этой квартиры» / «Rasmlar bu kvartiraniki emas» / «Photos are from another flat» |
  | `other` | «Другое» / «Boshqa» / «Other» | «Тип жилья, ремонт, условия» / «Uy turi, taʼmir, shartlar» / «Property type, renovation, terms» |

  This client never sends `wrong_data` without a `detail` (BR-APP-036). The release added 11 i18n keys and no
  analytics event.
- **Results** (`$KVADRO_ROOT/demo/app/src/app/useListingActions.js:32-81`):

  | Action | Effect | Toast |
  | ------ | ------ | ----- |
  | Hide | hide locally, close the listing | «Объявление скрыто» + «Вернуть» (undo: `DELETE /api/listings/:id/hide`) |
  | Block | hide all `listing_ids`, close | «Автор {label} заблокирован» + «Вернуть» (undo: `DELETE /api/listings/:id/block-author`) |
  | Report `fraud` with `hidden: true` | hide | «Спасибо, посмотрим. Это объявление у вас скрыли» + undo |
  | Report `rented` | hide and close, no undo | «Отметили: уже сдано» |
  | Report `agent` | — | «Отметили номер как риелторский» |
  | Other reports, including `wrong_data` with any `detail` | — | «Спасибо! Посмотрим» |
  | Any failure | — | «Не получилось сохранить» |
  | Undo failure | re-hides | «Не получилось сохранить» |

- **APIs:** `POST /api/listings/:id/hide`, `POST /api/listings/:id/block-author`, `POST /api/listings/:id/report`
  `{reason}` or `{reason: "wrong_data", detail}` (`detail` only when truthy,
  `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:86-90`), `GET /api/bot`, `DELETE /api/listings/:id/hide`,
  `DELETE /api/listings/:id/block-author`.
- **States:** `busy` ignores taps on every view while a request runs. Haptics: light when the report or detail view
  opens and when an action starts; success or error after it.
- **Legacy parity scenarios** (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:281-293`): `listing-report-wrong` (the
  detail view, no request), `listing-report-wrong-price` (body `{"reason":"wrong_data","detail":"price"}`, toast),
  `listing-report-wrong-back` (header back from the detail view to the reasons), `listing-report-204` (`wrong_data`
  with `detail: "photos"`).
- **Status:** CONFIRMED.

### SCR-024 — Favourites (`screen`)

- **Purpose:** the server list of favourites.
- **Opens:** the Heart tab with the «Избранное» sub-tab (the default sub-tab).
- **List:** `ListingFeed source=favorites` with one request, `GET /api/favorites`. Items un-favourited this session or
  hidden are filtered out locally (`ListingFeed.jsx:81-84`). Pull-to-refresh re-creates it.
- **States:** skeleton, error and empty (SCR-008, SCR-009).
- **Analytics:** `$pageview saved/favorites`.
- **Edge case:** the pagination contract is not visible (LB-APP-022).
- **Status:** CONFIRMED.

### SCR-025 — History «Смотрели» (`screen`)

- **Purpose:** the server list of listings the user opened.
- **Opens:** the «Смотрели» sub-tab.
- **List:** `GET /api/history`. The list is re-created whenever the session `seen` count changes (`App.jsx:516`). The
  «viewed» eye is not shown here.
- **Tool:** «Очистить» (`feed.clear`, trash icon) when items exist. It asks the confirm «Очистить историю просмотров?»
  (`feed.clearConfirm`), then `DELETE /api/history`, clears the list and plays the success haptic. A failure plays the
  error haptic only (`ListingFeed.jsx:93-112`).
- **Analytics:** `$pageview saved/history`.
- **Status:** CONFIRMED.

### SCR-026 — Radar tab: subscription list (`screen`)

- **Purpose:** saved searches («радары») that push new listings to the bot chat.
- **Opens:** the Radar tab.
- **Loading:** a centred spinner. **Error:** a tall ErrorState with retry (`$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:193-202`).
- **Tiles** (`$KVADRO_ROOT/demo/app/src/features/radar/RadarTiles.jsx:17-56`):
  - a collage of up to 4 covers from the latest finds, or the radar icon;
  - title `filtersTitle` (e.g. «2-комн. · до $600»);
  - area summary `filtersAreaSummary`;
  - a status line «На паузе», or «≈N в день · сразу», «N за неделю · подборкой», «пока редко · …»
    (`$KVADRO_ROOT/demo/app/src/features/radar/subscriptionStatus.js:11-32`);
  - an on/off switch;
  - inactive tiles are greyscale.
- **Previews:** for every subscription, `GET /api/feed` (first page, `new`; 5 finds kept), `GET /api/feed/count` and
  `GET /api/feed/flow` (`$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:21-72`). This is 3 requests per
  radar (LB-APP-036).
- **Actions:**
  - tap a tile opens SCR-028;
  - the switch is an optimistic `PATCH /api/subscriptions/:id {active}`. Turning on goes through the chat-access flow
    (TMA-033). On success with `starter > 0` it shows the toast «Радар снова включён. {count}, которые вы не видели, —
    в чате с ботом» (`subs.resumed`). `ask_found` opens SCR-031 (trigger `pause`).
  - «+» in the top bar opens SCR-030.
- **Return from a radar feed:** reopens the same sheet without animation and restores `scrollY` (`RadarScreen.jsx:63-71`).
- **APIs:** `GET /api/subscriptions`; the preview calls; `PATCH` / `DELETE /api/subscriptions/:id`.
- **Analytics:** `$pageview subs`.
- **Status:** CONFIRMED.

### SCR-027 — Radar empty state (`state`)

- **Layout:** an animated radar sweep with 3 blips (static in lite or reduced motion); «Радар следит за каналами за
  вас» (`subs.empty`); a long hint (`subs.emptyHint`); and the primary button «Включить радар» (`sheet.subscribe`),
  which opens SCR-030 (`$KVADRO_ROOT/demo/app/src/features/radar/RadarEmptyState.jsx:12-51`). The found survey can
  render inside it.
- **Status:** CONFIRMED.

### SCR-028 — Radar subscription sheet (`sheet`)

- **Purpose:** manage one radar.
- **Opens:** tap a tile, or return from its feed. **Closes:** ×, backdrop, drag, Telegram Back, opening the feed, or
  deleting it. It is hidden (not unmounted state) while a listing is open over it (`RadarScreen.jsx:216`).
- **Layout** (`$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:64-155`):
  - header: title, area summary, a status dot and text, ×;
  - «Последние находки»: a horizontal strip of mini-cards with cover, «новое» badge (unviewed, active only), price,
    district · age; then «Все {n} ›», or «Пока ничего — радар пришлёт, как появится», or ghost placeholders while
    loading (`$KVADRO_ROOT/demo/app/src/features/radar/RadarStrip.jsx`);
  - settings card:
    - «Присылать в чат» switch;
    - when active, mode radio rows «Сразу» («Каждое новое — как только появится») and «Подборкой» («Списком в 9 и
      21», built from `GET /api/settings` digest hours, else «Списком в заданное время»);
  - card: «Изменить условия ›», «Скрыто: N — Вернуть» (only when `hidden > 0`), and the red «Удалить радар»;
  - footer primary «Смотреть найденное · {n}» / «Смотреть найденное».
- **Actions:**
  - mode change: optimistic `PATCH {mode}`;
  - unhide: `PATCH {unhide: true}`, then the toast «Скрытое снова показывается»;
  - edit: opens SCR-029;
  - delete: native confirm «Удалить радар «{name}»?», then `DELETE`, then optionally SCR-031 (trigger `delete`);
  - «Смотреть найденное»: closes the sheet, sets the search filters to the radar's, switches to the search tab and
    remembers where Back returns (`App.jsx:367-378`).
- **APIs:** `GET /api/settings`; `PATCH /api/subscriptions/:id`; `DELETE /api/subscriptions/:id`.
- **Status:** CONFIRMED.

### SCR-029 — Radar editor: filters sheet in edit mode (`sheet`)

- **Purpose:** change a radar's conditions.
- **Opens:** «Изменить условия». **Closes:** ×, backdrop, drag, Telegram Back, or a successful save.
- **Differences from SCR-014:**
  - title «Условия радара» (`sheet.editTitle`);
  - no «Опубликовано» section;
  - footer «Сейчас подходит: {n}» (`sheet.matchingNow`) and one button «Сохранить» (`sheet.save`), disabled while
    submitting;
  - no subscribe / apply.
- **Save:** `PUT /api/subscriptions/:id {filters, relaxed}` inside the chat-access flow. Toasts
  (`$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:160-180`):
  - «Радар обновлён. {count} под новые условия — в чате с ботом» when `starter > 0`;
  - otherwise «Радар обновлён, но таких объявлений мало. {what}: {rate}» with the action «Расширить»
    (`POST /api/subscriptions/:id/relax {code}`), or «Радар обновлён. Пока пусто{hint}»;
  - on error: «Радар не включён — боту нужно разрешение писать вам в чат» (`no_chat`) or «Не получилось сохранить».
- **Analytics:** `$pageview radar/edit`.
- **Edge case:** LB-APP-005.
- **Status:** CONFIRMED.

### SCR-030 — New radar: filters sheet in create mode (`sheet`)

- **Opens:** «+» on the radar tab, or «Включить радар» on the empty state. It starts from the current search filters.
  Since release `index-DY_DH7h-.js` also from «Настроить» on the return banner (SCR-046) and «Настроить радар» on the
  in-feed radar card (SCR-047), which offer it for default filters only (BR-APP-073).
- **Differences from SCR-014:** title «Новый радар»; the button «Включить радар»; no posted-days section.
- **Save:** `subscribe(next, createSubSource, relaxed)`; the sheet closes on success. `createSubSource` is `empty` from
  «+» and the empty state, `return` / `feed` from the banner / the card (`App.jsx:401-415,717-721` at the pin); before
  release `index-DY_DH7h-.js` the sheet always sent `empty`.
- **Toasts** (`subscriptionActions.js:94-158`):
  - «Радар включён. {count} уже в чате с ботом»;
  - few: «Радар включён, но таких объявлений мало. {what}: {rate}» + «Расширить»;
  - empty: «Радар включён — новые придут в чат, как только появятся{hint}»;
  - «Радар по этому поиску уже включён»;
  - «Радар снова включён» (an inactive identical radar was re-enabled);
  - limit (409): «Уже {max} радаров — удалите ненужный во вкладке «Радар»»;
  - `no_chat`: «Радар не включён — боту нужно разрешение…»;
  - otherwise «Не получилось сохранить».
- **Analytics:** `$pageview radar/new`.
- **Status:** CONFIRMED.

### SCR-031 — «Нашли жильё?» survey (`sheet`)

- **Opens:** after pausing (`ask_found` on PATCH) or deleting (`ask_found` on DELETE) a radar.
- **Closes:** backdrop, drag, Telegram Back, or an answer.
- **Step `ask`:** «Нашли жильё?» / «Подскажите одной кнопкой — так мы поймём, помогает ли kvadro² искать.» with rows:
  - «Да, через kvadro²» goes to the congratulations step with a success haptic;
  - «Да, в другом месте» goes to `where`;
  - «Ещё ищу» closes with the toast «Удачи в поиске! Радар можно снова включить в любой момент»;
  - «Больше не ищу» closes with the toast «Понятно, спасибо! Радар можно снова включить в любой момент».
- **Step `where`:** «Где нашли?» with «Другой Telegram-канал / OLX / Другой сайт (Uybor, Uysot…) / Через риелтора /
  Знакомые подсказали / Объявление на доме или на улице / Другое». Any choice closes with the toast «Поздравляем! 🎉
  Спасибо, что рассказали».
- **Step `kvadro`:** the `hooray.webp` image, «Поздравляем с новосельем!», a text, «Рассказать друзьям» (shares
  `https://t.me/<bot>?start=s_friend` with `found.shareText`, only when the bot is known) and «Готово».
- **APIs:** `POST /api/found {answer, trigger}`; `POST /api/found/where {where}`. Both are fire-and-forget; errors are
  ignored.
- **Sources:** `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:85-184`.
- **Status:** CONFIRMED.

### SCR-032 — Settings (`screen`)

- **Opens:** the Settings tab, or the Telegram Settings button.
- **Loading:** spinner. **Error:** a tall ErrorState with retry (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:71-80`).
- **Groups:**
  - «Оформление»: Тема (value «Как в Telegram / Светлая / Тёмная») and Графика (Android only, or when the mode was
    changed: «Авто · полная», «Авто · облегчённая», «Полная», «Облегчённая»);
  - «Язык и валюта»: Язык, Валюта;
  - «Когда присылать»: Тихие часы («23–08» / «Выкл»), Время подборок («9 и 21»), footer «Время — ташкентское.»;
  - «Лента»: Скрытое (count), only when something is hidden;
  - «О приложении»:
    - «Значок на экране телефона — Добавить» when the home-screen status is `missed` or `unknown`;
    - «Написать в поддержку» when `support` is known;
    - «Мы в Instagram @kvadro.app» (`https://www.instagram.com/kvadro.app/`);
    - the about text «KvadroApp собирает объявления из открытых Telegram-каналов. В каждой карточке — ссылка на
      оригинал.» (`$KVADRO_ROOT/demo/app/src/features/settings/AboutGroup.jsx:17-52`).
- **Not present in the Mini App** (checked in code): city setting (city lives in the feed and filters), news toggle,
  privacy policy, data deletion, account. These are bot functions (`$KVADRO_ROOT/docs/about.md` §5.11; see
  `05-telegram-miniapp-audit.md` §3).
- **APIs:** `GET /api/settings`, `GET /api/subscriptions` (digest hint), `GET /api/hidden`, `GET /api/bot`,
  `PUT /api/settings`.
- **Analytics:** `$pageview settings`. Sub-pages are not tracked.
- **Status:** CONFIRMED.

### SCR-033 — Settings › Theme (`screen`, sub-page)

- **Options:** `auto` «Как в Telegram», `light` «Светлая», `dark` «Тёмная».
- **Effect:** applied at once (`kv-theme`, `data-theme` / `data-scheme`, the Telegram header and background colour),
  then `PUT /api/settings {theme}`. On error it rolls back with the error haptic (`SettingsScreen.jsx:98-114`).
- **Sub-page chrome** (shared by SCR-033 to SCR-039): a fixed layer (z 40) with a 24% slide-in, swipe-back, Telegram
  Back, and a header shadow when scrolled (`$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx`).
- **Status:** CONFIRMED.

### SCR-034 — Settings › Graphics (`screen`, sub-page)

- **Options:** «Авто · <полная|облегчённая>», «Полная», «Облегчённая», with a hint about blur and slow phones
  (`settings.graphics.hint`).
- **Storage:** local only (`kv-graphics`); `auto` also clears `kv-graphics-measured`. No API call.
- **Status:** CONFIRMED.

### SCR-035 — Settings › Language (`screen`, sub-page)

- **Options:** `settings.locales`, with the hint «Для приложения, бота и карточек объявлений.» (`notify.languageHint`).
- **Effect:** choosing another language calls `PUT /api/settings {locale}`, then `kv-locale`, then a full reload. A
  failure plays the error haptic only.
- **Status:** CONFIRMED.

### SCR-036 — Settings › Currency (`screen`, sub-page)

- **Options:** `settings.currencies` (e.g. «Доллары ($)», «Сумы»), with the hint «Цены в ленте, на карте и в карточках
  бота.».
- **Effect:** `PUT /api/settings {currency}`, then a full reload.
- **Status:** CONFIRMED.

### SCR-037 — Settings › Quiet hours (`screen`, sub-page)

- **Options:** `settings.quiet_presets` such as `23-08` («23–08») or `off` («Выкл»), with the hint «Карточки не
  приходят; всё, что появилось за ночь, — одной подборкой утром.».
- **Effect:** optimistic `PUT /api/settings {quiet}`; rollback and error haptic on failure.
- **Status:** CONFIRMED.

### SCR-038 — Settings › Digest time (`screen`, sub-page)

- **Options:** `settings.digest_presets` such as `09`, `09,21` («9 и 21»).
- **Hint:** «Во сколько присылать новое от радаров в режиме «Подборкой».» when an active digest radar exists, else
  «Для радаров в режиме «Подборкой» — режим переключается в карточке радара, вкладка «Радар».», followed by «Время —
  ташкентское.».
- **Effect:** optimistic `PUT /api/settings {digest}`.
- **Status:** CONFIRMED.

### SCR-039 — Settings › Hidden «Скрытое» (`screen`, sub-page)

- **Layout:**
  - intro «Эти объявления и авторы не приходят ни в ленту, ни в радар.»;
  - «Заблокированные авторы»: phone or channel icon, label (phones masked), «Номер / Канал · N объявлений / сейчас нет
    объявлений», and «Вернуть»;
  - «Скрытые объявления»: thumbnail, price or «Цена договорная», title · district; tapping opens the listing; «Вернуть»;
  - «Показать всё снова»;
  - when empty: «Ничего не скрыто».
- **Actions** (optimistic, rollback with the error haptic):
  - return an author: `DELETE /api/hidden/:id`;
  - return a listing: `DELETE /api/listings/:id/hide`;
  - return all: confirm «Снова показывать все скрытые объявления и заблокированных авторов?», then `DELETE /api/hidden`.
  - Every success resets the app's local `hidden` map.
- **Sources:** `$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:24-141`.
- **Status:** CONFIRMED.

### SCR-040 — Radar follow nudge (`overlay`)

- **Purpose:** offers to turn on a radar for filters the user has just applied.
- **Opens:** 1.8 s after applying filters, when the BR-APP-043 conditions hold and the search list is free of overlays
  (`$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:40-80`). It then fetches `GET /api/feed/flow`.
- **Closes:** after 10 s (`follow_prompt_expired`); × (`follow_prompt_closed`, counts towards the snooze); «Включить»
  (resets the close counter, then `subscribe(filters, 'prompt')`); or a filter change.
- **Layout:** `.nudge` card: radar icon, «Включить радар по этому поиску?», «Новые — сразу в чат», a flow line («≈N в
  день» / «N за неделю» / «Таких пока нет — радар пришлёт, как появятся»), «Включить» and × (`$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:19-60`).
- **Interplay with the return banner** (since release `index-DY_DH7h-.js`, BR-APP-046): not offered while a banner check
  for the same filters is pending, not rendered next to a banner and dropped when one shows. A shown banner also sets
  the shared cooldown and marks its filter hash as offered (BR-APP-071). No nudge shows while the create-radar sheet is
  open.
- **Storage:** `kv-nudge`.
- **Analytics:** `follow_prompt_shown`, `follow_prompt_expired`, `follow_prompt_closed`.
- **Edge cases:** LB-APP-006; LB-APP-050.
- **Status:** CONFIRMED.

### SCR-041 — Home-screen nudge (`overlay`)

- **Opens:** BR-APP-045. **Closes:** after 10 s; ×; or «Добавить», which calls `addToHomeScreen()`.
- **Interplay:** the offer waits while a follow nudge or its candidate, a toast and, since release `index-DY_DH7h-.js`,
  a return banner or its pending check is present (BR-APP-046). An offer already on screen is hidden by a follow nudge
  but not by a return banner (LB-APP-049).
- **Layout:** «kvadro² на экране телефона», «Открывать в одно касание, как обычное приложение», «Добавить».
- **After adding:** the Telegram `homeScreenAdded` event shows the toast «Значок kvadro² добавлен на экран телефона».
- **Storage:** `kv-home`.
- **Analytics:** `home_screen_offered`, `home_screen_closed`, `home_screen_added`.
- **Sources:** `Nudges.jsx:63-89`; `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js`; `$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js`.
- **Status:** CONFIRMED.

### SCR-042 — Toast (`overlay`)

- **Layout:** a bottom floating pill (z 60) that rises in.
  - A plain string closes on tap or after 4 s.
  - An object `{text, action, run}` shows an action button and closes after 6 s (`$KVADRO_ROOT/demo/app/src/components/Toast.jsx:11-38`).
  - Only one toast exists at a time; a new one replaces the old.
- **A second instance** lives inside the filters sheet for the pets tips (`FiltersSheet.jsx:244-248`).
- **Status:** CONFIRMED.

### SCR-043 — Confirm dialogs (`modal`)

- **Mechanism:** `WebApp.showConfirm` (6.2+), else `window.confirm` (`$KVADRO_ROOT/demo/app/src/lib/telegram/dialogs.js:9-17`).
- **Uses:**
  - clear history (`feed.clearConfirm`);
  - delete radar (`subs.deleteConfirm`);
  - return all hidden (`hidden.confirmAll`);
  - restart the bot after `no_chat`: «Бот не может писать вам — похоже, он остановлен. Открыть чат с ботом? Нажмите там
    «Перезапустить» и включите радар снова.» (`chat.restart`), which opens `https://t.me/<bot>` on OK
    (`$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:50-52`).
- **Status:** CONFIRMED.

### SCR-044 — Telegram system sheets triggered by the app (`modal`)

These are native Telegram UI with no app-side layout:

- `requestWriteAccess` after a `409 no_chat` (TMA-033);
- the `shareMessage` forward picker (TMA-030);
- the `addToHomeScreen` dialog (TMA-036);
- the LocationManager or browser geolocation permission (TMA-035);
- `openLink` / `openTelegramLink` hand-off (TMA-028).

The app only reacts to their results. Status: CONFIRMED (calls seen in code; native rendering not observed).

### SCR-045 — Crash screen, ErrorBoundary (`state`)

- **Opens:** any render exception under `<App/>`.
- **Layout:** shrug mascot, «Что-то пошло не так», «Ошибка записана. Обновите приложение — обычно это помогает.» and
  «Обновить» (`location.reload()`). uz: «Nimadir xato ketdi» / «Yangilash»; en: «Something went wrong» / «Reload».
- **Reporting:** `app_error` kind `render`, plus `posthog.captureException` when PostHog is loaded.
- **Sources:** `$KVADRO_ROOT/demo/app/src/app/ErrorBoundary.jsx:11-42`.
- **Status:** CONFIRMED.

### SCR-046 — Return banner «С вашего прошлого захода — N новых» (`overlay`)

- **Since:** release `index-DY_DH7h-.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:10-12`;
  `$KVADRO_ROOT/demo/app/docs/releases/2026-11-14_index-DY_DH7h-/REPORT.md:21-25`). Line numbers here are at the pin.
  An entry of its own, like SCR-040 and SCR-041: a floating layer with its own trigger, timer, request, storage and
  events.
- **Purpose:** on a return to a search after a break, says how many listings appeared since the previous visit with the
  same filters and offers a radar for them.
- **Opens:** 1.8 s after a search-tab visit (BR-APP-070), once meta and the radars are loaded and nothing covers the
  list, when the BR-APP-071 conditions hold. It then sends `GET /api/feed/new?<filters>&since=<unix seconds>` and shows
  only for `count > 0` (`$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:90-143`;
  `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:179-216`). Rendered only without a toast and while the filters
  still match (`App.jsx:737`).
- **Closes:** after 15 s (`return_prompt_expired`); × (`return_prompt_closed`; counts towards the 3-close snooze shared
  with SCR-040); «Включить» / «Настроить» (BR-APP-073); or a filter change (`useDropStaleNudges`,
  `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:24-33`).
- **Layout:** the `.nudge` card of SCR-040 (fixed above the tab bar, z 35): radar icon, a bold title, a hint that wraps
  instead of being cut (`.nudge-text.wrap .muted`, `$KVADRO_ROOT/demo/app/src/styles/nudges.css:60-62`), the button
  with a medium haptic and × (`$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:63-105`). The number is formatted
  with the number locale and followed by the plural word (`Nudges.jsx:84-87`): «С вашего прошлого захода — 12 новых» /
  «Oxirgi kirganingizdan beri — 12 ta yangi» / «12 new since your last visit».
- **Texts** (`ru.js:395-409`, `uz_Latn.js:369-381`, `en.js:370-382`):

  | Key | ru | uz_Latn | en |
  | --- | -- | ------- | -- |
  | `back.title` | «С вашего прошлого захода — {count}» | «Oxirgi kirganingizdan beri — {count}» | «{count} since your last visit» |
  | `back.new` (plural) | `one` «новое»; `few`, `many`, `other` «новых» | `one`, `other` «ta yangi» | `one`, `other` «new» |
  | `back.what` | «Радар пришлёт следующие сразу — узнаете о них первыми» | «Radar keyingilarini darhol yuboradi — birinchilardan boʻlib bilasiz» | «Radar will send the next ones right away — you'll know first» |
  | `nudge.enable` (custom filters, existing key) | «Включить» | «Yoqish» | «Turn on» |
  | `nudge.setup` (default filters, new key) | «Настроить» | «Sozlash» | «Set up» |

- **APIs:** `GET /api/feed/new`; `GET /api/subscriptions` (the conditions, and a re-read when the app returns from the
  background after ≥ 6 h); from «Включить» the radar flow of BR-APP-041 with `entry: "return"`
  (`GET /api/subscriptions`, then `POST /api/subscriptions` or `PATCH /api/subscriptions/:id`).
- **Storage:** `kv-visits`; `kv-nudge` (`back`, `lastShown`, `asked`, `closed`, `quietUntil`).
- **Analytics:** `return_prompt_shown {n, custom}`, `return_prompt_expired {custom}`, `return_prompt_closed {custom}`
  (§3.3).
- **Edge cases:** a response without a numeric `count` (LB-APP-048); on screen together with the home-screen offer
  (LB-APP-049); counted as shown before it renders (LB-APP-050).
- **Sources:** `useReturnNudge.js`; `followNudge.js:98-216`; `Nudges.jsx:63-105`;
  `App.jsx:115-120,140-149,221-265,399-415,737-755`; `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:105-117`; parity
  scenarios `return-nudge`, `return-nudge-setup`, `return-nudge-close`, `return-nudge-recent`, `return-nudge-cooldown`
  (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:314-323`).
- **Status:** CONFIRMED.

### SCR-047 — In-feed radar card on the search list (`state`)

- **Since:** release `index-DY_DH7h-.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:13-14`). Line numbers here are at the
  pin. A `state` of SCR-007, not an overlay: the card scrolls with the list. An entry of its own because it has its own
  conditions, storage, texts and events.
- **Shown when:** BR-APP-072. It sits after the 8th card, or after the last card of a short, fully loaded list without
  the few-results note (SCR-007, SCR-009; `App.jsx:297-303,629-645`;
  `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:219-244`;
  `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:98-106,128-139`).
- **Layout:** `section.feed-radar` (`$KVADRO_ROOT/demo/app/src/styles/nudges.css:63-112`): the animated radar sweep with
  two blips (`.feed-radar-art.radar-art`, with a fallback without `color-mix` in
  `$KVADRO_ROOT/demo/app/src/styles/fallbacks.css:86-88`), a 22 px title, the hint, a full-width primary button with
  the radar icon and a medium haptic, and × in the top-right corner
  (`$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:107-171`).
- **Texts** (`ru.js:404-408`, `uz_Latn.js:376-380`, `en.js:377-381`):

  | Key | Used for | ru | uz_Latn | en |
  | --- | -------- | -- | ------- | -- |
  | `feedRadar.titleRent` | rent, including daily | «Хорошие квартиры снимают в первые часы» | «Yaxshi kvartiralar birinchi soatlardayoq ijaraga olinadi» | «Good flats get rented in the first few hours» |
  | `feedRadar.titleSale` | sale | «Выгодные квартиры продают быстро» | «Yaxshi narxdagi kvartiralar tez sotiladi» | «Good-value flats sell fast» |
  | `feedRadar.what` | hint | «Включите радар — новые по этому поиску придут в Telegram сразу, как появятся.» | «Radarni yoqing — bu qidiruv boʻyicha yangilari chiqishi bilan Telegramga keladi.» | «Turn on radar — new ones for this search will come to Telegram as soon as they appear.» |
  | `feedRadar.enable` | button, custom filters | «Включить радар» | «Radarni yoqish» | «Turn on radar» |
  | `feedRadar.setup` | button, default filters | «Настроить радар» | «Radarni sozlash» | «Set up radar» |

- **Actions:** the button → BR-APP-073 with `entry: "feed"`; × (aria `common.close`) → hidden for 7 days
  (`kv-nudge.feedOff`) and `feed_radar_closed {custom}`; this close does not count towards the nudge snooze
  (`App.jsx:635-642`).
- **Analytics:** `feed_radar_shown {custom}` once 60 % of the card is visible (`IntersectionObserver`, threshold 0.6),
  once per session per filter hash; never where `IntersectionObserver` is missing (`Nudges.jsx:117-136`;
  `App.jsx:304-313`).
- **APIs:** as SCR-046 «Включить», with `entry: "feed"`.
- **Storage:** `kv-nudge.feedOff`.
- **Sources:** `Nudges.jsx:107-171`; `followNudge.js:150-167,219-244`; `ListingFeed.jsx`; `App.jsx`; parity scenarios
  `feed-radar`, `feed-radar-setup`, `feed-radar-close`, `feed-radar-sale`, `feed-radar-custom`
  (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:305-313`).
- **Status:** CONFIRMED.

### 2.1 Shared components (not screens on their own)

`src/components/`:

- `ListingCard`, `ListingCardSkeleton`, `Photo`, `PhotoStrip`, `FavButton`, `ErrorState`, `Toast` (SCR-042),
  `Chip` (`HeaderChip`, `FilterChip`), `Switch`, `PullToRefresh` (SCR-010);
- `inputs/IntInput`, `inputs/PriceInput`;
- `icons/RadarIcon`, `icons/InstagramIcon`.

`src/features/*` parts used inside screens:

- feed: `FeedHeader`, `followNudge.js`;
- filters: `PriceSection`, `RoomsPicker`, `sheet/*`;
- listing: `ListingHero`, `ListingTitleRow`, `ListingCtaBar`, `sections/*`, `ZoomableImage`, `spot/SpotMap` (preview);
- radar: `RadarTiles`, `RadarStrip`;
- settings: `SettingsGroup`, `SettingsRow`, `ChoiceList`, `SubPage`;
- map: `gl/*` and `leaflet/*` internals, `pins.js`, `palette.js`, `attribution.js`, `tilePrefetch.js`.

`src/app/`: `TopBar`, `TabBar`, `ViewToggle`, `FewResultsNote`.

Hooks: `src/hooks/useSheetDrag`, `useSwipeBack`, `useMiniChrome`, `useScrolled`.

Every directory under `src/features` maps to SCR items:

| Directory | SCR items |
| --------- | --------- |
| `city` | SCR-005, SCR-017 |
| `feed` | SCR-007, SCR-008, SCR-009, SCR-024, SCR-025, SCR-040, SCR-041, SCR-046, SCR-047 |
| `filters` | SCR-014, SCR-015, SCR-029, SCR-030 |
| `listing` | SCR-018 to SCR-023 |
| `map` | SCR-011, SCR-012, SCR-013 |
| `onboarding` | SCR-003, SCR-004 |
| `radar` | SCR-026, SCR-027, SCR-028, SCR-031 |
| `settings` | SCR-032 to SCR-039 |
| `sort` | SCR-016 |

There is **no "similar listings" section** anywhere in the client: `NearbySection` lists nearby places (metro, parks,
schools), not other listings.

## 3. Inventories

### 3.1 i18n

The counts below come from parsing `$KVADRO_ROOT/demo/app/src/i18n/locales/{ru,uz_Latn,en}.js`.

- **Locales:** `ru`, `uz_Latn`, `en`. Intl locales are `ru-RU`, `uz-Latn-UZ`, `en-GB`. Numbers in `uz_Latn` are
  formatted with `ru-RU` (space thousands separator, decimal comma) (`$KVADRO_ROOT/demo/app/src/i18n/index.js:16-74`).
- **Keys:** **482 top-level keys in each locale** at the pinned release, 482 in the union. No key is missing in any
  locale (CONFIRMED). A plural object counts as one key.
  - Per release: 461 at `index-plF_TOcT.js` (the audit), 462 after `index-Dbpp463V.js` (`card.businessPrice`), 473
    after `index-BNLZFfL0.js` (`report.detailTitle` and ten `report.d_*` keys), 482 after `index-DY_DH7h-.js` (nine
    keys: `back.title`, `back.new`, `back.what`, `feedRadar.titleRent`, `feedRadar.titleSale`, `feedRadar.what`,
    `feedRadar.enable`, `feedRadar.setup`, `nudge.setup`; texts in SCR-046 and SCR-047).
  - Method: the object literal of each locale file is parsed and its depth-1 keys counted, per SVN revision of the
    locale files (r9, r24, r25, r27). Counting quoted key lines (`^  '`) gives one less, because the plural key
    `listings` is unquoted; the 472 of `25` §1 matches that line count at `index-BNLZFfL0.js`.
  - 14 keys are plural objects up to `index-BNLZFfL0.js`: `listings`, `listing.rooms`, `details.daysOnMarket`,
    `details.publications`, `details.channels`, `details.views`, `actions.blockCount`, `map.missing`,
    `market.info.agoMin`, `market.info.agoHour`, `market.info.agoDay`, `market.v3.found`, `market.v3.district`,
    `market.v3.city`. Release `index-DY_DH7h-.js` adds a fifteenth, `back.new` (`ru.js:397-402`).
  - In ru they have `one / few / many / other`, except `map.missing`, which has `one / other`. In uz_Latn and en they
    have `one / other`.
- **Key families by prefix** (as of `index-BNLZFfL0.js`):

  | Prefix | Keys | Prefix | Keys | Prefix | Keys |
  | ------ | ---- | ------ | ---- | ------ | ---- |
  | `sheet` | 67 | `market` | 50 | `listing` | 32 |
  | `found` | 21 | `toast` | 19 | `feed` | 18 |
  | `fmt` | 17 | `settings` | 17 | `actions` | 14 |
  | `noAccess` | 14 | `radar` | 14 | `map` | 13 |
  | `notify` | 12 | `subs` | 12 | `sum` | 12 |
  | `details` | 10 | `hidden` | 10 | `sort` | 10 |
  | `report` | 20 | `card` | 9 | `city` | 7 |
  | `app` | 5 | `type` | 5 | others | ≤ 4 each |

  Release `index-DY_DH7h-.js` adds the prefixes `back` (3 keys) and `feedRadar` (5) and one `nudge` key.

- **Keys built at runtime** (every value must exist, or `t()` throws):

  | Template | Value source | Risk |
  | -------- | ------------ | ---- |
  | `deal.${deal}` | filters | local |
  | `type.${type}` | filters, including **server-stored** radar filters | server-driven |
  | `owner.*`, `tenant.*` | filters | local |
  | `sort.${sort}` | local | local |
  | `subs.mode.${mode}` | **server** subscription | server-driven |
  | `report.${reason}`, `report.${reason}Hint` | local | local |
  | `report.d_${detail}`, `report.d_${detail}Hint` | local (`REPORT_DETAILS`, since `index-BNLZFfL0.js`) | local |
  | `found.*`, `found.where.*` | local | local |
  | `noAccess.title.*`, `noAccess.text.*` | guarded by a whitelist | none |
  | `settings.theme.*`, `settings.graphics.*`, `sheet.market.*`, `sheet.posted.*`, `app.saved.*` | local | local |
  | `market.v3.rooms${median_rooms}` | **server**; only 1–3 exist, ≥ 4 maps to `rooms4` | server-driven |

- **Quirks:**
  - `t(key)` returns `entry.other` for plural objects. On a missing key it throws `TypeError` (reading `.other` of
    `undefined`) with no fallback (`i18n/index.js:118-121`); RECOVERY.md §7 records this.
  - `plural()` falls back to `other` for a missing form (`:131-144`).
  - Unknown `{placeholders}` are left as they are (`:100-110`).
- **Unused keys** (defined but never referenced, CONFIRMED by grep): `feed.historyHint`, `subs.count`, `subs.inFeed`,
  `subs.edit`, `subs.delete`, `subs.modeAria`.
- **Strings outside the dictionaries:**
  - the boot screen (`index.html:31-33`);
  - the language picker headings (`$KVADRO_ROOT/demo/app/src/features/onboarding/LanguagePicker.jsx:12-16`);
  - the Instagram handle `@kvadro.app`;
  - the methodology URLs (`MarketSheet.jsx:37-41`);
  - Uzbek short month names `yan … dek` (`i18n/index.js:76`).
- **Release history:** 2026-11-06 changed three uz strings (`details.facts` «Xususiyatlar», `details.publications`
  «nashr», `details.channels` «kanal») and added `sum.zonesBoth`. 2026-11-07 added `card.ownerVerified`. 2026-11-11
  (`index-Dbpp463V.js`) added `card.businessPrice` and reworded `noAccess.title.invite` and `noAccess.text.full`
  (SCR-003). 2026-11-12 (`index-BNLZFfL0.js`) added `report.detailTitle` and the pairs `report.d_<code>` /
  `report.d_<code>Hint` for `price`, `rooms`, `place`, `photos`, `other` (SCR-023). 2026-11-14 (`index-DY_DH7h-.js`)
  added the nine `back.*`, `feedRadar.*` and `nudge.setup` keys (SCR-046, SCR-047)
  (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:17,38,54,59,84,99,107`).

### 3.2 Client storage: localStorage `kv-*` and Telegram DeviceStorage

"Writer" uses `storageSet` (`$KVADRO_ROOT/demo/app/src/lib/storage.js:34-52`) for mirrored keys: it writes localStorage
**and** DeviceStorage (Telegram 9.0+). Restore copies a key back from DeviceStorage when it is missing in localStorage,
with a 1.5 s timeout per key (`storage.js:59-87`).

| Key | Values | Written by | Read by | DeviceStorage mirror | Restored on start |
| --- | ------ | ---------- | ------- | -------------------- | ----------------- |
| `kv-locale` | `ru` / `uz_Latn` / `en` | `setLocale(persist)`, `saveLocale` (`i18n/index.js:43-55`) | `detectLocale` (`:25-34`); boot script `index.html:46` | yes | **no** |
| `kv-theme` | `auto` / `light` / `dark` | `setThemePreference` (`$KVADRO_ROOT/demo/app/src/lib/telegram/theme.js:56-62`), directly | `theme.js:7-17` | no | — |
| `kv-city` | city code | `saveCity` (`$KVADRO_ROOT/demo/app/src/lib/city.js:20-27`) | `getSavedCity` (main.jsx prefetch, App initial filters, filters sheet apply) | yes | yes, but after first use (LB-APP-021) |
| `kv-nudge` | JSON `{asked: string[≤40], closed, quietUntil, lastShown}`; since `index-DY_DH7h-.js` also `back: {<filters hash>: ms}` (the return banner per filter set, ≤ 40) and `feedOff: ms` (end of the in-feed card's snooze) | `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:30-92`; at the pin also `:198-216`, `:239-244` | `followNudge.js:16-28`; at the pin also `:179-195`, `:232-237` | yes | yes |
| `kv-visits` | JSON `{<filters hash>: ms}`: the last search-tab visit per filter set, 40 newest kept; since `index-DY_DH7h-.js` (BR-APP-070) | `recordVisit` (`followNudge.js:125-143` at the pin) | `recordVisit` into the session map, then `returnSince` (`followNudge.js:108-123,179-195` at the pin) | yes | yes, since `index-DY_DH7h-.js` (`storage.js:6` at the pin; LB-APP-021) |
| `kv-home` | JSON `{days: ['YYYY-MM-DD' ×≤10], offered}` | `$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:71-98` | `homeScreen.js:17-28` | yes | yes |
| `kv-new-<feature>` | `'1'` (only `pets` is used) | `markFeatureSeen` (`$KVADRO_ROOT/demo/app/src/lib/newFeatures.js:18`) | `isNewFeature` (`:11-12`) | yes | no |
| `kv-graphics` | `full` / `lite` (absent = auto) | `setGraphicsMode` (`$KVADRO_ROOT/demo/app/src/lib/graphics.js:97-103`) | `getGraphicsMode` | no | — |
| `kv-graphics-measured` | `lite` | `measureScrollPerformance` (`graphics.js:134`) | `prefersLite` (`:62`) | no | — |
| `kv-map-v2` | `gl` / `leaflet` | `?map=` (`$KVADRO_ROOT/demo/app/src/features/map/engine.js:74-87`) | same | no | — |
| `kv-map-fit:<lat>,<lon>` | JSON `[lat, lon, zoom]` (4 dp) | Leaflet first fit (`$KVADRO_ROOT/demo/app/src/features/map/tilePrefetch.js:187-201`) | tile prefetch (`:205`) | no | — |

- **Dev only:** `kvdev-initData`, written by the Vite dev emulator (`$KVADRO_ROOT/demo/app/tools/dev/telegram-client.js:6`).
  It is not in builds.
- **Not used by the app:** sessionStorage, IndexedDB, Telegram CloudStorage and SecureStorage (grep of `src`).
- **Migration note:** `$KVADRO_ROOT/docs/about.md` §9.1 says renaming these keys resets every user's client settings.

### 3.3 Analytics events

Two channels exist.

**(a) Own journal `POST /api/events`.** Fire-and-forget with `keepalive: true`; properties sit at the top level next
to `name` (`$KVADRO_ROOT/demo/app/src/lib/api/events.js:9-35`).

| Event | Properties | Trigger | Evidence |
| ----- | ---------- | ------- | -------- |
| `app_launch` | `entry` (`link` / `news` / `menu`), `ms`, `v`, `sdk?`, `js`, `platform` | first effect, when initData exists | `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:53-61` |
| `app_opened` | `entry: 'link', listing_id, ms` or `entry: 'news' / 'menu', ms` | meta success; not after a 403 | `useAppBootstrap.js:98-113` |
| `app_error` | `v`, `error {kind, name, message, source, stage, screen, tg, platform}` | boot script (XHR, kind `boot`); global handlers (`error`, `rejection`); ErrorBoundary (`render`) | `index.html:69-90`; `$KVADRO_ROOT/demo/app/src/lib/errors.js:68-94` |
| `follow_prompt_shown` | — | follow nudge shown | `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:66` |
| `follow_prompt_expired` | — | follow nudge timed out (10 s) | `$KVADRO_ROOT/demo/app/src/app/App.jsx:110` |
| `follow_prompt_closed` | — | follow nudge × | `App.jsx:624` |
| `return_prompt_shown` | `n` (the `count`), `custom` | return banner shown (since `index-DY_DH7h-.js`, SCR-046) | `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:126-129` |
| `return_prompt_expired` | `custom` | return banner timed out (15 s) | `App.jsx:140-149` at the pin |
| `return_prompt_closed` | `custom` | return banner × | `App.jsx:742-748` at the pin |
| `feed_radar_shown` | `custom` | in-feed radar card 60 % visible, once per session per filter hash (SCR-047) | `App.jsx:304-313` at the pin; `Nudges.jsx:117-136` |
| `feed_radar_closed` | `custom` | in-feed radar card × | `App.jsx:636-642` at the pin |
| `home_screen_offered` | — | home nudge shown (status `missed`) | `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:74` |
| `home_screen_closed` | — | home nudge × (not on timeout) | `App.jsx:609` |
| `home_screen_added` | — | Telegram `homeScreenAdded` | `useHomeScreenOffer.js:27` |
| `chat_access_declined` | — | `requestWriteAccess` answered `false` | `$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:36` |
| `chat_access_allowed` | — | `requestWriteAccess` answered `true` | `chatAccess.js:40` |
| `listing_shared` | `listing_id` | share tap, before trying | `$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:30` |
| `original_opened` | `listing_id`, `src` (`button` / `video` / `sources` / `price_history` / `offers`) | an external post link actually opened (not debounced) | `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:139-146` |
| `original_copied` | `listing_id` | copy event on the original text | `$KVADRO_ROOT/demo/app/src/features/listing/sections/OriginalText.jsx:70-74` |
| `contact_call` | `listing_id`, `via` (`tel` / `browser`), `src?` (`text`) | call attempt resolved | `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:74-80` |
| `contact_write` | `listing_id` | «Написать» link opened | `useListingContact.js:82-88` |

Docs and code agree on this list (`$KVADRO_ROOT/docs/api.md` §11; at the pin `:1076-1107`). `custom` is
`isCustomFilters` of the filters concerned (BR-APP-013).

**(b) PostHog** (`$KVADRO_ROOT/demo/app/src/lib/analytics.js`). The key and host come from `meta.analytics`.

- **Loading:** lazy, 0.5 s after the first loaded photo or after 8 s. Not loaded at all with Save-Data or 2g.
- **Init options:** `persistence: memory`; `bootstrap.distinctID = meta.analytics.id` (identified); autocapture of
  click / change / submit (unless `autocapture === false`), rage clicks, heatmaps, dead clicks; web vitals; exception
  capture; sampled session replay (`replay_rate`, never in lite) with inputs masked and `.ph-mask` text masked.
- **Privacy:** the URL hash is removed from the address bar before init (`history.replaceState`), and
  `before_send` strips `tgWebAppData` from all properties.
- **`$pageview`:** sent manually by `trackScreen` with properties `{screen, listing_id?}`, `$current_url =
  <origin>/<screen>` and `$pathname = /<screen>`. Duplicates (same screen and listing) are suppressed; only the last
  screen before load is queued (`analytics.js:64-94`).
- **Super properties:** `screen`, `env`, `team`, `build`.
- **Screen names:** `search/list`, `search/map`, `saved/favorites`, `saved/history`, `subs`, `settings`, `listing`,
  `radar/edit`, `radar/new`, `filters`, `filters/rooms`, `filters/price`, `filters/owner`, `sort`, `city`, `map/draw`
  (`$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:26-44`).
- The map code sends no events of its own.

### 3.4 Constants, timeouts and limits

| Constant | Value | Evidence |
| -------- | ----- | -------- |
| SDK wait | 3000 ms | `$KVADRO_ROOT/demo/app/src/main.jsx:19` |
| API timeout | 15000 ms | `$KVADRO_ROOT/demo/app/src/lib/api/client.js:24` |
| Meta retry delays | 1, 3, 7, 15, 30 s | `useAppBootstrap.js:24` |
| Access re-check after 403 | 3 × 2.5 s (not for `blocked`) | `useAppBootstrap.js:26,134` |
| Feed page size | 20 | `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:77` |
| Infinite-scroll trigger | sentinel within 800 px | `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:57-59` |
| Few-results threshold | < 10 visible items | `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:17` |
| Eager photos | first 2 cards; the first 2 feed photos are preloaded before mount | `ListingFeed.jsx:19`; `main.jsx:28` |
| Live count / flow debounce | 250 ms / 500 ms | `$KVADRO_ROOT/demo/app/src/features/filters/useLiveFeedStats.js:20,39` |
| Filters focus scroll | 350 ms after open | `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:92` |
| Follow nudge | delay 1.8 s; auto-hide 10 s; cooldown 8 h; snooze 14 days after 3 closes; remembers 40 filter hashes | `useFollowNudge.js:9`; `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:9`; `followNudge.js:8-13` |
| Return banner | check 1.8 s after a visit; previous visit ≥ 6 h ago; once per filter set per 2 days; auto-hide 15 s; 40 visit hashes kept; shares the follow nudge's 8 h cooldown and 14-day snooze | `useReturnNudge.js:17`; `followNudge.js:100-106`; `Nudges.jsx:63` (at the pin) |
| In-feed radar card | after 8 cards; × hides it for 7 days; seen at 60 % visibility | `followNudge.js:220-223`; `Nudges.jsx:131` (at the pin) |
| Home-screen offer | delay 4 s; ≥ 3 distinct visit days (last 10 kept); once; status check timeout 1.5 s | `useHomeScreenOffer.js:15`; `homeScreen.js:8,38,75` |
| Max radars (fallback) | 10 (`meta.max_subscriptions`) | `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:16`; `useFollowNudge.js:11`; at the pin also `useReturnNudge.js:19`, `App.jsx:298` |
| Relax option threshold | first option with `count ≥ 7`, else the last | `subscriptionActions.js:18,51` |
| Radar preview finds | 5 per radar | `$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:7` |
| Toast lifetime | 4 s (text) / 6 s (with action) | `$KVADRO_ROOT/demo/app/src/components/Toast.jsx:14` |
| Contact link TTL / refresh | 10 min / refresh at 8 min | `useListingContact.js:9-10` |
| Android `tel:` detection | 1200 ms | `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:5` |
| Link debounce | same URL ignored for 1.5 s | `links.js:43` |
| Share lock | during share + 1.5 s | `ListingTitleRow.jsx:12` |
| Block hint count | author has ≥ 20 listings | `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:14` |
| Error reports | ≤ 5 distinct per session | `errors.js:10` |
| PostHog load | 0.5 s after first content or 8 s | `analytics.js:7-8` |
| Lite measurement | 150 frames, slow > 28 ms, ≥ 20 % | `graphics.js:11-15` |
| Low-end Android | ≤ 4 cores or ≤ 3 GB | `graphics.js:58` |
| Pull-to-refresh | trigger 72 px, max 110 px, spinner ≥ 700 ms | `$KVADRO_ROOT/demo/app/src/components/PullToRefresh.jsx:6-12` |
| Sheet drag | start 6 px, close at 25 % or 0.5 px/ms, settle 200 ms | `$KVADRO_ROOT/demo/app/src/hooks/useSheetDrag.js:5-13` |
| Swipe-back | start 10 px, close at 33 % or 0.5 px/ms, settle 180 ms, not on Android | `$KVADRO_ROOT/demo/app/src/hooks/useSwipeBack.js:6-14,27` |
| Collapsing chrome | delta 24 px, top zone 60 px | `$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js:4-6` |
| Photo zoom | max 4×, double tap 2.5×, swipe-close 110 px | `$KVADRO_ROOT/demo/app/src/features/listing/ZoomableImage.jsx:5-7` |
| Area input | integer, 0 → null, max 10000 | `$KVADRO_ROOT/demo/app/src/components/inputs/IntInput.jsx:18` |
| Lasso | ≥ 3 points, ≥ 40 px span, ≤ 40 vertices, close gap 12 px, 5 dp | `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:6-8,115-151` |
| Geolocation | browser timeout 12 s, max age 60 s; nearest city 16 km / regions 110 km | `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:31-35,96-99` |
| Metro shown | ≤ 1.5 km; name only under 50 m | `$KVADRO_ROOT/demo/app/src/features/listing/format.js:77-81` |
| Approximate distances | `~` when `geo_radius_m ≥ 400`; default radius 500 m | `$KVADRO_ROOT/demo/app/src/features/listing/sections/NearbySection.jsx:31`; `ListingScreen.jsx:134` |
| Market scale | ±40 % from the median reaches the scale edges; clamped to 4–96 % | `$KVADRO_ROOT/demo/app/src/features/listing/sections/MarketBlock.jsx:177-179` |
| "In N times" wording | delta ≥ +90 % | `format.js:201`; `$KVADRO_ROOT/demo/app/src/features/listing/MarketSheet.jsx:58` |
| Tab label shrink | label longer than 13 characters | `$KVADRO_ROOT/demo/app/src/app/TabBar.jsx:28` |
| Wide fact cell | value longer than 18 characters | `$KVADRO_ROOT/demo/app/src/features/listing/sections/FactsSection.jsx:48` |
| Map | cluster radius 48; GL maxZoom 17; fit maxZoom 14; points note 6 s; locate error 5 s; tile-prefetch delay 2.5 s; Leaflet basemap delay ≤ 1.2 s | map files, see SCR-011 |
| Tile prefetch budget | none with Save-Data or 2g. Lite: 2/stop, 3 preload, 300 KB, 1.5 MB per session. Full: 4, 6, 600 KB, 4 MB | `tilePrefetch.js:22-41` |

### 3.5 Money and date formatting

- **Money** (`$KVADRO_ROOT/demo/app/src/lib/money.js`):
  - Prices are stored and sent in **USD**.
  - The display currency comes from `meta.currency`, the rate from `meta.usd_uzs`. UZS is used only when the currency is
    `UZS` **and** the rate is greater than 0 (`:14-23`).
  - **USD:** `$` + `Intl.NumberFormat(numberLocale)` of the rounded integer, e.g. `$1 200` in ru, `$1,200` in en
    (`:57`).
  - **UZS:**
    - ≥ 1 000 000 000: «{value} млрд сум», 1 decimal;
    - ≥ 1 000 000: «{value} млн сум», 1 decimal;
    - otherwise rounded to thousands: «850 000 сум».
    - Keys `money.bln` / `money.mln` / `money.uzs` (`:32-46`). Boundary bug: LB-APP-011.
  - **Inputs:** in UZS, millions with 1 decimal (unit «млн сум»); in USD, an integer with unit «$».
  - **Parsing:** the first `,` becomes `.`, everything except digits and dots is stripped, `Number()` is applied, and
    0 / empty / NaN give `null`. UZS is converted with `max(1, round(value · 10⁶ / rate))` (`:76-101`).
  - **Presets:**
    - USD presets come from `cityStats.presets[deal]` (else `meta.price_presets[deal]`).
    - In UZS, city presets are converted and rounded to a step: 50 млн for sale, 0.1 млн for daily rent, 0.5 млн
      otherwise; duplicates are dropped.
    - Fixed UZS presets (in млн) apply when there are no city presets: rent 3, 4, 5, 6, 8, 10, 15; daily 0.3, 0.5, 0.7,
      1, 1.5; sale 500, 700, 1000, 1500, 2000, 3000 (`:104-140`).
  - **Server price strings** (`item.price`): split as in §1.12. Currency-correctness is assumed to come from the server
    (Q-APP-011).
- **Numbers:** `Intl.NumberFormat` with `ru-RU` (ru, uz) or `en-GB` (en). Kilometres use 1 decimal (`format.js:94-126`).
- **Dates:**
  - `formatShortDate`: «5 мар» (ru, with the dot removed), «5 Mar» (en), «5-mar» (uz; custom months)
    (`$KVADRO_ROOT/demo/app/src/i18n/index.js:83-93`).
  - History time: `toLocaleTimeString(numberLocale, {hour, minute})`.
  - Both use the **device time zone**, not Asia/Tashkent (LB-APP-025).
  - Relative «обновлено N минут назад» comes from `median_updated` (`MarketSheet.jsx:15-34`).
  - Visit days for the home-screen offer are **UTC** dates (`$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:71-78`;
    LB-APP-010).
  - `age` («2 ч назад» and similar) is a server string.
  - Settings state «Время — ташкентское.» for quiet hours and digests, which are evaluated server-side.

### 3.6 Design tokens, fonts, icons, mascots, CSS cascade

The source is `$KVADRO_ROOT/demo/app/src/styles/tokens.css` and the related files listed below.

- **Colour roles:**

  | Token | Light | Dark | Notes |
  | ----- | ----- | ---- | ----- |
  | `--bg` | `var(--tg-theme-bg-color, #ffffff)` | `#000000` | |
  | `--bg2` | `var(--tg-theme-secondary-bg-color, #f2f2f7)` | `#151517` | |
  | `--text` | `var(--tg-theme-text-color, #0f0f10)` | `#ececee` | |
  | `--hint` | `var(--tg-theme-hint-color, #8a8f98)` | `#8f8f97` | |
  | `--sheet` | `var(--bg)` | `#151517` | |
  | `--material` | `color-mix(var(--bg) 72%, transparent)` | — | frosted glass |
  | `--dim` | `rgba(0,0,0,.4)` | `rgba(0,0,0,.6)` | |
  | `--accent` | `#ffd23f` | `#ffd23f` | text `#0b0b0b`; **brand yellow, not Telegram's `button_color`** |
  | `--sep` | text mixed 10 % | text mixed 14 % | |
  | `--fill` | text mixed 6 % | text mixed 8 % | |
  | `--good` / `--high` / `--warn` / `--heart` | `#16a34a` / `#ea7a0c` / `#b45309` / `#ff385c` | same | |
  | `--badge-good` / `--badge-high` / `--badge-warn` / `--badge-same` | foreground + translucent background pairs | pairs | `tokens.css:18-25,60-67` |

- **Theme switching:**
  - `html[data-scheme=light|dark]` is always set; `html[data-theme]` only for an explicit choice (`theme.js:27-50`).
  - There is no `prefers-color-scheme` CSS.
  - **Telegram `themeParams` are used only in auto + light:** dark mode and an explicit light choice override them with
    the fixed palette. Only 4 `--tg-theme-*` variables are read: bg, secondary-bg, text, hint.
  - From Telegram 6.1, header and background colours are set; from 6.9, the exact `--bg` hex is passed, except in
    auto + light, which passes `bg_color` (TMA-020).
- **Typography:**
  - system font stack `15px/1.4 -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif`,
    antialiased, tabular numbers (`$KVADRO_ROOT/demo/app/src/styles/base.css:13-22`);
  - `.small` is 13 px; sizes from 9 to 28 px with no type scale; weights 400 to 800.
- **Spacing and radii:** no spacing scale; 16 px gutters; `--tabbar-h: 62px`;
  `--bottom-chrome = tabbar + bottom inset + 90px`; radii `--r-s 12`, `--r-m 16`, `--r-l 24`, `--r-photo 18`; pills
  `999px`.
- **Effects:** glass is `blur(22px) saturate(190%)`; around 34 ad-hoc shadows; no motion tokens. Common easing is
  `cubic-bezier(.2,.9,.3,1)` at 0.25–0.35 s.
- **Z-index ladder:** map note 5 → topbar 10 → CTA 20 → view toggle 29 → tab bar 30 → map card and mini title 31 → nudge
  35 → sub-page 40 → listing layer 45 → sheet backdrop 50 → toast and city sheet 60 → photo viewer and fullscreen map
  100 → active pin 1000.
- **Safe areas:** `--top-inset = --tg-safe-area-inset-top + --tg-content-safe-area-inset-top`;
  `--bottom-inset = --tg-safe-area-inset-bottom`. There is no `env(safe-area-inset-*)` and no left/right inset
  (`tokens.css:30-31`). `--tg-viewport-*`, `dvh` and `svh` are not used; full-screen layers are `position: fixed;
  inset: 0`.
- **Fonts:** the UI uses system fonts only, with no `@font-face`. The 12 Noto Sans woff2 files (latin, latin-ext,
  cyrillic, cyrillic-ext × 400, 500, 600) are **map label glyphs** for MapLibre (`$KVADRO_ROOT/demo/app/src/features/map/gl/fonts.js:16-65`).
- **Icons:** `lucide-react` in 45 files, plus the custom `RadarIcon` and `InstagramIcon` SVG components.
- **Images:**
  - mascots `empty-magnifier.svg` (search empty) and `empty-shrug.svg` (favourites and history empty, crash), at 120 px;
  - `hooray.webp` (found survey), 132 px;
  - `favicon.svg` / `favicon.ico`.
- **Animations:**
  - `spin`, `shimmer`, `fade`, `rise` (sheets), `rise-in` (toast, nudge), `viewer-in`, `subpage-in`, `minfo-go`,
    `minfo-fade`, `radar-turn`, `radar-blip`;
  - `prefers-reduced-motion` stops the shimmer and spinner and sets `* { transition: none !important }`
    (`$KVADRO_ROOT/demo/app/src/styles/states.css:70-77`); JS gestures settle instantly.
- **Responsive design:** none. There are no width or orientation media queries; the layout is single-column for phones.
- **CSS cascade constraints:**
  - The order of the 24 `@import`s in `$KVADRO_ROOT/demo/app/src/styles/index.css:2-25` **is** the cascade of the
    original bundle; the CSS must be imported after `App` in `main.jsx` (`main.jsx:2,17`).
  - `MapScreen.css` arrives through App, and lazy chunks bring `mapgl.css` and `leaflet.css`.
  - `lite.css` and `fallbacks.css` rely on coming late.
  - The only feature fallback is `@supports not (color: color-mix(…))`; `:has()` is used without a fallback.
- **Product-encoding CSS:**
  - verdict tones `good / high / same / mixed / no_repair / suspicious / check` drive `.delta`, `.deal`, `.marker` and
    pin colours;
  - inactive radar tiles are greyscale;
  - `.danger-row` is `#ff5c5c`;
  - feed cards use `content-visibility: auto` with an intrinsic size of 420 px.

## 4. Business rules visible in the client (BR-APP)

All rules below are `CONFIRMED` in client code. Server-side enforcement of the same rules is not visible.

| ID | Rule | Evidence |
| -- | ---- | -------- |
| BR-APP-001 | **Default filters.** `deal` `rent_long`, `city` from `kv-city` (else `tashkent`), `types ['apartment']`, `owner 'any'`; all lists empty and all other fields `null` or `false`. | `$KVADRO_ROOT/demo/app/src/features/filters/model.js:12-39`; `$KVADRO_ROOT/demo/app/src/app/App.jsx:52` |
| BR-APP-002 | **Switching rent and sale** resets every filter to the new deal's defaults but keeps `districts`, `zones` and `polygon`. | `App.jsx:271-281`; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/DealSections.jsx:20-28` |
| BR-APP-003 | **Switching long-term and daily rent** keeps only the types allowed for the new term (else `['apartment']`) and resets `price_min`, `price_max` and `below_median`. Daily rent also clears `tenant`, `pets` and `pets_only`. | `DealSections.jsx:51-65` |
| BR-APP-004 | **The rent-term choice is shown** only for rent, and only when daily is already selected or the city's `counts.rent_daily > 0`. | `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:136` |
| BR-APP-005 | **Property types per deal:** rent `apartment, house, room, commercial`; daily `apartment, house, room`; sale `apartment, house, commercial, land`. The last selected type cannot be removed. `below_median` survives only when the types are exactly `['apartment']`. | `$KVADRO_ROOT/demo/app/src/features/filters/options.js:7-11`; `DealSections.jsx:81-89` |
| BR-APP-006 | **The rooms filter is hidden** when every selected type is `room`, `commercial` or `land`. | `model.js:5`; `FiltersSheet.jsx:115`; `$KVADRO_ROOT/demo/app/src/features/feed/FeedHeader.jsx:24` |
| BR-APP-007 | **Room selection.** A tap picks one value. A second tap on a different value, while one value (or 4+) is picked, creates a range between them. `4` means "4 or more" (`rooms_max = null`). «Любые» clears the selection. | `model.js:145-176` |
| BR-APP-008 | **Geography modes are mutually exclusive:** a drawn polygon, zones, or districts. Choosing one clears the others. Zones allow multiple choices and are kept in the canonical order `center, near_center`. `near_metro` is independent. | `$KVADRO_ROOT/demo/app/src/features/filters/sheet/LocationSections.jsx:33-131`; `App.jsx:330-338` |
| BR-APP-009 | **Changing the city** clears `districts` and `polygon`. It keeps `zones` only if the new city has zones, `near_metro` only if `city.metro`, and `below_median` only if `city.median`. | `App.jsx:283-303`; `FiltersSheet.jsx:119-131` |
| BR-APP-010 | **At start-up, `meta.city` overrides the locally saved city.** The filters follow it only when no districts, zones or polygon are selected. | `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:83-94` |
| BR-APP-011 | **The active-filter badge counts groups:** daily rent, types other than `apartment`, rooms, price, any geography, metro, below-median, owner, tenant, pets (not for sale), furnished, renovation, floor, area, market, appliances, posted days. | `model.js:70-124` |
| BR-APP-012 | **Two filter sets are "the same"** when `filtersKey` matches. It fills missing fields with defaults, sorts keys and array values, maps `undefined` to `null`, defaults the city to `tashkent` and **ignores `posted_days`**. It is used to match radars against the search. | `model.js:45-63` |
| BR-APP-013 | **Filters are "custom"** when they differ from the defaults of their base deal (daily counts as rent) and city. Only custom filters can trigger the follow nudge. | `model.js:66-67`; `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:51-58` |
| BR-APP-014 | **Price preset chips** set `price_max = preset` and clear `price_min`. A chip shows as selected only when `price_min` is null. City presets from `/api/cities` take priority over `meta.price_presets`. | `$KVADRO_ROOT/demo/app/src/features/filters/PriceSection.jsx:35-38,73-88` |
| BR-APP-015 | **UZS presets.** City USD presets are converted and rounded to steps of 50 млн (sale), 0.1 млн (daily) or 0.5 млн (rent). Without city presets, fixed UZS lists are used. | `$KVADRO_ROOT/demo/app/src/lib/money.js:104-140` |
| BR-APP-016 | **«Половина квартир — до X»** (typical price) is shown only for apartment-only searches (including daily) in a city with a name, using `cityStats.typical[deal]`. | `PriceSection.jsx:40-42,93-100` |
| BR-APP-017 | **The «Не дороже рынка» chip** is available only for non-daily apartment-only searches in a city where `median !== false`. Its hint explains a +10 % tolerance and that listings without a median are excluded. | `PriceSection.jsx:101-121`; `sheet.belowMedianHint*` |
| BR-APP-018 | **For sale searches including land or houses**, the hint «Цена за сотку или м² — умножаем на площадь из объявления» is shown. | `PriceSection.jsx:90-92` |
| BR-APP-019 | **Tenant and pets sections** appear whenever the base deal is rent, which includes daily rent. | `FiltersSheet.jsx:213-216` |
| BR-APP-020 | **Area and market** filters exist only for sale; **appliances** only for rent. | `FiltersSheet.jsx:220-227` |
| BR-APP-021 | **«Опубликовано за 1 / 3 / 7 дней»** exists only in search mode, never in radar create or edit. It is ignored when matching radars. | `FiltersSheet.jsx:228`; `model.js:49` |
| BR-APP-022 | **Resetting the full sheet** gives the defaults for the base deal and current city. Resetting a quick sheet resets only its own filter; price reset also clears `below_median`. | `FiltersSheet.jsx:189`; `$KVADRO_ROOT/demo/app/src/features/filters/QuickFilterSheet.jsx:35-51` |
| BR-APP-023 | **Sort options:** `new`, `cheap` and `expensive` always. `deal` for non-daily apartment-only searches where `city.median !== false`. `center` when the city has zones. `ppm` for sale. An unavailable sort falls back to `new`. `new` is never sent to the API. | `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-34`; `App.jsx:259-263`; `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:78` |
| BR-APP-024 | **Feed paging:** `limit=20` with an opaque `cursor`, which ends when `next_cursor === null`. Items are de-duplicated by `id` across pages. | `feed.js:75-85`; `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:31-42` |
| BR-APP-025 | **The few-results note** appears only when the list is fully loaded with fewer than 10 items, there are no active filters, and city stats and name are known. «Смотреть продажу / аренду · N» is offered only when the other deal has more listings in the city. | `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:89-92`; `App.jsx:420-439`; `$KVADRO_ROOT/demo/app/src/app/FewResultsNote.jsx:39` |
| BR-APP-026 | **Card badge priority:** «Подозрительно дёшево» (warn) > «Проверьте цену» (warn) > «Хозяин ✓» (`owner_verified`) > «Хозяин» (`is_owner`) > «Ниже рынка» (`good`). Since release `index-Dbpp463V.js`; before it «Ниже рынка» ranked above «Хозяин». | `$KVADRO_ROOT/demo/app/src/features/listing/format.js:253-283`; `$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md:12-13` |
| BR-APP-027 | **Market verdict wording** depends on `median_tone`: `check` (above or below), `suspicious`, `same`, `mixed`, `no_repair`, `good`. Otherwise the text says "pricier"; from +90 % it says «В {x} раза дороже рынка». Percentages are rounded `abs(delta)·100`. | `format.js:142-217` |
| BR-APP-028 | **The market block shows** only when a verdict exists and `median_value`, `median_delta` and `median` are present. The scale is linear with ±40 % at the edges, clamped to 4–96 %. | `$KVADRO_ROOT/demo/app/src/features/listing/sections/MarketBlock.jsx:105,177-179` |
| BR-APP-029 | **Metro on cards:** shown only within 1.5 km. Under 50 m only the name is shown; otherwise «{metro} · {m} м», with metres rounded to 100. | `format.js:76-87` |
| BR-APP-030 | **The card location line** is `district · landmark · (metro label or «{km} км до центра»)`. | `$KVADRO_ROOT/demo/app/src/components/ListingCard.jsx:46-48` |
| BR-APP-031 | **Distances in «Рядом»:** under 0.1 km «рядом»; under 0.95 km metres rounded to 100; otherwise km with 1 decimal. A `~` prefix is added when `geo_radius_m ≥ 400` (default 500). | `format.js:94-113`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/NearbySection.jsx:31` |
| BR-APP-032 | **The main CTA**, in priority order: phone → «Позвонить»; `contact_url` → «Написать» (or «Номер платный» when `contact_paid`); otherwise «Открыть пост», unless `post_deleted`, in which case there is no action. | `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:28-48` |
| BR-APP-033 | **Calling.** On Android, `tel:` is tried first; if the app is not left within 1.2 s, the call page opens. Elsewhere the call page (`call_url`, about 10 min TTL) opens directly, refreshed when it is older than 8 min. | `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:14-40`; `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:54-81` |
| BR-APP-034 | **Machine translation** of the original text is offered only when the interface locale is not `ru`. The first tap fetches, later taps toggle; the result is labelled «Перевод сделан ИИ». | `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingTranslation.js:22-39`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/OriginalText.jsx:78-80` |
| BR-APP-035 | **Phone numbers in the original text** are detected as Uzbek numbers (`[+998] XX XXX XX XX` with a known operator or city code). Only the number that equals the listing's `phone` becomes a call button. | `$KVADRO_ROOT/demo/app/src/lib/phone.js:4-89`; `OriginalText.jsx:32-38` |
| BR-APP-036 | **Moderation effects on the client:** hide → hidden with undo; block → all `listing_ids` hidden with undo; `fraud` with `hidden` → hidden with undo; `rented` → hidden without undo. The `agent` reason is not offered when `is_owner === false`. Since release `index-BNLZFfL0.js` `wrong_data` is sent only together with a `detail` (`price`, `rooms`, `place`, `photos`, `other`) picked on a third view; the other reasons are sent at once and without `detail`. | `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:32-81`; `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:176-200`; `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:86-90`; `$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md:13-23` |
| BR-APP-037 | **The block hint** appends «скроет N объявлений» only when the author has 20 or more listings. | `ListingActionsSheet.jsx:103-107` |
| BR-APP-038 | **Share** is shown only when `bot_username` is known. It uses a prepared message (Telegram 8.0+); otherwise `t.me/share/url` with `https://t.me/<bot>?startapp=l_<id>` and text `title · price · price-kind label · district`; the label is «первый взнос» (`down_payment`) or, since release `index-Dbpp463V.js`, «цена за бизнес, помещение в аренде» (`business`), and is left out for other values. | `$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:28-50,71`; `$KVADRO_ROOT/demo/app/src/features/listing/format.js:35-43` |
| BR-APP-039 | **Favourite toggle** is optimistic; the server toggle response (`favorite`) wins, and a failure rolls back. The favourites list hides items un-favourited this session. | `$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:19-34`; `ListingFeed.jsx:81-84` |
| BR-APP-040 | **The «viewed» eye** is `seen[id] ?? item.viewed`; it is not shown in history or on compact map cards. | `ListingFeed.jsx:120`; `ListingCard.jsx:61` |
| BR-APP-041 | **Turning on a radar.** The client re-fetches the subscriptions. If an identical one is active → «Радар по этому поиску уже включён». If it exists but is inactive → `PATCH {active:true}`. Otherwise `POST` with `entry` = `filters` / `few` / `prompt` / `empty`, since release `index-DY_DH7h-.js` also `feed` / `return` (BR-APP-073). `409` (not `no_chat`) → the limit toast with `max_subscriptions ?? 10`. | `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:94-158`; `App.jsx:401-415,718,752` (at the pin) |
| BR-APP-042 | **"Widen" suggestion** after a radar with no starter results: the first `options[]` entry with `count ≥ 7`, else the last one. | `subscriptionActions.js:49-67` |
| BR-APP-043 | **Follow nudge** appears when: filters are custom, no radar with the same filters exists, radars < max, not snoozed (14 days after 3 closes in a row), ≥ 8 h since the last nudge, and this filter hash was not offered before (last 40 kept). It shows 1.8 s after applying filters and hides after 10 s. Since release `index-DY_DH7h-.js` a shown return banner counts as a shown nudge: it sets the last-nudge time and marks its filter hash as offered (BR-APP-071). | `followNudge.js:51-92`; `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:9,49-79`; `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:9`; at the pin `followNudge.js:198-216` |
| BR-APP-044 | **Radar flow wording:** `week == 0` → "none" (three different texts, LB-APP-033); `week / days < 1` → «N за неделю»; otherwise «≈N в день» with N rounded. | `format.js:230-243`; `Nudges.jsx:24-37`; `$KVADRO_ROOT/demo/app/src/features/radar/subscriptionStatus.js:19-31` |
| BR-APP-045 | **Home-screen offer:** Telegram 8.0+, at least 3 distinct (UTC) visit days, never offered before, after 4 s calm on the list feed, and only when the status is `missed`. The settings row shows when the status is `missed` or `unknown`. | `$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:8,84-87`; `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:56-83`; `$KVADRO_ROOT/demo/app/src/features/settings/AboutGroup.jsx:19` |
| BR-APP-046 | **Nudges** appear only on search / list with nothing else open. The home offer waits while a follow nudge, follow candidate or toast is present. Since release `index-DY_DH7h-.js`: the create-radar sheet also blocks them; the home offer also waits for a return banner and its pending check; the follow nudge is not offered while a banner check for the same filters is pending, is not rendered next to a banner and is dropped when one shows. A home offer already on screen is hidden by a follow nudge but not by a banner (LB-APP-049). | `App.jsx:181-189,605,618`; at the pin `App.jsx:233-242,724,737,756`, `useFollowNudge.js:70-72`, `useHomeScreenOffer.js:60-73`, `useReturnNudge.js:130-131` |
| BR-APP-047 | **Radar sheet:** the delivery mode can be chosen only while the radar is active. «Скрыто: N» appears only when `hidden > 0`. The digest hint shows the user's digest hours. | `$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:99-138` |
| BR-APP-048 | **Turning a radar on** goes through the chat-access flow; turning it off does not. `ask_found` after pause or delete opens the survey. Delete requires a confirmation. | `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:92-183` |
| BR-APP-049 | **Survey:** `kvadro` → congratulations; `elsewhere` → "where" (7 options); `searching` / `stopped` → close with a toast. Answers are sent with `trigger` = `pause` / `delete`. | `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:93-122` |
| BR-APP-050 | **Language before meta:** `kv-locale`, else `uz_Latn` when the Telegram language is `uz*`, else `ru`. After meta, `meta.locale` wins. A first launch requires an explicit choice (`locale_chosen`). | `$KVADRO_ROOT/demo/app/src/i18n/index.js:25-34`; `useAppBootstrap.js:79`; `App.jsx:234-236` |
| BR-APP-051 | **Settings save semantics.** Language and currency: save, then a full reload. Theme: applied at once, saved, rolled back on error. Quiet hours and digest: optimistic with rollback. Graphics: device-local only. | `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:83-133` |
| BR-APP-052 | **The graphics setting** is shown only on Android, or when the user has changed it before. | `SettingsScreen.jsx:55` |
| BR-APP-053 | **The «Скрытое» group** appears only when hidden listings plus blocked authors > 0. | `SettingsScreen.jsx:135,187` |
| BR-APP-054 | **Access gate:** a `403` from meta shows one of `private / invite / full / blocked / join` (unknown → `private`). It is re-checked 3 × 2.5 s unless `blocked`. Network failures retry after 1, 3, 7, 15, 30 s. Returning to the app retries at once. | `useAppBootstrap.js:24-26,127-158` |
| BR-APP-055 | **The first-launch city choice** is required when there is more than one city, `meta.city_chosen === false`, nothing was picked this session, and no listing is open. | `App.jsx:257` |
| BR-APP-056 | **Nearest city by location:** towns within 16 km; then "regions" (`zoom < 11`) within 110 km; then towns within 110 km; otherwise «Рядом с вами наших городов пока нет». | `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:108-126` |
| BR-APP-057 | **`?news=pets`** without a listing link opens the filters focused on the pets section and switches to long-term rent defaults if needed. The «Новое» pill shows until `kv-new-pets` is set. | `useAppBootstrap.js:115-124`; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/PreferenceSections.jsx:68,80` |
| BR-APP-058 | **Pull-to-refresh** reloads the radar list on the radar tab and re-creates the list elsewhere; it is disabled on settings, the map and under any overlay. | `App.jsx:359-365,530-541` |
| BR-APP-059 | **Photos:** a `.s.jpg` (480 px) thumbnail exists only for `/media/<n>/<n>.jpg?…`. Save-Data, ≤ 3g or lite loads only thumbnails; otherwise `srcset` uses 480w / 800w. There is no retry after a load error. | `$KVADRO_ROOT/demo/app/src/lib/images.js:9-60`; `$KVADRO_ROOT/demo/app/src/components/Photo.jsx:16-46` |
| BR-APP-060 | **Client price display:** USD `$N`; UZS in млрд / млн with 1 decimal, otherwise rounded to thousands of сум; UZS only when the rate is greater than 0 (§3.5). | `money.js:14-58` |
| BR-APP-061 | **A drawn area** becomes a polygon of ≤ 40 vertices with coordinates rounded to 5 decimals. A self-intersecting outline is replaced by its convex hull. Areas under 40 px are rejected with «Обведите покрупнее». Sent as `polygon=lat,lon;…`. | `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:115-151,235` |
| BR-APP-062 | **The map** excludes locally hidden listings. «На карте N из M» appears when some listings have no coordinates. Pins with equal coordinates (5 dp) become a stack sorted by price. | `$KVADRO_ROOT/demo/app/src/features/map/pins.js:9-22`; `$KVADRO_ROOT/demo/app/src/features/map/gl/useClusterIndex.js:89-92` |
| BR-APP-063 | **Radar previews:** for each radar, the newest feed page (5 shown), the total count and the flow are fetched by the radar's filters. | `$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:41-66` |
| BR-APP-064 | **Filter summary order:** `city · area · Посуточно · у метро · rooms · price · ≤ медианы · без риелторов / от хозяев`. Areas show «Своя область», «Центр и ближе к центру», the zone name before « (», or two districts «+N». | `$KVADRO_ROOT/demo/app/src/features/filters/summary.js:68-105` |
| BR-APP-065 | **Radar title:** deal (unless long-term rent) · types (unless only apartments) · rooms · price; if all are empty, the deal name. | `summary.js:108-119` |
| BR-APP-066 | **Room and price labels:** «{n}-комн.», «{n}+ комн.», «{lo}–{hi} комн.»; «до X», «от X», «X–Y». | `summary.js:6-42` |
| BR-APP-067 | **Clearing history** requires a confirmation and clears it on the server; there is no undo. | `ListingFeed.jsx:93-103` |
| BR-APP-068 | **Listing stats:** 0 days → «Сегодня на рынке». Channels are shown only when > 1; views only when non-zero. | `$KVADRO_ROOT/demo/app/src/features/listing/sections/StatsSection.jsx:13-24` |
| BR-APP-069 | **Price history:** one entry → a sentence with a clickable @channel; several → a timeline with the price and ±%, green when negative and orange when positive. | `$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx:28-97` |
| BR-APP-070 | **Search visits** (since release `index-DY_DH7h-.js`). Once meta is loaded, a visit is recorded for the current filter set on entering the search tab, on every filter change and, on the search tab, when the app goes to the background. A set is keyed by a djb2 hash of `filtersKey`, so `posted_days` is ignored; `kv-visits` keeps the 40 newest. The previous visit of a set is the stored time read at its first visit in the current visit session. A session starts with the app and again when the app returns from the background after ≥ 6 h, which also re-reads the radars. | `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:35-72`; `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:37-45,98-148` (at the pin) |
| BR-APP-071 | **Return banner** (since release `index-DY_DH7h-.js`). 1.8 s after a visit, with the radars loaded and nothing over the list, it is checked for that filter set. It needs: no radar with the same filters (for default filters, also none for the same base deal in the same city); radars < `max_subscriptions` (else 10); a previous visit ≥ 6 h ago; no snooze (14 days after 3 closes in a row, shared with the follow nudge); ≥ 8 h since the last nudge; no banner for this set in the last 2 days. Then `GET /api/feed/new` is sent, and the banner shows only for `count > 0` and hides after 15 s. Showing it stores the time for the set (`kv-nudge.back`, 40 kept), sets the last-nudge time, marks the set as offered and drops a follow nudge or its candidate; × counts towards the close streak. | `useReturnNudge.js:90-143`; `followNudge.js:150-216`; `Nudges.jsx:63-79`; `App.jsx:737-748` (at the pin) |
| BR-APP-072 | **In-feed radar card** (since release `index-DY_DH7h-.js`) on the search list when meta and the radars are loaded, no radar exists for the search (the test of BR-APP-071), radars < max and the card is not snoozed. It follows the 8th card, or the last card when the list has 8 or fewer, is fully loaded and has no few-results note. The title depends on the base deal (rent, including daily, or sale), the button on custom or default filters. × hides it for 7 days on every search and does not count towards the nudge close streak. | `followNudge.js:219-244`; `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:98-106,128-139`; `App.jsx:297-303,629-645` (at the pin) |
| BR-APP-073 | **«Включить радар» from the return banner or the in-feed card** resets the close streak. Custom filters go straight to the radar flow of BR-APP-041 with `entry` `return` / `feed`; default filters open the create-radar sheet (SCR-030), which sends the same `entry` (and `relaxed` when an option was picked). «+» and the empty radar screen open that sheet with `entry` `empty`, which it always sent before this release. | `App.jsx:399-415,629-635,712-721,749-753` (at the pin) |

## 5. Known legacy bugs (LB-APP, tag `bug`)

These items reproduce production behaviour 1:1 in the recovered code. RECOVERY.md §7 keeps them on purpose for parity
(`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:148-173`). **None of them is to be ported.**

- "Status" is the status of the defect in the code.
- Where the triggering data is unknown, the item is `UNVERIFIED` and has a `Q-APP`.
- Fixes are proposals for the Next.js frontend, not approved changes.

#### LB-APP-001 — Leaflet mini-map double initialisation (`bug`, CONFIRMED)

- **Symptom:** «Map container is already initialized» sometimes appears when a listing opens. It is a mount race of the
  spot mini-map and also happens in the original build.
- **Evidence:** `$KVADRO_ROOT/demo/app/docs/RECOVERY.md:153-154`; `$KVADRO_ROOT/demo/app/src/features/listing/spot/SpotMap.jsx:19-58`.
- **Proposed fix:** create the mini-map in one effect with a cancellation flag; dispose on unmount before re-init. Or
  render one engine through a single component that owns its container.

#### LB-APP-002 — `t()` throws on a missing key, including server-driven keys (`bug`, CONFIRMED)

- **Symptom:** `t()` dereferences `entry.other` with no fallback. Keys built from server values (`subs.mode.${mode}`,
  `type.${type}` in radar titles, `market.v3.rooms${n}`) can crash the whole app through the ErrorBoundary.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/i18n/index.js:118-121`; `$KVADRO_ROOT/demo/app/src/features/radar/subscriptionStatus.js:15`;
  `$KVADRO_ROOT/demo/app/src/features/filters/summary.js:111`.
- **Proposed fix:** use a typed i18n catalogue with a build-time missing-key check across all three locales. At runtime,
  fall back to `ru`, then to the key, and report a non-fatal event. Map server enums through explicit tables with a
  default label.

#### LB-APP-003 — Listing screen keeps another listing's translation and «original open» (`bug`, CONFIRMED)

- **Symptom:** `ListingScreen` has no `key`. Translation state lives in `useListingTranslation(id)` and `originalOpen` in
  plain `useState`; neither resets when `id` changes. This happens with the redirect (`plF_TOcT`), when the response id
  differs. The old translation text can then be shown for the new listing.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:60-71,94,103-104`;
  `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingTranslation.js:14-20`; `RECOVERY.md:156-157`.
- **Proposed fix:** key the listing view by listing id (a route segment in Next.js). Keep translation state in a cache
  keyed by id.

#### LB-APP-004 — Zoomable image binds touch handlers with first-render callbacks (`bug`, CONFIRMED)

- **Symptom:** it works only because PhotoViewer passes stable callbacks.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ZoomableImage.jsx`; `RECOVERY.md:158-159`.
- **Proposed fix:** read the callbacks through refs updated each render, or use a gesture library with declarative
  handlers.

#### LB-APP-005 — «Не получилось сохранить» after a successful radar save (`bug`, CONFIRMED; trigger UNVERIFIED, Q-APP-006)

- **Symptom:** `emptyResultToast` reads `result.relaxed[0]` without a check. If the server returns `starter: 0`, no
  `options` and no `relaxed`, the TypeError is caught by the surrounding `try`. The user sees «Не получилось сохранить»
  and the create sheet stays open although the radar was created.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:49-67,137-157,169-179`; `RECOVERY.md:160-161`.
- **Proposed fix:** validate responses with a schema (Zod or similar) and treat missing optional arrays as empty. Show
  the success toast whenever the request itself succeeded.

#### LB-APP-006 — Follow nudge crashes the app on an empty flow response (`bug`, CONFIRMED; trigger UNVERIFIED, Q-APP-005)

- **Symptom:** `fetchFeedFlow(...).catch(() => null)` keeps `undefined` from a `204` (`apiFetch` returns `undefined` for
  204). `AlertNudge` then evaluates `flow === null ? … : flow.week`, a TypeError in render that takes the whole app to
  the crash screen.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:63`; `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:24-37`;
  `$KVADRO_ROOT/demo/app/src/lib/api/client.js:99-101`; `RECOVERY.md:162`.
- **Proposed fix:** normalise the flow response to `null` for anything that is not an object. Render the nudge without
  a flow line when it is absent.

#### LB-APP-007 — City change can set `near_metro` / `below_median` to `undefined` (`bug`, CONFIRMED)

- **Symptom:** `picked.metro && filters.near_metro` yields `undefined` when the city object has no `metro` field.
  `filtersKey` turns that into `null`, which is not the default `false`. The filters then count as custom, radar
  matching fails, and the follow nudge can fire.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/App.jsx:294-295`; `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:127-128`;
  `$KVADRO_ROOT/demo/app/src/features/filters/model.js:57`; `RECOVERY.md:163-164`.
- **Proposed fix:** coerce booleans (`Boolean(city.metro) && …`) and normalise filters through one `normalizeFilters()`
  used for state, API and comparison.

#### LB-APP-008 — GL map stays blank when points or pmtiles fail (`bug`, CONFIRMED)

- **Symptom:** `fetchMapPoints` has no rejection handler. A rejected `registerPmtiles` never calls `onFail`, so there is
  no fallback and no error.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapPoints.js:15-22`; `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapInstance.js:51-60,125`;
  `RECOVERY.md:165-166`.
- **Proposed fix:** handle errors explicitly. Show an error state with retry (LB-APP-044) and fall back to raster tiles
  when vector tiles fail.

#### LB-APP-009 — Telegram LocationManager request has no timeout (`bug`, CONFIRMED)

- **Symptom:** the locate spinner can hang forever.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:48-72`; `RECOVERY.md:167`.
- **Proposed fix:** race every location request against a timeout of about 12 s (matching the browser path) that
  resolves to `fail`.

#### LB-APP-010 — Home-screen visit days counted in UTC (`bug`, CONFIRMED)

- **Symptom:** visit days are UTC dates. In Tashkent (UTC+5), 00:00–04:59 local time counts as the previous day.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:71-78`; `RECOVERY.md:168`.
- **Proposed fix:** compute the day key with `Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Tashkent'})`.

#### LB-APP-011 — UZS boundary and price-input parsing (`bug`, CONFIRMED)

- **Symptom:** amounts from 999 500 to 999 999 сум render as «1 000 000 сум» instead of «1 млн сум», because rounding
  to thousands happens after the threshold check. `parsePriceInput("1.000.000")` returns `null`.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/money.js:32-46,91-101`; `RECOVERY.md:169-170`.
- **Proposed fix:** round first, then choose the unit. Parse with locale-aware rules: strip spaces and thousands
  separators, treat a single `,` or `.` as the decimal mark. Cover both with unit tests.

#### LB-APP-012 — DeviceStorage receives every key but restores only three (`bug`, CONFIRMED)

- **Symptom:** `kv-locale` and `kv-new-*` are mirrored but never restored.
- **Since release `index-DY_DH7h-.js`:** four keys are restored, `kv-visits` joined `DEVICE_SYNCED_KEYS` (`storage.js:6`
  at the pin); the title keeps the audited count. `kv-locale` and `kv-new-*` are still not restored.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/storage.js:6,34-52`; `RECOVERY.md:171`.
- **Proposed fix:** declare per key whether it is local-only, mirrored or restored; mirror only the keys that are
  restored.

#### LB-APP-013 — Leaflet: a max-zoom cluster tap with an open stack (`bug`, CONFIRMED)

- **Symptom:** the selection changes but the expanded stack stays open.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/map/leaflet/MapView.jsx:108-110`; `RECOVERY.md:172`.
- **Proposed fix:** collapse any spiderfied stack before handling a cluster tap. This is moot if only one map engine is
  ported.

#### LB-APP-014 — Radar tiles are not keyboard-accessible (`bug`, CONFIRMED)

- **Symptom:** the tiles have `role="button"` and `tabIndex` but no keyboard handler.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/radar/RadarTiles.jsx:24-30`; `RECOVERY.md:173`.
- **Proposed fix:** use a real `<button>`, or handle Enter and Space. The nested switch must remain a separate control.

#### LB-APP-015 — Market sheet crashes for unexpected `median_rooms` (`bug`, code CONFIRMED; data UNVERIFIED, Q-APP-007)

- **Symptom:** `t(\`market.v3.rooms${median_rooms}\`)` exists only for 1–3 (≥ 4 maps to `rooms4`). A value of 0
  (studio) or a fraction throws when the «Откуда эта цифра» sheet opens.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/MarketSheet.jsx:99-102`.
- **Proposed fix:** map rooms through a total function (`0` gives «тоже студии», otherwise a generic «тоже N-комн.»).

#### LB-APP-016 — "Nearby" breaks on unknown or duplicate kinds (`bug`, code CONFIRMED; data UNVERIFIED, Q-APP-008)

- **Symptom:** `NEARBY_ICONS[place.kind]` is `undefined` for kinds other than `metro`, `park` and `school`. Rendering
  `<Icon/>` then throws. Two places of the same kind also share a React key.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/sections/NearbySection.jsx:5-9,36-40`.
- **Proposed fix:** use a default icon for unknown kinds and key by `kind + name + index`.

#### LB-APP-017 — Map selection card spins forever after a failed preview (`bug`, CONFIRMED)

- **Symptom:** after a failed fetch, the spinner stays until the index changes.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/map/MapSelectionCard.jsx:24-39`.
- **Proposed fix:** show an inline error with retry for the failed slot.

#### LB-APP-018 — MapLibre warm-up runs during render (`bug`, CONFIRMED)

- **Symptom:** a side effect in the render path; it runs twice under StrictMode.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:33-36`.
- **Proposed fix:** move the warm-up into an effect or an idle callback triggered by intent (list view idle, hover or
  touch on «Карта»).

#### LB-APP-019 — A GL map failure is retried on every map open (`bug`, CONFIRMED)

- **Symptom:** the fallback to Leaflet is per mount only.
- **Evidence:** `MapScreen.jsx:33,47`.
- **Proposed fix:** remember a runtime GL failure for the session, and report it.

#### LB-APP-020 — Server pin labels injected as HTML (`bug`, CONFIRMED; impact UNVERIFIED, Q-APP-012)

- **Symptom:** Leaflet pins and GL stack pins build `innerHTML` from the server `label`, an XSS vector if a label ever
  carries user text. GL single pins use `textContent`.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/map/leaflet/icons.js:13`; `$KVADRO_ROOT/demo/app/src/features/map/pins.js:70-73`;
  `$KVADRO_ROOT/demo/app/src/features/map/gl/markerElements.js:17`.
- **Proposed fix:** have the API return structured price data and render it as text only. Route this to
  `16-security-review.md`.

#### LB-APP-021 — Restored DeviceStorage values arrive too late (`bug`, CONFIRMED)

- **Symptom:** `restoreFromDeviceStorage()` runs in an effect after mount. `kv-city` has already been read for the
  prefetch and the initial filters (`main.jsx:25`, `App.jsx:52`), so a restored city only takes effect on the next
  launch. `kv-locale` is never restored.
- **Since release `index-DY_DH7h-.js`** the race also hits `kv-visits`: when meta arrives before the restore finishes,
  the first visit reads an empty map, so no previous visit and no return banner this launch, and its write may replace
  the DeviceStorage copy with that single entry (`useReturnNudge.js:44-49`, `followNudge.js:131-142`,
  `storage.js:34-52,59-87`, all at the pin).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:23-25`; `$KVADRO_ROOT/demo/app/src/main.jsx:25`.
- **Proposed fix:** restore before the first data request (with a short timeout), or rely on the server profile
  (`meta.city`, `meta.locale`) as the source of truth.

#### LB-APP-022 — Favourites and history ignore the cursor (`bug`, code CONFIRMED; trigger UNVERIFIED, Q-APP-009)

- **Symptom:** `fetchFavorites()` and `fetchHistory()` are called without a cursor, but the shared hook stores
  `next_cursor`. If the server ever returns a non-null cursor, the same page is fetched again in a loop while the
  sentinel is visible.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:31-62`; `$KVADRO_ROOT/demo/app/src/lib/api/user.js:23-26`.
- **Proposed fix:** give the API proper pagination for these lists, or treat them as single-page lists explicitly.

#### LB-APP-023 — Sort options before meta loads (`bug`, CONFIRMED)

- **Symptom:** `city?.zones.length !== 0` is `true` when `city` is `null`, so «Ближе к центру» is offered before meta
  loads. It throws if the fallback city has no `zones`.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:27`; `$KVADRO_ROOT/demo/app/src/features/filters/summary.js:49-64`.
- **Proposed fix:** compute options only from a loaded city config; hide unavailable sorts until meta is known.

#### LB-APP-046 — The Settings button leaves sheets open (`bug`, CONFIRMED)

- **Symptom:** the Telegram Settings button closes the listing, the filters and the radar editor, but not sort, quick
  filter, city picker or create-radar. Those keep rendering over the settings tab.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:10-23`; overlay rendering `App.jsx:546-669`.
- **Proposed fix:** one navigation reset (route change) that dismisses every overlay.

#### LB-APP-048 — The return banner crashes the app on a response without `count` (`bug`, CONFIRMED; trigger UNVERIFIED, Q-APP-026)

- **Symptom:** `useReturnNudgeTimer` skips the banner only for `!fresh || fresh.count <= 0`. A JSON body without `count`
  passes, because `undefined <= 0` is false. The banner then calls `count.toLocaleString()` in render, a TypeError that
  takes the whole app to the crash screen (SCR-045); a non-numeric `count` is rendered as text. A `204` is safe:
  `apiFetch` returns `undefined`. The legacy contract states the trap (`$KVADRO_ROOT/docs/api.md:572-573` at the pin).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:117-136`;
  `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:84-87` (at the pin);
  `$KVADRO_ROOT/demo/app/src/lib/api/client.js:99-101`.
- **Proposed fix:** show the banner only for a positive integer `count` and treat any other body as "no banner"; the
  server always sends an integer (LB-API-055).

#### LB-APP-049 — The return banner and the home-screen offer can be on screen together (`bug`, CONFIRMED)

- **Symptom:** the home offer waits for a banner and its check before it starts, but an offer already on screen is
  rendered with `!followNudge` only. A banner that appears during the offer's 10 s (a filter change starts a new check)
  is rendered as well. Both are `.nudge` cards fixed at the same place above the tab bar, so the banner covers the
  offer, which is then used up unseen (LB-APP-040).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/App.jsx:724,737`;
  `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:60-73`; `$KVADRO_ROOT/demo/app/src/styles/nudges.css:2-7` (at the
  pin).
- **Proposed fix:** one nudge slot with a fixed priority (return banner, follow nudge, home offer): a higher nudge hides
  a lower one, and a hidden home offer stays available for later.

## 5b. Questionable UX and logic decisions (LB-APP, tag `decision`)

These are not crash bugs: the behaviour looks logically wrong or confusing. The current behaviour is exact; the fixes
are proposals.

#### LB-APP-024 — Map selection card ignores Telegram Back (`decision`, CONFIRMED)

- **Symptom:** the card registers no Back handler, so on the map the BackButton is hidden while a card is open. Android
  hardware Back may close the whole Mini App.
- **Evidence:** `MapSelectionCard.jsx` has no `pushBackHandler`; compare `$KVADRO_ROOT/demo/app/src/lib/telegram/buttons.js:14-35`.
- **Proposed fix:** treat the card as a layer that Back closes.

#### LB-APP-025 — History dates and times use the device time zone (`decision`, CONFIRMED)

- **Symptom:** dates and times in price history use the device time zone, not Asia/Tashkent. Settings tell the user
  times are Tashkent time.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx:7-12`; `$KVADRO_ROOT/demo/app/src/i18n/index.js:83-93`;
  `notify.tz`.
- **Proposed fix:** format every product date in `Asia/Tashkent`.

#### LB-APP-026 — «Весь Ташкент» is hard-coded, and six keys are dead (`decision`, CONFIRMED)

- **Symptom:** `sum.wholeCity` is «Весь Ташкент» / «Butun Toshkent» / «All of Tashkent» for every city. It appears in
  the collapsed title before meta loads, even for Samarkand users. Six i18n keys are unused.
- **Evidence:** `summary.js:95,125`; §3.1.
- **Proposed fix:** use «Весь город» or the city name; delete the dead keys.

#### LB-APP-027 — Failures with haptic feedback only (`decision`, CONFIRMED)

- **Symptom:** these failures (and some successes) give haptic feedback only, with no text:
  - language picker (`$KVADRO_ROOT/demo/app/src/features/onboarding/LanguagePicker.jsx:37-40`);
  - settings saves (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:92-95,108-112,124-126`);
  - hidden list (`$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:34-37`);
  - radar mode, unhide, delete and toggle (`$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:115-121,139-142,158-160,179-181`);
  - clear history (`$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:99-101`).
  - Haptics do nothing outside Telegram and on many devices.
- **Proposed fix:** a consistent error toast (`common.saveFailed`) and success confirmation for destructive actions.

#### LB-APP-028 — Call button dead end, and calls over-counted (`decision`, CONFIRMED)

- **Symptom:** off Android, with no `call_url` (`contact` is `null`), «Позвонить» does nothing visible. It still logs
  `contact_call` with `via: 'browser'`.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:54-81`; `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:14-19`.
- **Proposed fix:** fetch the call link on demand when it is missing. Log the event only when something actually
  opened.

#### LB-APP-029 — Tenant and pets filters stay visible for daily rent (`decision`, CONFIRMED)

- **Symptom:** switching to daily rent resets them, yet they stay visible and selectable (they are shown by base deal).
- **Evidence:** `FiltersSheet.jsx:213-216`; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/DealSections.jsx:62-64`.
- **Proposed fix:** hide them for daily rent, or stop resetting them. Pick one rule.

#### LB-APP-030 — «Сбросить» leaves daily rent (`decision`, CONFIRMED)

- **Symptom:** «Сбросить» in the full sheet switches daily rent back to long-term rent, so reset changes the deal.
- **Evidence:** `FiltersSheet.jsx:189`; `$KVADRO_ROOT/demo/app/src/features/filters/model.js:131-136`.
- **Proposed fix:** reset to the defaults of the current deal, including daily.

#### LB-APP-031 — Metro distance units are inconsistent (`decision`, CONFIRMED)

- **Symptom:** cards show «· 1 500 м» up to 1.5 km, while «Рядом» switches to km from 0.95 km.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/format.js:83-86` vs `:94-113`.
- **Proposed fix:** one distance formatter for all surfaces.

#### LB-APP-032 — Language detection differs between code paths (`decision`, CONFIRMED)

- **Symptom:**
  - Before meta, `detectLocale` maps only `uz` (English Telegram users get Russian) (`$KVADRO_ROOT/demo/app/src/i18n/index.js:25-34`).
  - `getTelegramLanguage` maps `en` too (`$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:137-155`).
  - The boot screen maps only `uz` / `ru` (`index.html:44-59`).
- **Proposed fix:** one detector (`uz → uz_Latn`, `en → en`, else `ru`) used everywhere.

#### LB-APP-033 — Three texts for "no new listings this week" (`decision`, CONFIRMED)

- **Symptom:** the filters footer says «📡 За неделю таких не было — радар будет срабатывать редко» (`sheet.flowNone`),
  the nudge «Таких пока нет — радар пришлёт, как появятся» (`nudge.none`), and radar tiles «пока редко»
  (`alert.rare`). The day and week forms also differ (`sheet.flowDay` vs `alert.day`).
- **Evidence:** `format.js:230-243`; `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:24-37`; `$KVADRO_ROOT/demo/app/src/features/radar/subscriptionStatus.js:19-31`.
- **Proposed fix:** one flow formatter with one vocabulary.

#### LB-APP-034 — «Смотреть найденное · N» counts all matches (`decision`, CONFIRMED)

- **Symptom:** «Смотреть найденное · N» and «Все N» use `GET /api/feed/count`: every listing that matches now, not what
  the radar found or delivered.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:52-58`; `$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:145-151`.
- **Proposed fix:** label it «Сейчас подходит: N», or have the server return radar-specific counts.

#### LB-APP-035 — City counts omit daily rent (`decision`, CONFIRMED)

- **Symptom:** the city picker counts show long-term rent and sale only.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/city/CityPicker.jsx:113-119`.
- **Proposed fix:** include daily rent, or label the counts precisely.

#### LB-APP-036 — The radar tab sends 3 requests per radar (`decision`, CONFIRMED)

- **Symptom:** `/api/feed` (20 items, 5 used), `/api/feed/count` and `/api/feed/flow` per radar: up to 30 requests with
  10 radars, on every visit.
- **Evidence:** `useRadarPreviews.js:41-66`.
- **Proposed fix:** one batched preview endpoint (or `limit=5`) with caching.

#### LB-APP-037 — Most layers are not tracked as screens (`decision`, CONFIRMED)

- **Symptom:** these layers never produce a `$pageview`: language picker, no-access screen, first-launch city picker,
  map card, actions sheet, report view, report detail view, photo viewer, market sheet, fullscreen map, radar sheet,
  survey, settings sub-pages, hidden list.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:26-44`.
- **Proposed fix:** derive screen names from routes or layers; keep the existing names for continuity.

#### LB-APP-038 — «Сбросить фильтры» offered with nothing to reset (`decision`, CONFIRMED)

- **Symptom:** with no active filters and no city stats, the empty state still offers «Сбросить фильтры».
- **Evidence:** `ListingFeed.jsx:22-49,137-138`; `$KVADRO_ROOT/demo/app/src/app/App.jsx:420-423`.
- **Proposed fix:** show the reset only when filters are active; otherwise suggest another city or deal, or the radar.

#### LB-APP-039 — Unknown verdict tones read as "pricier" (`decision`, CONFIRMED)

- **Symptom:** the fallback verdict branch says "pricier" for any unknown tone, whatever the sign of the delta.
- **Evidence:** `format.js:200-216`.
- **Proposed fix:** decide the wording by sign; render an unknown tone neutrally.

#### LB-APP-040 — Home-screen offer used up without being shown (`decision`, CONFIRMED)

- **Symptom:** `markHomeScreenOffered()` runs whatever the status. When Telegram answers late (`unknown`) or
  `unsupported`, the offer is marked as made and never shown.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:69-77`.
- **Proposed fix:** mark it offered only when it was displayed.

#### LB-APP-041 — Full reload on language or currency change (`decision`, CONFIRMED)

- **Symptom:** changing language or currency reloads the whole app, losing in-memory state and re-running boot.
- **Evidence:** `SettingsScreen.jsx:116-127`; `LanguagePicker.jsx:32-36`.
- **Proposed fix:** switch locale and currency in place, then re-fetch the server-formatted data.

#### LB-APP-042 — Owner chip shows «Без риелторов» when nothing is selected (`decision`, CONFIRMED)

- **Symptom:** with owner `any`, the chip shows «Без риелторов» unhighlighted, which looks like an applied filter.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/feed/FeedHeader.jsx:51-54`.
- **Proposed fix:** show the neutral label «Кто размещает» until a value is chosen.

#### LB-APP-043 — No min ≤ max validation for price or area (`decision`, CONFIRMED)

- **Symptom:** inverted ranges are sent as they are.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/filters/PriceSection.jsx:45-71`; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/ExtraSections.jsx:9-42`.
- **Proposed fix:** swap or flag inverted ranges before applying.

#### LB-APP-044 — The map has no loading, empty or error state (`decision`, CONFIRMED)

- **Symptom:** no state is shown for points (SCR-011).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/map/gl/MapViewGL.jsx:160-205`; `$KVADRO_ROOT/demo/app/src/features/map/leaflet/MapView.jsx:154-160`.
- **Proposed fix:** loading indicator, «ничего не найдено в этой области», and an error with retry.

#### LB-APP-045 — A 403 inside the feed shows a retry (`decision`, CONFIRMED)

- **Symptom:** the feed shows «Нет доступа — повторить» instead of the no-access explanation.
- **Evidence:** `ListingFeed.jsx:88,126-136`.
- **Proposed fix:** route any 403 to the access screen (SCR-003).

#### LB-APP-047 — An expired or invalid initData is not handled (`decision`, CONFIRMED)

- **Symptom:** there is no `401` branch. Meta retries 5 times in silence; feeds and sheets then show «Не загрузилось» /
  «Сервер не ответил…», which blames the server for an expired Telegram session.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:127-145`;
  `$KVADRO_ROOT/demo/app/src/components/ErrorState.jsx:13-26`; `$KVADRO_ROOT/demo/app/src/lib/api/client.js:87-98`.
- **Proposed fix:** on `401`, show a dedicated «Сессия устарела — закройте и откройте приложение снова» state with
  `WebApp.close()`, and report it once.

#### LB-APP-050 — The return banner and the follow nudge count as shown before they render (`decision`, CONFIRMED)

- **Symptom:** `markReturnShown` / `markNudgeAsked` and `return_prompt_shown` / `follow_prompt_shown` run when the
  nudge is scheduled. The render waits until no toast is shown, and a filter change in the meantime drops the nudge.
  Such a nudge was never seen, yet it starts the 8 h cooldown (and, for the banner, the 2-day cooldown of its filters),
  marks the filter hash as offered and is counted as shown in analytics.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:125-136`;
  `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:24-33,79-88`; `$KVADRO_ROOT/demo/app/src/app/App.jsx:737,756` (at
  the pin).
- **Proposed fix:** record the nudge as shown, and send `*_shown`, from its first render, not when it is scheduled.

## 6. Reconstruction guesses and open questions

### 6.1 `// TODO: inferred from build` spots (4)

| # | Location | What was guessed | Status |
| - | -------- | ---------------- | ------ |
| 1 | `$KVADRO_ROOT/demo/app/vite.config.js:67` | `build.target` `chrome80 / edge80 / firefox72 / safari13.1`, from bundle syntax | UNVERIFIED (Q-APP-001) |
| 2 | `$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:7` | an engine-name debug badge stripped from the build (`SHOW_ENGINE_BADGE = false`; `.map-kind` CSS is dead) | UNVERIFIED (Q-APP-002) |
| 3 | `$KVADRO_ROOT/demo/app/src/features/map/gl/style.js:306` | the rationale of the label-halo width formula (`stroke/2 + 0.25`); the value matches the bundle, the reasoning is guessed | UNVERIFIED (Q-APP-003) |
| 4 | `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:118` | `zoom < 11` (default 12) marks a "region", not a city, for nearest-city search | UNVERIFIED (Q-APP-004) |

The recovery also states that file names, module boundaries and the versions of four range-pinned libraries are
guesses (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:88-95`).

### 6.2 Open questions (Q-APP)

| ID | Question | Check that closes it |
| -- | -------- | -------------------- |
| Q-APP-001 | What is the real minimum WebView the Mini App must support? | Pull the `platform` / `tg` distribution from `app_launch` and `app_error` in the legacy journal or PostHog; run a syntax checker over the prod bundle in `tools/parity/original/assets/` (read-only). |
| Q-APP-002 | Did the engine badge ever ship to users? | Inspect the prod chunks `MapView-*.js` / `MapViewGL-*.js` in `tools/parity/original/assets/` for the badge render. Product decision: drop it. |
| Q-APP-003 | Is the GL label halo correct? | Confirm with the existing `gl-parity` style comparison (16/16 identical per RECOVERY.md:71-74); visual check against a prod screenshot. |
| Q-APP-004 | Does `zoom < 11` really mean "region"? | Read `cities[].zoom` from a real `GET /api/meta` and confirm with the backend owner. `$KVADRO_ROOT/docs/api.md` §4 repeats the rule, but it was derived from code. |
| Q-APP-005 | Can `GET /api/feed/flow` return 204 or an empty body? (LB-APP-006) | Call it with very narrow filters on a test account and record the status and body. |
| Q-APP-006 | Do `POST` / `PUT /api/subscriptions` always return `relaxed[]` when `starter = 0` and `options` is empty? (LB-APP-005) | Contract check against `$KVADRO_ROOT/docs/api.md` §7 and a live call. |
| Q-APP-007 | What values can `median_rooms` take (0, fractions)? (LB-APP-015) | Sample `GET /api/listings/:id` responses with `median_scope = near`. |
| Q-APP-008 | Which `nearby[].kind` values exist? (LB-APP-016) | Sample listing responses; ask the backend owner for the enum. |
| Q-APP-009 | Can favourites or history return a non-null `next_cursor`? (LB-APP-022) | Call both with more than 20 entries. |
| Q-APP-010 | What are the server enums for `subscription.mode` and filter `types`? | Backend contract; the radar list with legacy radars. |
| Q-APP-011 | Do server-formatted strings (`price`, `age`, `label`, `title`) follow the user's currency and locale? | Call `/api/feed` and `/api/listings/:id` after `PUT /api/settings` with each currency and locale. |
| Q-APP-012 | Can map `label` contain HTML or user text? (LB-APP-020) | Sample `GET /api/map`; `$KVADRO_ROOT/docs/api.md` warns about HTML in labels. |
| Q-APP-013 | When are `meta.locale_chosen` and `meta.city_chosen` false, and can they reset? | Backend owner; a fresh Telegram test account. |
| Q-APP-014 | Are the closed-beta gates (`invite`, `full`, `join`) active in production? | Open the bot with a fresh account; ask the backend owner. |
| Q-APP-015 | Is `meta.tiles` in production a `.pmtiles` URL, a `{z}/{x}/{y}` template or `null`? On which host? | Read `GET /api/meta`. This affects the RES items, CSP and tile prefetch. |
| Q-APP-016 | What is the legacy CSP header for `app.kvadro.app` (script hashes, connect-src)? | `curl -sI https://app.kvadro.app/` from an allowed machine; record it in `17-infrastructure-and-deployment.md`. |
| Q-APP-017 | What does `contact_paid` mean, given the button «Номер платный»? | Backend owner; sample a listing with `contact_paid: true`. |
| Q-APP-018 | How many sessions use GL, Leaflet or lite? (decides whether to port Leaflet) | PostHog: `build` plus screen events joined with UA; or add a temporary event in the new app. |
| Q-APP-019 | Do bot buttons open the Mini App with `?listing=` / `?news=` (URL) or with `startapp`? | Read the bot's `web_app` button URLs in `$KVADRO_ROOT/docs/telegram-bot.md` and `04-telegram-bot-audit.md`. |
| Q-APP-020 | Do the parity mocks match real API shapes for every state above? | Record real responses for each endpoint on a test account and diff them against `tools/parity/mocks*.mjs`. |
| Q-APP-021 | Does `GET /api/bot` return `support`, and which account? | Call `GET /api/bot`. |
| Q-APP-022 | Do support staff use `?map=gl|leaflet|auto` overrides? | Ask the operators; otherwise treat it as a debug-only feature. |
| Q-APP-026 | Can `GET /api/feed/new` answer `200` without a numeric `count`? (LB-APP-048) | Call it on a test account with narrow filters, with `since` in the future and with `since=0`, and record the status and the body. |

## 7. Summary

| Kind | Count | Status |
| ---- | ----- | ------ |
| Screens and states (SCR) | 47: 17 `screen`, 11 `sheet`, 8 `overlay`, 2 `modal`, 9 `state` (SCR-046 and SCR-047 since `index-DY_DH7h-.js`) | 47 CONFIRMED (SCR-011 contains 2 inferred style details) |
| i18n keys | 482 per locale (ru, uz_Latn, en) at the pinned release, 461 at the audit (§3.1); 0 missing; 15 plural at the pin (14 up to `index-BNLZFfL0.js`); 6 unused | CONFIRMED |
| Client storage keys | 11 `kv-*` at the pin (6 mirrored to DeviceStorage, 4 restored; 10, 5 and 3 at the audit) + 1 dev-only | CONFIRMED |
| Analytics | 21 journal events (`POST /api/events`) at the pin, 16 at the audit, + PostHog `$pageview` with 16 screen names, autocapture, web vitals, exceptions, replay | CONFIRMED |
| Business rules (BR-APP) | 73 (BR-APP-070 to 073 since `index-DY_DH7h-.js`) | CONFIRMED |
| Legacy bugs (LB-APP, `bug`) | 26 (LB-APP-001 to 023, 046, 048, 049; 14 from RECOVERY.md §7, 12 found here) | 19 CONFIRMED; 7 with the defect CONFIRMED but the trigger or impact UNVERIFIED (005, 006, 015, 016, 020, 022, 048) |
| Questionable decisions (LB-APP, `decision`) | 24 (LB-APP-024 to 045, 047, 050) | CONFIRMED |
| `TODO: inferred from build` | 4 (3 in `src`, 1 in `vite.config.js`) | UNVERIFIED |
| Open questions (Q-APP) | 23 (Q-APP-001 to 022 and 026 here; Q-APP-023 to 025 are in `24`) | open |
| Telegram integration points (TMA) | 45 in `05-telegram-miniapp-audit.md` (39 used, 6 confirmed absences) | CONFIRMED (2 server-side parts DOCUMENTED_ONLY) |
