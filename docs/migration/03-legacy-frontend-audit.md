# 03 — Legacy frontend audit: kvadro² Mini App

Scope: the Telegram Mini App `app.kvadro.app` (React 19 + Vite 8), as recovered by decompiling the production bundle.
The recovered tree is `$KVADRO_ROOT/demo/app/`. The audit of 2026-11-09 described release `index-plF_TOcT.js` (prod
`Last-Modified` Sat, 07 Nov 2026 22:05:36 GMT). It was brought up to `index-DY_DH7h-.js` (prod `Last-Modified` Fri, 13
Nov 2026 22:05:41 GMT, SVN r27), the pin of WP-02, and by the intakes of 2026-11-19 first to `index-BnFvC-Ft.js` (prod
`Last-Modified` Sat, 14 Nov 2026 21:05:33 GMT, SVN r29; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:46`), then to
`index-CBlEKxdL.js` (prod `Last-Modified` Tue, 17 Nov 2026 22:05:45 GMT, SVN r31;
`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5` at r31), then to `index-CIa0Ldj2.js` (prod `Last-Modified` Wed, 18 Nov
2026 22:05:36 GMT by the legacy documents, not checked against production; source at SVN r33;
`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5` at r36), the previous pin, and by the intake of 2026-11-20 to the pinned
release `index-YX9bFVws.js` (prod `Last-Modified` Fri, 20 Nov 2026 01:05:43 GMT by the legacy documents, not checked
against production; source at SVN r38; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-36` at r39;
[`wave-1/baseline.md`](wave-1/baseline.md)). Text added for a later release names that release. "At the pin" in text
written before those intakes cites the code at r27. Text of the intake of `index-BnFvC-Ft.js` cites a file at r29 when
it had not changed since ("at r29"; `svn info` Last Changed Rev), else the release's delta units
(`$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/delta/units/`) or the file at r31 ("at r31"). Text of
the intake of `index-CBlEKxdL.js` cites files at r31, the state that release was read in; the checkout has moved to a
later release since (`wave-1/baseline.md`), so these are not the line numbers of today's checkout. Text of the intake of
`index-CIa0Ldj2.js` cites the source at r33 ("at r33"), `$KVADRO_ROOT/docs/api.md` at r35 ("(r35)"), the changelog at
r36 and the sync report of the release at r35, the state the release was read in on 2026-11-19 (15:12 – 15:27 +0500);
the "at r31" numbers of the previous intake are not today's. Text of the intake of `index-YX9bFVws.js` cites the
source at r38 ("at r38"), `$KVADRO_ROOT/docs/api.md` at r38 and the changelog and sync report at r39; the checkout is
at r39, whose source is unchanged since r38 (`svn info` Last Changed Rev). Other line numbers are those of the audited
tree. The
Telegram WebApp integration is in [`05-telegram-miniapp-audit.md`](05-telegram-miniapp-audit.md) (`TMA-NNN`). Endpoints
are named by `METHOD path`; their `API-NNN` ids are in `08-api-inventory.md`. The machine-readable screen list is
[`data/screens.json`](data/screens.json).

How this audit was made: by reading the code only. Nothing was built or run, so no item is `RUNTIME_VERIFIED`. The
recovery itself was checked against the production bundle by 79 differential parity scenarios at the audit, by 109
at `index-DY_DH7h-.js` (57 screens and sheets, ten of them for SCR-046 and SCR-047; 36 filter; 16 GL;
`$KVADRO_ROOT/CLAUDE.md:26-28`), by 119 at `index-BnFvC-Ft.js` (67 screens and sheets, ten more for SCR-048; 36 filter;
16 GL; `$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md:54-56,86`), by 137 at
`index-CBlEKxdL.js` (85 screens and sheets, 18 more for the owner cabinet; 36 filter; 16 GL), plus two
bundle-against-source stands of 45 scenarios (the list and the panel of the owner cabinet) and 88 (its form and place
picker) (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-18_index-CBlEKxdL/REPORT.md:77-89`), and by 169 at
`index-CIa0Ldj2.js` (113 screens and sheets, 28 of them new; 36 filter; 20 GL, four of them new;
`$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/REPORT.md:66-67` at r35; the total of 20 GL scenarios is
the report's, only the four new ones were counted, and its results were not reproduced), and by 186 at
`index-YX9bFVws.js` (130 screens and sheets, 17 of them new; 36 filter; 20 GL;
`$KVADRO_ROOT/demo/app/docs/releases/2026-11-20_index-YX9bFVws/REPORT.md:91-97` at r39; legacy's own figures, not
reproduced here). Those ran on mocks that the
recovery authors inferred from the code, not on the real API (`$KVADRO_ROOT/demo/app/tools/parity/README.md`,
`$KVADRO_ROOT/CLAUDE.md` "Commands"); the mocks of the owner cabinet and of the contact request are theirs too
(`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:253-301` at r31), and since `index-CIa0Ldj2.js` the mocks take the
options `session`, `frozenClock` and `noSdk` (`$KVADRO_ROOT/demo/app/tools/parity/README.md:40-45` at r33). Code that
the recovery reconstructed by guesswork carries `// TODO: inferred from build` and is `UNVERIFIED` here; §6 has the
list. The owner files of `index-CBlEKxdL.js` carry no such mark.

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
   enum can therefore white-screen the app (LB-APP-002, LB-APP-015, LB-APP-016). Since release `index-CIa0Ldj2.js` `t()`
   falls back instead of throwing (§3.1); the owner dictionary's own lookup does not (LB-APP-064).
5. **Session-only state and the map stack need explicit decisions.**
   - Favourites, "seen" and locally hidden maps live only in memory (`App.jsx:65-73`).
   - Thirteen `kv-*` localStorage keys (ten at the audit; `kv-visits` since release `index-DY_DH7h-.js`; `kv-req-tip`
     and `kv-owner-tip` since `index-CBlEKxdL.js`) and their Telegram DeviceStorage mirror must keep their names, or
     users lose client settings (§3.2). Release `index-CBlEKxdL.js` also brings the first sessionStorage key,
     `kv-own-focus`, and release `index-CIa0Ldj2.js` a second, `kv-start-done` (§3.2).
   - The map is two parallel implementations (MapLibre GL and Leaflet) with different behaviour (SCR-011).
   - The radar tab sends 3 requests per subscription (LB-APP-036).
6. **Since release `index-CBlEKxdL.js` the Mini App is also an owner's tool.** The cabinet «Сдать квартиру» (SCR-049 to
   SCR-060) has 17 methods of its own under `/api/owner/*`. The owner's phone is confirmed through the bot:
   `WebApp.requestContact` gives the app only a yes or a no, and the app then polls the server for the result
   (BR-APP-084, TMA-034). An unknown enum value or dictionary key crashes its screens (LB-APP-064). The listing screen
   changes for every owner's listing as well: an owner chip with an info sheet, a section «Хозяин — со слов объявления»,
   and a request instead of a call for an owner who hides the number (SCR-061, SCR-062, BR-APP-098 to BR-APP-103).
7. **Release `index-CIa0Ldj2.js` repairs part of what this audit recorded, and changes the contract.** It fixes or
   half-fixes eleven defects recorded here: LB-APP-017 and LB-APP-025 are fixed, and LB-APP-002, LB-APP-008,
   LB-APP-011, LB-APP-022, LB-APP-027, LB-APP-029, LB-APP-044, LB-APP-046 and LB-APP-058 in part (§5, §5b). It adds the states the
   audit had called missing: a listing that is gone, the day limit and the map errors (SCR-019, SCR-008, SCR-011). It
   keeps the search feed and its scroll position across the tabs and the map, and offers «Показать N новых» after a long
   absence (SCR-063, BR-APP-104, BR-APP-105). And it changes four contract points that older cached bundles do not know
   (`08` API-011, API-029; `02` BR-API-195, BR-API-196).
8. **Release `index-YX9bFVws.js` is motion and small UX on screens that exist, plus two ways into the owner cabinet
   and a survey change.** Sheets, settings sub-pages, toasts and tips now leave with an animation (§1.2, BR-APP-112);
   counters roll, save buttons show a busy and a done phase, the favourite heart plays on every tap, action toasts show
   a countdown ring, the owner form's photos show an upload ring, and the segmented control has a sliding thumb
   (BR-APP-113, BR-APP-114, BR-APP-117 to BR-APP-121). The search feed and the listing screen invite owners into the
   cabinet (BR-APP-115), and the «Нашли жильё?» survey gains a step and a «Отправить хозяину» block (BR-APP-116). The
   contract gains one field on the listing card, `owner_entry`, and two journal events (§3.3); there is no new
   endpoint (55 methods), and by the legacy documents no dependency, asset, `index.html` or CSP change
   (`$KVADRO_ROOT/docs/api.md:12,368`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:29` and
   `$KVADRO_ROOT/demo/app/docs/releases/2026-11-20_index-YX9bFVws/REPORT.md:27-29,76-77,81` at r39).

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
  - since release `index-CBlEKxdL.js`: `ownerFormId` (the owner form is open when it is `null`, for a new draft, or an
    owner listing id) and `ownerVersion` (the Settings group and the owner panel read their data again when it changes)
    (`App.jsx:133-148`, `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:101-107` at r31)
  - since release `index-CIa0Ldj2.js`: `savedVersion`, a refresh counter of «Сохранённые» beside `feedVersion`
    (BR-APP-058); the scroll memory of the search feed (BR-APP-105); the count of the fresh pill and the time the
    current feed was created, which is the pill's `since` (SCR-063, BR-APP-104); and a reference to the listing of the
    launch link (BR-APP-108) (`App.jsx:244-264,399-435,662-673` at r33)
- **Render order.** One base layer is chosen by `tab`/`view` (`App.jsx:484-528`). Overlays are rendered after it in a
  fixed JSX order (`App.jsx:546-670`): sort, listing, radar editor, filters, create radar, home nudge, follow nudge,
  quick filter, city picker, first-launch city picker, toast. Later siblings paint on top at equal z-index; the CSS
  z-index layers are in §3.6. Since release `index-CBlEKxdL.js` the JSX also holds the tab tip of SCR-060
  (`App.jsx:719-734` at r31) and the lazy owner form layer of SCR-050, rendered once meta is loaded (`App.jsx:801-822`
  at r31; z 46). Since release `index-CIa0Ldj2.js` the search `ListingFeed` is always rendered, inside a wrapper that is
  `display: contents` in the list view of the search tab and `display: none` otherwise, and «Сохранённые» is a second
  `ListingFeed`, rendered only on its tab (`App.jsx:841-892` at r33; BR-APP-105). Up to `index-CBlEKxdL.js` one
  `ListingFeed` served both and was unmounted on the map, the radar tab and the settings tab (the release's unit
  `002-removed-App.js:818-846`).
- **Portals.** `MarketSheet` and `FoundSheet` render into `document.body` through `createPortal`
  (`$KVADRO_ROOT/demo/app/src/features/listing/MarketSheet.jsx:161-220`,
  `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:124-182`).
- **Hook order is fragile.** The recovery documents it as fragile and it must not be reordered in the legacy tree
  (`App.jsx:49`, `$KVADRO_ROOT/CLAUDE.md` "Hard constraints"). This does not bind the port.
- **Screen-name precedence for analytics** (`$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:26-44`):
  `listing > radar/edit > radar/new > filters > filters/<kind> > sort > city > map/draw > tab screen`. Tab screens are
  `search/list`, `search/map`, `saved/favorites`, `saved/history`, `subs`, `settings`. Since release `index-CBlEKxdL.js`
  there are two more names, `owner/form` (any step of the owner form) and `owner/mine` («Мои объявления»). Of the three,
  `listing` wins over `owner/form`, which wins over `owner/mine`, so a form opened over a listing is reported as
  `listing` (`useScreenTracking.js:30-51` at r31). Their place among the other names of the chain is not recorded here.
  Since release `index-CIa0Ldj2.js` the App sends no `$pageview` while a listing is open: the listing screen sends it,
  as `listing` or as the new name `owner/listing` (SCR-018). The App still sets the error-report screen to `listing`
  (`useScreenTracking.js:54-57` at r33).
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
  - Since release `index-CIa0Ldj2.js` a handler always goes on the stack, also while the SDK is absent.
    `syncBackButton()` binds and shows the button when the stack is not empty and the SDK exists, unbinds and hides it
    when the stack empties, and runs again from `initTelegramApp()`, so handlers registered before a late SDK start to
    work (`buttons.js:17-27,36-46,58-69` at r33; `webApp.js:203-205` at r33; `05` TMA-022). Up to `index-CBlEKxdL.js` a
    handler registered without the SDK was dropped (the release's unit `098-modified-pushBackHandler.jsx.diff`).
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
  - Since release `index-CBlEKxdL.js`, the layers of the owner cabinet (line numbers at r31; the table is in SCR-050):
    - the lazy frame of a page whose chunk is loading or failed to load: Back closes the page
      (`$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx:97-118`);
    - the owner form: with the photo menu open, Back closes the menu; on the first map step it closes the whole form; on
      the steps «phone» and «mode» and on the rejection state it returns to the questionnaire and restores its scroll
      position; otherwise it closes the form. Every Back from the form gives a light haptic
      (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:370-385`);
    - the place picker opened from the form (`.../owner/PlacePicker.jsx:51-52`);
    - the limit sheet (`.../settings/OwnerLimitSheet.jsx:17-32`);
    - «Мои объявления» and «Отклики», through SubPage (`SubPage.jsx:19-27`); «Отклики» opened from the owner panel is an
      overlay with its own Back.
    - They stack in mount order: the lazy frame pushes its close while the chunk loads, then the form pushes its own
      handler, and an open picker pushes its own close.
- **No Back handler:** the base tabs, the map selection card (SCR-013, LB-APP-024), the follow, return and home nudges,
  the in-feed radar card, toasts and the first-launch city picker. With an empty stack, Telegram's BackButton is hidden.
- **SettingsButton** (Telegram 7.0+). Up to `index-CBlEKxdL.js` it closes the listing, filters and radar editor and
  switches to the settings tab (`useTelegramButtons.js:10-23`); it does **not** close sort, quick filter, city picker or
  the create-radar sheet. Since release `index-CIa0Ldj2.js` its handler gives a light haptic, closes the listing, the
  filters sheet, the radar editor, the radar-create sheet, the quick filter, the city picker and the sort sheet,
  remembers the scroll position of the search feed (BR-APP-105), opens the settings tab and scrolls to the top
  (`useTelegramButtons.js:12-40` at r33; `05` TMA-023). It does not close the owner form or «Мои объявления»
  (LB-APP-046). The button is bound lazily, like Back: `showSettingsButton` became `setSettingsHandler`, and
  `syncSettingsButton()` needs Bot API 7.0 or later (`buttons.js:76-85` at r33).
- **Close cross without the SDK** (since release `index-CIa0Ldj2.js`). While the Telegram SDK is absent, the listing
  layer, every settings sub-page and the owner form layer show a close button of their own, `FallbackClose`
  (`$KVADRO_ROOT/demo/app/src/components/FallbackClose.jsx:12-21` at r33; `05` TMA-047).
- **Swipe-back.** `useSwipeBack` (`$KVADRO_ROOT/demo/app/src/hooks/useSwipeBack.js:24-148`) is a rightward swipe:
  - start threshold 10 px; close at 33% of width or 0.5 px/ms; settle 180 ms;
  - disabled on Android (`:27`) and inside `.strip, .scroll, .leaflet-container, input, textarea, select, [data-no-swipe]`;
  - used by ListingScreen, but only when nothing is open over it (`ListingScreen.jsx:89-93`), and by SubPage
    (`SubPage.jsx:19`);
  - since release `index-CBlEKxdL.js` (`useSwipeBack.js:15-16,65-76,128-138` at r31): a layer marked `data-edge-swipe`
    (only the owner's place picker, SCR-051) takes the swipe only from the left 24 px, and the exclusion list does not
    apply to it; a touch inside a nested `.subpage` of the layer belongs to that sub-page (only the owner cabinet nests
    them: «Отклики» inside «Мои объявления», and the lazy frame); after a closing swipe the inline styles are removed
    300 ms after `onBack`, if the layer is still in the document;
  - since the same release the listing closes without its leave animation after a swipe (`onCloseNow`,
    `ListingScreen.jsx:120-133` at r31), and the layers of the owner cabinet take the swipe as the table of SCR-050
    says: the form on its loading, error, limit, questionnaire and done views, but not on the steps «phone» and «mode».
- **Sheet drag-to-close.** `useSheetDrag` (`$KVADRO_ROOT/demo/app/src/hooks/useSheetDrag.js:41-212`) works on the
  sheet's handle area:
  - start threshold 6 px; close at 25% of height or 0.5 px/ms; settle 200 ms;
  - the backdrop dims with the drag;
  - it blocks page scroll under sheets (allowing horizontal chip strips and the sheet body to scroll) and ref-counts
    `body.sheet-open`.
  - Tapping the backdrop closes every sheet except the first-launch city picker.
- **Leave animation** (since release `index-YX9bFVws.js`; BR-APP-112). `$KVADRO_ROOT/demo/app/src/lib/leave.js` (a new
  file) plays a leave on a copy of a node that React unmounts. The cleanup of a layout effect or of a React 19 ref
  callback takes a deep clone while the node is still in the document (`leave.js:145-158,195-216` at r38). In a
  microtask the clone gets the class `leave`, `aria-hidden` and `inert`, goes back into the old parent before the old
  next sibling (or last, when that sibling moved), gets the scroll positions of the node and its descendants, and
  animates through the Web Animations API with `fill: forwards`. It is removed when every animation has finished, and in
  any case after 600 ms (`leave.js:159-186`). `.leave, .leave *` switch off CSS animations, transitions and pointer
  events (`$KVADRO_ROOT/demo/app/src/styles/filters.css:63-67` at r38), so the entrance keyframes do not replay on the
  copy.

  | Kind | Animation | Callers (at r38) |
  | ---- | --------- | ---------------- |
  | sheet | 280 ms: the backdrop to a transparent background (`ease-out`), the sheet (`.csheet` / `.fsheet`, else the first child) to `translateY(100%)` (`cubic-bezier(0.3, 0, 0.2, 1)`), any other child to opacity 0 over 160 ms (`leave.js:18-64`) | the eleven sheets that use `useSheetDrag`, whose new layout effect hands the sheet's parent to the leave (`useSheetDrag.js:46-51`): FoundSheet, RadarSheet, SortSheet, FiltersSheet, OwnerLimitSheet, QuickFilterSheet, CityPicker, OwnerInfoSheet, ListingActionsSheet, ContactRequestSheet and MarketSheet. The effect is not tied to the `enabled` flag of the hook, so the first-launch city picker leaves too (`CityPicker.jsx:30`) |
  | sub-page | 200 ms: `translateX(24%)` and opacity 0, `cubic-bezier(0.4, 0, 1, 1)` (`leave.js:71-85`) | `SubPage`, so every settings sub-page, «Мои объявления» and «Отклики» (`$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx:31`) |
  | toast | 180 ms: `translateY(10px)` and opacity 0, the same curve (`leave.js:88-102`) | both kinds of `Toast` (`$KVADRO_ROOT/demo/app/src/components/Toast.jsx:81,87`) |
  | tip | 160 ms: `translateY(-6px) scale(0.92)` and opacity 0, the same curve (`leave.js:105-119`) | the owner chip's tip and `ReqTip` (`$KVADRO_ROOT/demo/app/src/features/listing/OwnerChip.jsx:72`, `$KVADRO_ROOT/demo/app/src/components/ReqTip.jsx:55`) |

  No leave plays:
  - under `prefers-reduced-motion` or in lite graphics (`html.lite`) (`leave.js:122-124`); `leave.js` is the only file
    of the release that checks lite;
  - after a gesture close: the node, or one of its direct children, has `data-gone` or an inline `transform`
    (`leave.js:131-134`). A sheet closed by a drag is marked `data-gone` before `onClose`, a mark new in this release
    (`useSheetDrag.js:186`); a
    swiped toast has an inline transform (`Toast.jsx:71-77`); a closing swipe-back leaves its inline transform on the
    layer until the reset 300 ms later, which runs only while the layer is still in the document
    (`$KVADRO_ROOT/demo/app/src/hooks/useSwipeBack.js:125-136`). That the swipe-back case is caught also relies on the
    layout-effect cleanup running before the hook's passive cleanup, which resets the styles (`useSwipeBack.js:150-157`;
    `inferred` from React's commit order);
  - for a node with the class `parked`, the radar sheet hidden under an open listing (`leave.js:146`; SCR-028);
  - when, in the microtask, the node is still in the document, its old parent is not (a whole subtree went), or a node
    matching the kind's selector (`.sheet-backdrop`, `.subpage`, `.toast`, `.owner-tip, .req-tip`) exists that was not
    there before the cleanup, so a toast replaced by another toast leaves no copy (`leave.js:150,160-165,219-221`).

  The listing layer keeps its own leave of release `index-CBlEKxdL.js` (SCR-018); the owner form layer, the place
  picker, the photo viewer and the fullscreen spot map have none.
- **Collapsing chrome.** Scrolling the search list down by more than 24 px past the anchor adds `html.chrome-mini`; it
  is always expanded within 60 px of the top (`$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js:4-85`). While
  collapsed, the first tap on the chrome (tab, view toggle, mini title) only expands it (`App.jsx:346-358`). Since
  release `index-CBlEKxdL.js` the open listing no longer switches it off: the condition is the search tab, not the map,
  and no filters sheet, radar editor or quick filter (`App.jsx:339-341` at r31; before: also no open listing). The
  chrome collapsed before a card opened is then still collapsed when the card closes (`inferred` from the condition; not
  seen running).

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
   - if `start_param` / `?listing=` names a listing, `prefetch('/api/listings/<id>')`. Since release `index-CIa0Ldj2.js`
     only while `sessionStorage['kv-start-done']` does not hold this launch and listing (BR-APP-106; `main.jsx:36-39` at
     r33).
   - `prefetch` does nothing without initData (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:35-43`).
   - Module-load side effects run even earlier: the i18n locale is detected (`$KVADRO_ROOT/demo/app/src/i18n/index.js:57`),
     the theme preference is read (`$KVADRO_ROOT/demo/app/src/lib/telegram/theme.js:20`) and `#tgWebAppData` is read
     from the hash (`$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:119`).
5. **`waitForTelegramSdk(3000, initTelegramApp)`** (`main.jsx:19,40`; `webApp.js:75-108`):
   - resolves at once if the SDK is present, the tag is missing or the SDK failed;
   - otherwise resolves on load, error or a 3 s timeout;
   - without an SDK it posts `web_app_ready` and `web_app_expand` straight to the native bridge (`webApp.js:16-40`);
   - a late SDK that carries initData is adopted and `initTelegramApp` runs again. Since release `index-CIa0Ldj2.js`,
     when the first render had no initData (SCR-002) and the SDK then loads with it, the App is also rendered again with
     a new key, which remounts it and restarts the launch (`main.jsx:41-64` at r33). Up to `index-CBlEKxdL.js` a late
     SDK only ran `initTelegramApp` (the release's unit `111-modified-v$stmt819.jsx.diff`).
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
     `GET /api/cities`. Since release `index-CIa0Ldj2.js` the `?radar=<id>` branch runs after `app_opened` and the
     `?news=pets` handling (BR-APP-107; `useAppBootstrap.js:135-149` at r33).
9. **First paint** shows the feed for the locally saved city before meta arrives (`App.jsx:52`).
   `useHomeScreenEvents` restores DeviceStorage keys and records the visit day (`$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:23-32`).
   Since release `index-DY_DH7h-.js`, once meta is loaded every search-tab visit is recorded per filter set in
   `kv-visits`, and once the radars are loaded the return banner may send `GET /api/feed/new` (BR-APP-070, BR-APP-071).
   Since release `index-CBlEKxdL.js` `App` also mounts the pending counter of the owner cabinet, so
   `GET /api/owner/pending` is sent at start and on every return to the app, for every user (BR-APP-091, LB-APP-066;
   `$KVADRO_ROOT/demo/app/src/lib/ownerPending.js:6-57`, `App.jsx:141-147` at r31). A launch with the `start_param`
   `owner_new` or `owner-new`, or with the page query `owner=new`, opens the owner form on a new draft; this is read
   once, when `App` mounts (TMA-046, BR-APP-075; `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:60-71`,
   `App.jsx:133-135` at r31). Since release `index-CIa0Ldj2.js` the listing of a launch link is the initial open listing
   only while `kv-start-done` does not hold it, and the mark is written once the card is on screen (BR-APP-106;
   `App.jsx:82-89` at r33).

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
| Lazy pages | Since release `index-CBlEKxdL.js` `LazyErrorBoundary` reports `render` for an error inside a lazy page or block; a chunk that fails to load shows an `ErrorState` whose retry imports it again (§1.9) | `$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx:81-83,146-209` (at r31) |
| Map views | Since release `index-CIa0Ldj2.js` `MapErrorBoundary` wraps the map views: it reports `render` and shows «Не загрузилось» with «Повторить» in place of the map (SCR-011), so a render error of a map view stays inside the map | `$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:21-41,44-76,81-112` (at r33) |
| Missing i18n key | Since release `index-CIa0Ldj2.js` `t()` and `plural()` report a missing key once per key as `app_error` with `kind: "error"`, `source: "i18n"` and `message: "i18n: no key <key> (<locale>)"`, inside the limit of 5 distinct errors per session, and return the ru entry or the key (§3.1, LB-APP-002) | `$KVADRO_ROOT/demo/app/src/i18n/index.js:110-125,180-193` (at r33); `errors.js:68-94` |
| Telegram callbacks | `safeCallback` re-throws asynchronously so a throw inside an SDK event does not break the SDK | `webApp.js:167-177` |
| API | `ApiError(status, detail)`; `status 0` with `detail` `timeout` or `network`; 15 s timeout; `detail` is taken only when it is a string | `client.js:9-111` |
| Screens | `ErrorState` distinguishes offline (`error.offline`) from server (`common.loadFailed`); the feed shows an inline retry when items already exist; since release `index-CIa0Ldj2.js` `ErrorState` also knows the day limit (SCR-008) | `$KVADRO_ROOT/demo/app/src/components/ErrorState.jsx:13-26`, `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:126-136` |
| Mutations | Most show `common.saveFailed` «Не получилось сохранить» as a toast. Several fail silently with haptic only (LB-APP-027); since release `index-CIa0Ldj2.js` those show it too (SCR-042). | §5b |

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
  Leaflet; it is not persisted (`$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:17-50`). Since release
  `index-CIa0Ldj2.js` the lazy map views are created by `createMapViews`, and «Повторить» of the map's error boundary
  (§1.6) creates new lazy components and mounts the map again, so a chunk that failed to load is requested again. A
  failed GL chunk still falls back to the Leaflet chunk without a message (`MapScreen.jsx:21-41,44-76,81-112` at r33).
  Up to `index-CBlEKxdL.js` the lazy components were module-level and had no boundary (the release's units `042` to
  `044`); that a rejected chunk then stayed rejected for the session is `inferred`.
- The listing mini-map uses the same engine choice (`$KVADRO_ROOT/demo/app/src/features/listing/spot/SpotMap.jsx:19-58`).
- Since release `index-CBlEKxdL.js` the place picker of the owner form follows the same engine choice and falls back to
  Leaflet when GL fails (SCR-051; `$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:98-114`,
  `$KVADRO_ROOT/demo/app/src/features/owner/pickMap.js:30-66,143-157` at r31).

### 1.9 Lazy chunks

- **Map:** `MapViewGL`, `MapView` (Leaflet), `spotGL`, `spotLeaflet`, MapLibre (vendored ESM), `pmtiles`, the
  `leaflet` / `protomaps-leaflet` basemap, and `MapCard` (lasso, selection card, pins)
  (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:28-43`). Since release `index-CBlEKxdL.js` Leaflet is its own chunk
  `leaflet-src` (still 1.9.4), and the GL style chunk is `glstyle`, renamed from `mapgl`
  (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:34` at r31).
- **Analytics:** `posthog-js` plus the `web-vitals-with-attribution`, `exception-autocapture`, `dead-clicks-autocapture`
  and `lazy-recorder` extensions (`analytics.js:128-134`).
- **Prefetch.** After 2.5 s on the list view, `preloadMapView()` and a tile prefetch run so that opening the map is fast
  (`$KVADRO_ROOT/demo/app/src/app/useMapTilePrefetch.js`, `$KVADRO_ROOT/demo/app/src/features/map/tilePrefetch.js:225-251`).
- **Owner cabinet** (since release `index-CBlEKxdL.js`; line numbers at r31):
  - three lazy chunks: `OwnerForm` (a layer; `$KVADRO_ROOT/demo/app/src/app/layers.js:5-8`), `OwnerListings` (a Settings
    page; `SettingsScreen.jsx:51-52`) and `OwnerPanel` (a block of the listing screen; `ListingScreen.jsx:41-42`)
    (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:10-12`);
  - the owner dictionary `owner.js` (`own.*`, §3.1) and `owner.css` travel in a shared `owner` chunk
    (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:1-5`; `CHANGELOG.md:13`);
  - `pickMap` is a second-level lazy import from `PlacePicker` (index → `OwnerForm` → `pickMap`). It in turn loads
    `leaflet-src` or `glstyle` (`$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:103-114`; `CHANGELOG.md:34`;
    `$KVADRO_ROOT/demo/app/docs/releases/2026-11-18_index-CBlEKxdL/REPORT.md:104-106`);
  - these stay in the main bundle: `ReqTip`, `OwnerLimitSheet`, `ownerPending`,
    `$KVADRO_ROOT/demo/app/src/lib/api/owner.js` and the 10 `own.*` keys of the main dictionaries (§3.1).
- **`LazyPage`** (since the same release; `$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx:11-67,97-209` at r31), used
  only for the three owner chunks:
  - while a chunk loads, a frame with the title and a spinner; a frame that has shown once does not replay its entrance
    (`.subpage.settled`);
  - a failed load shows an `ErrorState` whose retry imports the chunk again (through `reset()`);
  - 600 ms after the first lazy page or block is shown, every registered chunk is preloaded once.

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
- Since release `index-CBlEKxdL.js`: the pending counter of the owner cabinet (one number in module memory, BR-APP-091;
  `$KVADRO_ROOT/demo/app/src/lib/ownerPending.js:6-13` at r31); the unsent edits of the owner form, which live in
  component state until the next flush, with no local copy of a draft (BR-APP-079;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:245-337` at r31); and the reason an owner chose for a declined
  request (BR-APP-090).
- Since release `index-CIa0Ldj2.js` (all at r33): the scroll memory of the search feed (BR-APP-105; `App.jsx:400-414`);
  the count of the fresh pill and the time the current feed was created (SCR-063; `App.jsx:430-435`); the map camera
  memory, one per engine (BR-APP-111; `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapInstance.js:20`,
  `$KVADRO_ROOT/demo/app/src/features/map/leaflet/useLeafletMap.js:13`); the minute clock of the age labels (BR-APP-109;
  `$KVADRO_ROOT/demo/app/src/features/listing/minuteClock.js:4-43`); the time of the last refetch of the radar previews
  (BR-APP-063; `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:48-50`); the "subscribe is running" mark
  (BR-APP-041; `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:98-108`); the time of the last accepted call
  (BR-APP-033; `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:124`); and the set of `owner_attention`
  pairs already sent in this session (§3.3; `$KVADRO_ROOT/demo/app/src/lib/ownerAttention.js:5-22`).

The items up to release `index-DY_DH7h-.js`, except `sessionVisits`, are in `App.jsx` (`:65-90` in the audited tree).
The server is the source of truth after a reload (`item.favorite`, `item.viewed`, and hidden listings filtered
server-side). The settings tab's hidden screen resets `hidden` to `{}` after any change (`App.jsx:499`). Since release
`index-CIa0Ldj2.js` such a change also drops the feed scroll memory and re-creates the search feed (SCR-039).

### 1.12 Server-formatted vs client-formatted values

- **Server strings rendered as-is or lightly split by the client:**
  - `title` / `short_title`: first part before « · » (`format.js:9`).
  - `price`: first part, with parentheses removed and split at `/` into amount and period (`format.js:16-32`); the CTA
    bar shows the bracket text and the remaining parts as a note (`$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:21-25`).
  - `age`: second part (`format.js:129-134`); since release `index-CIa0Ldj2.js` only as the fallback of the age label,
    which the client computes from `posted_at` (BR-APP-109; `format.js:141-166` at r33).
  - `status_text`, `market`, `district_name`, `landmark`, `owner`, `phone_display`, `summary`, `facts[].label/value`,
    `history[].text`, `offers[].text`.
  - map `label`, injected as HTML in Leaflet and GL stack pins (LB-APP-020).
  - `flow.options[].label/rate`, `meta.*.name`, `settings.locales/currencies[].name`.
- **Client-formatted:** prices in `MarketBlock`, `MarketSheet`, `HistorySection`, typical price, presets, the filter
  summaries and input fields (`money.js`); counts and distances (`format.js`, `$KVADRO_ROOT/demo/app/src/lib/format.js`);
  dates (`i18n/index.js:83-93`). Since release `index-CIa0Ldj2.js` also the age label (BR-APP-109) and the floor words
  «цокольный этаж» and «подвал» (BR-APP-110); the dates and times of the price history are formatted in Asia/Tashkent
  (BR-APP-069; `i18n/index.js:86-104` at r33).
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
- **Opens:** `!hasInitData()` (`$KVADRO_ROOT/demo/app/src/app/App.jsx:228-230`). **Closes:** never up to
  `index-CBlEKxdL.js`; since release `index-CIa0Ldj2.js` the screen is left when a late SDK brings initData: the App is
  rendered again and the launch restarts (§1.3; `$KVADRO_ROOT/demo/app/src/main.jsx:41-64` at r33).
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

- **Purpose:** explains why `GET /api/meta` answered `403` (closed beta, private bot, blocked user, "press Start first";
  since release `index-CIa0Ldj2.js` also a paused bot) and offers a way out.
- **Opens:** `useAppBootstrap` 403 handler, with `reason = error.detail ?? 'private'`
  (`$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:130-139`).
- **Closes:** automatically when a later meta retry succeeds, which clears `noAccessReason` (`useAppBootstrap.js:77-78`).
- **Layout:** `main.lang-pick` with a Lock icon, h1, text, an optional «checking» line and a list of large buttons
  (`$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:41-87`).
- **Reasons:** `private | invite | full | blocked | join`; anything else renders as `private`
  (`NoAccessScreen.jsx:13,22`). Since release `index-CIa0Ldj2.js` also `paused` (`NoAccessScreen.jsx:13,22` at r33;
  `$KVADRO_ROOT/docs/api.md:69-75` (r35)). Up to `index-CBlEKxdL.js` that value was unknown and rendered as `private`,
  with the source passed to the bot link.
- **Titles and texts** (ru, `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:28-37`):

  | Reason | Title (`noAccess.title.*`) | Text (`noAccess.text.*`) |
  | ------ | -------------------------- | ------------------------ |
  | `private` | «Бот приватный» | «Приложение сейчас доступно только команде kvadro².» |
  | `invite` | «Вход по приглашению» | «Войти можно по ссылке-приглашению: откройте её и нажмите «Старт» в боте.» |
  | `full` | «Мест пока нет» | «Сейчас все места заняты. Попробуйте позже.» |
  | `blocked` | «Нет доступа» | «Доступ к приложению закрыт.» |
  | `join` | «Сначала — бот» | «Нажмите «Старт» в боте — после этого приложение откроется.» |
  | `paused` (since release `index-CIa0Ldj2.js`) | «Бот на паузе» | «Скоро вернёмся. Ваши Радары и избранное на месте.» |

  The uz and en equivalents are in the locale files, e.g. en «This bot is private», «Invite only», «No spots yet»,
  «No access», «Start with the bot». For `paused`: uz «Bot pauzada» / «Tez orada qaytamiz. Radarlaringiz va
  saralanganlaringiz joyida.», en «The bot is paused» / «We’ll be back soon. Your Radars and favorites are safe.»
  (`ru.js:36,42`, `uz_Latn.js:34,40`, `en.js:34,40` at r33).
- **No beta wording since release `index-Dbpp463V.js`:** two texts were reworded, the reason codes and the gate logic
  stayed (`ru.js:29,35`; `uz_Latn.js:27,33`; `en.js:27,33`;
  `$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md:20-22`):
  - `noAccess.title.invite`: «Закрытая бета» / «Yopiq beta-talqin» / «Closed beta» became «Вход по приглашению» /
    «Taklif orqali kirish» / «Invite only»;
  - `noAccess.text.full`: «Все места в бете заняты. Попробуйте позже.» / «Betada joy qolmadi. Keyinroq urinib koʻring.»
    / «All beta spots are taken. Please try again later.» became «Сейчас все места заняты. Попробуйте позже.» /
    «Hozir joy qolmadi. Keyinroq urinib koʻring.» / «All spots are taken right now. Please try again later.».
- **Reworded in release `index-CBlEKxdL.js`:** `noAccess.text.private`: «Приложение сейчас доступно только владельцу.» /
  «…faqat egasi uchun ochiq.» / «…only to its owner for now.» became «Приложение сейчас доступно только команде
  kvadro².» / «Ilova hozir faqat kvadro² jamoasi uchun ochiq.» / «The app is available only to the kvadro² team for
  now.» (`ru.js:33`, `uz_Latn.js:31`, `en.js:31` at r31; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:29` at r31).
- **Checking line:** `noAccess.checking` «Только что нажали «Старт»? Подождите пару секунд — проверяем доступ…».
  Shown while an automatic re-check is pending: 3 tries at 2.5 s, never for `blocked`. Since release `index-CIa0Ldj2.js`
  `paused` is re-checked like the other reasons, also on a return to the app; only `blocked` is not
  (`useAppBootstrap.js:155-165,175-182` at r33).
- **Actions:**
  - «📢 Открыть пост в канале» (`noAccess.openPost`): only if `start_param` matches `l_<id>-[seo-]<channel>-<post>`; opens
    `https://t.me/<channel>/<post>` (`$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:48-54`).
  - Main button: «Перейти в бота» (`noAccess.toBot`) opens
    `https://t.me/<bot>?start=s_<source>[--l<listingId>]` when the bot username and a `l_…` source are known and the
    reason is not `blocked`. Otherwise «Вернуться в бот» (`noAccess.back`) calls `WebApp.close()`
    (`NoAccessScreen.jsx:61-73`). Since release `index-CIa0Ldj2.js` no source is passed for `paused` either: for
    `blocked` and `paused` the button reads «Вернуться в бот» and only closes the Mini App; the «open post» and support
    buttons keep their own conditions (`NoAccessScreen.jsx:26,40,72-81` at r33).
  - «Написать в поддержку» (`settings.support`): `https://t.me/<support>` when `/api/bot` returns `support`.
  - Since release `index-CIa0Ldj2.js` the source `seo` carries the interface language in the bot link: `seo_en` for en
    and `seo_uz` for uz_Latn. ru stays `seo`, and the other sources (`web`, the campaign codes, `share`) are unchanged
    (`NoAccessScreen.jsx:41-47,72-75`, `startParam.js:69-79` at r33).
- **APIs:** `GET /api/bot` (plain `fetch`, no Authorization; `$KVADRO_ROOT/demo/app/src/lib/api/meta.js:15-23`). The
  re-tries of `GET /api/meta` come from the bootstrap.
- **Localization:** before showing, the locale is set from the Telegram language (`useAppBootstrap.js:132`), so this
  screen can appear in en while SCR-001 cannot.
- **Access:** this is the closed-beta gate.
- **Analytics:** no `app_opened` (`$KVADRO_ROOT/docs/api.md` §11). `$pageview` is not sent because analytics is not
  initialised.
- **Edge cases:** `getStartSource()` returns `web`, a campaign code `fb|tg|ig<1-4 digits>`, `seo` or `share`
  (`startParam.js:32-42`). Without a start param the button falls back to "close".
- **Sources:** `NoAccessScreen.jsx:1-88`, `useAppBootstrap.js:127-140`; since release `index-CIa0Ldj2.js` the legacy
  parity scenario `no-access-paused` (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:512-559` at r33).
- **Status:** CONFIRMED. Whether the gates are active in production is unknown, `paused` included (Q-APP-014).

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
- **States:** saving disables all buttons. On error up to `index-CBlEKxdL.js`: error haptic, buttons re-enabled, no text
  (LB-APP-027). Since release `index-CIa0Ldj2.js` a failed save also shows «Не получилось сохранить» as a line under the
  list (`role="alert"`), and the next attempt clears it (`LanguagePicker.jsx:25,29-46,66-70` at r33).
- **Storage:** writes `kv-locale` (mirrored to DeviceStorage).
- **Analytics:** none specific.
- **Sources:** `LanguagePicker.jsx:22-64`.
- **Status:** CONFIRMED.

### SCR-005 — First-launch city picker (`sheet`, blocking)

- **Purpose:** asks «Где ищете жильё?» (`city.firstTitle`) when the server does not know the user's city.
- **Opens:** all of: more than one city in `meta.cities`, `meta.city_chosen === false`, not picked this session, and no
  listing open (`App.jsx:257, 660-669`).
- **Closes:** only by picking. `onClose` is a no-op; there is no Back handler and no drag-to-close
  (`$KVADRO_ROOT/demo/app/src/features/city/CityPicker.jsx:22-30`); a backdrop tap is ignored (`:56-61`). Since release
  `index-YX9bFVws.js` the pick plays the sheet leave of BR-APP-112: the leave effect of `useSheetDrag` does not depend
  on the hook's `enabled` flag, which is false here (`CityPicker.jsx:30`, `$KVADRO_ROOT/demo/app/src/hooks/useSheetDrag.js:43-51`
  at r38).
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
  - `button.mini-top.glass`: collapsed one-line title `«<deal> · <filtersSummary>»`, search tab only
    (`App.jsx:446-456`). Since release `index-CIa0Ldj2.js` daily rent shows the summary alone, which already holds
    «Посуточно» (BR-APP-064; `App.jsx:520-524` at r33).
  - `header.topbar` (`$KVADRO_ROOT/demo/app/src/app/TopBar.jsx:48-134`). Variants:
    - search list: title tabs «Аренда» / «Продажа» (`deal.rent_long` / `deal.sale`; daily rent counts as «Аренда»)
      plus the FeedHeader chips (SCR-007); since release `index-CIa0Ldj2.js` the fresh pill hangs under the top bar here
      (SCR-063);
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
  - Pull-to-refresh indicator (SCR-010) and decorative `mini-ring` spans; since release `index-CIa0Ldj2.js`
    «Сохранённые» has a refresh counter of its own (BR-APP-058).
  - `nav.tabbar.glass`: 4 tabs with lucide icons at 24 px. Labels longer than 13 characters get class `long`
    (`TabBar.jsx:12-33`). Since release `index-CBlEKxdL.js` the Settings tab carries a red dot while requests to the
    owner wait for an answer (SCR-060), and inactive tabs are tinted with `color-mix(var(--text) 55%)` instead of
    `opacity .55`, with a `@supports` fallback (`chrome.css:130-150` at r31); that the red dot is the reason for the
    tint is `inferred`.
- **Actions:**
  - tab press: light haptic, clears radar-return, `scrollTo(0,0)`; since release `index-CIa0Ldj2.js` leaving the list
    view of the search tab first saves the scroll position of the search feed, and a second tap on the current tab drops
    it (BR-APP-105; `App.jsx:538-549` at r33);
  - deal switch: keeps geography, resets other filters (BR-APP-002);
  - view toggle; since release `index-CIa0Ldj2.js` the switch to the map saves the scroll position of the search feed
    (BR-APP-105);
  - mini-title tap: expands the chrome.
  - the Telegram Settings button (`05` TMA-023): since release `index-CIa0Ldj2.js` it closes every sheet and remembers
    the scroll position of the search feed (§1.2).
- **APIs:** `GET /api/subscriptions` on entering the search tab and after radar changes (`App.jsx:173-177`);
  `GET /api/cities` each time the filters sheet opens (`App.jsx:167-171`). Since release `index-CBlEKxdL.js` also
  `GET /api/owner/pending`, at start and on every return to the app (BR-APP-091). Since release `index-CIa0Ldj2.js` also
  `GET /api/feed/new` for the fresh pill (SCR-063).
- **Analytics:** `$pageview` for `search/list`, `search/map`, `saved/favorites`, `saved/history`, `subs`, `settings`.
- **Adaptive:**
  - safe-area padding via `--top-inset` / `--bottom-inset` built from Telegram CSS variables;
  - `html.fullscreen` centres the mini title in Telegram's header row (`$KVADRO_ROOT/demo/app/src/styles/chrome.css:223-230`);
  - no width breakpoints; a phone layout only, with the feed limited to a 608 px column (`$KVADRO_ROOT/demo/app/src/lib/images.js:34`).
- **Animation:** the chrome collapses with a `clip-path` morph (translate in lite) over 0.35–0.45 s; the tab lens moves
  with a spring easing (`chrome.css:100-319`). Since release `index-CBlEKxdL.js` the collapsed chrome stays collapsed
  under an open listing (the effect is `inferred` from the code, §1.2). Since release `index-YX9bFVws.js` the tab bar's
  clip and the view toggle's transform and clip run on `--ease-spring` (overshoot 1.2 instead of 1.1), the tab lens too
  (1.2 instead of 1.35), and the clip masks of the tab bar and the view toggle are rounded by `999px`
  (`chrome.css:109,120,216-217,268,271,296,309` at r38; §3.6). The map bar's deal control has the sliding segmented
  thumb (BR-APP-121; `TopBar.jsx:67` at r38).
- **Sources:** `App.jsx:440-545`; `TopBar.jsx`; `TabBar.jsx`; `ViewToggle.jsx`;
  `$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js`; since `index-CBlEKxdL.js` also
  `$KVADRO_ROOT/demo/app/src/styles/red-dot.css` and `$KVADRO_ROOT/demo/app/src/lib/ownerPending.js`; since
  `index-CIa0Ldj2.js` also `$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js`.
- **Status:** CONFIRMED.

### SCR-007 — Search feed: list (`screen`)

- **Purpose:** the main infinite list of listings for the current filters and sort.
- **Opens:** default on start (`tab = 'search'`, `view = 'list'`).
- **Closes:** by switching tab or view. Since release `index-CIa0Ldj2.js` the list is then only hidden, not unmounted:
  its loaded pages and its scroll position survive the map and the other tabs (BR-APP-105).
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
  - badge tag of a kind (BR-APP-026; since release `index-CBlEKxdL.js` `warn` orange, `verified` with a green
    `ShieldCheck`, `quiet` grey and medium weight, «Ниже рынка» plain; `ListingCard.jsx:60-61`,
    `$KVADRO_ROOT/demo/app/src/styles/listing-card.css:160-181` at r31), favourite heart, «viewed» eye (aria
    `card.viewedTitle`), `status_text` warning tag;
  - price `main` + `period` + the price-kind label, or «Цена договорная» (`card.negotiable`). The label
    (`priceKindLabel`, `$KVADRO_ROOT/demo/app/src/features/listing/format.js:35-43`; `ListingCard.jsx:74`) is
    «· первый взнос» (`card.downPayment`) for `price_kind: "down_payment"` and, since release `index-Dbpp463V.js`,
    «· цена за бизнес, помещение в аренде» / «biznes narxi, joy ijarada» / «business price, premises rented»
    (`card.businessPrice`, `ru.js:103`, `uz_Latn.js:101`, `en.js:101`) for `"business"`; any other value has no
    label (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md:14-15`). The same card, and so
    the label, appears in favourites, history and the compact map card (SCR-013);
  - market delta chip (`listing.marketDelta` «{delta} к рынку», or the short verdict);
  - facts line `title · area · floor · market · 🐾`, then age; since release `index-CIa0Ldj2.js` the floor reads
    «цокольный этаж» for `0` and «подвал» for a negative value (BR-APP-110), and the age is a label that the client
    computes from `posted_at` and keeps current with a minute clock (BR-APP-109);
  - location line `district · landmark · metro|center distance`.
- **Loading:** 3 skeleton cards on the first page; a spinner at the sentinel for later pages (SCR-008).
- **Pagination:** `GET /api/feed?…&limit=20[&sort][&cursor]`. The next page loads when the sentinel is within 800 px.
  Items are deduplicated by id (`$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:14-63`).
- **Recreation:** the list is re-created (`key`) on any change of filters, sort or `feedVersion` (pull-to-refresh)
  (`App.jsx:516`). Since release `index-CIa0Ldj2.js` the key is `${feedVersion}:${sort}:${JSON.stringify(filters)}`
  (`App.jsx:399` at r33). The next page is requested by an `IntersectionObserver` on the sentinel
  (`useInfiniteFeed.js:52-62` at r33), so a feed that is re-created while hidden asks for page one only when the list is
  shown again (`inferred`).
- **Visibility:** hidden listings are filtered locally (`ListingFeed.jsx:81-86`). The first 2 cards load their photo
  eagerly with high priority.
- **Block inside the list** (since release `index-DY_DH7h-.js`): the search list takes an `inline` block and renders it
  after the 8th visible card, or after the last card when the list is shorter, fully loaded and shows no few-results
  note (`ListingFeed.jsx:98-106,128-139` at the pin). That block is the in-feed radar card SCR-047. The return banner
  SCR-046 floats above the list. Since release `index-CIa0Ldj2.js` the fresh pill SCR-063 can hang under the top bar.
- **End of the list** (since release `index-YX9bFVws.js`; BR-APP-115). On the search tab, when the list is loaded to
  its end without an error and shows at least one card, a block `.feed-end` follows the last card: the line «Это всё по
  вашему поиску» (`feed.end`), left out while the few-results note shows, and the owner invitation row «Сдаёте квартиру?
  Разместите бесплатно» with a house icon and a chevron (`OwnerEntryRow`, `src: "feed_end"`)
  (`$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:161-172`,
  `$KVADRO_ROOT/demo/app/src/features/feed/OwnerEntry.jsx:22-31`, `$KVADRO_ROOT/demo/app/src/styles/found.css` `.feed-end`,
  `.own-entry-row` at r38). The App passes the handler only while the tab is search (`App.jsx:913` at r38), so
  favourites and history show neither. `feed.end` exists only inside this block; there is no end line without the
  invitation (LB-APP-089). With no card the invitation is the line of SCR-009.
- **Actions:**
  - open a card: `openListing(id, item)` adds it to `seen` and passes the card as `preview`;
  - favourite toggle: optimistic `POST /api/listings/:id/favorite`, with the server result applied
    (`$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:17-45`); since release `index-CIa0Ldj2.js` the request carries
    the wanted state, and a failure shows a toast (BR-APP-039); since release `index-YX9bFVws.js` every tap replays the
    heart's squash animation, and an add plays a burst of eight sparks (BR-APP-117; `FavButton.jsx:29-36,57-74` at r38);
  - header chips open SCR-014 to SCR-017;
  - since release `index-YX9bFVws.js` the invitation row opens the owner form or «Мои объявления» (BR-APP-115).
- **APIs:** `GET /api/feed` (the first page is prefetched in `main.jsx`); `POST /api/listings/:id/favorite`; since
  `index-YX9bFVws.js` `GET /api/owner/listings` from the invitation.
- **Storage:** `kv-city` through `getSavedCity` in the initial filters.
- **Analytics:** `$pageview search/list`. The first loaded photo resolves `markFirstContent()`, which starts PostHog
  loading (`$KVADRO_ROOT/demo/app/src/components/Photo.jsx:38-42`). Since release `index-YX9bFVws.js` the invitation
  sends `owner_entry {src: "feed_end"}` (§3.3).
- **Gestures:** horizontal photo swipe inside cards; pull-to-refresh; collapsing chrome.
- **Sources:** `App.jsx:403-418, 513-527`; `FeedHeader.jsx`; `ListingFeed.jsx`; `useInfiniteFeed.js`; `ListingCard.jsx`;
  `$KVADRO_ROOT/demo/app/src/components/PhotoStrip.jsx`; `Photo.jsx`; `FavButton.jsx`; since `index-CIa0Ldj2.js` also
  `$KVADRO_ROOT/demo/app/src/features/listing/minuteClock.js`.
- **Status:** CONFIRMED.

### SCR-008 — Feed loading and error states (`state`)

- **Applies to:** search, favourites and history lists (`ListingFeed.jsx:114-141`).
- **First load:** 3 `ListingCardSkeleton`s with a shimmer animation (`$KVADRO_ROOT/demo/app/src/components/ListingCardSkeleton.jsx`).
- **Error with no items** (not 403): `ErrorState` (`$KVADRO_ROOT/demo/app/src/components/ErrorState.jsx:13-26`):
  - offline (`status 0`): WifiOff icon, «Нет связи» (`error.offline`), «Проверьте интернет и попробуйте ещё раз.»
    (`error.offlineText`);
  - otherwise: CloudOff icon, «Не загрузилось» (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через
    минуту.» (`error.serverText`);
  - since release `index-CIa0Ldj2.js`, the day limit: status `429` with `detail` exactly `"too many today"`
    (`isDayLimitError`, `$KVADRO_ROOT/demo/app/src/lib/api/client.js:29-30` at r33) shows the CloudOff icon, «Лимит на
    сегодня» (`error.dayLimit`; uz «Bugungi limit tugadi», en «Daily limit reached») and «За сутки открыто очень много
    объявлений. Попробуйте позже — Радар продолжит присылать новые в чат.» (`error.dayLimitText`; uz «Bir kunda juda
    koʻp eʼlon ochildi. Keyinroq urinib koʻring — Radar yangilarini chatga yuborishda davom etadi.», en «You’ve opened a
    lot of listings in the past 24 hours. Try again later — Radar will keep sending new ones to the chat.»)
    (`ErrorState.jsx:14-25`, `ru.js:18-19` at r33). Any other `429` shows the server text;
  - button «Повторить» (`error.retry`).
- **Error with items, or a 403:** an inline button «Не загрузилось — повторить» or «Нет доступа — повторить»
  (`feed.retry` with `common.loadFailed` / `common.noAccess`).
- **Later pages:** spinner at the sentinel.
- **Where the day limit shows** (since release `index-CIa0Ldj2.js`): the server rule concerns `GET /api/listings/:id`
  (`$KVADRO_ROOT/docs/api.md:712-714,1366-1367` (r35); `02` BR-API-193), but the check lives in `ErrorState`, so it
  applies wherever that component shows: the listing screen (SCR-019), the first page of the search, favourites and
  history lists, the radar tab (SCR-026), the settings tab (SCR-032) and the owner chunks
  (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:197`, `ListingFeed.jsx:145`,
  `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:210`,
  `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:124` at r33). Legacy parity scenario
  `listing-day-limit`.
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
- **Owner invitation under an empty search** (since release `index-YX9bFVws.js`; BR-APP-115): when the search list is
  loaded to its end without an error and shows no card, a centred line «Сдаёте квартиру? **Разместите бесплатно ›**»
  (`OwnerEntryLine`, `src: "empty"`) stands under the empty state or under the few-results note at 0, pulled up by
  60 px or 16 px (`ListingFeed.jsx:161-165,171`, `OwnerEntry.jsx:10-16`; `found.css` `.empty + .own-entry-line`,
  `.few-note + .own-entry-line` at r38). Search tab only, as in SCR-007; a tap sends `owner_entry {src: "empty"}`.
- **Status:** CONFIRMED.

### SCR-010 — Pull-to-refresh (`overlay`)

- **Purpose:** reloads the current list or the radar list.
- **Active when:** no listing open, not the map, no filters / quick filter / radar editor / create-radar open, and not
  the settings tab (`App.jsx:530-541`). It also checks the body classes `locked`, `sheet-open` and `listing-open`
  (`$KVADRO_ROOT/demo/app/src/components/PullToRefresh.jsx:45-62`).
- **Gesture:** window `touchstart` at `scrollY == 0`. The indicator moves at half the finger distance; it triggers at
  72 px (max 110 px) with a light haptic when armed; the spinner shows for at least 700 ms.
- **Effect:** on the radar tab increments `subsVersion`, otherwise `feedVersion` (`App.jsx:359-365`). Since release
  `index-CIa0Ldj2.js` `savedVersion` on «Сохранённые», `subsVersion` on the radar tab and `feedVersion` elsewhere
  (BR-APP-058; `App.jsx:662-673` at r33).
- **Sources:** `PullToRefresh.jsx`.
- **Status:** CONFIRMED.

### SCR-011 — Search map (`screen`)

- **Purpose:** listings on a map with clusters, stacks of identical coordinates, a selection card, lasso drawing and
  "where am I".
- **Opens:** «Карта» view toggle; «Своя область» chip; «Обвести на карте» in filters (drawing mode).
- **Closes:** «Список» toggle or a tab switch. There is no Back handler for the map itself.
- **Engine:** GL (MapLibre) or Leaflet, see §1.8. While the chunk loads, a Suspense spinner shows
  (`$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:39-51`).
- **Data:** `GET /api/map?<filter params>` returns `{points:[{id,lat,lon,label,usd?,tone?,priced?}], total}`. Since
  release `index-CIa0Ldj2.js` the answer may also carry `with_point`, the number of listings of `total` that have
  coordinates (`02` BR-API-192; `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:142-149` at r33).
  - Hidden listings are excluded.
  - Points with the same coordinates (5 decimals) are grouped into "stacks" sorted by `usd`
    (`$KVADRO_ROOT/demo/app/src/features/map/pins.js:9-22`).
  - GL: Supercluster radius 48, maxZoom 17. Leaflet: markercluster radius 48.
- **Pins** show the server `label` with tone classes `good / high / suspicious / check / nego / active`
  (`$KVADRO_ROOT/demo/app/src/styles/map.css:137-158`). There is no client price formatting.
- **Camera:** fits the polygon, else robust point bounds (3%–97% quantiles from 20 points), padding 90/24, maxZoom 14
  (Leaflet scale). A city change jumps the centre. Since release `index-CIa0Ldj2.js` the camera is remembered while the
  filters stay the same, and a restored camera is not fitted again by the first points answer (BR-APP-111).
- **Note** `map.note` «На карте {shown} из {total} · {missing} известен только район» (with plural `map.missing`) shows
  for 6 s when some listings have no coordinates (`$KVADRO_ROOT/demo/app/src/features/map/gl/MapViewGL.jsx:152-174`,
  `$KVADRO_ROOT/demo/app/src/features/map/leaflet/MapView.jsx:200-222`). Since release `index-CIa0Ldj2.js` there are two
  texts, and `map.cut` is tested first: «На карте — {n} самых свежих. Остальные — в списке» (uz «Xaritada — eng yangi
  {n} tasi. Qolganlari — roʻyxatda», en «The map shows the {n} newest. The rest are in the list») when the answer was
  cut to the newest listings, else `map.note`. The counts are those of BR-APP-062 (`MapViewGL.jsx:192-204`,
  `MapView.jsx:242-254`, `ru.js:177`, `uz_Latn.js:172`, `en.js:173` at r33).
- **Locate button** (aria «Где я», `map.locate`): uses LocationManager or browser geolocation (TMA-035). Errors appear
  in the note for 5 s: `map.locateDenied` «Нет доступа к геопозиции. Разрешить можно в настройках Telegram.» or
  `map.locateFail` «Не получилось определить, где вы.». Success flies to zoom ≥ 15 with a blue dot and an accuracy
  circle under 2 km.
- **Gestures:** pan and pinch. GL disables rotation, pitch and keyboard. Taps: pin opens the card, cluster zooms (at max
  zoom opens the card with all leaves), stack spiderfies, background closes the card.
- **States:** up to `index-CBlEKxdL.js` there is no loading indicator for points, and no empty or error state. A GL
  fetch error leaves an empty map (LB-APP-008, LB-APP-044); after a failed request the points of the previous filters
  stayed and nothing was shown (the release's units `040-removed-MapViewGL.js:368-376`,
  `041-modified-MapView.jsx.diff`). Since release `index-CIa0Ldj2.js` a failed `GET /api/map` removes the markers,
  clusters, selection and counts of the previous filters and shows the banner `.map-note.map-error` (`role="alert"`)
  with «Не загрузилось» (`common.loadFailed`) and the text button «Повторить» (icon `RotateCw` 14 px, light haptic), on
  both engines. «Повторить» repeats the same request; a change of filters also clears the error. The banner is not shown
  while drawing; it replaces the geolocation error and suppresses the note above; it has no timer
  (`gl/useMapPoints.js:16-45`, `gl/MapViewGL.jsx:125-140,186-190`, `leaflet/MapView.jsx:152-188,236-240`,
  `MapSelectionCard.jsx:160-175`, `$KVADRO_ROOT/demo/app/src/styles/map.css:404-417` at r33;
  `$KVADRO_ROOT/docs/api.md:686-687` (r35)). The map views also sit in an error boundary, which shows `.empty.tall` with
  the same two texts in place of the map (§1.6, §1.8). There is still no loading indicator for points and no empty state
  (LB-APP-044).
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
  `tilePrefetch.js`; `attribution.js`; `palette.js`; since `index-CIa0Ldj2.js` also `MapSelectionCard.jsx:160-175`,
  `gl/useMapPoints.js:16-45` and `styles/map.css:404-418` (at r33); legacy parity scenarios `map-fail-leaflet`,
  `map-fail-leaflet-retry`, `map-cut-leaflet` and `map-leaflet-return`
  (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:512-559` at r33) and `gl-fail`, `gl-fail-retry`, `gl-cut` and
  `gl-return` (`$KVADRO_ROOT/demo/app/tools/parity/gl-parity.mjs:117-121` at r33).
- **Status:** CONFIRMED. Two style details are inferred (§6).

### SCR-012 — Map area drawing, lasso (`state`)

- **Purpose:** draw a free-hand search area.
- **Opens:**
  - lasso button or «Своя область» pill on the map (`startDrawing`, `App.jsx:325-329`);
  - «Обвести на карте» in the full filters sheet, which saves the city, closes the sheet, switches to the map and starts
    drawing (`App.jsx:393-402`). Since release `index-CIa0Ldj2.js` this path saves the city only when it differs from
    the city of the current filters (before: from the saved city), resets the sort to `new` when the current sort is not
    offered for the new filters, and remembers the scroll position of the list (BR-APP-105) (`App.jsx:694-712` at r33).
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
- **Layout:** `.map-card.glass` holding a compact `ListingCard` (one photo, `verdict.short`, no badges; since release
  `index-CBlEKxdL.js` a green `ShieldCheck` after the price for `owner_verified`, `role="img"` with the label
  `card.ownerVerified`; `ListingCard.jsx:92-97` at r31). For stacks: header «{n} из {total}» (`map.stackOf`) and a
  scroll-snap track that renders only ±1 slots, with a light haptic on slot change
  (`$KVADRO_ROOT/demo/app/src/features/map/MapSelectionCard.jsx:24-124`).
- **Data:** `GET /api/listings/:id?preview=1` for the current and adjacent items, once each. On error, up to
  `index-CBlEKxdL.js`, the id is un-marked for a later retry and the spinner remains (LB-APP-017). Since release
  `index-CIa0Ldj2.js` a failed preview shows `.sentinel.map-card-error` with «Не загрузилось» and the button «Повторить»
  in that slot; «Повторить» reloads the current card and its neighbours; `404` and `429` have no text of their own here
  (`MapSelectionCard.jsx:22-54,111-121`, `$KVADRO_ROOT/demo/app/src/styles/map.css:418` at r33;
  `$KVADRO_ROOT/docs/api.md:690-691` (r35)).
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
     Hidden when only room/commercial/land types are selected. Since release `index-CIa0Ldj2.js` «Любые» is active only
     when both bounds are `null`, and a maximum without a minimum highlights the buttons from 1 to it (BR-APP-007).
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
      (`$KVADRO_ROOT/demo/app/src/features/filters/sheet/PreferenceSections.jsx:62-94`). Since release
      `index-CIa0Ldj2.js` only for long-term rent (BR-APP-019).
  11. Furniture «Мебель»: «Не важно / С мебелью / Без мебели».
  12. Renovation «Ремонт»: `meta.renovations[deal]` chips.
  13. Floor «Этаж»: «Не первый», «Не последний».
  14. Sale only: area «Площадь, м²» from/to integers capped at 10 000, and market «Дом»: «Не важно / Новостройка /
      Вторичка». Since release `index-CIa0Ldj2.js` the area range shows for every deal; market stays sale-only
      (BR-APP-020).
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
  - Since release `index-YX9bFVws.js` the number of «Показать {n}» and of the flow line rolls digit by digit to each new
    value (BR-APP-113; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/SheetFooter.jsx:11-23,86-97` at r38), and
    «Включить радар» goes through the save phases: busy (the button narrows to a 48 px pill with a spinner), then done
    (green, a tick), and the sheet closes 900 ms after the answer (BR-APP-114; `SheetFooter.jsx:77-85`,
    `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:81-82,149-164` at r38). The deal control's segmented
    thumb slides (BR-APP-121).
- **Live data:** `GET /api/feed/count` 250 ms after any change and `GET /api/feed/flow` 500 ms after; in-flight
  requests are aborted (`$KVADRO_ROOT/demo/app/src/features/filters/useLiveFeedStats.js`).
- **Validation:**
  - price parse rules (§3.5; `$KVADRO_ROOT/demo/app/src/lib/money.js:91-101`);
  - area `IntInput` strips non-digits, 0 → null, max 10 000 (`$KVADRO_ROOT/demo/app/src/components/inputs/IntInput.jsx:10-21`);
  - no min ≤ max check (LB-APP-043).
- **Apply:** saves the city to the server if it changed, closes, `applyFilters` (scroll to top, follow-nudge candidate)
  (`App.jsx:385-391`). Since release `index-CIa0Ldj2.js` "changed" means different from the city of the current filters;
  before, different from the saved city (`App.jsx:694-712` at r33).
- **Subscribe:** `subscribe(next, 'filters', relaxed)` (BR-APP-041); since release `index-YX9bFVws.js` with the save
  phase's `confirm` as a fourth argument (`App.jsx:992-994` at r38).
- **APIs:** `GET /api/feed/count`, `GET /api/feed/flow`, `GET /api/cities`, `GET /api/subscriptions`,
  `POST /api/subscriptions`, `PATCH /api/subscriptions/:id`, `PUT /api/settings`.
- **Storage:** `kv-new-pets`; `kv-city`.
- **Analytics:** `$pageview filters`.
- **Edge cases:**
  - Reset returns to `rent_long` even from daily rent (LB-APP-030).
  - Tenant and pets remain visible for daily rent (LB-APP-029); since release `index-CIa0Ldj2.js` only the tenant
    section does.
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
  - rooms: RoomsPicker plus the hint; since release `index-CIa0Ldj2.js` «Любые» is active only when both bounds are
    `null` (BR-APP-007);
  - price: the full PriceSection, including the below-market chip;
  - owner: a 3-way segmented control.
- **Footer:** «Сбросить» resets only this filter (price also resets `below_median`), then «Показать {n}» / «Ничего нет».
  Since release `index-YX9bFVws.js` the number of «Показать {n}» rolls (BR-APP-113;
  `$KVADRO_ROOT/demo/app/src/features/filters/QuickFilterSheet.jsx:113` at r38), and the owner control's segmented thumb
  slides (BR-APP-121).
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
  - a deep link `start_param l_<id>…` or `?listing=<id>` (initial `listingId`, `App.jsx:61`); since release
    `index-CIa0Ldj2.js` once per launch (**Launch link** below).
- **Closes:** Telegram Back; swipe right (not on Android, and only when nothing is open over it); the Settings button;
  hide / block / report-rented / fraud-hidden actions. Since release `index-CBlEKxdL.js` a close plays the leave
  animation, except after a swipe (**Animation** below). Since release `index-CIa0Ldj2.js`, while the Telegram SDK is
  absent, the layer also shows the close cross of `05` TMA-047 in its content, skeleton and error states
  (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:178,205,252` at r33).
- **Layout** (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:158-247`): a fixed `listing-layer` (z 45)
  holding a scrollable `main.listing`.
  - **Hero** photo strip: counter «N / M»; a big ▶ «Смотреть видео в Telegram» (`listing.watchVideo`) for videos; tap
    opens the viewer, or for a video the original post.
  - **Sheet** body:
    - `status_text` banner;
    - **title row**: h1 title, «district · landmark», share (only when `bot_username` is known), favourite and «⋯»
      (aria «Ещё») (`$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:64-89`); since release
      `index-CBlEKxdL.js` also the owner chip «Проверенный хозяин» with its tip, under the title (BR-APP-100,
      BR-APP-101; `ListingTitleRow.jsx:86`, `$KVADRO_ROOT/demo/app/src/features/listing/OwnerChip.jsx:10-86` at r31);
      since release `index-YX9bFVws.js` the chip's wrapper spans the whole grid row of the title row and sits at its
      start (`.title-row .owner-chip-wrap { grid-column: 1 / -1; justify-self: start }`), the chip does not wrap
      (`white-space: nowrap`), and its tip leaves with the tip animation of BR-APP-112
      (`$KVADRO_ROOT/demo/app/src/styles/owner-shared.css:184-187,198`, `OwnerChip.jsx:72` at r38);
    - **key facts** tiles: rooms (plural `listing.rooms`), m², floor `n/total`, «Новый / Вторичка» building
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/KeyFacts.jsx:19-53`); since release `index-CIa0Ldj2.js` the
      floor tile reads «Цокольный этаж» for `0` and «Подвал» for a negative floor, with an empty caption (BR-APP-110);
    - **market block** «Сравнение с районом» / «… с похожими рядом» / «… с городом»: info button, verdict, a scale with
      a marker animated from the centre on first show this session, «дешевле … обычно {value}{unit} … дороже», a
      context line, and warnings (`$KVADRO_ROOT/demo/app/src/features/listing/sections/MarketBlock.jsx:85-179`); since
      release `index-CBlEKxdL.js` its class is `.island`, not `.market`, with no visual change (`MarketBlock.jsx:120`,
      `$KVADRO_ROOT/demo/app/src/styles/listing.css:203` at r31); since release `index-YX9bFVws.js` the marker is
      carried by a wrapper `.marker-run` as wide as the scale, moved by `transform: translateX(<position>%)` (50 % before
      the reveal) with a 0.7 s transition on `var(--ease-out)`, and the marker sits at the wrapper's right edge
      (`right: 0; transform: translate(50%)`). Before, the marker itself moved by `left` over 0.7 s with
      `cubic-bezier(0.22, 1, 0.36, 1)`, so the curve changed too (`MarketBlock.jsx:143-156`,
      `listing.css:373-391,423-425,437-441` at r38; §3.6). The reveal rule is unchanged: a double
      `requestAnimationFrame`, on the first show of a listing id in the session (`MarketBlock.jsx:85-103` at r38);
    - **facts grid** «Факты», from server `facts[]` with icons; values longer than 18 characters span full width
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/FactsSection.jsx`);
    - **stats cells**: days on market («Сегодня на рынке» when 0), publications, channels (only when > 1), views
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/StatsSection.jsx`);
    - **history**: a single sentence «Опубликовано {date} в @{channel}. Повторов и изменений цены пока не было.» with a
      clickable channel, or the «История цены» timeline (date, time, event text, @channel, price, ±% with a
      good/high colour) (`$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx`); since release
      `index-CBlEKxdL.js` a self-placed listing has the sentence «Хозяин разместил квартиру в kvadro² {date}. Изменений
      цены пока не было.» (`details.historySelf`), with no channel (BR-APP-102); since release `index-CIa0Ldj2.js` the
      dates and times of the history are in Asia/Tashkent (BR-APP-069);
    - **location** «Расположение»: a non-interactive spot mini-map (2:1, lazy via IntersectionObserver; tap opens the
      fullscreen map), the hint «Место примерное: по кварталу, ориентиру или метро из объявления», place row, centre
      distance, and «Рядом» (metro ≤ 1.5 km plus server `nearby[]` with `~` distances)
      (`$KVADRO_ROOT/demo/app/src/features/listing/sections/LocationSection.jsx`, `NearbySection.jsx`,
      `$KVADRO_ROOT/demo/app/src/features/listing/spot/SpotMap.jsx:86-126`); since release `index-CBlEKxdL.js` the
      spot-map buttons (`.lmap-expand`, `.lmap-attrib`, `.lmap-close`, `.lmap-locate`) have `z-index: 1000`
      (`$KVADRO_ROOT/demo/app/src/styles/spot-map.css:31-46` at r31);
    - **claimed owner** (since release `index-CBlEKxdL.js`): the section «Хозяин — со слов объявления» with «Мы не
      проверяли — спросите при звонке, нет ли комиссии.», for a listing with `is_owner` that is neither `owner_verified`
      nor self-placed (BR-APP-100; `ListingScreen.jsx:270-281` at r31);
    - **author** «Кто размещает»: owner text, `offers[]` (links open with `original_opened src=offers`), phone (masked
      for session replay; tap calls) and «Опубликовано {when}» (`sections/AuthorSection.jsx`); since release
      `index-CBlEKxdL.js` the `owner` text is hidden when it repeats the owner chip or the claimed section (BR-APP-100),
      and a self-placed listing adds «Обычно отвечает за {n} мин» (`contact.usually`) and, while the caller's request
      waits, «Отклик отправлен — ответ придёт в бот.» (`contact.pendingNote`) (BR-APP-102);
    - **description** «Из объявления» (`summary`); since release `index-CBlEKxdL.js` the section shows when `summary` or
      `owner_description` is set, the latter as a second paragraph (BR-APP-102);
    - **source** «Источник»: channel chips, then the disclosure «Текст оригинала». Inside: «Перевести / Перевожу… /
      Показать оригинал» (not in ru), «Не получилось перевести», the original or translated text with the author's
      phone as a call button, and «Перевод сделан ИИ» (`sections/SourcesSection.jsx`, `sections/OriginalText.jsx`).
      Since release `index-CBlEKxdL.js` a self-placed listing has no «Источник» section (BR-APP-102).
    - **owner invitation** (since release `index-YX9bFVws.js`; BR-APP-115): when the full card has a truthy
      `owner_entry`, the last line of the loaded content is «Тоже сдаёте квартиру? **Разместите бесплатно ›**»
      (`OwnerEntryLine` with `too`, `src: "listing"`). It stands outside the `!isSelf` guard of the sources, so the card
      decides alone. The App passes its handler on every tab (`ListingScreen.jsx:347`, `App.jsx:970` at r38;
      `$KVADRO_ROOT/docs/api.md:368` (r38)). When the server sets `owner_entry` is open in legacy's own contract
      (`$KVADRO_ROOT/docs/api.md:1453-1454` (r38), its question 19); HOMI's rule is DEC-94.
  - **Scroll box** (since release `index-YX9bFVws.js`): `main.listing` has `overflow-x: hidden`
    (`$KVADRO_ROOT/demo/app/src/styles/listing.css:42` at r38).
  - **CTA bar** (fixed bottom, z 20): price + period, delta / note, and a primary button «Позвонить» / «Написать» /
    «Номер платный» / «Открыть пост», or a shimmer placeholder (`ListingCtaBar.jsx:17-83`). Since release
    `index-CBlEKxdL.js`, for a listing in gate mode, the button is «Связаться с хозяином» or a quiet, inactive «Отклик
    отправлен», or a two-line bar replaces it (BR-APP-098; `ListingCtaBar.jsx:34-71,105-121` at r31). Since release
    `index-CIa0Ldj2.js` a second «Позвонить» within 1.5 s of an accepted one is ignored (BR-APP-033).
- **Data flow:**
  - It renders the feed `preview` at once.
  - `GET /api/listings/:id` replaces it (consuming the prefetch for deep links). The screen scrolls to the top on each
    new id.
  - If the response `id` differs, the screen switches to that id without a refetch (redirect; release `plF_TOcT`,
    `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:19-65`).
- **Launch link** (since release `index-CIa0Ldj2.js`): the listing of a launch link opens once per launch (BR-APP-106).
  When it is a sale listing over a search that is not a sale, the feed under it switches to the sale defaults
  (BR-APP-108).
- **Owner and request states** (since release `index-CBlEKxdL.js`; line numbers at r31). The screen derives them from
  the card:

  | Name | Rule | Evidence |
  | ---- | ---- | -------- |
  | self-placed | `owner_self` is true on the full card | `ListingScreen.jsx:205` |
  | gate | self-placed **and** `contact_mode === "gate"` **and** no `phone` on the card | `ListingScreen.jsx:206`; `$KVADRO_ROOT/docs/api.md:386-387` |
  | request | `my_request` of the card, else none | `ListingScreen.jsx:207` |
  | closed request | the request is `declined`, `agent`, `expired` or `cancelled` | `ListingScreen.jsx:45-46` |
  | no contact | the full card is loaded **and** self-placed **and** (`owner_mine` **or** (gate **and** closed request)) | `ListingScreen.jsx:209-210` |
  | owner chip | `owner_verified` (preview or card) **or** self-placed | `ListingScreen.jsx:232` |
  | claimed | the full card is loaded **and** not `owner_verified` **and** not self-placed **and** `is_owner` | `ListingScreen.jsx:272` |
  | mine | `owner_mine` on the full card | `ListingScreen.jsx:211` |

  `my_request` is `pending`, `given`, `declined`, `agent`, `expired`, `cancelled` or `null`
  (`$KVADRO_ROOT/docs/api.md:348`). These are the six statuses of the owner's `OwnerRequest.status`, where `agent` means
  that the owner marked the seeker a realtor (`$KVADRO_ROOT/docs/api.md:1413-1425`). The seeker's UI shows `agent`
  exactly like `declined` (`ListingCtaBar.jsx:108-116`).
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
- **Actions menu:** SCR-023. Since release `index-CIa0Ldj2.js` the realtor reason needs an author who is a phone, and
  «Уже сдано» can be undone (BR-APP-036).
- **Overlays:** PhotoViewer (SCR-020), MarketSheet (SCR-022), SpotMapFullscreen (SCR-021). Since release
  `index-CBlEKxdL.js` also the contact request sheet (SCR-061) and the owner info sheet (SCR-062). The user's own
  listing is the state SCR-059.
- **APIs:**
  - `GET /api/listings/:id`, `GET /api/listings/:id/call`;
  - `POST /api/listings/:id/translate`, `POST /api/listings/:id/favorite`, `POST /api/listings/:id/share`;
  - plus the actions-sheet calls;
  - since release `index-CBlEKxdL.js` also `POST /api/listings/:id/contact`, from SCR-061;
  - since release `index-YX9bFVws.js` also `GET /api/owner/listings`, from the owner invitation.
- **Storage:** since release `index-CBlEKxdL.js` `kv-owner-tip`, written by the owner chip (BR-APP-101; §3.2). Since
  release `index-CIa0Ldj2.js` also the sessionStorage key `kv-start-done` (BR-APP-106; §3.2).
- **Analytics:** `$pageview listing` with `listing_id`; `listing_shared`; `original_opened` (`src` = `button`, `video`,
  `sources`, `price_history`, `offers`); `original_copied`; `contact_call` (`via`, `src`); `contact_write`. Since
  release `index-CBlEKxdL.js` also `owner_info_opened {listing_id}`, sent by the owner chip (BR-APP-101). Since release
  `index-CIa0Ldj2.js` the `$pageview` is sent by the listing screen once ownership is known: `owner/listing` for the
  user's own listing (`owner_mine`), `listing` otherwise and after a failed load, each with `listing_id`. A card closed
  before that sends none, and the App still sets the error-report screen to `listing` (`ListingScreen.jsx:147-156`,
  `$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:54-57` at r33). Up to `index-CBlEKxdL.js` the App sent `listing`
  at once when the card opened, also for the user's own listing (the release's unit `002-removed-App.js:68-93`). Since
  release `index-YX9bFVws.js` the owner invitation sends `owner_entry {src: "listing"}` (§3.3).
- **Gestures:** swipe-back; horizontal photo strip; tap the mini-map.
- **Animation** (since release `index-CBlEKxdL.js`): the layer enters from 24 % with opacity 0 over 0.25 s
  (`@starting-style`) and leaves the same way over 0.2 s ease-in (`.leaving`; the listing is unmounted after
  `LISTING_LEAVE_MS = 200`). Lite graphics and reduced motion close at once, without either animation. A swipe back
  closes at once. Opening a listing during the leave cancels it (`$KVADRO_ROOT/demo/app/src/app/layers.js:10-15`,
  `App.jsx:207-235`, `$KVADRO_ROOT/demo/app/src/styles/listing.css:1-35` at r31). That the layer had no entrance or
  leave animation before is `inferred` from the CSS diff of the release: the old `.listing-layer` rule had no
  transition, and there was no `@starting-style`.
- **Localization:** translate is hidden for `ru` (`$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingTranslation.js:22`).
  Dates in history use the device timezone up to `index-CBlEKxdL.js` and Asia/Tashkent since `index-CIa0Ldj2.js`
  (LB-APP-025).
- **Edge cases:**
  - Video of a deleted post (`post_deleted`) opens the gallery.
  - Without phone, contact or post there is no CTA, only a placeholder.
  - Translation and «original open» state are not reset when `id` changes (LB-APP-003).
  - The call button can silently do nothing (LB-APP-028).
  - Since release `index-CBlEKxdL.js`: a chip tap before the card loads (LB-APP-072); the request errors `open`,
    `closed` and `own` leave the card stale (LB-APP-073); `given` without a phone (LB-APP-074); the test that hides the
    author label (LB-APP-075); an expired request (LB-APP-076); the info sheet after the number was given (LB-APP-078).
- **Sources:** `ListingScreen.jsx`; `ListingHero.jsx`; `ListingTitleRow.jsx`; `ListingCtaBar.jsx`; `format.js`;
  `sections/*`; `hooks/*`; `spot/SpotMap.jsx`; since `index-CBlEKxdL.js` also `$KVADRO_ROOT/demo/app/src/app/layers.js`,
  `OwnerChip.jsx`, `OwnerInfoSheet.jsx`, `ContactRequestSheet.jsx` and `sections/OwnerPriceSection.jsx`; since
  `index-CIa0Ldj2.js` also `minuteClock.js` and `$KVADRO_ROOT/demo/app/src/components/FallbackClose.jsx`; since
  `index-YX9bFVws.js` also `$KVADRO_ROOT/demo/app/src/features/feed/OwnerEntry.jsx`.
- **Status:** CONFIRMED.

### SCR-019 — Listing loading and error states (`state`)

- **No preview yet:** `ListingSkeleton`, a shimmer hero and three bars (`$KVADRO_ROOT/demo/app/src/features/listing/ListingSkeleton.jsx:5-35`).
- **Preview shown, details pending:** `SectionSkeleton` blocks of 3 and 4 lines and a shimmer CTA.
- **404:** up to `index-CBlEKxdL.js` the plain text «Объявление не загрузилось» / «Eʼlon yuklanmadi» / «Couldn’t load
  the listing» (`listing.loadFailed`), with no button; only Back closes it (`ListingScreen.jsx:112-122`). Since release
  `index-CIa0Ldj2.js` a block `.empty.tall` with `role="alert"`: the icon `SearchX` (28 px), the text «Этого объявления
  уже нет — квартиру, похоже, сдали или продали» / «Bu eʼlon endi yoʻq — uy, shekilli, ijaraga berilgan yoki sotilgan» /
  «This listing is gone — the flat has probably been rented out or sold» (`listing.gone`) and the button «Смотреть
  свежие» / «Yangilarini koʻrish» / «See the latest» (`listing.goneFresh`). The button gives a light haptic and closes
  the screen; it does not reload the feed. The block shows for every `404` of the full `GET /api/listings/:id`, whatever
  its `detail`, and not for the `?preview=1` request of the map card (SCR-013) (`ListingScreen.jsx:175-201`,
  `ru.js:179-180`, `uz_Latn.js:174-175`, `en.js:175-176` at r33; `$KVADRO_ROOT/docs/api.md:712-714` (r35);
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:15` at r36). `listing.loadFailed` stays in the dictionaries, unused (§3.1).
- **Other errors:** a tall `ErrorState` with «Повторить», which bumps `reloadKey`. Since release `index-CIa0Ldj2.js` it
  has the day-limit variant for a `429` with `too many today` (SCR-008).
- **Gestures:** swipe-back is disabled until there is data (`ListingScreen.jsx:89-93`).
- **Since release `index-CBlEKxdL.js`:** the re-read of the card after a request answered `given` shows the state
  "preview shown, details pending" again and scrolls to the top (LB-APP-074;
  `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:42-44` at r31). The skeleton no longer wraps
  itself in a layer of its own; it sits inside the animated listing layer (SCR-018; the release's unit
  `018-modified-ListingSkeleton.jsx.diff`).
- **Without the SDK** (since release `index-CIa0Ldj2.js`): the error, skeleton and content states carry the close cross
  of `05` TMA-047 (`ListingScreen.jsx:178,205,252` at r33).
- **Legacy parity scenarios** (since release `index-CIa0Ldj2.js`): `listing-gone` and `listing-gone-fresh`, in which
  «Смотреть свежие» closes the screen (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:512-559` at r33).
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
  - an animated demo scale (the dot slides to `--to` over 1 s; the tag fades in); since release `index-YX9bFVws.js` the
    slide `minfo-go` runs on `var(--ease-out)`, `cubic-bezier(0.2, 0.9, 0.3, 1)`, instead of
    `cubic-bezier(0.22, 1, 0.36, 1)` (`$KVADRO_ROOT/demo/app/src/styles/listing.css:269` at r38; §3.6);
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
  - «Это риелтор, а не хозяин» / «Отметим номер как риелторский» (hidden when `is_owner === false`; since release
    `index-CIa0Ldj2.js` also when the author is not a phone, BR-APP-036);
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
  | Report `fraud` with `hidden: true` | hide | «Спасибо, посмотрим. Это объявление у вас скрыли» + undo (`DELETE /api/listings/:id/hide`); since release `index-CIa0Ldj2.js` its button reads «Показывать у меня» (`toast.showForMe`), not «Вернуть» |
  | Report `rented` | hide and close; no undo up to `index-CBlEKxdL.js`, an undo since `index-CIa0Ldj2.js` | «Отметили: уже сдано»; since `index-CIa0Ldj2.js` + «Вернуть» (`toast.undo`) for 6 s (undo: the listing shows again and `DELETE /api/listings/:id/report` is sent) |
  | Report `agent` | — | «Отметили номер как риелторский»; since release `index-CIa0Ldj2.js` only when the answer has `agent_marked: true`, otherwise «Спасибо, учёл вашу отметку» (`toast.reportedAgentNoted`) |
  | Other reports, including `wrong_data` with any `detail` | — | «Спасибо! Посмотрим» |
  | Any failure | — | «Не получилось сохранить» |
  | Undo failure | re-hides | «Не получилось сохранить» |

  Since release `index-CIa0Ldj2.js` (`useListingActions.js:36-50,62-74`, `ListingActionsSheet.jsx:93-103`,
  `ru.js:241-242,259` at r33; `$KVADRO_ROOT/docs/api.md:840-864` (r35)): `toast.showForMe` is «Показывать у меня» /
  «Menga koʻrsatish» / «Show it to me», `toast.reportedAgentNoted` «Спасибо, учёл вашу отметку» / «Rahmat, belgingizni
  hisobga oldim» / «Thanks, I've noted your mark», and `toast.undo` «Вернуть» / «Qaytarish» / «Undo». A failed undo of
  «Уже сдано» hides the listing again and shows «Не получилось сохранить». The legacy changelog and `docs/api.md` call
  the button of the «Уже сдано» toast «Отменить» (`$KVADRO_ROOT/docs/api.md:854` (r35)); that wording is not in the
  dictionaries.
- **APIs:** `POST /api/listings/:id/hide`, `POST /api/listings/:id/block-author`, `POST /api/listings/:id/report`
  `{reason}` or `{reason: "wrong_data", detail}` (`detail` only when truthy,
  `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:86-90`), `GET /api/bot`, `DELETE /api/listings/:id/hide`,
  `DELETE /api/listings/:id/block-author`; since release `index-CIa0Ldj2.js` also `DELETE /api/listings/:id/report`, the
  undo of «Уже сдано» (`listings.js:87-90` at r33).
- **States:** `busy` ignores taps on every view while a request runs. Haptics: light when the report or detail view
  opens and when an action starts; success or error after it.
- **Legacy parity scenarios** (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:281-293`): `listing-report-wrong` (the
  detail view, no request), `listing-report-wrong-price` (body `{"reason":"wrong_data","detail":"price"}`, toast),
  `listing-report-wrong-back` (header back from the detail view to the reasons), `listing-report-204` (`wrong_data`
  with `detail: "photos"`). Since release `index-CIa0Ldj2.js` also `listing-report-rented-undo` (the toast action, then
  `DELETE …/report`, and the listing returns), `listing-report-agent` (`agent_marked: false`) and
  `listing-report-agent-marked` (`mocks.mjs:190-195,512-559` at r33).
- **Status:** CONFIRMED.

### SCR-024 — Favourites (`screen`)

- **Purpose:** the server list of favourites.
- **Opens:** the Heart tab with the «Избранное» sub-tab (the default sub-tab).
- **List:** `ListingFeed source=favorites` with one request, `GET /api/favorites`. Items un-favourited this session or
  hidden are filtered out locally (`ListingFeed.jsx:81-84`). Pull-to-refresh re-creates it. Since release
  `index-CIa0Ldj2.js` «Сохранённые» is a `ListingFeed` of its own, rendered only on its tab, with the key
  `${savedVersion}:${savedTab}` (`$KVADRO_ROOT/demo/app/src/app/App.jsx:841-854` at r33); it is unmounted outside the
  tab and has no scroll memory. Favourites are read in pages: `GET /api/favorites`, then
  `GET /api/favorites?cursor=<next_cursor>` until `next_cursor` is `null`, with duplicate ids dropped (BR-APP-024;
  `$KVADRO_ROOT/demo/app/src/lib/api/user.js:26-27`, `useInfiniteFeed.js:31-42` at r33;
  `$KVADRO_ROOT/docs/api.md:1157-1162` (r35)).
- **States:** skeleton, error and empty (SCR-008, SCR-009).
- **Analytics:** `$pageview saved/favorites`.
- **Edge case:** the pagination contract was not visible up to `index-CBlEKxdL.js` (LB-APP-022).
- **Legacy parity scenarios** (since release `index-CIa0Ldj2.js`): `favorites-pages` (the second page by `next_cursor`)
  and `fav-fail` (a failed heart: rollback and toast).
- **Status:** CONFIRMED.

### SCR-025 — History «Смотрели» (`screen`)

- **Purpose:** the server list of listings the user opened.
- **Opens:** the «Смотрели» sub-tab.
- **List:** `GET /api/history`. The list is re-created by pull-to-refresh and by entering the tab. Before release
  `index-CBlEKxdL.js` it was also re-created whenever the session `seen` count changed (`App.jsx:516`); since that
  release the key is `<feedVersion>:<sub-tab>` (`App.jsx:673` at r31), and since `index-CIa0Ldj2.js`
  `${savedVersion}:${savedTab}` (SCR-024). At `index-CIa0Ldj2.js` history is still read whole, without a cursor
  (`$KVADRO_ROOT/demo/app/src/lib/api/user.js:26-27` at r33). The «viewed» eye is not shown here.
- **Tool:** «Очистить» (`feed.clear`, trash icon) when items exist. It asks the confirm «Очистить историю просмотров?»
  (`feed.clearConfirm`), then `DELETE /api/history`, clears the list and plays the success haptic. A failure plays the
  error haptic only up to `index-CBlEKxdL.js` (`ListingFeed.jsx:93-112`); since release `index-CIa0Ldj2.js` it also
  shows the toast «Не получилось сохранить» (BR-APP-067; `ListingFeed.jsx:114-117` at r33).
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
  radar (LB-APP-036). Since release `index-CIa0Ldj2.js` they are fetched again after every successful load of the list,
  at most once per 10 s (BR-APP-063).
- **Actions:**
  - tap a tile opens SCR-028;
  - the switch is an optimistic `PATCH /api/subscriptions/:id {active}`. Turning on goes through the chat-access flow
    (TMA-033). On success with `starter > 0` it shows the toast «Радар снова включён. {count}, которые вы не видели, —
    в чате с ботом» (`subs.resumed`; since release `index-CIa0Ldj2.js` «Радар снова включён. В чате с ботом —
    непросмотренные: {count}», §3.1). Since release `index-CIa0Ldj2.js` a failed switch, unless the error is `no_chat`,
    shows the toast «Не получилось сохранить» (BR-APP-048). `ask_found` opens SCR-031 (trigger `pause`).
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
  deleting it. Up to release `index-CBlEKxdL.js` it was unmounted while a listing was open over it and mounted again
  after (`RadarScreen.jsx:216` at the audit). Since release `index-CIa0Ldj2.js` the sheet stays mounted while a
  listing is open over the radar tab and is parked: the class `sheet-backdrop parked` (`visibility: hidden;
  pointer-events: none`) and `aria-hidden` (`RadarScreen.jsx:232-240`,
  `$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:70-71`, `$KVADRO_ROOT/demo/app/src/styles/radar.css:264` at
  r33; the release's unit `057-removed-RadarScreen.js:136-137`). Since release `index-YX9bFVws.js` a close plays the
  sheet leave of BR-APP-112, except while the sheet is parked: a parked sheet that unmounts leaves no copy
  (`$KVADRO_ROOT/demo/app/src/lib/leave.js:146` at r38).
- **Layout** (`$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:64-155`):
  - header: title, area summary, a status dot and text, ×;
  - «Последние находки»: a horizontal strip of mini-cards with cover, «новое» badge (unviewed, active only), price,
    district · age; then «Все {n} ›», or «Пока ничего — радар пришлёт, как появится», or ghost placeholders while
    loading (`$KVADRO_ROOT/demo/app/src/features/radar/RadarStrip.jsx`); since release `index-CIa0Ldj2.js` the «новое»
    badge also goes from a listing opened in this session (BR-APP-040), and the age is the client's label from
    `posted_at`, computed when the strip renders (BR-APP-109);
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
- **Legacy parity scenarios** (since release `index-CIa0Ldj2.js`): `radar-sheet-listing` (the sheet is parked under an
  open listing, and «новое» goes from that listing), `radar-sheet-listing-back` (Back from the listing returns to the
  sheet) and `radar-sheet-age`.
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
- **Since release `index-CIa0Ldj2.js`:** the area range «Площадь, м²» shows for every deal, as in SCR-014 (BR-APP-020;
  `$KVADRO_ROOT/demo/app/src/features/filters/sheet/ExtraSections.jsx:9-42` at r33).
- **Since release `index-YX9bFVws.js`:** the number of «Сейчас подходит: {n}» rolls, also to and from 0, and so does
  the flow line (BR-APP-113; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/SheetFooter.jsx:52-70` at r38).
  «Сохранить» goes through the save phases: after a successful save the button turns green with a tick, the editor
  closes 900 ms later (250 ms under reduced motion), and the toast is set together with the close; on an error the
  button returns to idle and the editor stays (BR-APP-114; `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:178-186`,
  `App.jsx:973-983` at r38).
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
- **Since release `index-CIa0Ldj2.js`:** the area range «Площадь, м²» shows for every deal, as in SCR-014 (BR-APP-020).
  A second «Включить радар» while the first one is running does nothing: the sheet stays open and no toast shows
  (BR-APP-041; `subscriptionActions.js:98-108` at r33).
- **Since release `index-YX9bFVws.js`:** «Сейчас подходит: {n}» and the flow line roll (BR-APP-113), and the primary
  button, here labelled «Включить радар» (`saveLabel` = `sheet.subscribe`), goes through the save phases of SCR-029: on
  a created or re-enabled radar the tick shows and the sheet closes 900 ms after the answer; the caller closes it once
  `subscribe` resolves true (BR-APP-114; `App.jsx:999-1015`, `subscriptionActions.js:138-152` at r38). An already
  active identical radar closes at once with «Радар по этому поиску уже включён», without the done phase
  (`subscriptionActions.js:114-118` at r38).
- **Analytics:** `$pageview radar/new`.
- **Status:** CONFIRMED.

### SCR-031 — «Нашли жильё?» survey (`sheet`)

- **Opens:** after pausing (`ask_found` on PATCH) or deleting (`ask_found` on DELETE) a radar.
- **Closes:** backdrop, drag, Telegram Back, or an answer. Since release `index-YX9bFVws.js` a choice on `where` no
  longer closes it, and a close plays the sheet leave (BR-APP-112).
- **Step `ask`:** «Нашли жильё?» / «Подскажите одной кнопкой — так мы поймём, помогает ли kvadro² искать.» with rows:
  - «Да, через kvadro²» goes to the congratulations step with a success haptic;
  - «Да, в другом месте» goes to `where`;
  - «Ещё ищу» closes with the toast «Удачи в поиске! Радар можно снова включить в любой момент»;
  - «Больше не ищу» closes with the toast «Понятно, спасибо! Радар можно снова включить в любой момент».
- **Step `where`:** «Где нашли?» with «Другой Telegram-канал / OLX / Другой сайт (Uybor, Uysot…) / Через риелтора /
  Знакомые подсказали / Объявление на доме или на улице / Другое». Up to `index-CIa0Ldj2.js` any choice closed with the
  toast «Поздравляем! 🎉 Спасибо, что рассказали» (`found.thanksYes`). Since release `index-YX9bFVws.js` any of the
  seven choices gives a light haptic, sends the answer, goes to the step `moved` and scrolls the sheet to the top, with
  no toast (BR-APP-116; `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:139-144` at r38). `found.thanksYes`
  is no longer shown anywhere (LB-APP-091).
- **Step `kvadro`:** the `hooray.webp` image, «Поздравляем с новосельем!», a text, «Рассказать друзьям» (shares
  `https://t.me/<bot>?start=s_friend` with `found.shareText`, only when the bot is known) and «Готово». Since release
  `index-YX9bFVws.js` the landlord block stands between «Рассказать друзьям» and «Готово» (`FoundSheet.jsx:177-192` at
  r38).
- **Step `moved`** (since release `index-YX9bFVws.js`): «Поздравляем!» (`found.movedTitle`), «Спасибо, что рассказали —
  это помогает нам стать лучше.» (`found.movedText`), the landlord block and «Готово»; no image
  (`FoundSheet.jsx:193-201` at r38). The sheet header with its title shows only on `ask` and `where` (`:171`).
- **Landlord block** (since release `index-YX9bFVws.js`; `LandlordCard`, `FoundSheet.jsx:236-247` at r38), on both
  congratulation steps and with no condition (no locale, bot or flag check): «Съезжаете со старой квартиры?»
  (`found.landlordTitle`), «Её хозяину понадобится новый жилец. Отправьте ему ссылку — разместит квартиру бесплатно, без
  риелтора.» (`found.landlordText`) and the button «Отправить хозяину» with a send icon (`found.landlordSend`). A tap
  gives a light haptic, sends `landlord_share {src}` with `kvadro` on the step `kvadro` and `elsewhere` on `moved`, at
  every tap, and then shares «Здравствуйте! Я съезжаю. Нового жильца можно найти бесплатно и без риелтора здесь: {url}»
  (`found.landlordShare`) through `shareText` (`05` TMA-048), which puts the whole text into the `url` parameter of
  `t.me/share/url` (LB-APP-090) (`FoundSheet.jsx:95-101,145-151`, `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:101-119`
  at r38). `{url}` is `https://kvadro.app` + the page of the interface locale + `?s=tenant`: `/sdat-kvartiru/` (ru),
  `/uz/kvartira-ijaraga-berish/` (uz_Latn), `/en/list-your-apartment/` (en), the ru page for any other locale
  (`FoundSheet.jsx:80-92` at r38; `$KVADRO_ROOT/docs/api.md:1198-1203` (r38)). The block is styled by `.found-landlord`
  and `.found-landlord-btn`, with a dark variant (`$KVADRO_ROOT/demo/app/src/styles/found.css` at r38). Whether legacy
  counts `?s=tenant` anywhere is open in its own contract (`$KVADRO_ROOT/docs/api.md:1453-1454` (r38)).
- **APIs:** `POST /api/found {answer, trigger}`; `POST /api/found/where {where}`. Both are fire-and-forget; errors are
  ignored. The landlord share sends no API request.
- **Analytics** (since release `index-YX9bFVws.js`): `landlord_share {src: "kvadro" | "elsewhere"}` (§3.3).
- **Reworded in en by release `index-CBlEKxdL.js`:** `found.where.agent` «Through a realtor» became «Through an agent»,
  and `found.shareText` says «owners vs. agents», not «owners vs. realtors» (`en.js:494,502` at r31).
- **Sources:** `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:85-184`; since `index-YX9bFVws.js`
  `FoundSheet.jsx:79-247` and `share.js` (at r38).
- **Status:** CONFIRMED.

### SCR-032 — Settings (`screen`)

- **Opens:** the Settings tab, or the Telegram Settings button.
- **Loading:** spinner. **Error:** a tall ErrorState with retry (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:71-80`).
- **Groups:**
  - «Сдаю квартиру» (`own.group`; since release `index-CBlEKxdL.js` the first group, the entry point and summary of the
    owner cabinet; `SettingsScreen.jsx:233-275` at r31; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:30` at r31):
    - «Сдать квартиру» (House icon). Its value is «Бесплатно», or at the limit «{n} из {max}» with both numbers set to
      `max`, so it reads «2 из 2» (`SettingsScreen.jsx:234-253` at r31). A tap gives a light haptic and opens the limit
      sheet (SCR-049) when `can_add === false`, otherwise the owner form with a new draft (SCR-050, BR-APP-075);
    - «Мои объявления» (ListChecks icon), shown only when the owner has listings (`SettingsScreen.jsx:264-275` at r31).
      Its value is the first that applies: «ждут ответа: N» when requests wait for an answer; else the number of
      `active` and `paused` listings that are not `withdrawn`; else «Черновик» when a draft exists; else empty
      (`SettingsScreen.jsx:216-229` at r31). The row also carries a red counter with the pending number (the `count` of
      `SettingsRow`, §2.1). A tap gives a light haptic and opens SCR-057, a lazy sub-page;
    - while `GET /api/owner/listings` loads, and after it failed (offline included), the group shows only «Сдать
      квартиру» with «Бесплатно», and the limit is not checked. Errors are silent (`SettingsScreen.jsx:102` at r31);
  - «Оформление»: Тема (value «Как в Telegram / Светлая / Тёмная») and Графика (Android only, or when the mode was
    changed: «Авто · полная», «Авто · облегчённая», «Полная», «Облегчённая»);
  - «Язык и валюта»: Язык, Валюта;
  - «Когда присылать»: Тихие часы («23–08» / «Выкл»), Время подборок («9 и 21»), footer «Время — ташкентское.»;
  - «Чат с ботом» (since release `index-BnFvC-Ft.js`): Вид карточек (icon `GalleryHorizontal`, value «Классический» /
    «Новый» from `settings.cards.<card_style ?? 'classic'>`, LB-APP-051), with the «Новое» pill (`sheet.new`) while
    `meta.new_features` contains `cards` and `kv-new-cards` is unset; a tap writes `kv-new-cards` and opens SCR-048
    (`SettingsScreen.jsx:150-151,321-331` at r31, the same code as the release's unit `008-added-NEW$pj.jsx:165-176`;
    `$KVADRO_ROOT/demo/app/src/lib/newFeatures.js:11-18`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:51`);
  - «Лента»: Скрытое (count), only when something is hidden;
  - «О приложении»:
    - «Значок на экране телефона — Добавить» when the home-screen status is `missed` or `unknown`;
    - «Написать в поддержку» when `support` is known;
    - «Мы в Instagram @kvadro.app» (`https://www.instagram.com/kvadro.app/`);
    - the about text «KvadroApp собирает объявления из открытых Telegram-каналов. В каждой карточке — ссылка на
      оригинал.» (`$KVADRO_ROOT/demo/app/src/features/settings/AboutGroup.jsx:17-52`).
- **Texts of the group «Сдаю квартиру»** (main dictionaries, so visible before any chunk loads; `ru.js:605-615`,
  `en.js:576-586`, `uz_Latn.js:576-586` at r31):

  | Key | ru | uz_Latn | en |
  | --- | -- | ------- | -- |
  | `own.group` | «Сдаю квартиру» | «Kvartira ijaraga beraman» | «Renting out» |
  | `own.title` | «Сдать квартиру» | «Kvartirani ijaraga berish» | «Rent out a flat» |
  | `own.free` | «Бесплатно» | «Bepul» | «Free» |
  | `own.mine` | «Мои объявления» | «Mening eʼlonlarim» | «My listings» |
  | `own.pendingShort` | «ждут ответа: {n}» | «javob kutmoqda: {n}» | «waiting: {n}» |
  | `own.draftShort` | «Черновик» | «Qoralama» | «Draft» |
  | `own.limitValue` | «{n} из {max}» | «{n} / {max}» | «{n} of {max}» |

- **Not present in the Mini App** (checked in code): city setting (city lives in the feed and filters), news toggle,
  privacy policy, data deletion, account. These are bot functions (`$KVADRO_ROOT/docs/about.md` §5.11; see
  `05-telegram-miniapp-audit.md` §3).
- **APIs:** `GET /api/settings`, `GET /api/subscriptions` (digest hint), `GET /api/hidden`, `GET /api/bot`,
  `PUT /api/settings`; since `index-BnFvC-Ft.js` also `POST /api/settings/card-sample` (from SCR-048). Since
  `index-CBlEKxdL.js` also `GET /api/owner/listings` (on mount, when `ownerVersion` changes, and when «Мои объявления»
  is opened or closed; `SettingsScreen.jsx:101-107` at r31) and `GET /api/owner/pending` through the shared counter
  (BR-APP-091).
- **Storage:** since `index-BnFvC-Ft.js` the «Вид карточек» row writes `kv-new-cards` (§3.2).
- **Analytics:** `$pageview settings`. Sub-pages are not tracked, except «Мои объявления» since `index-CBlEKxdL.js`
  (`owner/mine`, SCR-057). Since release `index-CIa0Ldj2.js` the owner group sends events:
  `owner_limit_sheet {where: "settings"}` when the limit sheet opens from «Сдать квартиру» (SCR-049;
  `SettingsScreen.jsx:259-261` at r33), and a tap on the Settings tab while requests wait sends `owner_attention` with
  `what: "dot"` and `action: "clicked"` (SCR-060); the `banner` pair of that event belongs to the owner panel (SCR-059)
  (§3.3).
- **Edge cases:** since release `index-CBlEKxdL.js` every tap on «Сдать квартиру» below the limit creates a new draft
  (LB-APP-054).
- **Failed saves** (since release `index-CIa0Ldj2.js`): every failed `PUT /api/settings` of the tab and its sub-pages
  shows the toast «Не получилось сохранить» (BR-APP-051; `SettingsScreen.jsx:145-149,185-190,202-205` at r33).
- **Sub-pages leave** (since release `index-YX9bFVws.js`): every sub-page built on `SubPage` (SCR-033 to SCR-039,
  SCR-048, SCR-057, SCR-058) slides out to the right over 200 ms when it closes by Back or by its close cross, and not
  after a swipe-back (BR-APP-112; `$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx:30-31` at r38). Its entrance
  `subpage-in` is unchanged, only its curve is now written as `var(--ease-out)`, the same value (§3.6).
- **Status:** CONFIRMED.

### SCR-033 — Settings › Theme (`screen`, sub-page)

- **Options:** `auto` «Как в Telegram», `light` «Светлая», `dark` «Тёмная».
- **Effect:** applied at once (`kv-theme`, `data-theme` / `data-scheme`, the Telegram header and background colour),
  then `PUT /api/settings {theme}`. On error it rolls back with the error haptic (`SettingsScreen.jsx:98-114`). Since
  release `index-CIa0Ldj2.js` also with the toast «Не получилось сохранить» (BR-APP-051; `SettingsScreen.jsx:185-190` at
  r33).
- **Sub-page chrome** (shared by SCR-033 to SCR-039 and SCR-048; since release `index-CBlEKxdL.js` also by SCR-057 and
  SCR-058, through the lazy frame of §1.9): a fixed layer (z 40) with a 24% slide-in, swipe-back, Telegram Back, and a
  header shadow when scrolled (`$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx`). Since release
  `index-BnFvC-Ft.js` an open sub-page sets `body.subpage-open` (`overflow: hidden`), so the settings list under it does
  not scroll, and `.subpage` has `overscroll-behavior: contain` (the release's unit `011-modified-SubPage.jsx.diff`;
  `SubPage.jsx:21-25` and `$KVADRO_ROOT/demo/app/src/styles/settings.css:153,164` at r31;
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:61`). Since release `index-CBlEKxdL.js` a lazy frame that has shown once does
  not replay its entrance (`.subpage.settled`; `$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx:1-67` at r31). Since
  release `index-CIa0Ldj2.js` the chrome carries the close cross of `05` TMA-047 while the Telegram SDK is absent
  (`SubPage.jsx:33` at r33).
- **Status:** CONFIRMED.

### SCR-034 — Settings › Graphics (`screen`, sub-page)

- **Options:** «Авто · <полная|облегчённая>», «Полная», «Облегчённая», with a hint about blur and slow phones
  (`settings.graphics.hint`).
- **Storage:** local only (`kv-graphics`); `auto` also clears `kv-graphics-measured`. No API call.
- **Status:** CONFIRMED.

### SCR-035 — Settings › Language (`screen`, sub-page)

- **Options:** `settings.locales`, with the hint «Для приложения, бота и карточек объявлений.» (`notify.languageHint`).
- **Effect:** choosing another language calls `PUT /api/settings {locale}`, then `kv-locale`, then a full reload. A
  failure plays the error haptic only up to `index-CBlEKxdL.js`; since release `index-CIa0Ldj2.js` it also shows the
  toast «Не получилось сохранить», and the page does not reload (BR-APP-051;
  `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:202-205` at r33).
- **Status:** CONFIRMED.

### SCR-036 — Settings › Currency (`screen`, sub-page)

- **Options:** `settings.currencies` (e.g. «Доллары ($)», «Сумы»), with the hint «Цены в ленте, на карте и в карточках
  бота.».
- **Effect:** `PUT /api/settings {currency}`, then a full reload. Since release `index-CIa0Ldj2.js` a failed save shows
  the toast «Не получилось сохранить», and the page does not reload (BR-APP-051;
  `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:202-205` at r33).
- **Status:** CONFIRMED.

### SCR-037 — Settings › Quiet hours (`screen`, sub-page)

- **Options:** `settings.quiet_presets` such as `23-08` («23–08») or `off` («Выкл»), with the hint «Карточки не
  приходят; всё, что появилось за ночь, — одной подборкой утром.».
- **Effect:** optimistic `PUT /api/settings {quiet}`; rollback and error haptic on failure. Since release
  `index-CIa0Ldj2.js` also the toast «Не получилось сохранить» (BR-APP-051).
- **Status:** CONFIRMED.

### SCR-038 — Settings › Digest time (`screen`, sub-page)

- **Options:** `settings.digest_presets` such as `09`, `09,21` («9 и 21»).
- **Hint:** «Во сколько присылать новое от радаров в режиме «Подборкой».» when an active digest radar exists, else
  «Для радаров в режиме «Подборкой» — режим переключается в карточке радара, вкладка «Радар».», followed by «Время —
  ташкентское.».
- **Effect:** optimistic `PUT /api/settings {digest}`. Since release `index-CIa0Ldj2.js` a failed save rolls back with
  the toast «Не получилось сохранить» (BR-APP-051).
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
  - Every success resets the app's local `hidden` map. Since release `index-CIa0Ldj2.js` it also drops the feed scroll
    memory and re-creates the search feed (BR-APP-105; `$KVADRO_ROOT/demo/app/src/app/App.jsx:813-818`,
    `$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:32-35` at r33); before, only the map was cleared.
  - Since release `index-CIa0Ldj2.js` a failed request restores only what that action had removed: the list is rebuilt
    from the items still present plus the items this action removed, so removals of other requests still in flight are
    kept. It also shows the toast «Не получилось сохранить» (`HiddenScreen.jsx:28-54` at r33). Before, the whole
    previous list came back, with the error haptic only.
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
- **Since release `index-CBlEKxdL.js`:** both kinds can be swiped down: the toast follows the finger and fades
  (`max(0.2, 1 − dy/120)`); past 36 px it closes, otherwise it returns (`Toast.jsx:4-5,15-47` at r31). The offset
  depends on what is at the bottom (`$KVADRO_ROOT/demo/app/src/styles/feedback.css:23-29,77-88` at r31): tab bar +
  inset + 20 px by default; + 78 px with the view toggle (search tab); inset + 16 px over a sub-page; inset + 88 px over
  the listing's CTA bar; inside the filters sheet `--fsheet-foot` + 10 px. Before the release there was a single offset,
  tab bar + inset + 78 px, and the foot + 10 px inside the filters sheet.
- **Since release `index-CIa0Ldj2.js`:** the toast is global. The App registers its setter with `bindToast`, and any
  component calls `pushToast(msg)`; without a registered sink nothing happens (`Toast.jsx:6-26`,
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:276` at r33). «Не получилось сохранить» (`common.saveFailed`) now also shows in
  these places, which gave an error haptic at most before (LB-APP-027):

  | Place | With | Evidence (at r33) |
  | ----- | ---- | ----------------- |
  | A failed favourite heart | error haptic, rollback (BR-APP-039) | `$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:29-32` |
  | A failed «Очистить» of the history | error haptic (BR-APP-067) | `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:114-117` |
  | The hidden list: a failed return of an author, a listing or all | partial rollback (SCR-039) | `$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:51-52` |
  | Settings: any failed `PUT /api/settings` patch | rollback (BR-APP-051) | `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:145-149` |
  | Settings: a failed theme save | the theme rolled back | `SettingsScreen.jsx:185-190` |
  | Settings: a failed language or currency save | no reload | `SettingsScreen.jsx:202-205` |
  | Radar: a failed switch, except `no_chat` | rollback (BR-APP-048, LB-APP-081) | `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:130-134` |
  | Radar: a failed mode change, unhide or delete | rollback where optimistic | `RadarScreen.jsx:152-156,172-175,194-197` |
  | A failed undo of «Уже сдано» | the listing hidden again (SCR-023) | `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:44-47` |

  The language picker of the first launch shows the same text as a line under the list, not as a toast (SCR-004).
- **Since release `index-YX9bFVws.js`:**
  - The lifetimes are named constants with the same values: `TOAST_MS = 4000` and `ACTION_TOAST_MS = 6000`
    (`$KVADRO_ROOT/demo/app/src/components/Toast.jsx:29-32,50-53` at r38).
  - A toast with an action shows a countdown ring before the action's label: a 16 px SVG (`viewBox 0 0 20 20`, radius
    8, stroke 2.4, turned −90°), a faint full circle under a circle whose dash offset runs from 0 to 1 over
    `ACTION_TOAST_MS`, linear, `forwards`. The ring is keyed by the toast's text. When the time is up the toast goes
    through `onDone` only; the action does not run. Under reduced motion the ring has no animation and stays full
    (BR-APP-118; `Toast.jsx:96-108`, `$KVADRO_ROOT/demo/app/src/styles/feedback.css:65-91` at r38). A replacement with
    the same text restarts the timer but not the ring (LB-APP-085).
  - An unmount plays the toast leave of BR-APP-112 (180 ms down and out), except after a swipe, which leaves an inline
    transform, and when another toast replaced it in the same commit (`Toast.jsx:81,87` at r38). The second instance
    inside the filters sheet leaves the same way, unless the whole sheet goes (`FiltersSheet.jsx:257` at r38).
- **Status:** CONFIRMED.

### SCR-043 — Confirm dialogs (`modal`)

- **Mechanism:** `WebApp.showConfirm` (6.2+), else `window.confirm` (`$KVADRO_ROOT/demo/app/src/lib/telegram/dialogs.js:9-17`).
- **Uses:**
  - clear history (`feed.clearConfirm`);
  - delete radar (`subs.deleteConfirm`);
  - return all hidden (`hidden.confirmAll`);
  - restart the bot after `no_chat`: «Бот не может писать вам — похоже, он остановлен. Открыть чат с ботом? Нажмите там
    «Перезапустить» и включите радар снова.» (`chat.restart`), which opens `https://t.me/<bot>` on OK
    (`$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:50-52`);
  - since release `index-CBlEKxdL.js`, in the owner cabinet: «Отметить «Сдано»? Объявление уйдёт из ленты, а тем, кто
    ждёт ответа, скажем, что квартиру сдали.», «Снять объявление?» and «Удалить черновик?» (BR-APP-088;
    `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:765-775` at r31).
- **Status:** CONFIRMED.

### SCR-044 — Telegram system sheets triggered by the app (`modal`)

These are native Telegram UI with no app-side layout:

- `requestWriteAccess` after a `409 no_chat` (TMA-033);
- the `shareMessage` forward picker (TMA-030);
- the `addToHomeScreen` dialog (TMA-036);
- the LocationManager or browser geolocation permission (TMA-035);
- `openLink` / `openTelegramLink` hand-off (TMA-028);
- since release `index-CBlEKxdL.js` the contact-sharing prompt of `requestContact`, on the phone step of the owner form
  (TMA-034, SCR-053).

The app only reacts to their results. Status: CONFIRMED (calls seen in code; native rendering not observed).

### SCR-045 — Crash screen, ErrorBoundary (`state`)

- **Opens:** any render exception under `<App/>`. Since release `index-CIa0Ldj2.js` a render error of a map view no
  longer reaches it: the map has an error boundary of its own (SCR-011, §1.6). That such an error reached this screen
  before is `inferred`.
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
- **With the fresh pill** (since release `index-CIa0Ldj2.js`): the banner is independent of the pill SCR-063; after one
  long return both can ask `GET /api/feed/new`, each with its own `since`, and both can be on screen (LB-APP-082).
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

### SCR-048 — Settings › Card style «Вид карточек» (`screen`, sub-page)

- **Since:** release `index-BnFvC-Ft.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:51-54`). `CardStylePicker.jsx`,
  `SettingsPages.jsx` and `card-style.css` are at r29; `SettingsScreen.jsx` is at r31, where its card-style code equals
  the release's unit `008-added-NEW$pj.jsx`.
- **Opens:** the «Вид карточек» row of the group «Чат с ботом» (SCR-032).
- **Layout:** a `bare` sub-page (no `.set-card` around the content) with the chrome of SCR-033 and the title «Вид
  карточек» (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsPages.jsx:144-159` at r29). Inside
  (`$KVADRO_ROOT/demo/app/src/features/settings/CardStylePicker.jsx` at r29):
  - a `role="radiogroup"` of two `role="radio"` buttons side by side, the current one `aria-checked` and `.on`; each
    holds a mock of the bot's message (`aria-hidden`), the name and a hint (`:17-39`);
  - «Классический» (`classic`): a photo placeholder, then caption lines 🏠 title, 💰 price, 📊 market, 📍 place, 🏢 area
    and floor, 🏠 owner and a quote; inline-button rows [📱 📍] [🔗 📷 +5] [⭐ …] (`:97-126`);
  - «Новый» (`rich`): a photo placeholder with four dots, the price as a heading, the bold title, 📊 market, a table
    Район / Метро / Площадь / Сдаёт, «📝 Описание ›»; button rows [📱 📍] [🔗 ⭐] [… ] (`:128-165`);
  - the hint `settings.cards.hint`, and a bottom panel with the result line and the full-width primary button
    (`:40-56`).
  The mock texts are the 16 keys `settings.cards.demo.*`. Styles: 35 `.cs-*` rules and their
  `@supports not (color: color-mix(…))` fallback in the new `src/styles/card-style.css`, the last `@import`
  (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md:34`).
- **Texts** (`ru.js:572-600`, `uz_Latn.js:543-571`, `en.js:543-571` at r29):

  | Key | Used for | ru | uz_Latn | en |
  | --- | -------- | -- | ------- | -- |
  | `settings.group.chat` | group title (SCR-032) | «Чат с ботом» | «Bot bilan chat» | «Chat with the bot» |
  | `settings.cards` | row and sub-page title | «Вид карточек» | «Kartochkalar koʻrinishi» | «Card style» |
  | `settings.cards.classic`, `.rich` | option names, row value | «Классический», «Новый» | «Klassik», «Yangi» | «Classic», «New» |
  | `settings.cards.classicHint` | under «Классический» | «Фото и подпись. Видно в любой версии Telegram» | «Rasm va matn. Telegramning istalgan versiyasida koʻrinadi» | «Photo and caption. Shows in any Telegram version» |
  | `settings.cards.richHint` | under «Новый» | «Фото листаются в карточке, данные — таблицей» | «Rasmlar kartochkada varaqlanadi, maʼlumotlar jadvalda» | «Photos swipe in the card, details in a table» |
  | `settings.cards.hint` | under the options | «Так карточки объявлений приходят в чат с ботом. Новый вид показывают только свежие версии Telegram — пришлите пример и проверьте: если карточку не видно, обновите Telegram или верните классический.» | same meaning | same meaning |
  | `settings.cards.send` | button | «Прислать пример в чат» | «Namunani chatga yuborish» | «Send a sample to the chat» |
  | `settings.cards.sending` | button while sending | «Отправляем пример в чат…» | «Namuna chatga yuborilmoqda…» | «Sending a sample to the chat…» |
  | `settings.cards.sent` | result, with a check icon | «Пример — в чате с ботом» | «Namuna bot bilan chatda» | «Sample sent to the bot chat» |
  | `settings.cards.minimize` | second line of `sent` | «Чтобы посмотреть, сверните приложение — смахните его вниз» | «Koʻrish uchun ilovani yigʻing — uni pastga suring» | «To see it, minimize the app — swipe it down» |
  | `settings.cards.failed` | result | «Пример не отправился — вид всё равно сохранён» | «Namuna yuborilmadi — koʻrinish baribir saqlandi» | «The sample didn't send — the style is saved anyway» |

- **States of the sample:** `idle`; `sending` (button disabled with a spinner); `sent`; `failed`. The state belongs to
  the settings screen, not to the sub-page, so it outlives a close of the sub-page (LB-APP-053) and is lost when the
  Settings tab unmounts (`SettingsScreen.jsx:95-96` at r31).
- **Actions:** BR-APP-074.
- **APIs:** `PUT /api/settings {card_style}` (API-025), `POST /api/settings/card-sample` (API-036).
- **Storage:** none here; the row of SCR-032 writes `kv-new-cards`.
- **Analytics:** none (sub-pages are not tracked).
- **Edge cases:** an unknown `card_style` (LB-APP-051); a `card-sample` answer without a JSON body (LB-APP-052).
- **Sources:** `CardStylePicker.jsx`; `SettingsPages.jsx:144-159`; `SettingsScreen.jsx:94-96,150-171,321-331` at r31;
  parity scenarios `settings-cards`, `settings-cards-rich-saved`, `settings-cards-pick`, `settings-cards-pick-fail`,
  `settings-cards-sample`, `settings-cards-sample-unsent`, `settings-cards-sample-error`, `settings-cards-sample-pick`,
  `settings-cards-badge`, `settings-cards-badge-seen`
  (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md:51-56`).
- **Status:** CONFIRMED for the client. What the bot sends for each style is UNVERIFIED (Q-API-067, Q-BOT-046;
  `04` §3.10).

### SCR-049 — Limit sheet «Сдаются N из max квартир» (`sheet`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** tells an owner who lists the maximum number of flats why a new one cannot be added.
- **Opens:** from the Settings row «Сдать квартиру» at the limit (SCR-032), with the button «Мои объявления»; or from
  «Сдать ещё одну квартиру» in «Мои объявления» (SCR-057), with the button «Понятно»
  (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:254-262`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:386`).
- **Closes:** the button (light haptic), a tap on the backdrop, a drag on the handle, or Telegram Back
  (`$KVADRO_ROOT/demo/app/src/features/settings/OwnerLimitSheet.jsx:17-32`).
- **Layout:** a bottom sheet (`csheet`) rendered into `document.body` through a portal (`OwnerLimitSheet.jsx:16-61`):
  - the title `own.limitSheetTitle` with `n = max` and `max = max`: «Сдаются 2 из 2 квартир»;
  - the text `own.limitSheetText` «Это максимум на один номер. Отметьте одну квартиру «Сдано» или снимите её — и сможете
    добавить новую.» (`ru.js:609-611`);
  - one button: «Мои объявления» (primary) or «Понятно» (`owner.info.ok`).
- **Note:** the text speaks of a limit «на один номер» (per phone), while `can_add` and `max` are per account
  (`$KVADRO_ROOT/docs/api.md:1406-1411`). Which of the two the server counts is open (Q-API-068).
- **Analytics:** since release `index-CIa0Ldj2.js` `owner_limit_sheet {where}` on every mount of the sheet; `where` is
  `settings` or `mine`. The sheet gained the prop `where` for it and is otherwise unchanged
  (`OwnerLimitSheet.jsx:18-26`, `SettingsScreen.jsx:259-261`, `OwnerListings.jsx:384` at r33; §3.3).
- **Sources:** `OwnerLimitSheet.jsx`; `SettingsScreen.jsx:254-262`; `OwnerListings.jsx:386`.
- **Status:** CONFIRMED.

### SCR-050 — Owner form «Сдать квартиру»: layer, loading, error and limit states (`screen`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** the layer in which an owner lists a flat for long-term rent or edits a listing. Its steps have entries of
  their own: the place picker (SCR-051), the questionnaire (SCR-052), the phone confirmation (SCR-053) with its
  rejection state (SCR-054), the contact mode (SCR-055) and the done state (SCR-056).
- **Opens:** when `ownerFormId` is `null` (a new draft) or an owner listing id (an edit)
  (`$KVADRO_ROOT/demo/app/src/app/App.jsx:133-148`). It renders only once `meta` is loaded, as a lazy layer keyed by
  `id ?? 'new'` (`App.jsx:801-822`).
- **Entry points of the cabinet:**

  | Entry | What happens | Evidence |
  | ----- | ------------ | -------- |
  | Settings → group «Сдаю квартиру» (the first group, SCR-032) → row «Сдать квартиру» | A new draft in the form, or the limit sheet (SCR-049) when `can_add` is false | `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:233-262`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:30` |
  | Settings → row «Мои объявления» (only when the owner has listings) | «Мои объявления» (SCR-057) | `SettingsScreen.jsx:264-275,366-380` |
  | Launch link `startapp=owner_new` or `owner-new`, or the page query `?owner=new` | The app starts with the form open on a new draft. This is read once, when `App` mounts (TMA-046) | `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:60-71`; `App.jsx:133-135` |
  | «Сдать ещё одну квартиру» (the list), «Сдать ещё одну» (the panel, past listings) | A new draft | `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:363-371,462-466`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:212-215` |
  | «Продолжить» on a draft card, a tap on a draft, «Изменить», the fill hints of the panel | The form for that listing (`id`) | `OwnerListings.jsx:111-126,422-436`; `OwnerPanel.jsx:164,187,238-244` |
  | A published card with `listing_id` | The public listing screen in its `owner_mine` variant (SCR-059) | `OwnerListings.jsx:422-436` |
  | The red dot and the tab tip «Пришёл первый отклик!» | Switches to the Settings tab (SCR-060) | `App.jsx:719-734` |
  | Since release `index-YX9bFVws.js`: the owner invitations «Сдаёте квартиру? Разместите бесплатно» at the end of the search feed (SCR-007), under an empty search (SCR-009) and «Тоже сдаёте квартиру?» on a listing with `owner_entry` (SCR-018) | `GET /api/owner/listings`: `can_add` true opens the form on a new draft; false closes the listing, switches to the Settings tab and opens «Мои объявления» (SCR-057); a failed request also opens a new draft (BR-APP-115) | `App.jsx:167-187,913,970` (at r38) |

- **Flow, end to end:**
  1. An entry point sends `POST /api/owner/listings` (a new draft). `409` shows «Уже две квартиры», the limit state
     below.
  2. Step «where», for a draft without a point: the place picker (SCR-051). The map start is awaited for at most 1.5 s,
     the address lookup runs 400 ms after the map stops, and «Готово» sends `POST /api/owner/place`, which fills the
     city, the district and the landmark. «Указать вручную» leads to the questionnaire.
  3. Step «form» (SCR-052): photos, place, rooms, price, renovation, furniture, tenants, pets and description. Autosave
     by `PATCH` after 600 ms; the demand hint after 500 ms; «Дальше» needs a city, a place, rooms, a price and at least
     one photo.
  4. Step «phone» (SCR-053), unless `phone_set`: «Поделиться номером» calls `requestContact`, and the bot gets the
     contact. The form polls `GET /api/owner/listings/:id` every 1.5 s for at most 90 s, until `phone_set`, a rejection
     (SCR-054) or `not_uz` / `not_own`.
  5. Step «mode» (SCR-055): «Через kvadro²» (`gate`) or «Показывать номер» (`open`) and a preview, then «Опубликовать»
     sends `POST …/publish`, whose errors are `missing:…`, `status:…` and `rejected:…`.
  6. Step «done» (SCR-056): confetti, then «Мои объявления» or «Готово».
  7. Later: «Мои объявления» (SCR-057) and its «Отклики» (SCR-058) with «Дать номер», «Не подходит», the reasons, the
     undo and «Оказался риелтором»; the owner's own listing with the panel «Ваше объявление» (SCR-059: stats, fill
     hints, footer actions); the pending counter with the red dot, the Settings counter and the tips (SCR-060).
- **Frame while the chunk loads:** a full-screen layer with the title «Сдать квартиру» and a spinner. Telegram Back and
  swipe close it. A failed chunk load shows an `ErrorState` with a retry
  (`$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx:97-118,146-182`; §1.9).
- **Data:**
  - A new form sends `POST /api/owner/listings`; an existing one sends `GET /api/owner/listings/:id`. A spinner shows
    meanwhile (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:183-238,768-774`).
  - `409` on create shows the limit state: «Уже две квартиры», the text `own.limitText` and a «Мои объявления» button
    (`OwnerForm.jsx:221-235,747-759`).
  - Any other error shows a tall `ErrorState` with a retry. A retry of a **new** form posts again
    (`OwnerForm.jsx:760-767`).
  - A loaded draft without a point starts at step «where» (SCR-051); everything else starts at «form» (SCR-052)
    (`OwnerForm.jsx:193-196`). A form that opens for a new draft also reads `GET /api/owner/listings` once, for «С
    возвращением!» (BR-APP-095; `OwnerForm.jsx:214-219`).
- **Layer:** `OwnerLayer`, a full-screen layer with a scroll area, a header with the title and an optional subtitle, and
  a shadow once scrolled. It sets `body.listing-open` so the page below does not scroll (`OwnerForm.jsx:1459-1481`). In
  the CSS the form layer is `z-index: 46` (`$KVADRO_ROOT/demo/app/src/styles/owner-shared.css:9-15`). Its footer bar and
  the requests page opened from the panel are 47 (`$KVADRO_ROOT/demo/app/src/features/owner/owner.css:193-198,891-892`).
  The place picker is 60 (`owner.css:1177-1183`), and so is the backdrop of the city sheet
  (`$KVADRO_ROOT/demo/app/src/styles/city-sheet.css:7-8`).
- **Back and swipe in the cabinet:**

  | Where | Telegram Back | Swipe back | Evidence |
  | ----- | ------------- | ---------- | -------- |
  | The lazy frame of the form (chunk loading or chunk error) | closes the form | yes | `LazyPage.jsx:97-118` |
  | Form layer: loading, load error, limit, «form», «done» | with the photo menu open it closes the menu; otherwise it closes the form | yes | `OwnerForm.jsx:370-382,749,762,769,844-849,995-996,1459-1461` |
  | Step «where» (the first map) | closes the **whole form** | the picker's edge swipe closes the form | `OwnerForm.jsx:374-375,778,791`; `$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:51-52,156` |
  | The picker opened from the form | closes the picker | edge swipe (`data-edge-swipe`) | `PlacePicker.jsx:51-52,156` |
  | Steps «phone» and «mode», and the rejection state | back to «form», with its scroll position restored | no | `OwnerForm.jsx:376-377,383-385,906,1623,1666` |
  | «Мои объявления», «Отклики» | close the sub-page, as every Settings sub-page | yes | `$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx:19-27` |
  | Limit sheet | closes it | a drag on the handle; a tap on the backdrop also closes it | `$KVADRO_ROOT/demo/app/src/features/settings/OwnerLimitSheet.jsx:17-32` |

  Every Back from the form gives a light haptic (`OwnerForm.jsx:371`). The handlers stack: the lazy frame pushes its
  close while the chunk loads, then the form pushes its own handler, and an open picker pushes its own close. This is
  the stack of §1.2 (TMA-022).
- **«Мои объявления» from inside the form** closes the form and any open listing, switches to Settings and opens SCR-057
  (`App.jsx:815-820`).
- **Without the SDK** (since release `index-CIa0Ldj2.js`): the form layer shows the close cross of `05` TMA-047
  (`OwnerForm.jsx:1491` at r33).
- **APIs:** `POST /api/owner/listings` (API-038), `GET /api/owner/listings/:id` (API-039), `GET /api/owner/listings`
  (API-037).
- **Analytics:** the screen name is `owner/form` for all steps
  (`$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:30-36`). The form sends no event up to `index-CBlEKxdL.js`
  (LB-APP-058). Since release `index-CIa0Ldj2.js` it sends `owner_place_set {source}` when the place picker returns
  (`map`, `locate` or `manual`; SCR-051) and `owner_place_autofill {result}`: `applied` when the address lookup for the
  point filled or replaced at least one of city, district and landmark, `reverted` when the user taps the undo of the
  «replaced» toast (`OwnerForm.jsx:554-557,616-620,631-636,805-809` at r33; §3.3).
- **Edge cases:**
  - On a first launch through `owner_new`, a user who has not chosen a city yet gets the blocking first-launch city
    picker (SCR-005; `App.jsx:388,898-906`). Its root is `.sheet-backdrop.city-backdrop`
    (`$KVADRO_ROOT/demo/app/src/features/city/CityPicker.jsx:55`), and `.city-backdrop` has `z-index: 60`, above the
    form layer's 46, so the city most likely has to be picked first (`inferred` from the CSS: the rule order against
    `.sheet-backdrop` was not checked; Q-APP-028). The language picker gate (SCR-004) comes before both
    (`App.jsx:365-367`).
  - Every entry creates a new draft (LB-APP-054).
- **Sources:** `OwnerForm.jsx`; `LazyPage.jsx`; `$KVADRO_ROOT/demo/app/src/app/layers.js`; `App.jsx`;
  `$KVADRO_ROOT/demo/app/src/lib/api/owner.js`; `$KVADRO_ROOT/demo/app/src/features/owner/owner.js` (the dictionary);
  `owner-shared.css`; since `index-CIa0Ldj2.js` also `$KVADRO_ROOT/demo/app/src/components/FallbackClose.jsx`.
- **Status:** CONFIRMED.

### SCR-051 — Place picker «Где квартира?» (`overlay`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** the owner sets the point of the flat on a map.
- **Opens:**
  - as step «where» of the owner form (SCR-050) for a new draft without a point. The secondary button is then «Указать
    вручную» (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:776-797`);
  - from the questionnaire (SCR-052), through the «Карта» button of the address field or a tap on the spot preview. The
    secondary button is then «Отмена» (`OwnerForm.jsx:545-549,1012-1016,1040-1065`).
  - The start view follows BR-APP-076. While the start point is still being resolved, the step shows a spinner
    (`OwnerForm.jsx:779-783`).
- **Closes:** «Готово», «Указать вручную» or «Отмена», Telegram Back, or a swipe from the left edge. On step «where»,
  Back and the edge swipe close the whole form (SCR-050).
- **Layout:** a full-screen map rendered into `document.body` through a portal, at `z-index: 60`
  (`$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:155-216`;
  `$KVADRO_ROOT/demo/app/src/features/owner/owner.css:1177-1183`). It has:
  - a fixed pin in the centre with a house glyph, which lifts while the map moves (`moving`), and a centre dot;
  - the label under the pin: «…» while the lookup runs, else the address, else «landmark · district», else the city
    name, else `own.pickNoAddr`;
  - at the bottom, the round «Найти меня» button (only when a location can be requested, BR-APP-097) and a glass panel
    with the title `own.whereTitle`, a hint line (`own.pickHint` or a status hint), the primary «Готово» (disabled until
    the map is mounted) and the text button «Указать вручную» / «Отмена»;
  - the map attribution.
- **Map engine** (`PlacePicker.jsx:98-114`; `$KVADRO_ROOT/demo/app/src/features/owner/pickMap.js:30-66,143-157`):
  - GL (MapLibre) when the app's engine is `gl` (§1.8). If GL fails, the picker falls back to Leaflet. PMTiles are
    registered for a `.pmtiles` URL.
  - GL is set up without rotation, pitch, keyboard or world copies. Its pixel ratio is 1 in lite graphics, else at
    most 2. A tap eases the centre to the tapped point (300 ms).
  - Leaflet uses `zoomSnap: 0.25` and the shared basemap (raster when `tiles` is `null`).
- **Actions:**
  - The address lookup follows BR-APP-077.
  - «Найти меня» follows BR-APP-097.
  - «Готово» with the centre outside the rectangle gives a warning haptic and the hint `own.pickOutside`. Otherwise it
    gives a medium haptic, rounds the coordinates to 5 decimals and continues with BR-APP-078
    (`PlacePicker.jsx:142-154`).
  - «Указать вручную» (light haptic) leads to the questionnaire. «Отмена» closes the picker.
- **States:** while waiting for the map start, a spinner. While the map mounts, «Готово» is disabled. If both engines
  fail, the map stays blank and «Готово» stays disabled with no message (`inferred`: the Leaflet mount rejection is not
  handled, `PlacePicker.jsx:103-114`; Q-APP-028). Offline: the lookup fails and the label shows `own.pickNoAddr`.
- **Haptics:** light on opening (from the form) and on «Найти меня»; warning on a denied or failed location and on a
  centre outside the rectangle; medium on «Готово».
- **Texts** (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:27-47`): `own.whereTitle` «Где квартира?» (en «Where is
  the flat?», uz «Kvartira qayerda?»); `own.pickHint` «Хватит ориентира рядом — точный адрес ищущие всё равно не
  увидят.»; `own.pickDone` «Готово»; `own.whereManual` «Указать вручную»; `own.pickCancel` «Отмена»; `own.pickMe` (aria)
  «Найти меня»; `own.pickNoAddr`; `own.pickDenied`; `own.pickFailed`; `own.pickRough`; `own.pickFarMe`;
  `own.pickOutside`.
- **APIs:** `GET /api/owner/map-start` (API-052), `POST /api/owner/place` (API-051).
- **Analytics:** since release `index-CIa0Ldj2.js` the picker gives the form the `source` of `owner_place_set`
  (SCR-050): `locate` when «Где я» succeeded at any time before the confirmation of the point, else `map`; «Указать
  вручную» gives `manual`, and no point is set (`PlacePicker.jsx:124,141,156`, `OwnerForm.jsx:554-557,805-809` at r33;
  §3.3).
- **Edge cases:** Back from the first step closes the form and leaves the draft behind (LB-APP-054); the "inside
  Uzbekistan" test is a rectangle (LB-APP-063).
- **Sources:** `PlacePicker.jsx`; `pickMap.js`; `OwnerForm.jsx`.
- **Status:** CONFIRMED. The real MapLibre and Leaflet render inside the form was checked only by the parity scenario
  `owner-form-new` (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-18_index-CBlEKxdL/REPORT.md:88-89`).

### SCR-052 — Owner form › Questionnaire (`screen`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31. Step «form» of SCR-050.
- **Purpose:** the owner describes the flat. The form is for long-term rent only: the price is «В месяц», the renovation
  list falls back to `rent_long`, and it asks who the tenants may be.
- **Title:** «Сдать квартиру» for a draft; `own.editTitle` «Изменить объявление» when the listing was not a draft at
  load (`isEdit`). The subtitle is `own.subtitle`, «Бесплатно. Риелторы ваш номер не увидят.»
  (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:180-181,995-1003`).
- **Sections, in order** (`OwnerForm.jsx:1004-1391`):
  1. **Welcome:** `own.welcome` «С возвращением! Вы уже размещали у нас квартир: {n}» (BR-APP-095).
  2. **Place:**
     - When `shown_point` exists and the point in the form equals the saved one, a spot preview with the circle that
       seekers see, plus `own.mapNote` «Точный адрес никому не показываем: ищущие видят только круг около 500 м. Нажмите
       на карту, чтобы поправить точку.» A tap opens the picker (SCR-051; `OwnerForm.jsx:980-989,1010-1016`).
     - The field «Адрес или ориентир» (placeholder «Например, ул. Катартал», at most 120 characters). Without a preview
       it carries the «Карта» button. Erasing the text while a point is set also removes the point
       (`OwnerForm.jsx:1017-1053`).
     - The error `own.pointOutside` when the point is rejected or outside the rectangle, and the note `own.placeNote`
       after a silent fill (`OwnerForm.jsx:990-992,1055-1056`).
  3. **Photos** «Фото {n} из 10» (`OwnerForm.jsx:1067-1137`; BR-APP-082):
     - a grid in which the first photo carries «Обложка». A tap opens a mini menu: «Сделать обложкой» (star, only from
       the second photo on) and «Удалить фото» (trash);
     - spinner tiles while photos upload, and an add tile (camera when empty, image-plus otherwise). The add tile is
       hidden during an upload and at 10 photos. Since release `index-YX9bFVws.js` the spinner is gone: the tile being
       sent shows a 40 px progress ring with the percent in its centre, the queued tiles show only a grey ring at half
       opacity, the ring pulses once the body is sent and the answer is awaited, and a photo that the answer brings in
       new shows a green tick for 1.5 s (BR-APP-119; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:120-187,
       572-590,1249-1253,1269-1281`, `$KVADRO_ROOT/demo/app/src/features/owner/owner.css:60-134` at r38); the count
       «{n} из 10» of the heading rolls (BR-APP-113; `OwnerForm.jsx:1224-1234` at r38);
     - a hidden `<input type="file" accept="image/*" multiple>`, an error line, and `own.photosTip` when there is more
       than one photo.
  4. **Where** (`OwnerForm.jsx:1137-1181`):
     - city chips, only when meta has more than one city. Picking another city clears the district, the landmark and the
       point;
     - district chips («Район»), which toggle.
  5. **Rooms** (`OwnerForm.jsx:1183-1253`; `$KVADRO_ROOT/demo/app/src/features/owner/NumberField.jsx:4-60`):
     - buttons 1, 2, 3, 4, «5+» and the wide «Комната» (exclusive with the number of rooms);
     - three number fields: «Площадь» (m², decimal), «Этаж» (integer; «5/9» also fills the number of floors) and
       «Этажей» (integer). `own.floorBad` shows when the floor is above the number of floors.
  6. **Price** (`OwnerForm.jsx:1254-1330`; BR-APP-083):
     - «В месяц»: digits only, at most 12, shown with digit grouping. The placeholder is «600», or «7 000 000» in sum;
     - the currency segment «$» / «сум» (default USD);
     - the usual-price hint `own.usual`;
     - renovation chips from `meta.renovations.owner` (falling back to `rent_long`), which toggle;
     - furniture chips «С мебелью» / «Без мебели» (three states: yes, no, unset).
  7. **Tenants** («Кому сдаёте»; `OwnerForm.jsx:1331-1369`):
     - a multi-choice of «Семьям», «Студентам», «Девушкам», «Парням», «Иностранцам», with the hint «Можно выбрать
       несколько. Не выбрали — значит, всем.»;
     - pets chips «Можно с животными» / «Без животных» (three states).
  8. **Description:** a 4-row text area of at most 600 characters (placeholder «Что рядом, какой двор, что есть в
     квартире»), with the counter line `own.descriptionHint` «{n} из {max}. Номер здесь не пишите — мы его скроем.»
     (`OwnerForm.jsx:1370-1391`). Since release `index-YX9bFVws.js` an 18 px fill ring sits in the field's lower
     right corner from the first character on: it fills by `n / 600`, turns `--high` from 90 % (`near`) and red
     `#dc2626` at 600 (`full`), and a keystroke at the limit with a collapsed selection shakes it for 0.32 s
     (BR-APP-120; `OwnerForm.jsx:81,194-220,1537-1566`, `owner.css:1565-1614` at r38). The counter line stays.
- **Footer** (a fixed glass bar, `OwnerForm.jsx:1392-1430`):
  - One note line, the first that applies:
    1. «Заполните: {what}» after «Дальше» with missing fields;
    2. `own.floorBad`;
    3. a save-failed text: `own.fixFields` (fields rejected), `own.notEditable` (locked), `own.editOffline` or
       `own.saveFailed`;
    4. the demand line `own.demand` «Сейчас такую ищут {n} человек с радаром».
  - «Мои объявления» when the listing is locked.
  - The primary button: «Дальше: подтвердить номер», or «Дальше» when `phone_set`. It is disabled while busy or
    uploading.
- **Highlight:** a section or field is marked bad when the server rejected it, when it is missing (after «Дальше») or
  when the floor is above the number of floors (`OwnerForm.jsx:974-979`).
- **Rules:** autosave BR-APP-079; defaults and couplings BR-APP-080; the «Дальше» gate BR-APP-081; photos BR-APP-082;
  demand BR-APP-083; the place fill and its undo toast BR-APP-078 (`OwnerForm.jsx:1431`); focus from the panel
  BR-APP-093.
- **Haptics:** light on photo taps and photo actions, and on the address «Карта»; medium on «Дальше»; warning when
  something is missing; error on a failed save or photo action.
- **APIs:** `PATCH /api/owner/listings/:id` (API-040), `POST /api/owner/listings/:id/photos` (API-041),
  `DELETE /api/owner/listings/:id/photos/:photoId` (API-042), `POST /api/owner/listings/:id/photos/order` (API-043),
  `GET /api/owner/demand` (API-053), `POST /api/owner/place` (API-051).
- **Storage:** reads and removes the sessionStorage key `kv-own-focus` (BR-APP-093; §3.2).
- **Edge cases:** an edit of a published listing is saved without «Сохранить изменения» (LB-APP-055); a failed
  conversion uploads the original photo (LB-APP-061); a photo is deleted without confirmation (LB-APP-067); a city
  change or an erased address drops data (LB-APP-068).
- **Sources:** `OwnerForm.jsx`; `NumberField.jsx`; `$KVADRO_ROOT/demo/app/src/features/owner/shrinkPhoto.js`.
- **Status:** CONFIRMED.

### SCR-053 — Owner form › Phone confirmation «Подтвердите номер» (`screen`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31. Step «phone» of SCR-050.
- **Purpose:** the owner proves that the phone number is their own before the listing can be published.
- **Opens:** from «Дальше» when `phone_set` is false (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:641`);
  after a publish answered `missing:phone` (`OwnerForm.jsx:722-723`); after a publish answered `rejected:<reason>`, as
  the rejection state SCR-054 (`OwnerForm.jsx:708-721`).
- **Layout** (`OwnerForm.jsx:1666-1700`):
  - a card with a shield icon, `own.phoneText` «Номер увидит только тот, кому вы сами его дадите.» and `own.phoneHow`
    «Подтверждаем кнопкой Telegram «Поделиться номером» — так мы знаем, что номер ваш. Номер придёт боту kvadro², в чате
    его не будет видно другим.»;
  - while waiting, a spinner line «Ждём номер от Telegram…»;
  - an inline error, `own.phoneNotUz` or `own.phoneNotOwn`; the denied text `own.phoneDenied`;
  - when late, timed out or on an old client, the block `own.phoneLate` / `own.phoneOldTg` with «Открыть бот» (only when
    `meta.bot_username` is known).
  - The footer button «Поделиться номером» is always enabled; a new tap starts a new attempt.
- **Actions:** BR-APP-084. Medium haptic on the tap; success haptic and step «mode» (SCR-055) once the phone is set;
  error haptic on a rejection.
- **Back:** Telegram Back returns to the questionnaire; there is no swipe.
- **Texts** (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:87-101`):

  | Key | ru |
  | --- | -- |
  | `own.phoneTitle` | «Подтвердите номер» (en «Confirm your number», uz «Raqamni tasdiqlang») |
  | `own.sharePhone` | «Поделиться номером» |
  | `own.phoneLate` | «Номер ещё не пришёл. Загляните в чат с ботом — там может быть ответ.» |
  | `own.phoneOldTg` | «Этот Telegram не умеет делиться номером из приложения. Откройте бот и нажмите «Поделиться номером» там — потом вернитесь сюда.» |
  | `own.phoneDenied` | «Без номера опубликовать нельзя: по нему мы проверяем, что вы хозяин. …» |
  | `own.phoneNotUz` | «Подойдёт только узбекский номер +998, а у этого аккаунта Telegram номер другой страны. …» |
  | `own.phoneNotOwn` | «Пришёл чужой контакт. Нужен ваш номер — тот, что у этого аккаунта Telegram: …» |

- **APIs:** `GET /api/owner/listings/:id` as the poll (API-039). The contact itself is asked for with
  `WebApp.requestContact` (TMA-034).
- **Edge cases:** on a Telegram client below 6.9 the owner is sent to the bot and may not be able to come back to
  the draft (LB-APP-060, Q-APP-027).
- **Sources:** `OwnerForm.jsx`; `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js`;
  `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js`.
- **Status:** CONFIRMED for the client. That the contact goes through the bot is DOCUMENTED_ONLY (`02` BR-API-170,
  TMA-034); what the bot does with it and answers was not observed (`04` BOT-086 is UNVERIFIED, Q-BOT-047).

### SCR-054 — Owner form › Rejection «Не получилось» and the realtor waitlist (`state`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31. A state of the phone step SCR-053.
- **Shown:** on the phone step when the listing has `status: "rejected"`. The reason is `reject_reason`, `agent` by
  default (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:1514,1622-1664`).
- **Layout:** the title `own.rejectedTitle` «Не получилось» and one paragraph
  (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:103-110`):
  - `agent`: «Этот номер встречается в объявлениях о разных квартирах — так бывает у риелторов. «Сдать квартиру» пока
    только для хозяев. Если это ошибка, напишите в поддержку.» It is followed by the button «Сообщите, когда откроете
    вход для риелторов».
  - `fraud`: «Этот номер не можем принять. Если это ошибка, напишите в поддержку.»
  - `limit`: «С этим номером уже сдаются 2 квартиры. Отметьте одну «Сдано» или снимите её в «Мои объявления» — и
    добавьте новую.» It is followed by «Мои объявления».
  - There is no footer, no publish and no support button.
- **Waitlist:** shown only here, and only for `agent`. A tap (light haptic) sends `POST /api/owner/waitlist` (API-050).
  On success the line becomes «Хорошо, напишем в бот, когда откроем.»; a failure gives an error haptic and the button
  stays (`OwnerForm.jsx:1639-1655`). The state is not persisted: the next visit shows the button again.
- **Back:** Telegram Back returns to the questionnaire. «Дальше» leads back here.
- **APIs:** `POST /api/owner/waitlist` (API-050).
- **Edge cases:** a rejected owner gets no way forward (LB-APP-065); the waitlist sign-up is not remembered
  (LB-APP-071).
- **Sources:** `OwnerForm.jsx`; `owner.js`.
- **Status:** CONFIRMED for the client. The server rules behind the reasons are UNVERIFIED (`02` BR-API-171, Q-API-072).

### SCR-055 — Owner form › Contact mode and preview «Как с вами связываться?» (`screen`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31. Step «mode» of SCR-050.
- **Purpose:** the owner chooses how seekers reach them, sees the card as seekers will, and publishes.
- **Opens:** after the phone is confirmed (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:742-745`), or from
  «Дальше» when `phone_set` is already true (`OwnerForm.jsx:641`).
- **Layout** (`OwnerForm.jsx:906-968`):
  - A radio group with two options:
    - «Через kvadro²», tagged «Советуем», with `own.mode.gateText` «Номер скрыт. Люди присылают отклик: кто будет жить и
      когда въезд. Номер даёте вы сами, одной кнопкой.»;
    - «Показывать номер», with `own.mode.openText` «Номер видят все в карточке. Звонить будут и риелторы.»
    - When `contact_mode` is `null`, **neither option is selected** (LB-APP-056).
  - «Так увидят люди»: the cover as a `.s.jpg` thumbnail (or a placeholder), the price with «/мес», «rooms · district or
    landmark», the facts (area, «floor of total»), and «Проверенный хозяин · разместил сам в kvadro²» (`own.verified`, a
    key of the owner dictionary; the chip of the listing screen is `owner.verified`). Below it, «Ваш номер: {phone}»
    from `phone_display`.
  - Footer: an error note, «Мои объявления» when the error offers it, and the primary «Опубликовать» (for a draft) or
    «Сохранить изменения» (for a published listing), with a spinner while busy. Since release `index-YX9bFVws.js` the
    button uses the save phases of BR-APP-114 instead of the spinner icon: busy narrows it to a 48 px pill with a
    spinner; for an edit, a successful save turns it green with a tick, and the done step (SCR-056) follows 900 ms later
    (250 ms under reduced motion); a first publish goes from busy straight to the celebration and the done step, without
    the tick; on an error the phase returns to idle (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:265,
    812-889,1116-1122` at r38).
- **Actions:** the mode change follows BR-APP-086, publishing BR-APP-087. Haptics: light on a mode change; medium on
  publish; on success a celebration for a new listing (BR-APP-096) or a success haptic for an edit; an error haptic on
  failure.
- **Back:** Telegram Back returns to the questionnaire; there is no swipe.
- **Texts** (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:111-122`): `own.modeTitle` «Как с вами связываться?» (en
  «How should people contact you?», uz «Siz bilan qanday bogʻlanishsin?»); `own.mode.gate` «Через kvadro²»;
  `own.mode.open` «Показывать номер»; `own.recommended` «Советуем»; `own.preview` «Так увидят люди»; `own.verified`;
  `own.phoneIs`; `own.publish` «Опубликовать»; `own.save` «Сохранить изменения».
- **APIs:** `POST /api/owner/listings/:id/contact_mode` (API-044), `POST /api/owner/listings/:id/publish` (API-045).
- **Edge cases:** an edit of a published listing is saved before «Сохранить изменения» (LB-APP-055); publishing works
  with no mode chosen (LB-APP-056).
- **Sources:** `OwnerForm.jsx`; `owner.js`.
- **Status:** CONFIRMED.

### SCR-056 — Owner form › Done «Готово» / «Сохранили» (`state`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31. Step «done» of SCR-050.
- **Opens:** after a successful publish (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:684-691`).
- **Layout:**
  - **New listing:** a festive block with 12 confetti pieces, staggered by 25 ms (`OwnerForm.jsx:53-68,852-866`), and
    the mascot button (`$KVADRO_ROOT/demo/app/src/features/owner/DoneMascot.jsx`). A tap on the mascot repeats the
    celebration, at most once per 800 ms (`OwnerForm.jsx:867-883`; BR-APP-096). Then `own.doneText` «Квартира в ленте
    kvadro² и уже уходит тем, у кого включён радар.», the demand line `own.demand` when `count > 0`, and `own.doneNext`
    «Отклики придут в бот. Ответить можно там или в «Мои объявления».» (`OwnerForm.jsx:884-892`).
  - **Edit:** the title `own.savedTitle` «Сохранили» and the text `own.savedText` «Объявление обновлено.». Confetti
    shows only after a mascot tap.
  - Since release `index-YX9bFVws.js` the confetti pieces fly on `var(--ease-out)`, `cubic-bezier(0.2, 0.9, 0.3, 1)`,
    instead of `cubic-bezier(0.2, 0.7, 0.3, 1)`; the pop and hop curves became `var(--ease-pop)` with the same value
    (`$KVADRO_ROOT/demo/app/src/features/owner/owner.css:399,446,1536` at r38; §3.6). For an edit the step comes 900 ms
    after the tick of the save button (SCR-055).
  - Footer: «Мои объявления» and «Готово», which closes the form (`OwnerForm.jsx:893-901`).
- **Closes:** «Готово», Telegram Back or swipe, each of which closes the form.
- **Analytics:** since release `index-CIa0Ldj2.js` `owner_mascot_tap`, without properties, on an accepted tap on the
  mascot, at most once per 30 000 ms (`$KVADRO_ROOT/demo/app/src/lib/ownerAttention.js:25-39`,
  `OwnerForm.jsx:56,892-898` at r33; §3.3).
- **Sources:** `OwnerForm.jsx`; `DoneMascot.jsx`.
- **Status:** CONFIRMED for the client. That the listing is in the feed and goes out to radars at once is known only
  from these texts (`02` BR-API-175, Q-API-071).

### SCR-057 — Settings › «Мои объявления» (`screen`, sub-page)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** the owner's list of flats, current and past, with their status, their numbers and the actions on them.
- **Opens:** from the Settings row (SCR-032), the limit sheet (SCR-049), «Мои объявления» inside the form (SCR-050) and
  the `limit` rejection (SCR-054); since release `index-YX9bFVws.js` also from an owner invitation when
  `GET /api/owner/listings` answers `can_add: false`: the App closes an open listing, switches to the Settings tab,
  opens the page and scrolls to the top (BR-APP-115; `$KVADRO_ROOT/demo/app/src/app/App.jsx:169-187` at r38). Since the
  same release the page leaves with the sub-page animation (BR-APP-112), the tab control's segmented thumb slides
  (BR-APP-121), and the card tip leaves with the tip animation (SCR-060). It is the lazy chunk `OwnerListings` in a `SubPage` frame, with the sub-page chrome
  of SCR-033 (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:51-52,366-380`; §1.9).
- **Layout** (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:384-480`):
  - **Tabs** «Актуальные» / «История» (a segmented control). A tab shows a red dot when one of its listings has pending
    requests (`OwnerListings.jsx:394-406`). «История» holds `rented`, `removed` and every `withdrawn` listing;
    «Актуальные» holds the rest, including `draft` and `rejected` (`OwnerListings.jsx:282-284`).
  - **Empty texts:** in «Актуальные», `own.welcome` when `past > 0`, else `own.mineEmpty` «Здесь появятся квартиры,
    которые вы сдаёте через kvadro².»; in «История», `own.pastEmpty` «Здесь будут квартиры, которые вы сдали или сняли.»
    (`OwnerListings.jsx:407-417`).
  - **A card** (`OwnerListings.jsx:80-214`):
    - the cover photo (the full URL, no `.s.jpg`) with a glass status chip (BR-APP-094), and a red chip
      `own.v.newRequests` («{n} новых откликов») when requests are pending;
    - the price with «/мес» and a market delta badge from `stats.price_delta` / `stats.price_tone`;
    - «rooms · district», falling back to the landmark and then the city;
    - for non-drafts, the stats line «N получили по радару · N открыли · N в избранном» (the last only when > 0);
    - the note `own.withdrawnNote` or `own.held`;
    - the actions of BR-APP-088.
    - The card tip «Вот здесь ваши отклики» appears on the first card with pending requests (SCR-060).
  - **Below the list**, in «Актуальные» only: «+ Сдать ещё одну квартиру» (the limit sheet when `can_add` is false) and
    the foot line «Можно сдавать до {n} квартир сразу.» (`OwnerListings.jsx:462-470`).
- **Actions:**
  - A tap on a card (light haptic): a draft opens the form; a listing with `listing_id` opens the public listing
    (SCR-059); anything else does nothing. Taps on buttons inside the card do not count (`OwnerListings.jsx:422-436`).
  - «Отклики» opens SCR-058.
  - The status buttons follow BR-APP-088.
- **States:** a spinner while loading. When the first load fails, an `ErrorState` with a retry; a later refetch that
  fails keeps the old list. The empty states are described above. Offline actions fail with the toast
  `own.actionOffline`.
- **Closes:** the sub-page Back or swipe returns to Settings, which then refetches the listings
  (`SettingsScreen.jsx:104-107`).
- **Without the SDK** (since release `index-CIa0Ldj2.js`): the sub-page, and the requests page opened over it, carry the
  close cross of `05` TMA-047 through `SubPage` (`SubPage.jsx:33` at r33).
- **APIs:** `GET /api/owner/listings` (API-037) on open, on `version`, on retry, after every status change and after
  closing «Отклики»; `POST /api/owner/listings/:id/status` (API-046); a refresh of `GET /api/owner/pending` (API-047).
- **Analytics:** the screen name `owner/mine` (`$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:35-36`); no event of
  its own (LB-APP-058). Since release `index-CIa0Ldj2.js` the limit sheet opened from here sends
  `owner_limit_sheet {where: "mine"}` (SCR-049) and the card tip `owner_attention` (SCR-060).
- **Texts:** `own.tab.now` «Актуальные», `own.tab.past` «История», `own.status.*`
  (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:141-152`), `own.tab5.*`, `own.addAnother`, `own.mineFoot`,
  `own.toast.*` (`owner.js:207-211`).
- **Edge cases:** a rejected card has no reason and no action (LB-APP-065); the days of the status chip come from the
  device clock (LB-APP-062); an unknown status crashes the page (LB-APP-064).
- **Sources:** `OwnerListings.jsx`; `SettingsScreen.jsx`; `$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx`;
  `$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx`; `$KVADRO_ROOT/demo/app/src/components/ReqTip.jsx`; since
  `index-CIa0Ldj2.js` also `$KVADRO_ROOT/demo/app/src/components/FallbackClose.jsx`, through `SubPage`.
- **Status:** CONFIRMED.

### SCR-058 — Requests «Отклики» (`screen`, sub-page)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** the owner reads the requests of seekers for one flat and answers them.
- **Opens:** from «Отклики» on a card in SCR-057, or from the panel's «Отклики» tab or «Ответить» (SCR-059). From the
  panel it opens as a portal overlay (`own-req-over`, `z-index: 47`)
  (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:268-274`;
  `$KVADRO_ROOT/demo/app/src/features/owner/owner.css:891-892`). It is always for one owner listing
  (`owner_listing_id`). No caller uses the "all requests" form of `GET /api/owner/requests`
  (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:477-479`; `OwnerPanel.jsx:271`).
- **On mount** it dismisses the request tip for good (`OwnerListings.jsx:495`; BR-APP-092).
- **Layout** (`OwnerListings.jsx:562-656`), one card per request:
  - The name, or «Без имени».
  - A details line: `contact.who.*` · «N чел.» (only when more than 1) · «въезд: {when}».
  - The message in «…».
  - A **pending** request offers «Дать номер» (primary) and «Не подходит».
  - Any other request shows a status line `own.req.*`: «Номер дали», «Номер дали · оказался риелтором», «Не подошло»,
    «Отмечен как риелтор», «Без ответа», «Квартира сдана». Then, depending on the server flags:
    - when `can_reason` is set and no reason was chosen in this session: «Почему не подошло? Можно не отвечать —
      человеку ответим одинаково мягко.» with «Уже договорился» / «Похоже на риелтора». After «Уже договорился» it shows
      «Причина: уже договорились с другим.»;
    - when `can_undo` is set: «Передумали — можно отменить в течение 10 минут» and «Отменить»;
    - else, when `can_late` is set: «Оказался риелтором».
  - The foot line `own.requestsFoot` «Человек видит только ваш ответ. Номер получает только тот, кому вы нажали «Дать
    номер».»
- **Actions:** BR-APP-090. Haptics: medium for «Дать номер», light for the rest; then success or error.
- **States:** a spinner while loading; an `ErrorState` with a retry; when empty, «Откликов пока нет.»
- **Closes:** the sub-page Back or swipe returns to the list, which refetches the listings and the pending counter, or
  to the panel, which refetches its listing and the counter (`OwnerListings.jsx:316-320`; `OwnerPanel.jsx:70-74`).
- **Texts:** `own.requests` «Отклики» (en «Requests», uz «Soʻrovlar»), `own.give` «Дать номер», `own.decline` «Не
  подходит», `own.answered.*`, `own.undo*`, `own.why*`, `own.req.*`
  (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:212-241`); `contact.who.*` from the main dictionary
  (`ru.js:621-626`).
- **APIs:** `GET /api/owner/requests` (API-048), `POST /api/owner/requests/:id` (API-049).
- **Storage:** writes `kv-req-tip` (BR-APP-092; §3.2).
- **Edge cases:** a `who` value outside the enum crashes the page (`$KVADRO_ROOT/docs/api.md:1283-1285`; LB-APP-064).
- **Sources:** `OwnerListings.jsx`; `OwnerPanel.jsx`.
- **Status:** CONFIRMED for the client. What the seeker receives for each answer is the bot's side and is UNVERIFIED
  (`04` BOT-088, BOT-089; Q-BOT-048).

### SCR-059 — The owner's own listing: panel «Ваше объявление» and the `owner_mine` variant (`state`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31. A state of the listing screen SCR-018.
- **When:** the full card has `owner_mine` (`$KVADRO_ROOT/docs/api.md:345`). `owner_mine` on its own already changes the
  listing screen (BR-APP-103):
  - the title row keeps only «Поделиться»: no favourite and no «⋯»
    (`$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:94-106`);
  - the footer becomes an empty slot (`cta-bar own-cta`) that the panel fills through a portal, instead of
    `ListingCtaBar` (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:310-322`);
  - there is no market block above the facts. After «Факты» comes a «Цена» section (`head.price`: the main price and
    period, the delta and the note; `$KVADRO_ROOT/demo/app/src/features/listing/sections/OwnerPriceSection.jsx:7-26`),
    and the market block stands below it (`ListingScreen.jsx:250,254-255`);
  - there is no «Источник» section, because the listing is self-placed (`ListingScreen.jsx:285-303`; BR-APP-102);
  - the author section shows no «Обычно отвечает за…»
    (`$KVADRO_ROOT/demo/app/src/features/listing/sections/AuthorSection.jsx:40`);
  - the owner chip shows (BR-APP-100).
- **Panel:** `details.owner_mine && details.owner_listing_id` mounts the lazy block `OwnerPanel` under the key facts
  (`ListingScreen.jsx:237-249`).
- **Panel layout** (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:246-278`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:217-280`):
  - The heading `own.panel.title` «Ваше объявление» with a status pill, and the line «Этот блок видите только вы.»
  - When requests are pending, a button «{n} человек ждут ответа» (plural) with «Ответить».
  - Stats tiles: «Получили по радару», «Открыли», «В избранном», «Откликов» (with «номер дали N» when > 0).
  - A week chart «Открывали за 7 дней»: the total, bars from the last 7 values of `daily`, weekday initials, today on
    the right (LB-APP-062).
  - «В kvadro² {N дней}»; the note for `withdrawn` / `held`.
- **Footer by status** (`OwnerPanel.jsx:151-218`):

  | Listing | Footer |
  | ------- | ------ |
  | `active` / `paused`, not `withdrawn`, not `held` | five tabs: «Отклики» (badge = pending), «Изменить», «Пауза» or «Вернуть», «Сдано», «Снять» (danger) |
  | `draft` | «Удалить» / «Продолжить» |
  | `withdrawn`, or `paused` + `held` | «Поддержка» (only when `GET /api/bot` gave `support`), otherwise nothing |
  | anything else (`rented`, `removed`, `rejected`) | «Отклики» (only when requests > 0) and «Сдать ещё одну» |

- **Fill hints** (manageable listings only), «Чтобы объявление было полнее» (`OwnerPanel.jsx:220-244,289-329`):
  - the count «n из 5» and a 5-segment bar; since release `index-YX9bFVws.js` the first number rolls to each new value
    (BR-APP-113; `own.panel.filled` «{n} из {total}»; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:323-325`,
    `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:176` at r38);
  - the open items first: photos (fewer than 5 → «Добавьте фото — сейчас n из 10», 5 or more → «Фото — n из 10»),
    «Укажите площадь», «Укажите этаж», «Укажите ремонт», «Напишите пару слов о квартире»;
  - a tap on an item opens the form on that field (BR-APP-093);
  - when everything is filled, the single line «Объявление заполнено полностью».
- **APIs:** `GET /api/listings/:id` for the card (API-008); `GET /api/owner/listings/:id` on mount, on `ownerVersion`
  and on retry (API-039); `GET /api/bot` on every mount, for `support` (API-003; `OwnerPanel.jsx:43-52`);
  `POST /api/owner/listings/:id/status` (API-046); `GET /api/owner/requests` and `POST /api/owner/requests/:id` through
  SCR-058 (API-048, API-049).
- **States:**
  - Loading renders nothing, and the footer slot stays empty (`OwnerPanel.jsx:83-85`).
  - A load error shows an island with an `ErrorState` and a retry (`OwnerPanel.jsx:76-82`).
  - A chunk error shows the `ErrorState` of `LazyBlock` (`$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx:188-209`).
- **Status change:** «Сдано» and «Снять» ask for confirmation (BR-APP-088); success shows a toast and reloads the
  listing screen (`OwnerPanel.jsx:87-113`; `ListingScreen.jsx:245`). It does **not** refresh the pending counter
  (LB-APP-059).
- **Closes:** the listing screen's own Back (SCR-018). The requests overlay has its own Back.
- **Storage:** a tap on a fill hint writes the sessionStorage key `kv-own-focus` (BR-APP-093; §3.2).
- **Texts:** `own.panel.*` (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:162-180`), `own.stat.*`, `own.week`,
  `own.weekdays`, `own.listedDays`, `own.tab5.*`.
- **Analytics:** since release `index-CIa0Ldj2.js` `owner_attention` with `what: "banner"`: `shown` when the panel has
  `stats.pending > 0`, `clicked` on a tap on the row «N человек ждут ответа · Ответить», each once per session; and
  `owner_hint_opened {field}`, with `photos`, `area_m2`, `floor`, `renovation` or `description`, when a fill hint opens
  the form on that field (`OwnerPanel.jsx:78-83,247-251,270-275` at r33; §3.3).
- **Edge cases:** the counters stay stale after a status change on the panel (LB-APP-059); the footer can be empty, and
  the «Это ваше объявление» bar of `ListingCtaBar` is never rendered (LB-APP-070).
- **Sources:** `OwnerPanel.jsx`; `OwnerListings.jsx`; `ListingScreen.jsx`; `ListingTitleRow.jsx`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx`; `sections/OwnerPriceSection.jsx`; `LazyPage.jsx`.
- **Status:** CONFIRMED.

### SCR-060 — Request signals: red dot on the Settings tab, «Пришёл первый отклик!» and the card tip (`overlay`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** tells an owner that requests wait for an answer and where they are.
- **Red dot:** the Settings tab shows a red dot when pending > 0. Its aria-label is «ждут ответа: N»
  (`$KVADRO_ROOT/demo/app/src/app/TabBar.jsx:13-40`; `$KVADRO_ROOT/demo/app/src/styles/red-dot.css`).
- **Tab tip** above the tab bar: `own.reqTip.tab` «Пришёл первый отклик! Он в «Настройки» → «Мои объявления»» (en «Your
  first request is in! Settings → My listings»). It shows when pending > 0, the tip has not been dismissed, the current
  tab is not Settings, and no listing, form, «Мои объявления» or filters sheet is open
  (`$KVADRO_ROOT/demo/app/src/app/App.jsx:719-734`).
  - A tap gives a light haptic and switches to the Settings tab. It does not open the list.
  - «×» dismisses the tip for good.
- **Card tip** «Вот здесь ваши отклики»: on the first card with pending requests in the current tab of «Мои объявления»
  (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:376-379,448-458`). A tap opens that listing's requests.
- **Dismissal:** «×» on either tip, or opening any requests page, writes `kv-req-tip = done` and hides the tips
  everywhere at once (`$KVADRO_ROOT/demo/app/src/components/ReqTip.jsx:7-34`; BR-APP-092). The «×» label is
  `owner.tipClose` «Закрыть подсказку» (`ru.js:648`). Since release `index-YX9bFVws.js`:
  - `dismissReqTip()` tells every mounted tip to hide also when the key is already `done`; before, it notified only on
    the first write (`ReqTip.jsx:30-36` at r38). The requests page calls it on mount
    (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:497` at r38);
  - `syncReqTipDismissed()` runs once the DeviceStorage restore of the launch has finished, and hides the tips when the
    restored `kv-req-tip` is `done`, that is, when the tip was dismissed on another device after this one rendered it
    (`ReqTip.jsx:38-46`, `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:26-31` at r38; LB-APP-021);
  - a tip that hides plays the tip leave of BR-APP-112, 160 ms up and smaller (`ReqTip.jsx:55` at r38).
- **Source:** the pending counter (BR-APP-091).
- **APIs:** `GET /api/owner/pending` (API-047).
- **Storage:** `kv-req-tip` (§3.2).
- **Analytics:** since release `index-CIa0Ldj2.js` `owner_attention {what, action}`, each pair at most once per session:
  `dot` / `shown` when the pending count is above 0, on any tab; `dot` / `clicked` on a tap on the Settings tab while
  the count is above 0, unless the tap only expanded the collapsed chrome; `coach` / `shown` when a tip bubble mounts
  (over the tab bar or on a card of «Мои объявления») and `coach` / `clicked` on a tap on its text; the close cross
  sends nothing (`$KVADRO_ROOT/demo/app/src/lib/ownerAttention.js:5-22`, `App.jsx:153-158,656-658`,
  `ReqTip.jsx:42,48-51` at r33; §3.3). The `banner` pair is sent by the owner panel (SCR-059).
- **Edge cases:** the counter is fetched for every user (LB-APP-066); the tab tip leads to Settings, not to the requests
  (LB-APP-069).
- **Sources:** `TabBar.jsx`; `App.jsx`; `ReqTip.jsx`; `$KVADRO_ROOT/demo/app/src/lib/ownerPending.js`; `red-dot.css`;
  `OwnerListings.jsx`; since `index-CIa0Ldj2.js` also `ownerAttention.js`.
- **Status:** CONFIRMED.

### SCR-061 — Contact request sheet «Отклик хозяину» (`sheet`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** a seeker asks an owner who hides the number (gate mode, BR-APP-098) to give it; the owner answers in the
  bot (`$KVADRO_ROOT/demo/app/src/features/listing/ContactRequestSheet.jsx:1-2`; `$KVADRO_ROOT/docs/api.md:820-822`).
- **Opens:** the CTA «Связаться с хозяином» (`contact.cta`) in gate mode without a request, or with the request `given`
  but no phone yet (`$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:40-52`; LB-APP-074). Only with the
  full card (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:328`).
- **Closes:** a backdrop tap, the × (`common.close`), a drag down, Telegram Back
  (`ContactRequestSheet.jsx:44-48,88,101`); success closes it (`ListingScreen.jsx:334-336`). Swipe-back of the listing
  is off while it is open (`ListingScreen.jsx:123-133`). Typed text is lost on close; there is no confirmation.
- **Layout** (`ContactRequestSheet.jsx:96-177`):
  - the title «Отклик хозяину» (`contact.title`);
  - the lead «Хозяин получит ваш отклик и ответит в бот — обычно в течение {n} мин.» (`contact.lead`, when
    `response_minutes` is truthy), else «Хозяин получит ваш отклик и ответит в бот.» (`contact.leadNoTime`)
    (`ru.js:618-620`);
  - «Кто будет жить» (`contact.who`): five single-choice chips «Один / Пара / Семья / Студенты / Друзья»
    (`contact.who.one|couple|family|students|friends`), none picked at first
    (`ContactRequestSheet.jsx:13-14,38,114-131`; `ru.js:621-626`);
  - «Сколько человек» (`contact.people`): a stepper 1…20, starting at 1; picking a chip sets it to 1 / 2 / 3 / 2 / 2
    (`ContactRequestSheet.jsx:16-23,39,124,132-151`);
  - «Въезд» (`contact.moveIn`): free text, at most 32 characters, placeholder «Например, с 1 декабря»
    (`ContactRequestSheet.jsx:152-160`; `ru.js:628-629`);
  - «Сообщение» (`contact.message`): a text area of 3 rows, at most 500 characters, prefilled «Здравствуйте! Можно
    посмотреть?» (`contact.messageDefault`) (`ContactRequestSheet.jsx:41,161-169`; `ru.js:630-631`);
  - the note `contact.note` «Хозяин увидит ваше имя из Telegram и эти ответы, но не ваш номер. Можно отправить до 10
    откликов в день.» (`ContactRequestSheet.jsx:170`; `ru.js:632-633`);
  - the error line (`ContactRequestSheet.jsx:171`);
  - the footer button: a disabled «Выберите, кто будет жить» (`contact.pickWho`) until a chip is picked, then «Отправить
    хозяину» (`contact.send`); disabled while sending (`ContactRequestSheet.jsx:173-176`; `ru.js:634-635`).
- **Send** (`ContactRequestSheet.jsx:50-85`; BR-APP-099):
  - It is ignored without a chip or while a send runs (a state and a ref lock). It plays a medium haptic.
  - The body is `{who, people, move_in, message}`, with `move_in` and `message` trimmed and an empty value sent as
    `null`.
  - The call runs through the write-access flow (`withChatAccess`, TMA-033;
    `$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:27-55`).
  - Success: a success haptic, the sheet closes, and the card's `my_request` becomes the returned `status`; `given`
    re-reads the card (`ListingScreen.jsx:334-340`).
  - Failure: an error haptic and one line, by cause: `409 no_chat` after the write-access attempt →
    `contact.err.noChat`; a known `detail` → `contact.err.<detail>`, with `harvest` shown as `blocked`; else «Не
    получилось сохранить» (`common.saveFailed`) (`ContactRequestSheet.jsx:25-26,71-80`). The error codes are in `08`
    API-054.
- **Error texts** (`ru.js:636-644`; `ContactRequestSheet.jsx:25-26,71-80`):

  | `detail` | Text shown | Client effect |
  | -------- | ---------- | ------------- |
  | `no_chat` (409) | the write-access request and one repeat; if it still fails, «Ответ хозяина придёт в бот — разрешите боту писать вам и отправьте ещё раз.» | `chat_access_*` events; may offer to open the bot |
  | `limit_fast` | «Несколько откликов подряд — следующий можно будет отправить через 10 минут.» | none |
  | `limit_day` | «Сегодня вы уже отправили 10 откликов. Завтра можно снова.» | none |
  | `limit_week` | «За неделю — 30 откликов, это предел. Новые можно будет отправить через несколько дней.» | none |
  | `blocked` | «Отклики для вашего аккаунта сейчас закрыты. Если это ошибка, напишите в поддержку.» | none |
  | `harvest` | the same text as `blocked`; the user is not told that it is anti-harvesting | none |
  | `closed` | «Хозяин уже не принимает отклики — квартиру, скорее всего, сдали.» | none (LB-APP-073) |
  | `own` | «Это ваша квартира.» | none (LB-APP-073) |
  | `open` | «Хозяин открыл номер — обновите карточку и позвоните.» | none (LB-APP-073) |
  | other | «Не получилось сохранить» | none |

  The HTTP statuses of the `detail` codes other than `no_chat` are UNVERIFIED (Q-API-076).
- **APIs:** `POST /api/listings/:id/contact` (API-054).
- **Analytics:** none of its own; `chat_access_declined` / `chat_access_allowed` from the write-access flow
  (`$KVADRO_ROOT/docs/api.md:1186`).
- **Edge cases:** the errors `open`, `closed` and `own` leave the card stale (LB-APP-073); `given` without a phone
  offers a second request (LB-APP-074); the limits are written into the texts (LB-APP-057); picking a chip overwrites
  the count the user set (LB-APP-077).
- **Sources:** `ContactRequestSheet.jsx`; `ListingScreen.jsx`; `ListingCtaBar.jsx`; `chatAccess.js`;
  `$KVADRO_ROOT/demo/app/src/lib/api/owner.js:191-192`.
- **Status:** CONFIRMED for the client. Server rules in `02`: BR-API-184 is CONFIRMED; BR-API-183 and BR-API-185 to BR-API-187 are DOCUMENTED_ONLY.

### SCR-062 — Owner info sheet «Проверенный хозяин» (`sheet`)

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31). Line numbers here are
  at r31.
- **Purpose:** explains what the owner chip of the listing screen means (BR-APP-100).
- **Opens:** a tap on the owner chip or on its tip text, only with the full card
  (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:233,327`).
- **Closes:** backdrop, drag, Telegram Back, «Понятно» (`owner.info.ok`)
  (`$KVADRO_ROOT/demo/app/src/features/listing/OwnerInfoSheet.jsx:16-19,41,75-77`). Since release `index-YX9bFVws.js` a
  close other than a drag plays the sheet leave of BR-APP-112.
- **Layout:** a portal sheet with an animated shield-and-check drawing, the title «Проверенный хозяин»
  (`owner.verified`) and a list of points (`OwnerInfoSheet.jsx:21-38,51-74`). Since release `index-YX9bFVws.js` the
  shield is drawn on `var(--ease-out)`, `cubic-bezier(0.2, 0.9, 0.3, 1)`, instead of `cubic-bezier(0.65, 0, 0.35, 1)`
  (`oi-draw`); the badge pop keeps its value as `var(--ease-pop)`
  (`$KVADRO_ROOT/demo/app/src/styles/owner-shared.css:354,377` at r38; §3.6):
  1. for a self-placed listing «Разместил квартиру сам в kvadro².» (`owner.info.self`), else «Хозяин сам подтвердил в
     kvadro² номер из этого объявления.» (`owner.info.verified`);
  2. «Номер подтверждён кнопкой Telegram: это его собственный номер.» (`owner.info.phone`);
  3. «Мы проверили: этот номер не встречается в объявлениях риелторов.» (`owner.info.notAgent`);
  4. only for a self-placed listing with `contact_mode === "gate"` (the phone is not tested here, LB-APP-078): «Номер он
     даёт сам, после вашего отклика. Риелторов к нему не пускаем.» (`owner.info.gate`);
  5. only for a self-placed listing with `response_minutes`: «Обычно отвечает за {n} мин» (`contact.usually`).
- **Foot:** for gate «Если всё же ответил риелтор, нажмите в боте «Ответил риелтор» — мы проверим.»
  (`owner.info.footGate`), else «Оказался риелтором? Нажмите «Ещё» → «Пожаловаться» — мы проверим.» (`owner.info.foot`)
  (`ru.js:647-656`).
- **Analytics:** `owner_info_opened {listing_id}`, sent by the chip on the tap, not by the sheet (BR-APP-101).
- **Storage:** none of its own; the chip writes `kv-owner-tip` (BR-APP-101).
- **Edge cases:** a chip tap before the card loads sends the event but opens nothing (LB-APP-072); the gate point stays
  after the number was given (LB-APP-078).
- **Sources:** `OwnerInfoSheet.jsx`; `$KVADRO_ROOT/demo/app/src/features/listing/OwnerChip.jsx`; `ListingScreen.jsx`.
- **Status:** CONFIRMED.

### SCR-063 — Fresh pill «Показать N новых» (`overlay`)

- **Since:** release `index-CIa0Ldj2.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:10` at r36). Line numbers here are at
  r33. An entry of its own, like SCR-046: a floating control with its own trigger, request and text.
- **Purpose:** after a long absence, says how many listings appeared in the current search since the list on screen was
  created, and reloads the list on a tap.
- **Opens:** the long-return check of BR-APP-104 has asked `GET /api/feed/new` and the answer has `count > 0`. The pill
  is rendered only while the search list is free (`canShowNudges`): the search tab in the list view, no listing, no
  filters, quick-filter, city or sort sheet, no radar editor or radar-create sheet, and the owner form closed
  (`$KVADRO_ROOT/demo/app/src/app/App.jsx:321-331,793-794`). So after a return with a listing open the request goes at
  once and the pill appears when the listing closes; after a return on the map it appears on the return to the list.
- **Closes:** a tap; or a change of the feed key (filters, sort or a re-created feed), which returns the count to 0.
  There is no hide timer, no × and no Back handler.
- **Layout:** `button.fresh-pill` inside `header.topbar`, with the icon `ArrowUp` (16 px) and the text. It is absolute
  and centred at `top: calc(100% + 10px)` of the top bar, 36 px high with an 18 px radius. Under the collapsed chrome
  (`.chrome-mini`) it moves down by `var(--top-inset) + 54px`, in lite graphics by `+ 42px`
  (`$KVADRO_ROOT/demo/app/src/app/TopBar.jsx:138-143`; `$KVADRO_ROOT/demo/app/src/styles/chrome.css:183-213`; the CSS
  diffs `001` to `004` of the release).
- **Texts:** the plural `app.freshShow` with `n` = the count (`ru.js:61-66`, `uz_Latn.js:59`, `en.js:59`):

  | Locale | Forms |
  | ------ | ----- |
  | ru | `one` «Показать {n} новое»; `few`, `many`, `other` «Показать {n} новых» |
  | uz_Latn | `one`, `other` «{n} ta yangisini koʻrsatish» |
  | en | `one`, `other` «Show {n} new» |

  In ru it reads «Показать 1 новое» or «Показать 3 новых».
- **Actions:** a tap gives a light haptic, scrolls the window to the top and re-creates the search feed, which loads
  from page one (`App.jsx:469-473`).
- **APIs:** `GET /api/feed/new?<filters>&since=<unix seconds>`, answer `{count}`
  (`$KVADRO_ROOT/demo/app/src/lib/api/feed.js:111-117`; `$KVADRO_ROOT/docs/api.md:648-653` (r35)).
- **Storage:** none; the count and the time the feed was created live in memory (§1.11).
- **Analytics:** none.
- **Edge cases:** the request has no `AbortSignal`; its answer is used only while the feed key is still the same, and
  errors are ignored. `since` is the moment the current feed was created, which is the App's mount or the last change of
  the feed key, not the moment its first page arrived (`App.jsx:430-435`). The pill can be on screen together with the
  return banner SCR-046 (LB-APP-082).
- **Sources:** `App.jsx:321-331,430-473,793-794`; `TopBar.jsx:138-143`;
  `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:52-74`; `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:102`;
  `feed.js:111-117`; `$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js:6`; `chrome.css:183-213`; legacy parity scenarios
  `fresh-pill` (7 h in the background with a listing open: the request, then «Показать 3 новых»), `fresh-pill-show` (a
  tap reloads the feed) and `fresh-reload` (the feed at the top and nothing open: a silent reload, no pill)
  (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:512-559`).
- **Status:** CONFIRMED.

### 2.1 Shared components (not screens on their own)

`src/components/`:

- `ListingCard`, `ListingCardSkeleton`, `Photo`, `PhotoStrip`, `FavButton`, `ErrorState`, `Toast` (SCR-042),
  `Chip` (`HeaderChip`, `FilterChip`), `Switch`, `PullToRefresh` (SCR-010);
- `inputs/IntInput`, `inputs/PriceInput`;
- `icons/RadarIcon`, `icons/InstagramIcon`;
- since release `index-CBlEKxdL.js`: `ReqTip` (SCR-060) and `LazyPage` (§1.9); `Photo` marks an image that is already
  complete from the cache as loaded right after render (`Photo.jsx:21-27` at r31).
- since release `index-CIa0Ldj2.js`: `FallbackClose`, a new file (the close cross of `05` TMA-047); `ErrorState` has the
  day-limit variant (SCR-008); `Toast` exports `pushToast` and `bindToast` (SCR-042); `Photo` clears "loaded" and
  "failed" when its `src` changes (BR-APP-059; `Photo.jsx:19-25` at r33).
- since release `index-YX9bFVws.js`: `RollNumber` and `SaveState`, two new files (below); `FavButton` replays its heart
  and adds the burst (BR-APP-117); `Toast` has the countdown ring and the leave (SCR-042); `ReqTip` has
  `syncReqTipDismissed` and the leave (SCR-060).

`src/features/*` parts used inside screens:

- feed: `FeedHeader`, `followNudge.js`; since release `index-YX9bFVws.js` `OwnerEntry` (below);
- filters: `PriceSection`, `RoomsPicker`, `sheet/*`;
- listing: `ListingHero`, `ListingTitleRow`, `ListingCtaBar`, `sections/*`, `ZoomableImage`, `spot/SpotMap` (preview);
  since release `index-CBlEKxdL.js` also `OwnerChip`, `OwnerInfoSheet` (SCR-062), `ContactRequestSheet` (SCR-061) and
  `sections/OwnerPriceSection` (SCR-059);
- radar: `RadarTiles`, `RadarStrip`;
- settings: `SettingsGroup`, `SettingsRow` (since release `index-BnFvC-Ft.js` an optional `badge`, drawn as a
  `new-pill` after the label; the release's unit `009-modified-SettingsRow.jsx.diff`), `ChoiceList`, `SubPage`,
  `CardStylePicker` (SCR-048, since the same release); since release `index-CBlEKxdL.js` `SettingsRow` also takes a
  `count`, drawn as a red counter, and the directory holds `OwnerLimitSheet` (SCR-049);
- owner (since release `index-CBlEKxdL.js`): `OwnerForm`, `OwnerListings`, `OwnerPanel`, `PlacePicker`, `pickMap.js`,
  `NumberField`, `shrinkPhoto.js`, `DoneMascot`, the dictionary `owner.js` and `owner.css`;
- map: `gl/*` and `leaflet/*` internals, `pins.js`, `palette.js`, `attribution.js`, `tilePrefetch.js`.

`src/app/`: `TopBar`, `TabBar`, `ViewToggle`, `FewResultsNote`; since release `index-CBlEKxdL.js` also `layers.js` (the
lazy owner form layer and the leave time of the listing layer).

Hooks: `src/hooks/useSheetDrag`, `useSwipeBack`, `useMiniChrome`, `useScrolled`.

Since release `index-CIa0Ldj2.js` four files are new: `components/FallbackClose.jsx`, `features/listing/minuteClock.js`
(the minute clock of BR-APP-109), `features/radar/radarLink.js` (the `?radar=` parameter, BR-APP-107) and
`lib/ownerAttention.js` (the owner events of §3.3). No file was deleted
(`$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/REPORT.md:31-32` at r35). Three symbols were renamed:
`showSettingsButton` to `setSettingsHandler`; `MapViewLeaflet` and the old `MapViewGLLazy` to `createMapViews`;
`toggleFavorite` to `setFavorite`. `ageLabel` and `formatShortDate` were replaced under the same names (BR-APP-109,
BR-APP-069) (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:57` at r36).

Since release `index-YX9bFVws.js` four files are new and none is deleted: `lib/leave.js`, `components/RollNumber.jsx`,
`components/SaveState.jsx` and `features/feed/OwnerEntry.jsx`; 41 files changed
(`$KVADRO_ROOT/demo/app/docs/releases/2026-11-20_index-YX9bFVws/REPORT.md:35-51` at r39). `flowLabel` of
`features/listing/format.js` became `flowParts(flow) → {key, n} | null`, with the same numbers, and the label with the
rolling number moved to `SheetFooter.jsx` (`format.js:261-282`, `sheet/SheetFooter.jsx:11-23` at r38). The shared
pieces of the release (at r38):

- **`lib/leave.js`**: the leave animation of sheets, sub-pages, toasts and tips (§1.2, BR-APP-112). Exports
  `sheetLeave`, `subpageLeave`, `playLeave(node, animate, selector)`, the hook `useLeave(ref, animate, selector)` and the
  ref callbacks `toastLeaveRef` and `tipLeaveRef`.
- **`RollNumber` / `rollText`** (`$KVADRO_ROOT/demo/app/src/components/RollNumber.jsx:8-49`; BR-APP-113). `RollNumber`
  shows `String(Math.max(0, Math.round(value)))`, one column per digit. A column holds a hidden copy of its digit, which
  sets the width, and a one-digit window over a strip `0123456789` ten digits high, moved by `translateY(−digit × 10%)`.
  Columns are keyed from the end, so units stay units when the length changes, and the transition of a column is delayed
  by `(length − 1 − index) × 45 ms`, so the rightmost digit moves first. The number is the `aria-label`; the columns are
  `aria-hidden`. The strip moves over 0.62 s on a `linear()` spring that overshoots to about 1.057 at 38 % (the
  `--ease-spring` before it is a fallback); under reduced motion it does not move
  (`$KVADRO_ROOT/demo/app/src/styles/listing-details.css:154-221`). There is no lite rule (LB-APP-086). That nothing
  moves on the first render, or in a new leading column, is `inferred`: there is no earlier position to move from.
  `rollText(format, value)` calls `format('\0')` and splits the result at `\0` into the text before and after the
  number, so it works only for templates that are plain strings; every caller at r38 is one.
- **`SaveState`** (`$KVADRO_ROOT/demo/app/src/components/SaveState.jsx:5-50`; BR-APP-114). `useSavePhase()` gives
  `{phase, setPhase, confirm}` with `idle`, `busy` and `done`; `confirm()` sets `done` and resolves after 900 ms, or
  250 ms under reduced motion; there is no lite check, and the file says so. `saveBtnClass(phase)` appends
  ` save-btn is-<phase>` to the button's classes. `SaveState` keeps the label in place for the width (hidden while busy
  or done) and lays over it a 22 px conic spinner turning every 0.7 s (busy) or a tick drawn over 0.4 s after 0.15 s
  (done). The button is clipped by `inset(0 round 999px)`; busy narrows the clip to a 48 px pill in the middle,
  `inset(0 calc(50% - 24px) round 999px)`, on a 0.66 s `linear()` spring; done paints it `--good` with white text.
  Under reduced motion it does not narrow and the tick is drawn at once (`$KVADRO_ROOT/demo/app/src/styles/filters.css:334-435`).
  Users: the radar sheets' «Сохранить» and «Включить радар», the search sheet's «Включить радар» and the owner form's
  publish button (SCR-014, SCR-029, SCR-030, SCR-055).
- **`OwnerEntry`** (`$KVADRO_ROOT/demo/app/src/features/feed/OwnerEntry.jsx:10-31`; BR-APP-115). `OwnerEntryLine({onOpen,
  too})` is a centred text button: `own.entryAsk` «Сдаёте квартиру?» or, with `too`, `own.entryAskToo` «Тоже сдаёте
  квартиру?», then `own.entryCta` «Разместите бесплатно» and «›» in bold. `OwnerEntryRow({onOpen})` is a full-width row
  with a `House` icon, «Сдаёте квартиру? Разместите бесплатно» and a `ChevronRight`. Both render only where the App
  passes `onOwnerEntry` (SCR-007, SCR-009, SCR-018).
- **Segmented thumb** (`$KVADRO_ROOT/demo/app/src/styles/owner-shared.css:484-542`; BR-APP-121). Inside
  `@supports selector(:has(*))`, `.segmented:after` is a thumb `(100% − 2·pad − (n − 1)·gap) / n` wide, with `n` 2, or 3
  for `.three`, and `pad` and `gap` 3 px (4 px for `.map-bar .segmented.compact` and `.segmented.own-cur`). It is moved by
  `translate(k × (100% + gap))`, where `k` comes from `:has(> .seg.active:nth-child(2))` or `(3)`, over 0.42 s on
  `var(--ease-spring)`, and is transparent until a segment is active; the active segment loses its own background and
  shadow. In the dark scheme the thumb is `color-mix(in srgb, var(--text) 18%, var(--bg))`, `#2c2c2f` without
  `color-mix` (`$KVADRO_ROOT/demo/app/src/styles/fallbacks.css:69-71`); in the map bar it is `--text`; in the owner form's
  currency control its radius is `calc(var(--r-s) - 4px)`. Users: the map bar's deal control
  (`$KVADRO_ROOT/demo/app/src/app/TopBar.jsx:67`), the deal, «Кто размещает» and other three-way controls of the filters
  sheet (`sheet/DealSections.jsx:15`, `sheet/PreferenceSections.jsx:13,70,101`, `sheet/ExtraSections.jsx:49`), the
  quick filter's owner control (`QuickFilterSheet.jsx:81`), the tabs of «Мои объявления» (`OwnerListings.jsx:391`) and
  the owner form's currency (`OwnerForm.jsx:1440`). The thumb has no reduced-motion rule of its own, and the global
  `* { transition: none !important }` of `$KVADRO_ROOT/demo/app/src/styles/states.css:75-77` does not select the `:after`
  pseudo-element, so the thumb slides under reduced motion too (`inferred` from the selector). Without `:has()` the
  whole block is skipped and the active segment keeps its own background.
- **`FavButton`** (`$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:8-77`; BR-APP-117). A tap counter keys the heart,
  so each tap that is not refused as busy remounts it with the class `like` (now a favourite) or `dip` (not), and while
  it is a favourite after a tap, a burst of eight sparks keyed by the same counter plays
  (`$KVADRO_ROOT/demo/app/src/styles/listing-card.css:396-535`). A failed save rolls the state back without a new key
  (LB-APP-087).

Every directory under `src/features` maps to SCR items:

| Directory | SCR items |
| --------- | --------- |
| `city` | SCR-005, SCR-017 |
| `feed` | SCR-007, SCR-008, SCR-009, SCR-024, SCR-025, SCR-040, SCR-041, SCR-046, SCR-047, SCR-063 |
| `filters` | SCR-014, SCR-015, SCR-029, SCR-030 |
| `listing` | SCR-018 to SCR-023, SCR-059, SCR-061, SCR-062 |
| `map` | SCR-011, SCR-012, SCR-013 |
| `onboarding` | SCR-003, SCR-004 |
| `owner` | SCR-050 to SCR-059 |
| `radar` | SCR-026, SCR-027, SCR-028, SCR-031 |
| `settings` | SCR-032 to SCR-039, SCR-048, SCR-049, SCR-057 |
| `sort` | SCR-016 |

There is **no "similar listings" section** anywhere in the client: `NearbySection` lists nearby places (metro, parks,
schools), not other listings.

## 3. Inventories

### 3.1 i18n

The counts below come from parsing `$KVADRO_ROOT/demo/app/src/i18n/locales/{ru,uz_Latn,en}.js`.

- **Locales:** `ru`, `uz_Latn`, `en`. Intl locales are `ru-RU`, `uz-Latn-UZ`, `en-GB`. Numbers in `uz_Latn` are
  formatted with `ru-RU` (space thousands separator, decimal comma) (`$KVADRO_ROOT/demo/app/src/i18n/index.js:16-74`).
- **Keys:** **597 top-level keys in each locale** at the pinned release `index-YX9bFVws.js` (587 at
  `index-CIa0Ldj2.js`, 569 at `index-CBlEKxdL.js`), 597 in the union. No key is missing in any locale (CONFIRMED). A
  plural object counts as one key.
  - Per release: 461 at `index-plF_TOcT.js` (the audit), 462 after `index-Dbpp463V.js` (`card.businessPrice`), 473
    after `index-BNLZFfL0.js` (`report.detailTitle` and ten `report.d_*` keys), 482 after `index-DY_DH7h-.js` (nine
    keys: `back.title`, `back.new`, `back.what`, `feedRadar.titleRent`, `feedRadar.titleSale`, `feedRadar.what`,
    `feedRadar.enable`, `feedRadar.setup`, `nudge.setup`; texts in SCR-046 and SCR-047), 510 after
    `index-BnFvC-Ft.js` (28 keys: `settings.group.chat`, `settings.cards`, `settings.cards.{classic, rich,
    classicHint, richHint, hint, sent, send, sending, failed, minimize}` and the 16 mock keys `settings.cards.demo.*`;
    SCR-048; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:56`), 569 after `index-CBlEKxdL.js` (59 keys: 10 under `own`, 35
    under `contact`, 13 under `owner`, and `details.historySelf`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:20` at r31),
    587 after `index-CIa0Ldj2.js` (18 keys, named below; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:25` at r36;
    `$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/REPORT.md:63` at r35), 597 after
    `index-YX9bFVws.js` (10 keys, named below; counted in the locale files at r38, which the checkout holds).
  - The 59 keys of `index-CBlEKxdL.js`: `own.group`, `own.title`, `own.free`, `own.limitValue`, `own.limitSheetTitle`,
    `own.limitSheetText`, `own.mine`, `own.pendingShort`, `own.reqTip.tab`, `own.draftShort`; `contact.cta`,
    `contact.sent`, `contact.title`, `contact.lead`, `contact.leadNoTime`, `contact.who` and `contact.who.{one, couple,
    family, students, friends}`, `contact.people`, `contact.moveIn`, `contact.moveInPh`, `contact.message`,
    `contact.messageDefault`, `contact.note`, `contact.send`, `contact.pickWho`, `contact.err.{noChat, limit_day,
    limit_fast, limit_week, blocked, closed, own, open}`, `contact.usually`, `contact.pendingNote`, `contact.mineBar`,
    `contact.mineBarHint`, `contact.closedBar`, `contact.cancelledBar`, `contact.expiredBar`, `contact.similarHint`;
    `owner.verified`, `owner.claimed`, `owner.claimedHint`, `owner.tip`, `owner.tipClose`, `owner.info.{self, verified,
    phone, notAgent, gate, footGate, foot, ok}`; `details.historySelf`. `contact.who` is a key and a prefix at once.
  - The 18 keys of `index-CIa0Ldj2.js`: `error.dayLimit`, `error.dayLimitText`; `noAccess.title.paused`,
    `noAccess.text.paused`; `app.freshShow`; `fmt.floorGround`, `fmt.floorBasement`; `card.ageNow`, `card.ageMin`,
    `card.ageHours`, `card.ageDays`; `map.cut`; `listing.gone`, `listing.goneFresh`, `listing.floorGround`,
    `listing.floorBasement`; `toast.showForMe`, `toast.reportedAgentNoted`. No key was removed. Their texts are in the
    table **Texts of release `index-CIa0Ldj2.js`** below.
  - The 10 keys of `index-YX9bFVws.js`: `feed.end`; `found.landlordTitle`, `found.landlordText`, `found.landlordSend`,
    `found.landlordShare`, `found.movedTitle`, `found.movedText`; `own.entryAsk`, `own.entryAskToo`, `own.entryCta`.
    None is a plural object; no key was removed and no value changed (the r38 hunks of the three locale files remove no
    line). The changelog says 12 keys (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:18` at r39): that is the number of added
    lines per locale file, because the values of `found.landlordText` and `found.landlordShare` wrap onto a second line.
    Their texts are in the table **Texts of release `index-YX9bFVws.js`** below. The HOMI catalogue was re-imported from
    these files in the intake of this release: 591 names per locale, the 597 keys less the six unused keys below that
    the import drops (`frontend/packages/i18n/messages/legacy/keys.json`, `dropped`).
  - Method: the object literal of each locale file is parsed and its depth-1 keys counted, per SVN revision of the
    locale files (r9, r24, r25, r27). Counting quoted key lines (`^  '`) gives one less, because the plural key
    `listings` is unquoted; the 472 of `25` §1 matches that line count at `index-BNLZFfL0.js`. The locale files of
    r29 cannot be read without `svn cat`: their count is that of a copy rebuilt by reverse-applying the next
    release's diffs
    (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-18_index-CBlEKxdL/delta/units/063-modified-en.jsx.diff`,
    `064-modified-ru.jsx.diff`, `065-modified-uz_Latn.jsx.diff`) to the r31 files; reverse-applying the release's own
    diffs (`012`–`014` of `2026-11-17_index-BnFvC-Ft`) to that copy gives back the r27 files, key for key and value for
    value (`wave-1/baseline.md`, the pin). The 569 of `index-CBlEKxdL.js` are the count of a copy of the r31 locale
    files (`wave-1/baseline.md`). The 587 of `index-CIa0Ldj2.js` were counted in the locale files at r33, which the
    checkout held then; the sync report gives the same number
    (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/REPORT.md:63` at r35).
  - 14 keys are plural objects up to `index-BNLZFfL0.js`: `listings`, `listing.rooms`, `details.daysOnMarket`,
    `details.publications`, `details.channels`, `details.views`, `actions.blockCount`, `map.missing`,
    `market.info.agoMin`, `market.info.agoHour`, `market.info.agoDay`, `market.v3.found`, `market.v3.district`,
    `market.v3.city`. Release `index-DY_DH7h-.js` adds a fifteenth, `back.new` (`ru.js:397-402`). Release
    `index-CBlEKxdL.js` adds none. Release `index-CIa0Ldj2.js` adds a sixteenth, `app.freshShow` (`ru.js:61-66` at r33).
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

  Release `index-DY_DH7h-.js` adds the prefixes `back` (3 keys) and `feedRadar` (5) and one `nudge` key. Release
  `index-BnFvC-Ft.js` adds 28 keys under `settings` (`settings.group.chat`, `settings.cards*`). Release
  `index-CBlEKxdL.js` adds the prefixes `own` (10 keys) and `contact` (35), 13 keys under `owner` (16 with the three
  filter labels `owner.any`, `owner.no_agents` and `owner.owners`) and one under `details`. Release `index-CIa0Ldj2.js`
  adds 18 keys under existing prefixes: `card` 4, `listing` 4, `error` 2, `fmt` 2, `noAccess` 2, `toast` 2, `app` 1 and
  `map` 1. Release `index-YX9bFVws.js` adds 10 under existing prefixes: `found` 6, `own` 3 and `feed` 1.

- **Texts of release `index-CIa0Ldj2.js`** (the 18 new keys;
  `ru.js:18-19,36,42,61-66,93-94,118-121,177,179-180,189-190,242,259`,
  `uz_Latn.js:18-19,34,40,59,89-90,114-117,172,174-175,182-183,233,250`,
  `en.js:18-19,34,40,59,89-90,114-117,173,175-176,183-184,234,251` at r33):

  | Key | ru | uz_Latn | en | Used by |
  | --- | -- | ------- | -- | ------- |
  | `error.dayLimit` | «Лимит на сегодня» | «Bugungi limit tugadi» | «Daily limit reached» | SCR-008 |
  | `error.dayLimitText` | «За сутки открыто очень много объявлений. Попробуйте позже — Радар продолжит присылать новые в чат.» | «Bir kunda juda koʻp eʼlon ochildi. Keyinroq urinib koʻring — Radar yangilarini chatga yuborishda davom etadi.» | «You’ve opened a lot of listings in the past 24 hours. Try again later — Radar will keep sending new ones to the chat.» | SCR-008 |
  | `noAccess.title.paused` | «Бот на паузе» | «Bot pauzada» | «The bot is paused» | SCR-003 |
  | `noAccess.text.paused` | «Скоро вернёмся. Ваши Радары и избранное на месте.» | «Tez orada qaytamiz. Radarlaringiz va saralanganlaringiz joyida.» | «We’ll be back soon. Your Radars and favorites are safe.» | SCR-003 |
  | `app.freshShow` (plural) | `one` «Показать {n} новое»; `few`, `many`, `other` «Показать {n} новых» | `one`, `other` «{n} ta yangisini koʻrsatish» | `one`, `other` «Show {n} new» | SCR-063 |
  | `fmt.floorGround` | «цокольный этаж» | «tsokol qavat» | «semi-basement floor» | BR-APP-110 |
  | `fmt.floorBasement` | «подвал» | «yertoʻla» | «basement» | BR-APP-110 |
  | `card.ageNow` | «только что» | «hozirgina» | «just now» | BR-APP-109 |
  | `card.ageMin` | «{n} мин назад» | «{n} daqiqa oldin» | «{n} min ago» | BR-APP-109 |
  | `card.ageHours` | «{n} ч назад» | «{n} soat oldin» | «{n} h ago» | BR-APP-109 |
  | `card.ageDays` | «{n} дн. назад» | «{n} kun oldin» | «{n} d ago» | BR-APP-109 |
  | `map.cut` | «На карте — {n} самых свежих. Остальные — в списке» | «Xaritada — eng yangi {n} tasi. Qolganlari — roʻyxatda» | «The map shows the {n} newest. The rest are in the list» | SCR-011 |
  | `listing.gone` | «Этого объявления уже нет — квартиру, похоже, сдали или продали» | «Bu eʼlon endi yoʻq — uy, shekilli, ijaraga berilgan yoki sotilgan» | «This listing is gone — the flat has probably been rented out or sold» | SCR-019 |
  | `listing.goneFresh` | «Смотреть свежие» | «Yangilarini koʻrish» | «See the latest» | SCR-019 |
  | `listing.floorGround` | «Цокольный этаж» | «Tsokol qavat» | «Semi-basement floor» | BR-APP-110 |
  | `listing.floorBasement` | «Подвал» | «Yertoʻla» | «Basement» | BR-APP-110 |
  | `toast.showForMe` | «Показывать у меня» | «Menga koʻrsatish» | «Show it to me» | SCR-023 |
  | `toast.reportedAgentNoted` | «Спасибо, учёл вашу отметку» | «Rahmat, belgingizni hisobga oldim» | «Thanks, I've noted your mark» | SCR-023 |

- **Texts changed by release `index-CIa0Ldj2.js`** (old → new; the release's units `071-modified-en.jsx.diff`,
  `072-modified-ru.jsx.diff`, `073-modified-uz_Latn.jsx.diff`):

  | Locale | Key | Old | New |
  | ------ | --- | --- | --- |
  | ru | `subs.resumed` | «Радар снова включён. {count}, которые вы не видели, — в чате с ботом» | «Радар снова включён. В чате с ботом — непросмотренные: {count}» |
  | en | `subs.resumed` | «Radar is on again. {count} you haven’t seen are in your chat with the bot» | «Radar is on again. In your chat with the bot: {count} you haven’t seen yet» |
  | en | `toast.subSaved` | «Radar is on. {count} are already in your chat with the bot» | «Radar is on. Already in your chat with the bot: {count}» |
  | en | `toast.subUpdated` | «Radar updated. {count} match the new conditions — see your chat with the bot» | «Radar updated. Matching the new conditions: {count} — see your chat with the bot» |
  | en | `settings.cards.demo.place` | «Yunusobod · Minor metro» | «Yunusabad · Minor metro» |
  | en | `settings.cards.demo.district` | «Yunusobod» | «Yunusabad» |
  | uz_Latn | `listings` (`one`, `other`) | «eʼlonlar» | «ta eʼlon» |

  That is 7 keys and 8 strings. The sync report counts nine changed texts («9 изменённых текстов»,
  `$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/REPORT.md:18` at r35); a ninth was not found in the
  three unit diffs, so the report's count stays unconfirmed.

- **Texts of release `index-YX9bFVws.js`** (the 10 new keys; `ru.js:172,558-565,645-647`,
  `uz_Latn.js:167,527-534,614-616`, `en.js:168,528-535,614-616` at r38):

  | Key | ru | uz_Latn | en | Used by |
  | --- | -- | ------- | -- | ------- |
  | `feed.end` | «Это всё по вашему поиску» | «Qidiruvingiz boʻyicha hammasi shu» | «That’s everything for your search» | SCR-007 |
  | `found.landlordTitle` | «Съезжаете со старой квартиры?» | «Eski kvartiradan koʻchyapsizmi?» | «Moving out of your old place?» | SCR-031 |
  | `found.landlordText` | «Её хозяину понадобится новый жилец. Отправьте ему ссылку — разместит квартиру бесплатно, без риелтора.» | «Uy egasiga yangi ijarachi kerak boʻladi. Unga havolani yuboring — kvartirasini bepul va maklersiz joylaydi.» | «Your landlord will need a new tenant. Send them a link — they can list the apartment for free, without an agent.» | SCR-031 |
  | `found.landlordSend` | «Отправить хозяину» | «Uy egasiga yuborish» | «Send to landlord» | SCR-031 |
  | `found.landlordShare` | «Здравствуйте! Я съезжаю. Нового жильца можно найти бесплатно и без риелтора здесь: {url}» | «Assalomu alaykum! Men koʻchib ketyapman. Yangi ijarachini bepul va maklersiz shu yerda topish mumkin: {url}» | «Hi! I’m moving out. You can find a new tenant for free and without an agent here: {url}» | SCR-031 (the shared text) |
  | `found.movedTitle` | «Поздравляем!» | «Tabriklaymiz!» | «Congrats!» | SCR-031 |
  | `found.movedText` | «Спасибо, что рассказали — это помогает нам стать лучше.» | «Aytganingiz uchun rahmat — bu bizga yaxshilanishga yordam beradi.» | «Thanks for telling us — it helps us get better.» | SCR-031 |
  | `own.entryAsk` | «Сдаёте квартиру?» | «Kvartira ijaraga berasizmi?» | «Renting out an apartment?» | SCR-007, SCR-009 |
  | `own.entryAskToo` | «Тоже сдаёте квартиру?» | «Siz ham kvartira ijaraga berasizmi?» | «Renting out an apartment too?» | SCR-018 |
  | `own.entryCta` | «Разместите бесплатно» | «Bepul joylang» | «List it for free» | SCR-007, SCR-009, SCR-018 |

  The three `own.entry*` keys are in the main dictionaries, not in the owner chunk's own dictionary, which the release
  does not touch (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js` is unchanged at r38).

- **Keys built at runtime** (every value must exist, or `t()` throws; since release `index-CIa0Ldj2.js` `t()` falls back
  instead, see **Quirks**):

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
  | `settings.cards.${style}`, `settings.cards.${style}Hint` (options of SCR-048) | local (`CARD_STYLES`, since `index-BnFvC-Ft.js`) | local |
  | `settings.cards.${card_style}` (value of the SCR-032 row) | **server** (`GET /api/settings`), `card_style ?? 'classic'`, since `index-BnFvC-Ft.js` | server-driven: a value other than `classic` / `rich` throws (LB-APP-051) |
  | `contact.who.${who}` (the requests page, SCR-058) | **server** (`OwnerRequest.who`), since `index-CBlEKxdL.js` | server-driven: a value outside the five throws (LB-APP-064) |
  | `contact.err.${detail}` (the request sheet, SCR-061) | **server** (`detail` of `POST /api/listings/:id/contact`), guarded by a list of known codes, since `index-CBlEKxdL.js` | none |
  | `own.status.${status}`, `own.req.${status}`, `own.answered.${action}` (the owner dictionary) | **server** statuses of owner listings and requests, since `index-CBlEKxdL.js` | server-driven (LB-APP-064) |
  | `market.v3.rooms${median_rooms}` | **server**; only 1–3 exist, ≥ 4 maps to `rooms4` | server-driven |

- **Quirks:**
  - `t(key)` returns `entry.other` for plural objects. On a missing key it throws `TypeError` (reading `.other` of
    `undefined`) with no fallback up to `index-CBlEKxdL.js` (`i18n/index.js:118-121`); RECOVERY.md §7 records this.
  - `plural()` falls back to `other` for a missing form (`:131-144`).
  - Unknown `{placeholders}` are left as they are (`:100-110`).
  - Since release `index-CBlEKxdL.js` `t` and `plural` are built on the shared `formatEntry` / `pluralEntry`, which the
    owner dictionary also uses; the output did not change (`i18n/index.js:119-121` at r31; the release's units
    `061-modified-plural.jsx.diff` and `062-modified-t.jsx.diff`).
  - Since release `index-CIa0Ldj2.js` `t()` and `plural()` no longer throw on a missing key: they return the ru entry,
    or the key itself when ru has none, and report the key once as `app_error` with `source: "i18n"` (§1.6;
    `i18n/index.js:110-125,180-193` at r33; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:24` at r36;
    `$KVADRO_ROOT/docs/api.md:1287-1289` (r35)). The owner dictionary's own lookup has no such fallback
    (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:701-707`, r31); that a missing owner key still throws is
    `inferred` (LB-APP-064).
- **Owner dictionary** (since release `index-CBlEKxdL.js`; `$KVADRO_ROOT/demo/app/src/features/owner/owner.js` at r31).
  The owner chunks have a dictionary of their own. It is outside the locale files and outside the counts above:
  - **207 keys in each of ru, en and uz_Latn** (ru `owner.js:9-243`, en `:245-471`, uz_Latn `:473-696`), with identical
    key sets; this was checked by extracting the key names of each block and comparing them. Three keys are plural
    objects: `own.panel.waiting`, `own.v.newRequests` and `own.days`. The largest groups are `own.panel.*` 13,
    `own.tab5.*` 8, `own.status.*` 8, `own.answered.*` 7, `own.req.*` 6, then `own.toast.*`, `own.tenant.*`,
    `own.stat.*` and `own.need.*` with 5 each.
  - The locale comes from `getLocale()`, with ru as the fallback for an unknown language (`owner.js:700-701`). Numbers
    in uz use the `ru-RU` format (`i18n/index.js:69-74`).
  - The main dictionaries hold what must show before a chunk loads: 10 `own.*` keys (`ru.js:605-615`), 35 `contact.*`,
    16 `owner.*` and `details.historySelf`. The release's ru delta adds exactly the 59 new ones
    (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-18_index-CBlEKxdL/delta/units/064-modified-ru.jsx.diff`). The owner
    side uses the 10 `own.*` keys (SCR-032, SCR-049, SCR-060), `contact.who.*` (the requests page, SCR-058),
    `owner.info.ok` (the limit sheet) and `owner.tipClose` (the «×» of the tips); `contact.mineBar` and
    `contact.mineBarHint` are unreachable (LB-APP-070). The rest belongs to the seeker's side (SCR-018, SCR-061,
    SCR-062).
  - Two families are easy to confuse. `owner.*` is in the main dictionary: the chip, the info sheet and the filter
    labels. `own.*` is the cabinet: 10 keys in the main dictionary and 207 in `owner.js`. `own.verified`, the preview
    line of SCR-055, is not `owner.verified`, the chip.
  - **An unknown key throws**, as in `t()`: `lookupOwn` returns `undefined` (`owner.js:701`), and `formatEntry` reads
    `entry.other` of it (`i18n/index.js:119-121`). The file says so itself (`owner.js:4`). The keys
    `own.status.${status}`, `own.req.${status}`, `own.answered.${action}` and `contact.who.${who}` are built from server
    data (`$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:50,542,571,606`), and
    `$KVADRO_ROOT/docs/api.md:1283-1285` (r31) turns that into an obligation of the server (LB-APP-064). Since release
    `index-CIa0Ldj2.js` `t()` has a fallback (**Quirks**) and this lookup has none; the file is unchanged since r31, so
    that it still throws is `inferred`.
  - Numbers are written into the texts: «2» (`owner.js:107,136-137`) and «из 10» (`owner.js:170,175`) (LB-APP-057).
- **Unused keys** (defined but never referenced, CONFIRMED by grep): `feed.historyHint`, `subs.count`, `subs.inFeed`,
  `subs.edit`, `subs.delete`, `subs.modeAria`. Since release `index-CIa0Ldj2.js` a seventh, `listing.loadFailed`: the
  gone state of SCR-019 replaced its only use, and nothing under `src` reads it at r33. Since release
  `index-YX9bFVws.js` an eighth, `found.thanksYes` «Поздравляем! 🎉 Спасибо, что рассказали»: the step `moved` of
  SCR-031 replaced the toast that was its only use, and at r38 only the three locale files name it (`ru.js:538`,
  `uz_Latn.js:507`, `en.js:508`; LB-APP-091).
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
  (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:17,38,54,59,84,99,107`, line numbers of r27). 2026-11-17
  (`index-BnFvC-Ft.js`) added the 28 card-style keys (SCR-048; `CHANGELOG.md:56`). 2026-11-18 (`index-CBlEKxdL.js`)
  reworded `noAccess.text.private` (SCR-003) and `card.ownerVerified` («Хозяин ✓» / «Uy egasi ✓» / «Owner ✓» became
  «Проверенный хозяин» / «Tasdiqlangan uy egasi» / «Verified owner»; `ru.js:100`, `uz_Latn.js:98`, `en.js:98` at r31) in
  the three locales and, in en only, `found.where.agent` and `found.shareText` (SCR-031), and added the 59 keys of the
  owner cabinet, the contact request and the owner chip (`CHANGELOG.md:20,29` at r31). 2026-11-19 (`index-CIa0Ldj2.js`)
  added the 18 keys of the table above and changed 7 keys, 8 strings (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:24-25` at
  r36). 2026-11-20 (`index-YX9bFVws.js`) added the 10 keys of its table above and changed none
  (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:18` at r39).

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
| `kv-new-<feature>` | `'1'` (`pets`; since `index-BnFvC-Ft.js` also `cards`, the «Вид карточек» row of SCR-032) | `markFeatureSeen` (`$KVADRO_ROOT/demo/app/src/lib/newFeatures.js:18`) | `isNewFeature` (`:11-12`) | yes | no |
| `kv-req-tip` | `done` once the request tip of the owner cabinet is dismissed, by «×» or by opening any requests page; never reset; since `index-CBlEKxdL.js` (BR-APP-092, SCR-060) | `$KVADRO_ROOT/demo/app/src/components/ReqTip.jsx:7-34` (at r31) | same | yes | yes (`storage.js:6` at r31) |
| `kv-owner-tip` | the number of times the tip of the owner chip was shown, then `done`; since `index-CBlEKxdL.js` (BR-APP-101) | `$KVADRO_ROOT/demo/app/src/features/listing/OwnerChip.jsx:10-62` (at r31) | same | yes | yes (`storage.js:6` at r31) |
| `kv-graphics` | `full` / `lite` (absent = auto) | `setGraphicsMode` (`$KVADRO_ROOT/demo/app/src/lib/graphics.js:97-103`) | `getGraphicsMode` | no | — |
| `kv-graphics-measured` | `lite` | `measureScrollPerformance` (`graphics.js:134`) | `prefersLite` (`:62`) | no | — |
| `kv-map-v2` | `gl` / `leaflet` | `?map=` (`$KVADRO_ROOT/demo/app/src/features/map/engine.js:74-87`) | same | no | — |
| `kv-map-fit:<lat>,<lon>` | JSON `[lat, lon, zoom]` (4 dp) | Leaflet first fit (`$KVADRO_ROOT/demo/app/src/features/map/tilePrefetch.js:187-201`) | tile prefetch (`:205`) | no | — |

- **Dev only:** `kvdev-initData`, written by the Vite dev emulator (`$KVADRO_ROOT/demo/app/tools/dev/telegram-client.js:6`).
  It is not in builds.
- **sessionStorage:** not used up to release `index-BnFvC-Ft.js`. Since `index-CBlEKxdL.js` it holds `kv-own-focus`: a
  `data-focus` token (`photos`, `area_m2`, `floor`, `renovation`, `description`) written by the fill hints of the owner
  panel and read once and removed by the owner form (BR-APP-093;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:238-244`,
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:103,386-412` at r31). Since `index-CIa0Ldj2.js` it also holds
  `kv-start-done`, with the value `<hash>:<id>`: the `hash` field of initData (an empty string when absent) and the id
  of the launch listing. `markStartListingDone()` writes it and `getPendingStartListingId()` reads it; a storage error
  means "not done" (BR-APP-106; `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:27-62` at r33). It is not mirrored
  to DeviceStorage.
- **Not used by the app:** IndexedDB, Telegram CloudStorage and SecureStorage (grep of `src`).
- **Migration note:** `$KVADRO_ROOT/docs/about.md` §9.1 says renaming these keys resets every user's client settings.

### 3.3 Analytics events

Two channels exist.

**(a) Own journal `POST /api/events`.** Fire-and-forget with `keepalive: true`; properties sit at the top level next
to `name` (`$KVADRO_ROOT/demo/app/src/lib/api/events.js:9-35`).

| Event | Properties | Trigger | Evidence |
| ----- | ---------- | ------- | -------- |
| `app_launch` | `entry` (`link` / `news` / `menu`), `ms`, `v`, `sdk?`, `js`, `platform`; since `index-BnFvC-Ft.js` also `tg` (`Telegram.WebApp.version`, not truncated by the sender) | first effect, when initData exists | `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:53-61`; `:53-62` at r29 |
| `app_opened` | `entry: 'link', listing_id, ms` or `entry: 'news' / 'menu', ms` | meta success; not after a 403 | `useAppBootstrap.js:98-113` |
| `app_error` | `v`, `error {kind, name, message, source, stage, screen, tg, platform}` | boot script (XHR, kind `boot`); global handlers (`error`, `rejection`); ErrorBoundary (`render`); since `index-CIa0Ldj2.js` also the error boundary of the map views (`render`) and a missing i18n key, once per key (`kind: "error"`, `source: "i18n"`, `message: "i18n: no key <key> (<locale>)"`; §1.6) | `index.html:69-90`; `$KVADRO_ROOT/demo/app/src/lib/errors.js:68-94`; `$KVADRO_ROOT/demo/app/src/i18n/index.js:110-125,180-193`, `$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:21-41` (at r33) |
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
| `chat_access_declined` | — | `requestWriteAccess` answered `false`; since `index-CBlEKxdL.js` also from the contact request (SCR-061) | `$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:36` |
| `chat_access_allowed` | — | `requestWriteAccess` answered `true`; since `index-CBlEKxdL.js` also from the contact request (SCR-061) | `chatAccess.js:40` |
| `listing_shared` | `listing_id` | share tap, before trying | `$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:30` |
| `original_opened` | `listing_id`, `src` (`button` / `video` / `sources` / `price_history` / `offers`) | an external post link actually opened (not debounced) | `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:139-146` |
| `original_copied` | `listing_id` | copy event on the original text | `$KVADRO_ROOT/demo/app/src/features/listing/sections/OriginalText.jsx:70-74` |
| `contact_call` | `listing_id`, `via` (`tel` / `browser`), `src?` (`text`) | call attempt resolved | `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:74-80` |
| `contact_write` | `listing_id` | «Написать» link opened | `useListingContact.js:82-88` |
| `owner_info_opened` | `listing_id` | a tap on the owner chip of the listing screen or on its tip (since `index-CBlEKxdL.js`, BR-APP-101) | `$KVADRO_ROOT/demo/app/src/features/listing/OwnerChip.jsx:54-62` (at r31); `$KVADRO_ROOT/docs/api.md:1192` (r31) |
| `owner_attention` | `what` (`dot` / `coach` / `banner`), `action` (`shown` / `clicked`) | since `index-CIa0Ldj2.js`; each `what:action` pair at most once per session. `dot`: shown when the pending count of the owner cabinet is above 0, on any tab; clicked on a tap on the Settings tab while it is above 0, unless the tap only expanded the collapsed chrome. `coach`: shown when a request tip mounts (over the tab bar or on a card of «Мои объявления»); clicked on a tap on its text; its close cross sends nothing. `banner`: shown when the owner panel has `stats.pending > 0`; clicked on a tap on the row «N человек ждут ответа · Ответить» (SCR-060, SCR-059) | `$KVADRO_ROOT/demo/app/src/lib/ownerAttention.js:5-22`; `App.jsx:153-158,656-658`; `$KVADRO_ROOT/demo/app/src/components/ReqTip.jsx:42,48-51`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:78-83,270-275` (at r33) |
| `owner_mascot_tap` | — | since `index-CIa0Ldj2.js`: an accepted tap on the mascot of the «Готово» step (SCR-056), at most once per 30 000 ms; a tap is accepted at most every 800 ms (BR-APP-096) | `ownerAttention.js:25-39`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:56,892-898` (at r33) |
| `owner_limit_sheet` | `where` (`settings` / `mine`) | since `index-CIa0Ldj2.js`: every mount of the limit sheet (SCR-049); no once-per-session rule | `$KVADRO_ROOT/demo/app/src/features/settings/OwnerLimitSheet.jsx:18-26`; `SettingsScreen.jsx:259-261`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:384` (at r33) |
| `owner_place_set` | `source` (`map` / `locate` / `manual`) | since `index-CIa0Ldj2.js`: `map` or `locate` when the point is confirmed on the place picker (SCR-051), `locate` if «Где я» succeeded at any time before the confirmation, else `map`; `manual` on «Указать вручную», where no point is set | `OwnerForm.jsx:554-557,805-809`; `$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:124,141,156` (at r33) |
| `owner_place_autofill` | `result` (`applied` / `reverted`) | since `index-CIa0Ldj2.js`: `applied` when the address lookup for the point filled or replaced at least one of city, district and landmark; `reverted` when the user taps the undo of the «replaced» toast | `OwnerForm.jsx:616-620,631-636` (at r33) |
| `owner_hint_opened` | `field` (`photos` / `area_m2` / `floor` / `renovation` / `description`) | since `index-CIa0Ldj2.js`: a checklist row of the owner panel opens the form on that field (BR-APP-093, SCR-059) | `OwnerPanel.jsx:247-251` (at r33) |
| `owner_entry` | `src` (`feed_end` / `empty` / `listing`) | since `index-YX9bFVws.js`: a tap on an owner invitation (BR-APP-115): the row at the end of the search feed (SCR-007), the line under an empty search (SCR-009) or the line on a listing with `owner_entry` (SCR-018); sent before `GET /api/owner/listings`, so also when it fails, and at every tap (LB-APP-084) | `$KVADRO_ROOT/demo/app/src/app/App.jsx:169-174`; `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:168,171`; `App.jsx:970` (at r38); `$KVADRO_ROOT/docs/api.md:1276,1303-1305` (r38) |
| `landlord_share` | `src` (`kvadro` / `elsewhere`) | since `index-YX9bFVws.js`: every tap on «Отправить хозяину» in the «Нашли жильё?» survey (SCR-031, BR-APP-116), before the share; `kvadro` on the congratulation after «Да, через kvadro²», `elsewhere` on the step `moved` | `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:145-151` (at r38); `$KVADRO_ROOT/docs/api.md:1277,1303-1305` (r38) |

Docs and code agree on this list (`$KVADRO_ROOT/docs/api.md` §11; at the pin `:1076-1107`). `custom` is
`isCustomFilters` of the filters concerned (BR-APP-013). The owner chunks of `index-CBlEKxdL.js` send no event
(LB-APP-058). Since release `index-CIa0Ldj2.js` the six `owner_*` events above exist
(`$KVADRO_ROOT/docs/api.md:1256-1261,1278-1286` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:23` at r36). That
release adds no other journal event: the fresh pill, the gone state of the listing and the map errors send nothing to
`/api/events`. Release `index-YX9bFVws.js` adds two, `owner_entry` and `landlord_share`; its animations send nothing.

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
  (`$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:26-44`) and, since release `index-CBlEKxdL.js`, `owner/form` and
  `owner/mine` (`useScreenTracking.js:30-51` at r31; §1.1). Since release `index-CIa0Ldj2.js` a nineteenth name,
  `owner/listing`: the `$pageview` of an open listing is sent by the listing screen once ownership is known, as
  `owner/listing` for the user's own listing and as `listing` otherwise (SCR-018; `ListingScreen.jsx:147-156` at r33).
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
| Toast lifetime | 4 s (text) / 6 s (with action); since `index-CBlEKxdL.js` a downward drag closes it past 36 px and fades it to 0.2 over 120 px; since `index-YX9bFVws.js` the two values are `TOAST_MS` and `ACTION_TOAST_MS`, and the countdown ring of an action toast runs over `ACTION_TOAST_MS` (BR-APP-118) | `$KVADRO_ROOT/demo/app/src/components/Toast.jsx:14`; `Toast.jsx:5,34-43` (at r31); `Toast.jsx:29-32,96-108` (at r38) |
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
| Swipe-back | start 10 px, close at 33 % or 0.5 px/ms, settle 180 ms, not on Android; since `index-CBlEKxdL.js` an edge-only zone of 24 px for a layer marked `data-edge-swipe`, and the inline styles are reset 300 ms after the close | `$KVADRO_ROOT/demo/app/src/hooks/useSwipeBack.js:6-14,27`; `useSwipeBack.js:15-16,131-137` (at r31) |
| Listing layer enter / leave | 0.25 s / 0.2 s; none in lite graphics or reduced motion (since `index-CBlEKxdL.js`) | `$KVADRO_ROOT/demo/app/src/app/layers.js:11`, `$KVADRO_ROOT/demo/app/src/styles/listing.css:1-35` (at r31) |
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
| Owner cabinet: flats listed at once | 2 (since `index-CBlEKxdL.js`, like the other owner-cabinet rows): `max` comes from the server, and the texts hard-code 2 (per account in `can_add`, «на один номер» in the limit sheet and in the `limit` rejection; LB-APP-057) | `$KVADRO_ROOT/docs/api.md:1406-1411` (r31); `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:107,136-137`, `ru.js:609-611` (at r31) |
| Owner cabinet: photos | at most 10 (`MAX_PHOTOS`; the panel text says «из 10»); upload with the long side ≤ 2048 px at JPEG quality 0.88; upload timeout 90 s per photo (other calls 15 s). Since `index-YX9bFVws.js` the upload is an `XMLHttpRequest` with `timeout` = `UPLOAD_TIMEOUT_MS` 90 000; the ring eases toward the sent share with `1 − exp(−dt / 0.25 s)` per frame (`dt` capped at 50 ms, snapped below 0.002), shows the percent between 0.5 % and 99.5 %, and pulses every 1.6 s from 99.5 %; a new photo's tick lasts 1 500 ms (its badge animation 1.4 s) (BR-APP-119) | `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:74`; `owner.js:170,175`; `$KVADRO_ROOT/demo/app/src/features/owner/shrinkPhoto.js:3-6`; `client.js:24-27` (at r31); `$KVADRO_ROOT/demo/app/src/lib/api/client.js:35`, `$KVADRO_ROOT/demo/app/src/lib/api/owner.js:61-89`, `OwnerForm.jsx:79,127-166,583-589`, `$KVADRO_ROOT/demo/app/src/features/owner/owner.css:76-125` (at r38) |
| Owner cabinet: form | autosave after 600 ms; description ≤ 600 characters, landmark ≤ 120; price ≤ 12 digits; demand request after 500 ms; focus highlight 1.6 s; mascot tap at most once per 800 ms. Since `index-YX9bFVws.js` the description ring is `near` from 90 % of 600 (540 characters) and `full` at 600, and its shake lasts 0.32 s, ±3 px (BR-APP-120) | `OwnerForm.jsx:53,76,78,107,109,1022,1264` (at r31); `OwnerForm.jsx:81,194-203,1550-1556`, `owner.css:1592-1614` (at r38) |
| Owner cabinet: place picker | address lookup 400 ms after the map stops; "inside Uzbekistan" is lat 37–46, lon 55–74; the point is rounded to 5 decimals (about 1 m); the wait for `map-start` is at most 1.5 s | `$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:15-16,18-19,24`; `OwnerForm.jsx:105` (at r31) |
| Owner cabinet: phone | poll every 1.5 s for at most 90 s; a stale rejection is ignored for 8 s; the "late" hint shows after 20 s | `OwnerForm.jsx:80-86` (at r31) |
| Owner cabinet: requests | 10 min for the undo of an answer and for the delay of the soft refusal (from the texts; the server decides with `can_undo`) | `owner.js:220,226-227` (at r31); `$KVADRO_ROOT/docs/api.md:1321-1325` (r31) |
| Owner cabinet: fill hint | 5 photos count as enough | `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:29-30` (at r31) |
| Lazy pages | every registered chunk is preloaded 600 ms after the first lazy page is shown (since `index-CBlEKxdL.js`) | `$KVADRO_ROOT/demo/app/src/components/LazyPage.jsx:16-22` (at r31) |
| Contact request form | `people` 1…20; `move_in` ≤ 32 characters; `message` ≤ 500 characters (since `index-CBlEKxdL.js`; BR-APP-099) | `$KVADRO_ROOT/demo/app/src/features/listing/ContactRequestSheet.jsx:13-23,50-85` (at r31) |
| Long return | the app was hidden for ≥ 6 h (`RETURN_AWAY_MS`): the check of BR-APP-104 (since `index-CIa0Ldj2.js`, like the rows below) | `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:102`; `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:52-74` (at r33) |
| Top zone of the long return | scrolled less than 60 px (`MINI_TOP_ZONE_PX`): the feed is re-created without a request (BR-APP-104) | `$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js:6`; `App.jsx:438-468` (at r33) |
| Call guard | a second «Позвонить» within 1 500 ms of an accepted one is ignored (BR-APP-033) | `useListingContact.js:55-65` (at r33) |
| Minute clock of the age labels | checked every 15 s and on `visibilitychange`, while a feed card is mounted (BR-APP-109) | `$KVADRO_ROOT/demo/app/src/features/listing/minuteClock.js:4-43` (at r33) |
| Radar preview refetch | at most once per 10 000 ms (BR-APP-063) | `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:48-50,61-74` (at r33) |
| «Вернуть» on the «Отметили: уже сдано» toast | 6 s, the lifetime of a toast with an action (SCR-023) | `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:36-50` (at r33) |
| Map notes | 6 s after new points, for `map.cut` as for `map.note`; the error banner has no timer (SCR-011) | `MapViewGL.jsx:192-204`; `MapView.jsx:242-254` (at r33) |
| `owner_mascot_tap` | at most once per 30 000 ms (§3.3) | `$KVADRO_ROOT/demo/app/src/lib/ownerAttention.js:25-39` (at r33) |
| Leave animations | sheet 280 ms (other children of the backdrop 160 ms), sub-page 200 ms, toast 180 ms, tip 160 ms; the copy is removed after 600 ms at the latest (since `index-YX9bFVws.js`, like the rows below; BR-APP-112) | `$KVADRO_ROOT/demo/app/src/lib/leave.js:22,58,80,97,114,185` (at r38) |
| Rolling numbers | 0.62 s per digit, the next digit to the left 45 ms later (BR-APP-113) | `$KVADRO_ROOT/demo/app/src/components/RollNumber.jsx:20`; `$KVADRO_ROOT/demo/app/src/styles/listing-details.css:182` (at r38) |
| Save phases | the done phase holds 900 ms, 250 ms under reduced motion, before the sheet closes or the owner form moves on; the busy pill is 48 px wide; the narrowing takes 0.66 s; the tick is drawn over 0.4 s after 0.15 s (BR-APP-114) | `$KVADRO_ROOT/demo/app/src/components/SaveState.jsx:19`; `$KVADRO_ROOT/demo/app/src/styles/filters.css:337,375,420` (at r38) |
| Favourite animation | heart 0.8 s (`like`) or 0.6 s (`dip`); eight sparks over 0.55 s, from 8 px to 24 px or 29 px (BR-APP-117) | `$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:9-14`; `$KVADRO_ROOT/demo/app/src/styles/listing-card.css:401-406,500-525` (at r38) |
| Segmented thumb | 0.42 s slide; padding and gap 3 px, 4 px in the map bar and the owner form's currency (BR-APP-121) | `$KVADRO_ROOT/demo/app/src/styles/owner-shared.css:484-520` (at r38) |

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
  - **Inputs:** in UZS, millions with 1 decimal (unit «млн сум»); in USD, an integer with unit «$». Since release
    `index-CIa0Ldj2.js` the сум field prints the millions with at most one decimal and no thousands separator
    (`formatInputDecimal`), so its text parses back; before, the digits were grouped (the release's unit `083`).
  - **Parsing:** up to `index-CBlEKxdL.js` the first `,` becomes `.`, everything except digits and dots is stripped,
    `Number()` is applied, and 0 / empty / NaN give `null`. UZS is converted with `max(1, round(value · 10⁶ / rate))`
    (`:76-101`). Since release `index-CIa0Ldj2.js` there are two rules (`:72-117` at r33;
    `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:41` at r36; before, only the rule above, the release's unit
    `082-modified-parsePriceInput.jsx.diff`):
    - **Dollars only:** a text of 1 to 3 digits followed by one or more groups of a separator (a dot, a comma, a space,
      a no-break space or a narrow no-break space) and exactly 3 digits, with an optional `$` before or after, loses
      every non-digit and is read as a whole number; zero gives `null`. «1,200», «1.200», «1 200 $» and «$1 200» give
      1200; «1.000.000» gives 1000000.
    - **Otherwise:** in the English number locale a text of the form `1,200` or `1,200.5` loses its commas; in the other
      locales the first comma becomes a dot. Then everything except digits and dots is stripped; empty, zero or not a
      number give `null`.
    - **Result:** dollars are `Math.round(value)`; сум, where the value is millions of сум, are
      `max(1, round(value × 1 000 000 / rate))`.
    - **Consequences:** in сум «1.000.000» is still `null` (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:169`; LB-APP-011).
      In dollars «1,200.5» is `null` with the ru locale and 1201 with the en locale.
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
    (`$KVADRO_ROOT/demo/app/src/i18n/index.js:83-93`). Since release `index-CIa0Ldj2.js` it takes a time zone
    (`i18n/index.js:86-104` at r33).
  - History time: `toLocaleTimeString(numberLocale, {hour, minute})`.
  - Both use the **device time zone**, not Asia/Tashkent, up to `index-CBlEKxdL.js` (LB-APP-025); since release
    `index-CIa0Ldj2.js` the listing history passes `Asia/Tashkent` for the date and for the `HH:MM` time
    (`$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx:9-16` at r33).
  - Relative «обновлено N минут назад» comes from `median_updated` (`MarketSheet.jsx:15-34`).
  - Visit days for the home-screen offer are **UTC** dates (`$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:71-78`;
    LB-APP-010).
  - `age` («2 ч назад» and similar) is a server string up to `index-CBlEKxdL.js`; since release `index-CIa0Ldj2.js` the
    client computes the label from `posted_at` (§1.12, BR-APP-109).
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
  `cubic-bezier(.2,.9,.3,1)` at 0.25–0.35 s. Since release `index-YX9bFVws.js` there are three motion tokens
  (`tokens.css:27-29` at r38): `--ease-out: cubic-bezier(0.2, 0.9, 0.3, 1)`, `--ease-spring: cubic-bezier(0.3, 1.2, 0.45,
  1)` and `--ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1)` (**CSS of release `index-YX9bFVws.js`** below).
- **Z-index ladder:** map note 5 → topbar 10 → CTA 20 → view toggle 29 → tab bar 30 → map card and mini title 31 → nudge
  35 → sub-page 40 → listing layer 45 → sheet backdrop 50 → toast and city sheet 60 → photo viewer and fullscreen map
  100 → active pin 1000. Since release `index-CBlEKxdL.js`: owner form layer 46, its footer bar and the requests overlay
  of the owner panel 47, place picker 60, the buttons of the spot map 1000 (SCR-050, SCR-018).
- **Safe areas:** `--top-inset = --tg-safe-area-inset-top + --tg-content-safe-area-inset-top`;
  `--bottom-inset = --tg-safe-area-inset-bottom`. There is no `env(safe-area-inset-*)` and no left/right inset
  (`tokens.css:30-31`). `--tg-viewport-*`, `dvh` and `svh` are not used; full-screen layers are `position: fixed;
  inset: 0`.
- **Fonts:** the UI uses system fonts only, with no `@font-face`. The 12 Noto Sans woff2 files (latin, latin-ext,
  cyrillic, cyrillic-ext × 400, 500, 600) are **map label glyphs** for MapLibre (`$KVADRO_ROOT/demo/app/src/features/map/gl/fonts.js:16-65`).
- **Icons:** `lucide-react` in 45 files, plus the custom `RadarIcon` and `InstagramIcon` SVG components. Release
  `index-BnFvC-Ft.js` adds `GalleryHorizontal` (the SCR-032 row) and, in the new `CardStylePicker.jsx`, `Check` and
  `Image` (imported as `ImageIcon`), all from `lucide-react@1.69.0`
  (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md:21-22,33`). Release `index-CBlEKxdL.js` adds
  `ShieldCheck` (the card badge, the shield of the compact card and the owner chip) and, in the owner cabinet, `Minus`
  and `ListChecks` (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-18_index-CBlEKxdL/REPORT.md:51-52`); `lucide-react` is
  imported in 54 files at r31. Release `index-CIa0Ldj2.js` adds `ArrowUp` (the fresh pill, SCR-063) and `SearchX` (the
  gone state, SCR-019) (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/REPORT.md:28` at r35). Release
  `index-YX9bFVws.js` imports `House` and `ChevronRight`, which the app already used, in the new `OwnerEntry.jsx`, and
  the owner form no longer draws `LoaderCircle` in its publish button and upload tiles (it keeps it for the phone wait;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:3` at r38).
- **Images:**
  - mascots `empty-magnifier.svg` (search empty) and `empty-shrug.svg` (favourites and history empty, crash), at 120 px;
  - `hooray.webp` (found survey), 132 px;
  - `favicon.svg` / `favicon.ico`.
- **Animations:**
  - `spin`, `shimmer`, `fade`, `rise` (sheets), `rise-in` (toast, nudge), `viewer-in`, `subpage-in`, `minfo-go`,
    `minfo-fade`, `radar-turn`, `radar-blip`;
  - since release `index-CBlEKxdL.js` the listing layer's `@starting-style` entrance and `.leaving` transition
    (SCR-018), switched off under reduced motion (`.listing-layer { transition: none }`), and a `.spin` helper class;
  - `prefers-reduced-motion` stops the shimmer and spinner and sets `* { transition: none !important }`
    (`$KVADRO_ROOT/demo/app/src/styles/states.css:70-77`); JS gestures settle instantly. The `*` selector does not
    reach pseudo-elements, so a transition on `:before` / `:after`, such as the segmented thumb of release
    `index-YX9bFVws.js`, is not stopped by it (`inferred` from the selector);
  - since release `index-YX9bFVws.js` the keyframes `fav-like`, `fav-dip`, `fav-spark` (SCR-007), `toast-ring`
    (SCR-042), `save-draw` (BR-APP-114), `own-up-wait`, `own-photo-ok` and `own-limit-shake` (SCR-052); the transitions
    of `.roll-strip`, `.save-btn`, `.marker-run` and `.segmented:after`; six new reduced-motion blocks (four in the main
    CSS, two in `owner.css`); and the leave animations of `lib/leave.js`, which run through the Web Animations API, not
    CSS (§1.2; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:19,32` at r39).
- **Responsive design:** none. There are no width or orientation media queries; the layout is single-column for phones.
- **CSS cascade constraints:**
  - The order of the 24 `@import`s in `$KVADRO_ROOT/demo/app/src/styles/index.css:2-25` **is** the cascade of the
    original bundle; the CSS must be imported after `App` in `main.jsx` (`main.jsx:2,17`). Release
    `index-BnFvC-Ft.js` adds a 25th, `card-style.css`, last (`index.css:26`; in the production CSS these rules are the
    last bytes, `$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md:34`). Release
    `index-CBlEKxdL.js` adds a 26th, `owner-shared.css`, last (`index.css:26-27` at r31).
  - `MapScreen.css` arrives through App, and lazy chunks bring `mapgl.css` and `leaflet.css`.
  - `lite.css` and `fallbacks.css` rely on coming late.
  - The only feature fallback is `@supports not (color: color-mix(…))`; `:has()` is used without a fallback. Since
    release `index-CBlEKxdL.js` `:has()` also sets the toast offsets (SCR-042). Since release `index-YX9bFVws.js` a
    second `@supports` block, `selector(:has(*))`, holds the segmented thumb, so the thumb, unlike the toast offsets,
    is skipped where `:has()` is missing (`owner-shared.css:484-542` at r38), and the `color-mix` fallback block gains
    the thumb's dark colour (`fallbacks.css:69-71` at r38).
- **Product-encoding CSS:**
  - verdict tones `good / high / same / mixed / no_repair / suspicious / check` drive `.delta`, `.deal`, `.marker` and
    pin colours;
  - inactive radar tiles are greyscale;
  - `.danger-row` is `#ff5c5c`;
  - feed cards use `content-visibility: auto` with an intrinsic size of 420 px;
  - since release `index-CBlEKxdL.js`: inactive tabs are tinted 55 % (`color-mix`, with an opacity fallback) instead of
    opacity 0.55 (`chrome.css:130-150` at r31); the market block's class is `.island`; `.primary` is centred
    (`justify-content: center`) and has opacity 0.5 when disabled.
- **CSS of release `index-CIa0Ldj2.js`:** nine new rules, none changed or removed (the CSS diffs `001` to `009` of the
  release, `$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/delta/css/` at r35;
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:26` at r36):
  - `.fresh-pill`, `.fresh-pill:active`, `.chrome-mini .fresh-pill` and `.lite.chrome-mini .fresh-pill`
    (`chrome.css:183-213`; SCR-063);
  - `.fallback-close` (`$KVADRO_ROOT/demo/app/src/styles/settings.css:157`): fixed, top `var(--top-inset) + 10px`, right
    12 px, 44 × 44 px, `z-index: 3`, opacity 0.88 (`05` TMA-047);
  - `.map-error`, `.map-error .text-btn` and `.map-card-error` (`$KVADRO_ROOT/demo/app/src/styles/map.css:404-418`;
    SCR-011, SCR-013);
  - `.sheet-backdrop.parked` (`$KVADRO_ROOT/demo/app/src/styles/radar.css:264`; SCR-028).
- **CSS of release `index-YX9bFVws.js`** (at r38; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:19,22-36` at r39; by the
  sync report the built CSS equals production rule for rule,
  `$KVADRO_ROOT/demo/app/docs/releases/2026-11-20_index-YX9bFVws/REPORT.md:66-69` at r39):
  - **Tokens:** the three motion tokens above. Every `cubic-bezier` literal that the app had up to `index-CIa0Ldj2.js`
    became a `var(--…)` (33 removed lines of the r38 diff carry one); where the literal had the token's value nothing changed,
    elsewhere the curve changed. At r38 the only literals outside `tokens.css` are new ones: `fav-spark`
    (`listing-card.css:508`) and the two leave curves of `lib/leave.js:8,10`.

    | Where | Before | Since `index-YX9bFVws.js` | Value |
    | ----- | ------ | ------------------------- | ----- |
    | tab bar clip (`chrome.css:109`), view toggle transform and clip (`chrome.css:216-217`) | `cubic-bezier(0.3, 1.1, 0.45, 1)` | `--ease-spring` | changed |
    | tab lens (`chrome.css:120,296`) | `cubic-bezier(0.3, 1.35, 0.45, 1)` | `--ease-spring` | changed |
    | `minfo-go` of the market sheet (`listing.css:269`; SCR-022) and the market marker (`listing.css:423-425`; SCR-018) | `cubic-bezier(0.22, 1, 0.36, 1)` | `--ease-out` | changed (the marker also moves by `transform` instead of `left`) |
    | `own-confetti` (`owner.css:446`; SCR-056) | `cubic-bezier(0.2, 0.7, 0.3, 1)` | `--ease-out` | changed |
    | `oi-draw` of the owner info sheet (`owner-shared.css:377`; SCR-062) | `cubic-bezier(0.65, 0, 0.35, 1)` | `--ease-out` | changed |
    | top bar, fresh pill and mini title (`chrome.css:6,202,242,252`), the listing layer (`listing.css:11`), the sheet entrance `rise` (`city-sheet.css:18`, `filters.css:98`), `subpage-in` (`settings.css:179`, `owner-shared.css:17`, `owner.css:1263`), lite chrome (`lite.css:56`), the panel's week bars and the place picker's pin (`owner.css:661,1299`); in JS pull-to-refresh, photo zoom, swipe-back and sheet drag (`PullToRefresh.jsx:39`, `ZoomableImage.jsx:41`, `useSwipeBack.js:50`, `useSheetDrag.js:117`) | `cubic-bezier(0.2, 0.9, 0.3, 1)` | `--ease-out` | same |
    | tab buttons (`chrome.css:277,282`) | `cubic-bezier(0.3, 1.2, 0.45, 1)` | `--ease-spring` | same |
    | owner tips, the info sheet's badge, the done mascot (`owner-shared.css:234,283,354`, `owner.css:399,1536`) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `--ease-pop` | same |

  - **Clip radii:** the clip masks of the tab bar and the view toggle are rounded by `999px` instead of `60px`, the
    collapsed tab bar's `calc(var(--tabbar-h) / 2)` and the collapsed view toggle's `22px` (`chrome.css:268,271,309`).
  - **New rules:** `.leave` (`filters.css:63-67`), `.save-btn` / `.save-st` / `.save-spin` / `.save-ok`
    (`filters.css:334-435`), `.roll*` (`listing-details.css:154-221`), `.fav svg` and `.fav-burst`
    (`listing-card.css:396-535`), `.toast-ring*` (`feedback.css:65-91`), `.marker-run` (`listing.css:383-391,423-425`),
    `.found-landlord*`, `.feed-end`, `.own-entry-*` (`found.css`), `.title-row .owner-chip-wrap` and the segmented thumb
    (`owner-shared.css:184-187,484-542`), and in `owner.css` `.own-up-*`, `.own-photo-ok`, `.own-field.area` and
    `.own-limit*`. Changed: `.marker` (`right: 0`, `translate(50%)`), `.listing` (`overflow-x: hidden`) and
    `.owner-chip` (`white-space: nowrap`). Removed: `.scale .marker` (its `left` transition).

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
| BR-APP-007 | **Room selection.** A tap picks one value. A second tap on a different value, while one value (or 4+) is picked, creates a range between them. `4` means "4 or more" (`rooms_max = null`). «Любые» clears the selection. Since release `index-CIa0Ldj2.js`, with only `rooms_max` set the buttons from 1 to `rooms_max` are highlighted, and «Любые» is active only when both bounds are `null` (before: whenever `rooms_min` was `null`). The sheet cannot produce a maximum without a minimum, so the state comes from server-provided filters (`inferred`). | `model.js:145-176`; `model.js:169-177`; `RoomsPicker.jsx:17` (at r33) |
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
| BR-APP-019 | **Tenant and pets sections** appeared whenever the base deal is rent, which includes daily rent, up to release `index-CBlEKxdL.js`. Since release `index-CIa0Ldj2.js` the pets section shows only for long-term rent; the tenant section still shows for both rents. | `FiltersSheet.jsx:213-216`; `FiltersSheet.jsx:214-217` (at r33) |
| BR-APP-020 | **Market** filters exist only for sale and **appliances** only for rent; up to release `index-CBlEKxdL.js` the **area** range was sale-only too. Since release `index-CIa0Ldj2.js` the area range («Площадь, м²») shows for every deal, in the search sheet and in both radar sheets; market stays sale-only. The legacy contract still calls `area_*` sale-only (`$KVADRO_ROOT/docs/api.md:206`, r35). | `FiltersSheet.jsx:220-227`; `FiltersSheet.jsx:221`; `sheet/ExtraSections.jsx:9-42` (at r33) |
| BR-APP-021 | **«Опубликовано за 1 / 3 / 7 дней»** exists only in search mode, never in radar create or edit. It is ignored when matching radars. | `FiltersSheet.jsx:228`; `model.js:49` |
| BR-APP-022 | **Resetting the full sheet** gives the defaults for the base deal and current city. Resetting a quick sheet resets only its own filter; price reset also clears `below_median`. | `FiltersSheet.jsx:189`; `$KVADRO_ROOT/demo/app/src/features/filters/QuickFilterSheet.jsx:35-51` |
| BR-APP-023 | **Sort options:** `new`, `cheap` and `expensive` always. `deal` for non-daily apartment-only searches where `city.median !== false`. `center` when the city has zones. `ppm` for sale. An unavailable sort falls back to `new`. `new` is never sent to the API. | `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-34`; `App.jsx:259-263`; `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:78` |
| BR-APP-024 | **Feed paging:** `limit=20` with an opaque `cursor`, which ends when `next_cursor === null`. Items are de-duplicated by `id` across pages. Since release `index-CIa0Ldj2.js` favourites are paged the same way; history is still read whole. | `feed.js:75-85`; `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:31-42`; `$KVADRO_ROOT/demo/app/src/lib/api/user.js:26-27` (at r33) |
| BR-APP-025 | **The few-results note** appears only when the list is fully loaded with fewer than 10 items, there are no active filters, and city stats and name are known. «Смотреть продажу / аренду · N» is offered only when the other deal has more listings in the city. | `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:89-92`; `App.jsx:420-439`; `$KVADRO_ROOT/demo/app/src/app/FewResultsNote.jsx:39` |
| BR-APP-026 | **Card badge priority:** «Подозрительно дёшево» (warn) > «Проверьте цену» (warn) > «Проверенный хозяин» (`owner_verified`) > «Хозяин» (`is_owner`) > «Ниже рынка» (`good`). Since release `index-Dbpp463V.js`; before it «Ниже рынка» ranked above «Хозяин». Since release `index-CBlEKxdL.js` the verified badge reads «Проверенный хозяин» («Хозяин ✓» before) and each badge has a kind: `warn` for the two warnings, `verified` with a shield icon, `quiet` for «Хозяин», none for «Ниже рынка»; the compact map card, which has no badge, shows a shield after the price for `owner_verified`. | `$KVADRO_ROOT/demo/app/src/features/listing/format.js:253-283`; `$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md:12-13`; `format.js:269-301`, `ListingCard.jsx:60-61,92-97`, `$KVADRO_ROOT/demo/app/src/styles/listing-card.css:168-188` (at r31); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:24` (at r31); the release's units `002-modified-ListingCard.jsx.diff` and `064-modified-ru.jsx.diff:16-17` |
| BR-APP-027 | **Market verdict wording** depends on `median_tone`: `check` (above or below), `suspicious`, `same`, `mixed`, `no_repair`, `good`. Otherwise the text says "pricier"; from +90 % it says «В {x} раза дороже рынка». Percentages are rounded `abs(delta)·100`. | `format.js:142-217` |
| BR-APP-028 | **The market block shows** only when a verdict exists and `median_value`, `median_delta` and `median` are present. The scale is linear with ±40 % at the edges, clamped to 4–96 %. | `$KVADRO_ROOT/demo/app/src/features/listing/sections/MarketBlock.jsx:105,177-179` |
| BR-APP-029 | **Metro on cards:** shown only within 1.5 km. Under 50 m only the name is shown; otherwise «{metro} · {m} м», with metres rounded to 100. | `format.js:76-87` |
| BR-APP-030 | **The card location line** is `district · landmark · (metro label or «{km} км до центра»)`. | `$KVADRO_ROOT/demo/app/src/components/ListingCard.jsx:46-48` |
| BR-APP-031 | **Distances in «Рядом»:** under 0.1 km «рядом»; under 0.95 km metres rounded to 100; otherwise km with 1 decimal. A `~` prefix is added when `geo_radius_m ≥ 400` (default 500). | `format.js:94-113`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/NearbySection.jsx:31` |
| BR-APP-032 | **The main CTA**, in priority order: phone → «Позвонить»; `contact_url` → «Написать» (or «Номер платный» when `contact_paid`); otherwise «Открыть пост», unless `post_deleted`, in which case there is no action. Since release `index-CBlEKxdL.js` the request of a gate listing and the "no contact" bars rank above this order (BR-APP-098). | `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:28-48` |
| BR-APP-033 | **Calling.** On Android, `tel:` is tried first; if the app is not left within 1.2 s, the call page opens. Elsewhere the call page (`call_url`, about 10 min TTL) opens directly, refreshed when it is older than 8 min. Since release `index-CIa0Ldj2.js` a second «Позвонить» within 1 500 ms of an accepted one is ignored (the haptic still plays); the guard covers the CTA and the numbers in the original text. | `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:14-40`; `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:54-81`; `useListingContact.js:55-65`; `ListingScreen.jsx:124` (at r33) |
| BR-APP-034 | **Machine translation** of the original text is offered only when the interface locale is not `ru`. The first tap fetches, later taps toggle; the result is labelled «Перевод сделан ИИ». | `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingTranslation.js:22-39`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/OriginalText.jsx:78-80` |
| BR-APP-035 | **Phone numbers in the original text** are detected as Uzbek numbers (`[+998] XX XXX XX XX` with a known operator or city code). Only the number that equals the listing's `phone` becomes a call button. A self-placed listing has no original text (BR-APP-102). | `$KVADRO_ROOT/demo/app/src/lib/phone.js:4-89`; `OriginalText.jsx:32-38` |
| BR-APP-036 | **Moderation effects on the client:** hide → hidden with undo; block → all `listing_ids` hidden with undo; `fraud` with `hidden` → hidden with undo (the button reads «Показывать у меня» since release `index-CIa0Ldj2.js`); `rented` → hidden, without undo up to `index-CBlEKxdL.js`; since `index-CIa0Ldj2.js` the toast carries «Вернуть» for 6 s, which shows the listing again and sends `DELETE /api/listings/:id/report`, and a failed undo hides it again. The `agent` reason is not offered when `is_owner === false`; since `index-CIa0Ldj2.js` also not when the author is not a phone (`author.kind !== 'phone'`), which includes a card without an author and a card whose details have not loaded yet. Since that release the `agent` toast follows `agent_marked` of the answer: «Отметили номер как риелторский» when `true`, «Спасибо, учёл вашу отметку» otherwise. Since release `index-BNLZFfL0.js` `wrong_data` is sent only together with a `detail` (`price`, `rooms`, `place`, `photos`, `other`) picked on a third view; the other reasons are sent at once and without `detail`. | `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:32-81`; `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:176-200`; `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:86-90`; `$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md:13-23`; `useListingActions.js:36-50,62-74`; `ListingScreen.jsx:389-390`; `ListingActionsSheet.jsx:93-103,177`; `listings.js:87-90` (at r33) |
| BR-APP-037 | **The block hint** appends «скроет N объявлений» only when the author has 20 or more listings. | `ListingActionsSheet.jsx:103-107` |
| BR-APP-038 | **Share** is shown only when `bot_username` is known. It uses a prepared message (Telegram 8.0+); otherwise `t.me/share/url` with `https://t.me/<bot>?startapp=l_<id>` and text `title · price · price-kind label · district`; the label is «первый взнос» (`down_payment`) or, since release `index-Dbpp463V.js`, «цена за бизнес, помещение в аренде» (`business`), and is left out for other values. | `$KVADRO_ROOT/demo/app/src/features/listing/ListingTitleRow.jsx:28-50,71`; `$KVADRO_ROOT/demo/app/src/features/listing/format.js:35-43` |
| BR-APP-039 | **Favourite toggle** is optimistic; the server toggle response (`favorite`) wins, and a failure rolls back. The favourites list hides items un-favourited this session. Since release `index-CIa0Ldj2.js` the request carries the wanted state `{favorite}` (before: no body, the server toggled), and a failure or an empty answer rolls back with the error haptic and the toast «Не получилось сохранить» (before: silently). | `$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:19-34`; `ListingFeed.jsx:81-84`; `FavButton.jsx:20-37`; `lib/api/listings.js:39-45` (at r33) |
| BR-APP-040 | **The «viewed» eye** is `seen[id] ?? item.viewed`; it is not shown in history or on compact map cards. Since release `index-CIa0Ldj2.js` the «новое» mark of a radar's finds follows the same session map: it shows only while the radar is active, `viewed` is falsy and the listing was not opened in this session. | `ListingFeed.jsx:120`; `ListingCard.jsx:61`; `RadarStrip.jsx:34-36`; `App.jsx:833` (at r33) |
| BR-APP-041 | **Turning on a radar.** The client re-fetches the subscriptions. If an identical one is active → «Радар по этому поиску уже включён». If it exists but is inactive → `PATCH {active:true}`. Otherwise `POST` with `entry` = `filters` / `few` / `prompt` / `empty`, since release `index-DY_DH7h-.js` also `feed` / `return` (BR-APP-073). `409` (not `no_chat`) → the limit toast with `max_subscriptions ?? 10`. Since release `index-CIa0Ldj2.js` a call made while an earlier one is running returns at once, without a toast. | `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:94-158`; `App.jsx:401-415,718,752` (at the pin); `subscriptionActions.js:98-108`; `App.jsx:395,985-989` (at r33) |
| BR-APP-042 | **"Widen" suggestion** after a radar with no starter results: the first `options[]` entry with `count ≥ 7`, else the last one. | `subscriptionActions.js:49-67` |
| BR-APP-043 | **Follow nudge** appears when: filters are custom, no radar with the same filters exists, radars < max, not snoozed (14 days after 3 closes in a row), ≥ 8 h since the last nudge, and this filter hash was not offered before (last 40 kept). It shows 1.8 s after applying filters and hides after 10 s. Since release `index-DY_DH7h-.js` a shown return banner counts as a shown nudge: it sets the last-nudge time and marks its filter hash as offered (BR-APP-071). | `followNudge.js:51-92`; `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:9,49-79`; `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:9`; at the pin `followNudge.js:198-216` |
| BR-APP-044 | **Radar flow wording:** `week == 0` → "none" (three different texts, LB-APP-033); `week / days < 1` → «N за неделю»; otherwise «≈N в день» with N rounded. | `format.js:230-243`; `Nudges.jsx:24-37`; `$KVADRO_ROOT/demo/app/src/features/radar/subscriptionStatus.js:19-31` |
| BR-APP-045 | **Home-screen offer:** Telegram 8.0+, at least 3 distinct (UTC) visit days, never offered before, after 4 s calm on the list feed, and only when the status is `missed`. The settings row shows when the status is `missed` or `unknown`. | `$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:8,84-87`; `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:56-83`; `$KVADRO_ROOT/demo/app/src/features/settings/AboutGroup.jsx:19` |
| BR-APP-046 | **Nudges** appear only on search / list with nothing else open. The home offer waits while a follow nudge, follow candidate or toast is present. Since release `index-DY_DH7h-.js`: the create-radar sheet also blocks them; the home offer also waits for a return banner and its pending check; the follow nudge is not offered while a banner check for the same filters is pending, is not rendered next to a banner and is dropped when one shows. A home offer already on screen is hidden by a follow nudge but not by a banner (LB-APP-049). Since release `index-CIa0Ldj2.js` the fresh pill (SCR-063) shows under the same condition, beside the nudges, not instead of one. | `App.jsx:181-189,605,618`; at the pin `App.jsx:233-242,724,737,756`, `useFollowNudge.js:70-72`, `useHomeScreenOffer.js:60-73`, `useReturnNudge.js:130-131`; `App.jsx:321-331,793-794` (at r33) |
| BR-APP-047 | **Radar sheet:** the delivery mode can be chosen only while the radar is active. «Скрыто: N» appears only when `hidden > 0`. The digest hint shows the user's digest hours. | `$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:99-138` |
| BR-APP-048 | **Turning a radar on** goes through the chat-access flow; turning it off does not. `ask_found` after pause or delete opens the survey. Delete requires a confirmation. Since release `index-CIa0Ldj2.js` a failed switch (unless `no_chat`), mode change, unhide or delete shows «Не получилось сохранить»; a `409` limit on the switch reads the same (LB-APP-081). | `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:92-183`; `RadarScreen.jsx:130-134,152-156,172-175,194-197` (at r33) |
| BR-APP-049 | **Survey:** `kvadro` → congratulations; `elsewhere` → "where" (7 options); `searching` / `stopped` → close with a toast. Answers are sent with `trigger` = `pause` / `delete`. | `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:93-122` |
| BR-APP-050 | **Language before meta:** `kv-locale`, else `uz_Latn` when the Telegram language is `uz*`, else `ru`. After meta, `meta.locale` wins. A first launch requires an explicit choice (`locale_chosen`). | `$KVADRO_ROOT/demo/app/src/i18n/index.js:25-34`; `useAppBootstrap.js:79`; `App.jsx:234-236` |
| BR-APP-051 | **Settings save semantics.** Language and currency: save, then a full reload. Theme: applied at once, saved, rolled back on error. Quiet hours and digest: optimistic with rollback. Graphics: device-local only. Since release `index-CIa0Ldj2.js` every failed save shows «Не получилось сохранить»; a failed language or currency save does not reload. | `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:83-133`; `SettingsScreen.jsx:145-149,185-190,202-205` (at r33) |
| BR-APP-052 | **The graphics setting** is shown only on Android, or when the user has changed it before. | `SettingsScreen.jsx:55` |
| BR-APP-053 | **The «Скрытое» group** appears only when hidden listings plus blocked authors > 0. | `SettingsScreen.jsx:135,187` |
| BR-APP-054 | **Access gate:** a `403` from meta shows one of `private / invite / full / blocked / join` and, since release `index-CIa0Ldj2.js`, `paused` (unknown → `private`). It is re-checked 3 × 2.5 s unless `blocked`. Network failures retry after 1, 3, 7, 15, 30 s. Returning to the app retries at once. For `blocked` and, since that release, `paused` the bot link carries no source. | `useAppBootstrap.js:24-26,127-158`; `NoAccessScreen.jsx:13,22,26`; `useAppBootstrap.js:155-165,175-182` (at r33) |
| BR-APP-055 | **The first-launch city choice** is required when there is more than one city, `meta.city_chosen === false`, nothing was picked this session, and no listing is open. | `App.jsx:257` |
| BR-APP-056 | **Nearest city by location:** towns within 16 km; then "regions" (`zoom < 11`) within 110 km; then towns within 110 km; otherwise «Рядом с вами наших городов пока нет». | `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:108-126`; `$KVADRO_ROOT/docs/api.md:499-500` (r31) states the rule as contract, still derived from the code (Q-APP-004) |
| BR-APP-057 | **`?news=pets`** without a listing link opens the filters focused on the pets section and switches to long-term rent defaults if needed. The «Новое» pill shows until `kv-new-pets` is set. | `useAppBootstrap.js:115-124`; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/PreferenceSections.jsx:68,80` |
| BR-APP-058 | **Pull-to-refresh** reloads the radar list on the radar tab and re-creates the list elsewhere; it is disabled on settings, the map and under any overlay. Since release `index-CIa0Ldj2.js` «Сохранённые» has a counter of its own, so a pull there no longer re-creates the search feed. | `App.jsx:359-365,530-541`; `App.jsx:662-673,841-854` (at r33) |
| BR-APP-059 | **Photos:** a `.s.jpg` (480 px) thumbnail exists only for `/media/<n>/<n>.jpg?…`. Save-Data, ≤ 3g or lite loads only thumbnails; otherwise `srcset` uses 480w / 800w. There is no retry after a load error. Since release `index-CIa0Ldj2.js` a reused image clears "loaded" and "failed" when its `src` changes. | `$KVADRO_ROOT/demo/app/src/lib/images.js:9-60`; `$KVADRO_ROOT/demo/app/src/components/Photo.jsx:16-46`; `Photo.jsx:19-25` (at r33) |
| BR-APP-060 | **Client price display:** USD `$N`; UZS in млрд / млн with 1 decimal, otherwise rounded to thousands of сум; UZS only when the rate is greater than 0 (§3.5). | `money.js:14-58` |
| BR-APP-061 | **A drawn area** becomes a polygon of ≤ 40 vertices with coordinates rounded to 5 decimals. A self-intersecting outline is replaced by its convex hull. Areas under 40 px are rejected with «Обведите покрупнее». Sent as `polygon=lat,lon;…`. | `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:115-151,235` |
| BR-APP-062 | **The map** excludes locally hidden listings. «На карте N из M» appears when some listings have no coordinates. Pins with equal coordinates (5 dp) become a stack sorted by price. Since release `index-CIa0Ldj2.js` the counts come from `with_point` of the answer (absent: the number of points): `cut = max(0, with_point − points)`, `noPoint = max(0, total − with_point)`, `shown` = the points without the locally hidden ones. `cut > 0` shows «На карте — {shown} самых свежих. Остальные — в списке» (`map.cut`); else `noPoint > 0` shows «На карте {shown} из {shown + noPoint} · …»; without `total` neither shows. Locally hidden listings are no longer subtracted from `total`. | `$KVADRO_ROOT/demo/app/src/features/map/pins.js:9-22`; `$KVADRO_ROOT/demo/app/src/features/map/gl/useClusterIndex.js:89-92`; `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:142-149`; `gl/MapViewGL.jsx:192-204`; `leaflet/MapView.jsx:242-254` (at r33) |
| BR-APP-063 | **Radar previews:** for each radar, the newest feed page (5 shown), the total count and the flow are fetched by the radar's filters. Since release `index-CIa0Ldj2.js` they are fetched again after every successful load of the radar list (mount, pull-to-refresh, any radar change, retry), at most once per 10 s; before, only when the set of radars or their filters changed. | `$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:41-66`; `RadarScreen.jsx:48-50,61-74`; `useRadarPreviews.js:23-74` (at r33) |
| BR-APP-064 | **Filter summary order:** `city · area · Посуточно · у метро · rooms · price · ≤ медианы · без риелторов / от хозяев`. Areas show «Своя область», «Центр и ближе к центру», the zone name before « (», or two districts «+N». Since release `index-CIa0Ldj2.js` districts and zones are printed together when both are set («Юнусабадский · Центр»; before, zones won) — a state only server-provided filters can hold (`inferred`) — and the collapsed title of daily rent is the summary alone, without the deal word in front (before: `<deal> · <summary>` for every deal). | `$KVADRO_ROOT/demo/app/src/features/filters/summary.js:68-105`; `summary.js:71-92,100`; `App.jsx:520-524` (at r33) |
| BR-APP-065 | **Radar title:** deal (unless long-term rent) · types (unless only apartments) · rooms · price; if all are empty, the deal name. | `summary.js:108-119` |
| BR-APP-066 | **Room and price labels:** «{n}-комн.», «{n}+ комн.», «{lo}–{hi} комн.»; «до X», «от X», «X–Y». | `summary.js:6-42` |
| BR-APP-067 | **Clearing history** requires a confirmation and clears it on the server; there is no undo. Since release `index-CIa0Ldj2.js` a failed clear shows «Не получилось сохранить». | `ListingFeed.jsx:93-103`; `ListingFeed.jsx:114-117` (at r33) |
| BR-APP-068 | **Listing stats:** 0 days → «Сегодня на рынке». Channels are shown only when > 1; views only when non-zero. | `$KVADRO_ROOT/demo/app/src/features/listing/sections/StatsSection.jsx:13-24` |
| BR-APP-069 | **Price history:** one entry → a sentence with a clickable @channel; several → a timeline with the price and ±%, green when negative and orange when positive. Since release `index-CIa0Ldj2.js` its dates and times are formatted in Asia/Tashkent (before: the device time zone, LB-APP-025). | `$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx:28-97`; `HistorySection.jsx:9-16`; `$KVADRO_ROOT/demo/app/src/i18n/index.js:86-104` (at r33) |
| BR-APP-070 | **Search visits** (since release `index-DY_DH7h-.js`). Once meta is loaded, a visit is recorded for the current filter set on entering the search tab, on every filter change and, on the search tab, when the app goes to the background. A set is keyed by a djb2 hash of `filtersKey`, so `posted_days` is ignored; `kv-visits` keeps the 40 newest. The previous visit of a set is the stored time read at its first visit in the current visit session. A session starts with the app and again when the app returns from the background after ≥ 6 h, which also re-reads the radars. Since release `index-CIa0Ldj2.js` such a return also runs the long-return check (BR-APP-104). | `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:35-72`; `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:37-45,98-148` (at the pin); `useReturnNudge.js:52-74` (at r33) |
| BR-APP-071 | **Return banner** (since release `index-DY_DH7h-.js`). 1.8 s after a visit, with the radars loaded and nothing over the list, it is checked for that filter set. It needs: no radar with the same filters (for default filters, also none for the same base deal in the same city); radars < `max_subscriptions` (else 10); a previous visit ≥ 6 h ago; no snooze (14 days after 3 closes in a row, shared with the follow nudge); ≥ 8 h since the last nudge; no banner for this set in the last 2 days. Then `GET /api/feed/new` is sent, and the banner shows only for `count > 0` and hides after 15 s. Showing it stores the time for the set (`kv-nudge.back`, 40 kept), sets the last-nudge time, marks the set as offered and drops a follow nudge or its candidate; × counts towards the close streak. | `useReturnNudge.js:90-143`; `followNudge.js:150-216`; `Nudges.jsx:63-79`; `App.jsx:737-748` (at the pin) |
| BR-APP-072 | **In-feed radar card** (since release `index-DY_DH7h-.js`) on the search list when meta and the radars are loaded, no radar exists for the search (the test of BR-APP-071), radars < max and the card is not snoozed. It follows the 8th card, or the last card when the list has 8 or fewer, is fully loaded and has no few-results note. The title depends on the base deal (rent, including daily, or sale), the button on custom or default filters. × hides it for 7 days on every search and does not count towards the nudge close streak. | `followNudge.js:219-244`; `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:98-106,128-139`; `App.jsx:297-303,629-645` (at the pin) |
| BR-APP-073 | **«Включить радар» from the return banner or the in-feed card** resets the close streak. Custom filters go straight to the radar flow of BR-APP-041 with `entry` `return` / `feed`; default filters open the create-radar sheet (SCR-030), which sends the same `entry` (and `relaxed` when an option was picked). «+» and the empty radar screen open that sheet with `entry` `empty`, which it always sent before this release. | `App.jsx:399-415,629-635,712-721,749-753` (at the pin) |
| BR-APP-074 | **Card style of the bot's listing cards** (since release `index-BnFvC-Ft.js`). The value is `card_style ?? 'classic'`. A pick in SCR-048 does nothing when it equals the current style or while a sample is sending; otherwise it resets the sample result to `idle` and saves `PUT /api/settings {card_style}` optimistically with a light haptic, takes the full answer as the new settings, and on failure restores the previous settings with the error haptic. «Прислать пример в чат» plays a light haptic, shows `sending` and sends `POST /api/settings/card-sample` without a body: `sent: true` → «Пример — в чате с ботом» with the minimise hint and the success haptic; `sent: false` or a failed request → «Пример не отправился — вид всё равно сохранён» and the warning haptic. The result stays until the next pick or until the Settings tab unmounts. The sample is sent in the saved style (`$KVADRO_ROOT/docs/api.md:1040-1043`, r31). | `SettingsScreen.jsx:94-96,133-171` (at r31, the same code as the release's unit `008-added-NEW$pj.jsx`); `CardStylePicker.jsx:17-56` (at r29); `$KVADRO_ROOT/demo/app/src/lib/api/settings.js:7-14` (at r29); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:53-54` |
| BR-APP-075 | **Entry into the owner form and the new draft** (since release `index-CBlEKxdL.js`). The form opens for a new draft (`id: null`) from the Settings row (unless `can_add` is false), from «Сдать ещё одну квартиру» in the list (same check), from «Сдать ещё одну» on the panel (no check) and at launch when `start_param` is `owner_new` or `owner-new`, or the page query has `owner=new` (TMA-046). The launch state is set once, when `App` mounts. Every opening sends `POST /api/owner/listings`; the client never looks for an existing draft (LB-APP-054). Since release `index-YX9bFVws.js` the owner invitations of the search feed and the listing screen are a further entry: they read `GET /api/owner/listings` first and open the form on a new draft when `can_add` is true or the request fails, and «Мои объявления» otherwise (BR-APP-115). | `App.jsx:133-135`; `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:60-71`; `SettingsScreen.jsx:245-252`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:363-371`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:212`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:183-186` (at r31); `App.jsx:169-187` (at r38) |
| BR-APP-076 | **Start view of the place picker** (since release `index-CBlEKxdL.js`). A saved point gives zoom 17. Otherwise, and only when the listing has no point, `GET /api/owner/map-start` is awaited for up to 1.5 s; an answer that arrives after the timer is ignored. Without it the view is the centre of the form's city (or of the first city in meta) at that city's `zoom + 1` (`zoom` defaults to 12), else Tashkent 41.311, 69.28. | `OwnerForm.jsx:105,111-114,197-209,526-544` (at r31); `$KVADRO_ROOT/docs/api.md:502-505,1474-1475` (r31) |
| BR-APP-077 | **Address under the pin** (since release `index-CBlEKxdL.js`). The lookup `POST /api/owner/place` runs 400 ms after each stop of the map, aborting the previous request, and only when the centre is inside lat 37–46, lon 55–74; outside, the label is "unknown" at once. Label: `address`, else «landmark · district», else the city name, else `own.pickNoAddr`. A failed request gives `own.pickNoAddr`. | `$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:15-16,24,63-83,203-216` (at r31); `$KVADRO_ROOT/docs/api.md:1471-1473` (r31) |
| BR-APP-078 | **Place from the point after «Готово»** (since release `index-CBlEKxdL.js`). The coordinates are rounded to 5 decimals. `POST /api/owner/place` is sent again (without abort). The answer is dropped when the point changed meanwhile or the call failed, and a `city` that meta does not know is ignored. Empty fields are filled silently and `own.placeNote` shows. Fields that already hold a different value are replaced, with the toast «Адрес обновили по карте» and «Вернуть», which restores the previous values. When both the district and the landmark were empty before the pick, the city counts as empty too. | `PlacePicker.jsx:19,153`; `OwnerForm.jsx:550-622`; `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:36-37,47` (at r31) |
| BR-APP-079 | **Autosave of the owner form** (since release `index-CBlEKxdL.js`). Every edit marks its fields as dirty and restarts a 600 ms timer. The dirty fields are also flushed before «Дальше», before publish and when the form unmounts (closing the form saves). Flushes run one at a time; a flush that waits for a failed one reports "not saved". The body holds the current values of the dirty fields, with cleared fields as `null`. While `floor > floors_total` those two fields are held back and the flush reports "not saved". Errors: `409`, or `detail: "missing:status"`, means locked (`own.notEditable` and «Мои объявления»); a network failure gives `own.editOffline`. `422 invalid:a,b` highlights those fields (`floor` → both floor fields; `point` / `lat` / `lon` → both coordinates). When only some of the fields were rejected, the rest of the same save is re-sent in a separate `PATCH`. Fields that failed stay dirty. Editing a field removes its highlight. | `OwnerForm.jsx:78,245-337,1437-1447` (at r31); `$KVADRO_ROOT/docs/api.md:1439-1442` (r31) |
| BR-APP-080 | **Defaults and couplings of the owner form** (since release `index-CBlEKxdL.js`). A draft without a city gets `meta.city` (which itself sends a `PATCH`). Typing a price also sets the currency (USD when none). The price takes digits only, at most 12. Choosing another city clears the district, the landmark and the point. Erasing the address while a point is set clears the point. `room` and `rooms` exclude each other. «5/9» in the floor field sets the floor to 5 and the number of floors to 9. Numbers must be > 0; the area may be decimal (a comma works); fields hold at most 6 characters (7 for the floor). The description holds at most 600 characters, the landmark at most 120. There is no client upper bound or sanity check on area, floor or price. | `OwnerForm.jsx:339-346,1022-1036,1140-1158,1186-1210,1262-1270,1374-1376`; `$KVADRO_ROOT/demo/app/src/features/owner/NumberField.jsx:4-60` (at r31) |
| BR-APP-081 | **The «Дальше» gate** (since release `index-CBlEKxdL.js`). Required: a city; a place (a district, a landmark or a point); rooms or «Комната»; a price and a currency; at least one photo; and a floor no higher than the number of floors. If something is missing, the sections are highlighted, the footer shows «Заполните: город, район или ориентир, комнаты, цену, фото» (only the missing items, `own.need.*`) and a warning haptic plays. Next comes a flush; if it fails, an error haptic and the save-failed text. Then the phone step, or the mode step when `phone_set`. | `OwnerForm.jsx:93-98,415-433,624-642`; `owner.js:80-84` (at r31) |
| BR-APP-082 | **Owner photos** (since release `index-CBlEKxdL.js`). At most 10. A selection larger than the free slots is cut, and «Не больше 10 фото.» shows. One batch runs at a time. Files go up one by one; each is first shrunk (long side ≤ 2048 px, JPEG quality 0.88; if the browser cannot, the **original file** is sent, LB-APP-061) and sent as the multipart field `file` named `photo.jpg`, with a 90 s timeout. `photo:too_many` stops the batch; `photo:not_image`, `photo:too_big` and other errors show a message and the batch goes on. The first photo is the cover. «Сделать обложкой» sends the full order with that id first. «Удалить фото» acts at once, without confirmation or undo (LB-APP-067). The form shows thumbnails by replacing the first `.jpg?` with `.s.jpg?`; the list shows the cover as is. Since release `index-YX9bFVws.js` the form sends each photo by `XMLHttpRequest` with upload progress, the same `Authorization: tma <initData>` and `timeout` 90 s; a `2xx` answer without a JSON body counts as a failure (`own.photoFailed`), `onerror` gives `ApiError(0, 'network')` and `ontimeout` `ApiError(0, 'timeout')`; without a progress callback the helper still uses `apiFetch`, but the form always passes one (BR-APP-119). | `OwnerForm.jsx:74,435-524`; `$KVADRO_ROOT/demo/app/src/features/owner/shrinkPhoto.js:3-26`; `$KVADRO_ROOT/demo/app/src/lib/api/owner.js:57-85`; `$KVADRO_ROOT/demo/app/src/lib/api/client.js:24-27`; `owner.js:712-713` (at r31); `$KVADRO_ROOT/docs/api.md:1230-1231,1443-1447` (r31); `$KVADRO_ROOT/demo/app/src/lib/api/owner.js:61-101`, `OwnerForm.jsx:578` (at r38); `$KVADRO_ROOT/docs/api.md:46,60,1580-1584` (r38) |
| BR-APP-083 | **Demand and usual price** (since release `index-CBlEKxdL.js`). Requested 500 ms after a change of city, district, rooms, room, price or currency, aborting the previous request, and never without a city, so the client helper's `tashkent` default is dead code. The query has `city`, then `district`, then `room=true` or `rooms`, then `price` + `currency` (USD by default). The footer, and the done screen, show «Сейчас такую ищут {n} человек с радаром» when `count > 0`. «≈ обычная цена: {range} — {what}, {place}» shows when both usual bounds and a rooms choice exist. In a UZS form the range is in millions through `meta.usd_uzs` (`money.mln`); otherwise «$low–high». Errors are silent. | `OwnerForm.jsx:347-369,812-827,1289-1297`; `$KVADRO_ROOT/demo/app/src/lib/api/owner.js:165-184` (at r31); `$KVADRO_ROOT/docs/api.md:1476-1479` (r31) |
| BR-APP-084 | **Phone confirmation** (since release `index-CBlEKxdL.js`). «Поделиться номером» calls `WebApp.requestContact` when the client version is ≥ 6.9 (TMA-034). The result is a consent flag only; the contact goes to the bot. On `null` (an old client), the old-client text shows and polling starts anyway; on `false`, the denied text; on `true`, polling. Polling sends `GET /api/owner/listings/:id` at once, then every 1.5 s without overlapping requests, for up to 90 s, and also at once whenever the app becomes visible. After 20 s the "late" hint with «Открыть бот» shows. After 90 s polling stops and restarts on the next return to the app. It ends on `phone_set` (success haptic, then the mode step), on `status: rejected` (error haptic, SCR-054), or on a draft `reject_reason` of `not_uz` or `not_own`. A reason equal to the one shown before the tap is ignored for the first 8 s as stale. A failed poll is retried on the next tick. | `OwnerForm.jsx:80-86,1484-1620`; `share.js:45-58` (at r31); `$KVADRO_ROOT/docs/api.md:1436-1438` (r31) |
| BR-APP-085 | **Rejection outcomes** (since release `index-CBlEKxdL.js`). `status: "rejected"` with `reject_reason` `agent` (the default), `fraud` or `limit` shows SCR-054. On a draft, `reject_reason` `not_uz` / `not_own` is an inline error on the phone step: one field with two meanings. A publish answered `rejected:<reason>` re-reads the listing. If the server's copy is rejected, it is used; otherwise the listing is marked rejected locally with that reason. Then the phone step shows. | `OwnerForm.jsx:708-721,1484-1488,1514-1515` (at r31); `$KVADRO_ROOT/docs/api.md:1368-1369` (r31) |
| BR-APP-086 | **Contact mode** (since release `index-CBlEKxdL.js`). A tap changes the mode at once (light haptic), sends `POST …/contact_mode`, and the answer replaces the listing. On an error the previous state comes back, with an error haptic and a footer error. A tap on the current mode does nothing. A `null` mode shows no selection, and publish does not ask for one (LB-APP-056). | `OwnerForm.jsx:644-667,906-929` (at r31) |
| BR-APP-087 | **Publish** (since release `index-CBlEKxdL.js`). One at a time. First a flush; if it fails, back to the form with the save-failed text. Then `POST …/publish`, the same call that saves edits of a published listing. On success: a celebration (new) or a success haptic (edit; since release `index-YX9bFVws.js` followed by the 900 ms done phase of the button, BR-APP-114), `onChanged` (refetches the lists and the pending counter, `App.jsx:144-147`), then the done step. Errors by `detail`: a `missing:` list that includes `limit` → `own.limitText` and «Мои объявления»; one that includes `status`, or `409` with `status:…` → `own.notEditable` and «Мои объявления»; `rejected:<reason>` → BR-APP-085; `missing:` with `phone` → the phone step; any other `missing:` → the form with highlights (and the save-failed text when the client itself sees nothing missing). Otherwise a network failure gives `own.publishOffline` / `own.editOffline`, and anything else `own.publishFailed` / `own.saveFailed`. | `OwnerForm.jsx:668-741` (at r31); `$KVADRO_ROOT/docs/api.md:1450-1454` (r31) |
| BR-APP-088 | **Status actions of an owner listing** (since release `index-CBlEKxdL.js`). List card: a draft offers «Удалить» and «Продолжить». `active` / `paused` (not `withdrawn`, not `held`) offer «Отклики», «Пауза» / «Вернуть» and «Сдано». `held` or `withdrawn` offer «Отклики» (when requests > 0) and «Поддержка». Anything else offers «Отклики» when requests > 0. The panel adds «Изменить» and «Снять» for manageable listings (SCR-059). «Сдано», «Снять» and «Удалить» on a draft ask through `showConfirm`: «Отметить «Сдано»? Объявление уйдёт из ленты, а тем, кто ждёт ответа, скажем, что квартиру сдали.», «Снять объявление?», «Удалить черновик?». One change runs at a time. On success: a success haptic and the toast `own.toast.*` («Отметили «Сдано». Поздравляем!», «На паузе: в ленту и радар не уходит», «Снова в ленте», «Сняли объявление», «Черновик удалили»). In the list, a deleted draft leaves the list and other listings are replaced by the answer; then the list and the pending counter are refetched. The panel only reloads the listing screen. Errors: an error haptic and the toast `own.actionOffline` or `common.saveFailed`. Nothing leads out of `rented` or `removed`: there is no relisting. «Снять» exists only on the panel. | `OwnerListings.jsx:80-170,322-361`; `OwnerPanel.jsx:87-218`; `owner.js:203-211,765-775` (at r31); `$KVADRO_ROOT/docs/api.md:1455-1457` (r31) |
| BR-APP-089 | **Apartment limit** (since release `index-CBlEKxdL.js`). `max` and `can_add` come from `GET /api/owner/listings`; the texts assume 2 (LB-APP-057). When `can_add` is false, the Settings row shows «{max} из {max}» and opens the limit sheet (SCR-049), and «Сдать ещё одну квартиру» in the list opens the sheet. The panel's «Сдать ещё одну» does not check, so it reaches `POST` → `409` → the limit state. `POST` `409` gives «Уже две квартиры». A publish answered `missing:limit` gives the limit text. A phone rejection with reason `limit` gives «С этим номером уже сдаются 2 квартиры». | `SettingsScreen.jsx:230-262`; `OwnerListings.jsx:363-371`; `OwnerPanel.jsx:212`; `OwnerForm.jsx:695-700,747-759` (at r31); `$KVADRO_ROOT/docs/api.md:1406-1411,1434-1435` (r31) |
| BR-APP-090 | **Answering requests** (since release `index-CBlEKxdL.js`). The actions are `give`, `decline`, `reason_found`, `reason_agent`, `undo` and `late`, one at a time, with no confirmation (not even for «Дать номер»). The answer replaces the item; when the answer has no name, the old name stays. A reason chosen in this session is remembered: the reason buttons hide, and «found» shows «Причина: …». `undo` or `decline` clears it. The toast is `own.answered.<action>`, or `own.unmarked` «Отметку сняли» for `undo` on a `given` request. A `409` reloads the list, and for `undo` also shows «Отменить уже нельзя: прошло больше 10 минут». Other errors show toasts. The server's flags `can_reason`, `can_undo` (10 minutes, per the texts) and `can_late` decide which buttons show. | `OwnerListings.jsx:493-560,600-650`; `owner.js:219-234` (at r31); `$KVADRO_ROOT/docs/api.md:1413-1427,1464-1466` (r31) |
| BR-APP-091 | **Pending counter** (since release `index-CBlEKxdL.js`). One module-level number. It is fetched when the app starts (`App` mounts the hook) and whenever the document becomes visible; each mounted hook adds its own listener, and concurrent calls share one request. It is also fetched after the form's `onChanged`, after closing a requests page (list or panel) and after a status change in the list. Errors are ignored. Its consumers are the tab's red dot, the tab tip, and the Settings row's value and counter. A status change on the panel does not refresh it (LB-APP-059). | `$KVADRO_ROOT/demo/app/src/lib/ownerPending.js:6-57`; `App.jsx:141-147`; `OwnerListings.jsx:316-320,352`; `OwnerPanel.jsx:70-74` (at r31); `$KVADRO_ROOT/docs/api.md:1460-1462` (r31) |
| BR-APP-092 | **Request tip** (since release `index-CBlEKxdL.js`). It is visible while pending > 0 and `kv-req-tip` is not `done`. «×» or opening any requests page dismisses it. The key is mirrored to DeviceStorage. Since release `index-YX9bFVws.js` the tip also hides when `kv-req-tip = done` arrives from DeviceStorage after the first render: `syncReqTipDismissed()` runs once `restoreFromDeviceStorage()` has finished and hides every mounted tip when the key is `done`; `dismissReqTip()` hides every mounted tip also when the key was already `done` (before, only on the first write); a tip that hides plays the tip leave of BR-APP-112. | `$KVADRO_ROOT/demo/app/src/components/ReqTip.jsx:7-34`; `$KVADRO_ROOT/demo/app/src/lib/storage.js:6`; `App.jsx:719-734` (at r31); `ReqTip.jsx:30-46,55`, `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:26-31` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:17` at r39 |
| BR-APP-093 | **Fill hints and focus** (since release `index-CBlEKxdL.js`). The panel has five checks: photos ≥ 5 (`ENOUGH_PHOTOS`), area, floor, renovation and description. They show only for manageable listings. A tap writes `sessionStorage['kv-own-focus']` = the field and opens the form. Once on the «form» step, the form reads and removes the key, scrolls the element with that `data-focus` token into the centre (`photos`, `area_m2 floor`, `renovation`, `description`) and highlights it for 1.6 s. | `OwnerPanel.jsx:29-30,220-244`; `OwnerForm.jsx:103,109,386-412,1067,1183,1299,1370` (at r31) |
| BR-APP-094 | **Status label and days of an owner listing** (since release `index-CBlEKxdL.js`). `withdrawn` → «Снято по жалобам». Any status other than `active` → `own.status.<status>` («Черновик», «На паузе», «Сдано», «Снято», «Не принято»). `active` → «Сдаётся · с сегодня» when less than one full day has passed since `published_at`, else «Сдаётся · N дней». The days come from the device clock (LB-APP-062). «В kvadro² N дней» uses `stats.days_listed`, falling back to the same count, and hides at 0. | `OwnerListings.jsx:35-56,217-245`; `owner.js:141-152` (at r31) |
| BR-APP-095 | **Returning owner** (since release `index-CBlEKxdL.js`). «С возвращением! Вы уже размещали у нас квартир: {n}» shows when `past > 0` and no `active`, `paused` or `draft` listing exists besides the open draft. The form shows it only for a new draft, after its own extra `GET /api/owner/listings`; the list shows it in an empty «Актуальные». | `owner.js:748-760`; `OwnerForm.jsx:214-219,1004-1010`; `OwnerListings.jsx:407-414` (at r31) |
| BR-APP-096 | **Celebration after publishing** (since release `index-CBlEKxdL.js`). Publishing a new listing plays a success haptic, a heavy impact at 260 ms and a medium one at 420 ms, and shows confetti on the done screen. A tap on the mascot repeats both, at most once per 800 ms. | `OwnerForm.jsx:45-68,842-883` (at r31) |
| BR-APP-097 | **«Найти меня» in the place picker** (since release `index-CBlEKxdL.js`). The button exists only when Telegram's LocationManager (8.0+) or browser geolocation is available (TMA-035). Denied or failed → a warning haptic and a hint. A location outside the rectangle → `own.pickFarMe`. An accuracy worse than 100 m → `own.pickRough`. Otherwise the picker shows a "me" dot with the accuracy circle and flies to zoom 17, never zooming out. | `PlacePicker.jsx:22,123-141,170-179`; `$KVADRO_ROOT/demo/app/src/features/owner/pickMap.js:112-122,169-198`; `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:48-78` (at r31) |
| BR-APP-098 | **Contact by request** (since release `index-CBlEKxdL.js`). A listing is in gate mode when it is self-placed (`owner_self`), its `contact_mode` is `gate` and the card has no `phone`. In gate mode the CTA is the request: with no request (or any status not covered below) it is «Связаться с хозяином» (icon MessageCircle), which opens SCR-061; with `pending` it is a quiet, inactive «Отклик отправлен» (`contact.sent`). When the caller's request is closed, a two-line bar replaces the CTA: bold «Квартира уже не сдаётся» (`cancelled`), «Хозяин пока не ответил» (`expired`) or «Хозяин не готов дать номер» (`declined`, and `agent`, which the seeker sees exactly like `declined`), with the muted hint «Посмотрите похожие в ленте». Gate, which implies no phone, ranks above the contact link and the post (BR-APP-032). `ListingCtaBar` also has a variant of the bar for the user's own listing, «Это ваше объявление» with the hint «Отклики — в «Мои объявления»» (`ListingCtaBar.jsx:105-121`), but the screen never renders the bar for such a card (LB-APP-070, SCR-059). | `ListingCtaBar.jsx:34-71,105-121`; `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:45-46,205-211,310-322`; `ru.js:616-617,657-662` (at r31); `$KVADRO_ROOT/docs/api.md:386-391` (r31) |
| BR-APP-099 | **Request form** (since release `index-CBlEKxdL.js`). `who` is required (`one`, `couple`, `family`, `students`, `friends`); `people` is 1…20 and defaults per `who` to 1 / 2 / 3 / 2 / 2; `move_in` holds at most 32 and `message` at most 500 characters, both trimmed, with an empty value sent as `null`; the message is prefilled. One send at a time. `409 no_chat` → the write-access request and one repeat, as for radars (TMA-033). The answer's `status` becomes `my_request`; `given` re-reads the card, expecting `phone` (LB-APP-074). | `$KVADRO_ROOT/demo/app/src/features/listing/ContactRequestSheet.jsx:13-23,50-85`; `ListingScreen.jsx:334-340` (at r31); `$KVADRO_ROOT/docs/api.md:833-838` (r31) |
| BR-APP-100 | **Owner tiers on the listing screen** (since release `index-CBlEKxdL.js`). The owner chip (ShieldCheck, «Проверенный хозяин», ⓘ) stands under the title when the listing is `owner_verified` or self-placed; it shows from the preview already, since `owner_verified` is a preview field. A claimed owner (`is_owner`, not verified, not self-placed) gets a section «Хозяин — со слов объявления» with «Мы не проверяли — спросите при звонке, нет ли комиссии.» between «Расположение» and «Кто размещает». The author label `owner` is hidden when, after stripping leading non-letters, it starts with the UI's «Проверенный хозяин» (verified or self-placed) or equals «Хозяин — со слов объявления» (`is_owner`, not verified) (LB-APP-075). | `ListingScreen.jsx:232-235,270-281`; `ListingTitleRow.jsx:86`; `$KVADRO_ROOT/demo/app/src/features/listing/OwnerChip.jsx:63-69`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/AuthorSection.jsx:13-23`; `ru.js:101-103` (at r31); `$KVADRO_ROOT/docs/api.md:392-395` (r31) |
| BR-APP-101 | **Owner chip tip** (since release `index-CBlEKxdL.js`). Shown at most twice per device: 700 ms after the chip mounts for a listing, the chip pulses and a tip «Нажмите — расскажем, что это значит» (`owner.tip`) with × (`owner.tipClose`) appears for 7 s. Each show increments `kv-owner-tip`; a tap on the chip or the tip, or ×, writes `done`. A tap also plays a light haptic and sends `owner_info_opened {listing_id}`. `kv-owner-tip` is synced through DeviceStorage. | `OwnerChip.jsx:10-62,70-86`; `storage.js:6`; `ru.js:647-648` (at r31); `$KVADRO_ROOT/docs/api.md:1192,1481-1482` (r31) |
| BR-APP-102 | **Self-placed listings** (since release `index-CBlEKxdL.js`). A listing with `owner_self` has no «Источник» section (channels, original text, translation). A single history entry reads «Хозяин разместил квартиру в kvadro² {date}. Изменений цены пока не было.» (`details.historySelf`, no channel). «Описание» shows when `summary` or `owner_description` is set, the latter as a second paragraph. The author section adds «Обычно отвечает за {n} мин» (self-placed, with `response_minutes`, not the user's own) and, for gate with a `pending` request, «Отклик отправлен — ответ придёт в бот.» (`contact.pendingNote`). | `ListingScreen.jsx:285-303`; `HistorySection.jsx:29-40`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/DescriptionSection.jsx:8-15`; `AuthorSection.jsx:40-47`; `ru.js:286,645-646` (at r31); `$KVADRO_ROOT/docs/api.md:396-397` (r31) |
| BR-APP-103 | **The owner's own listing** (since release `index-CBlEKxdL.js`; SCR-059). `owner_mine` alone changes the screen: the title row keeps only the share button, the price is a section with the market block under it, and there is no CTA bar. The panel «Ваше объявление» also needs `owner_listing_id`. | `ListingTitleRow.jsx:94-106`; `ListingScreen.jsx:237-255,310-311`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/OwnerPriceSection.jsx:7-26` (at r31) |
| BR-APP-104 | **Long return** (since release `index-CIa0Ldj2.js`). When the app becomes visible after being hidden for ≥ 6 h (`RETURN_AWAY_MS`), it starts a new visit session and re-reads the radars (BR-APP-070), re-checks the return banner (BR-APP-071), and then decides what to do with the search feed. Not on the search tab: the search feed is re-created silently and its scroll memory is dropped (BR-APP-105). On the search tab, not covered and scrolled less than 60 px (`MINI_TOP_ZONE_PX`): the feed is re-created and no request is sent. Otherwise `GET /api/feed/new` is sent with `since` = the moment the current feed was created, in seconds, and the fresh pill (SCR-063) shows while `count > 0`. "Covered" means that a listing is open, or the filters sheet, a quick filter, the city picker, the sort sheet, the radar editor, the radar-create sheet or drawing mode; the owner form layer and the first-launch city picker do not count. The scroll position is `window.scrollY` in the list view; in the map view it is the remembered scroll of the feed when its key equals the current feed key (BR-APP-105), else 0. The feed is "created" when the App mounts and each time its key changes (filters, sort, `feedVersion`), not when its first page arrives. The request has no `AbortSignal`; its answer is used only while the feed key is still the same, and errors are ignored. A tap on the pill gives a light haptic, scrolls to the top and re-creates the feed, which loads from page one. The time the app was hidden is kept in the memory of the handler, which exists only once meta has loaded. Up to `index-CBlEKxdL.js` a long return only reset the visit session, re-read the radars and re-armed the banner. | `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:102`; `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:52-74`; `App.jsx:430-473`; `$KVADRO_ROOT/demo/app/src/hooks/useMiniChrome.js:6`; `feed.js:111-117` (at r33); the release's unit `002-removed-App.js:312-326`; `$KVADRO_ROOT/docs/api.md:648-653` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:10,44` at r36 |
| BR-APP-105 | **Feed scroll memory** (since release `index-CIa0Ldj2.js`). The search feed is always rendered and only hidden (`display: none`) outside the list view of the search tab, so its loaded pages survive the map and the other tabs; its key is `${feedVersion}:${sort}:${JSON.stringify(filters)}`. The App remembers `{key, y}`, the feed key and `window.scrollY`, in memory only. The memory is saved, only while the list view is on screen: on a switch of the view to the map (the view toggle, the area chip of the feed header, drawing from the filters sheet), on a switch to another tab, on the Telegram Settings button and on «Мои объявления» of the owner form. It is restored when the list view becomes visible again: the memory is taken and cleared, and the window scrolls to `y` only when the key equals the current feed key, so a changed filter, sort or `feedVersion` restores nothing. It is dropped by a second tap on the current tab, by opening a radar's feed, by Back from a radar's feed, by a long return on a tab other than search (BR-APP-104) and by a change of the hidden list in settings (SCR-039). The next page is requested by an `IntersectionObserver` on the sentinel, so a feed that is re-created while hidden asks for page one only when the list is shown again (`inferred`). «Сохранённые» is a second feed, unmounted outside its tab, with no scroll memory. Up to `index-CBlEKxdL.js` one feed served the search and «Сохранённые» and was unmounted on the map, the radar tab and the settings tab; there was no memory, and every tab switch scrolled to the top. | `App.jsx:390-392,399-428,441,538-549,685,709,723-726,816,841-892,1006-1012`; `$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:34,90`; `useInfiniteFeed.js:52-62` (at r33); the release's unit `002-removed-App.js:378-380,818-846`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:11` at r36 |
| BR-APP-106 | **A listing link opens once per launch** (since release `index-CIa0Ldj2.js`). `sessionStorage['kv-start-done']` holds `<hash>:<id>`: the `hash` field of initData (an empty string when absent) and the id of the listing named by `start_param` `l_<id>` or `?listing=<id>`. The mark is written when a listing is open, `meta.locale_chosen` is truthy and there is no no-access reason, so not while the language picker or the no-access screen covers the card. The write does not check that the open listing is the one of the link; it always writes the value of the launch listing, which is harmless (`inferred`). While the stored value equals `<hash>:<id>` of the launch, the listing is neither prefetched nor opened; a storage error counts as "not done". So a reload of the WebView inside one launch does not reopen the card. That a new launch brings a new initData hash, and so opens the card again, is `inferred` (Q-APP-029). Since this release an id from a link must be a positive safe integer (`Number.isSafeInteger`; before, `Number.isInteger` for the listing id). The readers that ignore the mark are LB-APP-080. Up to `index-CBlEKxdL.js` every page load reopened the card. | `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:21,28,31,38-62`; `App.jsx:82-89`; `$KVADRO_ROOT/demo/app/src/main.jsx:36-39` (at r33); the release's units `002-removed-App.js:9`, `100-modified-getStartListingId.jsx.diff`; `$KVADRO_ROOT/docs/api.md:1317-1318` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:13,45` at r36; parity `deep-link-listing-done`, `deep-link-listing-again` |
| BR-APP-107 | **Radar link `?radar=<id>`** (since release `index-CIa0Ldj2.js`). The parameter is read from the page query only: `start_param` has no radar form (it is parsed only for `l_<id>…` and `owner_new` / `owner-new`). The value goes through `Number()` and is accepted when it is a positive safe integer. It is read in the success handler of `GET /api/meta`, after `app_opened` and after the `?news=pets` branch, and it is skipped whenever the launch names a listing. Then `GET /api/subscriptions` is sent and the radar is looked up by a strict comparison of its `id` with the number; when it is found, the radar's filters become the search filters. When no radar matches or the request fails, nothing happens and nothing is shown. The sort becomes `new` when the current sort is not offered for the radar's filters; the effect closes over the sort of the first render, `new`, which is always offered, so this reset cannot fire in practice (`inferred`). The link sets no Back to the radars, leaves the tab on search, does not open the radar sheet and leaves `entry` of `app_launch` / `app_opened` at `menu` or `news`; no event carries the radar id; the prefetched default feed is shown first and is then replaced. Defects: LB-APP-079. Who produces such links: `04` Q-BOT-050. | `$KVADRO_ROOT/demo/app/src/features/radar/radarLink.js:7-13`; `startParam.js:17-25`; `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:61-67`; `useAppBootstrap.js:135-149`; `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-34`; `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:530` (at r33; parity `radar-link`); `$KVADRO_ROOT/docs/api.md:1314-1317` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:12` at r36 |
| BR-APP-108 | **A sale listing from the launch link** (since release `index-CIa0Ldj2.js`). When the full details of the listing named by the launch link arrive for the first time and they have `deal_type === 'sale'` while the deal of the filters is not `sale`, the filters become `defaultFilters('sale', <current city of the filters>)`, so the feed under the card is the sale feed. Only that listing and only its first full load count: the reference to it is cleared when the open listing changes or closes. A daily-rent listing switches nothing, and the sort is not checked. | `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:142-146`; `App.jsx:244-264` (at r33); `$KVADRO_ROOT/docs/api.md:315-316` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:14` at r36 |
| BR-APP-109 | **Age label** (since release `index-CIa0Ldj2.js`). The client computes the age of a card from `posted_at`, parsed with `Date.parse`, against the device clock: `minutes = max(0, floor((now − posted_at) / 60000))`. `< 1` gives «только что» (`card.ageNow`); `1 … 59` gives «{n} мин назад» (`card.ageMin`, `n` = minutes); `60 … 1 439` gives «{n} ч назад» (`card.ageHours`, `n = floor(minutes / 60)`); `≥ 1 440` gives «{n} дн. назад» (`card.ageDays`, `n = floor(minutes / 1440)`). There is no week, month or date form and no plural form. When `posted_at` is missing, empty or unparsable, the label is the part of `age` after the first « · », else the whole `age`, else nothing. In the feed card the label follows a shared minute clock: the minute number is checked every 15 s and on `visibilitychange`, only while at least one card is mounted. The radar strip uses the same function without the clock, so its label is computed when the strip renders. Callers at r33: the feed card and the radar strip only. Up to `index-CBlEKxdL.js` the label always came from `age`. Defect: LB-APP-083. Server side: `02` BR-API-196. | `format.js:141-166`; `$KVADRO_ROOT/demo/app/src/features/listing/minuteClock.js:4-43`; `$KVADRO_ROOT/demo/app/src/components/ListingCard.jsx:104,116-123`; `$KVADRO_ROOT/demo/app/src/features/radar/RadarStrip.jsx:43`; `ru.js:118-121` (at r33); the release's unit `026-removed-ageLabel.js`; `$KVADRO_ROOT/docs/api.md:286,302-304` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:17` at r36; parity `feed-age`, `radar-sheet-age` |
| BR-APP-110 | **Floor words** (since release `index-CIa0Ldj2.js`). In the facts line of a card `floor === 0` reads «цокольный этаж» (`fmt.floorGround`) and a negative floor «подвал» (`fmt.floorBasement`), both without the total. The floor tile of the listing screen shows the word alone, «Цокольный этаж» (`listing.floorGround`) or «Подвал» (`listing.floorBasement`), with an empty caption. `null` or a missing key shows nothing; a positive floor is unchanged. Up to `index-CBlEKxdL.js` `0` showed nothing and a negative floor showed as a number. Server side: `02` BR-API-195. | `format.js:55-71`; `$KVADRO_ROOT/demo/app/src/features/listing/sections/KeyFacts.jsx:28-35,49`; `ru.js:93-94,189-190` (at r33); the release's units `027-modified-listingFacts.jsx.diff`, `032-modified-KeyFacts.jsx.diff`; `$KVADRO_ROOT/docs/api.md:274,305-307,1368` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:34,62` at r36; parity `feed-floor`, `listing-floor-ground`, `listing-floor-basement` |
| BR-APP-111 | **Map camera memory** (since release `index-CIa0Ldj2.js`). When the map unmounts, by the view toggle or a tab switch, the camera is saved as `{key: JSON.stringify(filters), center, zoom}`. GL saves only after the camera was fitted or restored once; Leaflet only once the basemap is on, which happens after the first points answer or error. When a map is created and the stored key is byte-identical to the JSON of the current filters, it opens at the stored centre and zoom, and the first points answer does not fit the camera; later answers fit as before. The key ignores the sort and the locally hidden set and includes `posted_days`. The memory lives in module memory, one per engine, and is lost on a reload. | `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapInstance.js:20,79-85,147-158`; `useClusterIndex.js:47-48,103-114,139`; `$KVADRO_ROOT/demo/app/src/features/map/leaflet/useLeafletMap.js:13,49-56,64-73`; `MapView.jsx:76-82,127-131` (at r33); `$KVADRO_ROOT/docs/api.md:688-689` (r35); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:19` at r36; parity `map-leaflet-return`, `gl-return` |
| BR-APP-112 | **Leave animation** (since release `index-YX9bFVws.js`). When React unmounts a sheet, a settings sub-page, a toast or a tip, a deep copy of its node takes its place in the old parent, marked `.leave`, `aria-hidden` and `inert`, with the scroll positions of the node and its descendants, and animates out through the Web Animations API (`fill: forwards`): a sheet over 280 ms (the backdrop to a transparent background, `ease-out`; the sheet, `.csheet` / `.fsheet` or else the first child, to `translateY(100%)`, `cubic-bezier(0.3, 0, 0.2, 1)`; any other child of the backdrop to opacity 0 over 160 ms), a sub-page over 200 ms (`translateX(24%)` and opacity 0, `cubic-bezier(0.4, 0, 1, 1)`), a toast over 180 ms (`translateY(10px)` and opacity 0, the same curve) and a tip over 160 ms (`translateY(-6px) scale(0.92)` and opacity 0, the same curve). The copy is removed when its animations have finished, and after 600 ms at the latest; inside it CSS animations, transitions and pointer events are off. The state changes at once; nothing waits for the copy. No copy is made under `prefers-reduced-motion`, in lite graphics, after a gesture close (the node or a direct child has `data-gone` or an inline `transform`: a dragged sheet, a swiped toast, a swiped-back sub-page), for the parked radar sheet, when the node is still in the document after the commit, when its old parent has left the document too, and when a new node of the same kind (`.sheet-backdrop`, `.subpage`, `.toast`, `.owner-tip, .req-tip`) appeared in the same commit. Users: the eleven sheets of `useSheetDrag`, the first-launch city picker included; `SubPage`; both kinds of `Toast`; the owner chip's tip and `ReqTip`. The listing layer keeps its own leave of release `index-CBlEKxdL.js`. | `$KVADRO_ROOT/demo/app/src/lib/leave.js:8-10,18-221`; `$KVADRO_ROOT/demo/app/src/hooks/useSheetDrag.js:46-51,186`; `$KVADRO_ROOT/demo/app/src/hooks/useSwipeBack.js:125-136`; `$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx:31`; `$KVADRO_ROOT/demo/app/src/components/Toast.jsx:71-87`; `OwnerChip.jsx:72`; `ReqTip.jsx:55`; `$KVADRO_ROOT/demo/app/src/styles/filters.css:63-67` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:10` at r39; parity `leave-filters-sheet`, `leave-subpage`, `leave-toast` |
| BR-APP-113 | **Rolling numbers** (since release `index-YX9bFVws.js`). These numbers roll digit by digit to each new value: «Показать {n}» of the full and the quick filters sheets, «Сейчас подходит: {n}» of the radar editor and creator (also to and from 0), the radar flow «📡 Радар: ≈{n} в день» / «📡 Радар: {n} за неделю» (not «За неделю таких не было…»), the count «{n} из {total}» of the owner panel's fill hints and the count «{n} из 10» of the owner form's photos. The number is rounded and floored at 0; each digit is a strip that moves over 0.62 s on a spring that overshoots, the rightmost digit first and each next one 45 ms later; columns are keyed from the right, so a digit keeps its place when the length changes. The full number is the accessible label. Nothing moves under reduced motion; there is no lite rule, so the numbers roll in lite graphics too (LB-APP-086). «Показать» without a count and «Ничего нет» at 0 are plain text. | `$KVADRO_ROOT/demo/app/src/components/RollNumber.jsx:8-49`; `$KVADRO_ROOT/demo/app/src/styles/listing-details.css:154-221`; `$KVADRO_ROOT/demo/app/src/features/filters/sheet/SheetFooter.jsx:11-23,52-70,86-97`; `QuickFilterSheet.jsx:113`; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:323-325`; `OwnerForm.jsx:1224-1234`; `format.js:261-282` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:11` at r39 |
| BR-APP-114 | **Save phases** (since release `index-YX9bFVws.js`). The primary button of the radar editor («Сохранить») and of the radar creator («Включить радар», the creator's `saveLabel`), and the secondary «Включить радар» of the search sheet, go idle → busy → done. Busy: the button is disabled, its label is hidden, and it narrows to a 48 px pill with a spinner. Done: full width again, green (`--good`) with a drawn tick; it is set after a successful save, after the success haptic, and the sheet closes 900 ms later (250 ms under reduced motion, which also keeps the full width and draws the tick at once); the success toast is set together with the close. An already active identical radar closes the sheet at once with «Радар по этому поиску уже включён», without the done phase; a call refused because another is running returns at once; on an error (`no_chat`, the `409` limit, any other) the toast shows, the phase returns to idle and the sheet stays. The owner form's publish button has the busy phase for every publish and the done phase only for an edit of a published listing, before the done step; a first publish goes from busy to the celebration. There is no lite rule for the 900 ms (LB-APP-086). | `$KVADRO_ROOT/demo/app/src/components/SaveState.jsx:5-50`; `$KVADRO_ROOT/demo/app/src/styles/filters.css:334-435`; `SheetFooter.jsx:52-85`; `FiltersSheet.jsx:81-82,149-164`; `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:98-186`; `App.jsx:973-1015`; `OwnerForm.jsx:812-889,1116-1122` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:12` at r39; parity `radar-edit-save-phase` |
| BR-APP-115 | **Owner invitations** (since release `index-YX9bFVws.js`). «Сдаёте квартиру? Разместите бесплатно» shows (1) as a row with a house icon under the search feed when it is loaded to its end without an error and shows at least one card, under «Это всё по вашему поиску» (`feed.end`, left out while the few-results note shows; `src: feed_end`); (2) as a line under the search feed when it is loaded to its end without an error and shows no card, under the empty state or the few-results note (`src: empty`); and (3) as «Тоже сдаёте квартиру? Разместите бесплатно ›», the last line of a listing screen whose full card has a truthy `owner_entry` (`src: listing`), also on the user's own listing if the server sends it. (1) and (2) only on the search tab, so not in favourites or history; (3) on every tab. There is no condition on the deal, and no switch, `new_features` entry or role decides them; when the server sets `owner_entry` is open in legacy's contract. A tap gives a light haptic, sends `owner_entry {src}` and then `GET /api/owner/listings`: `can_add` true opens the owner form on a new draft; false closes an open listing, switches to the Settings tab, opens «Мои объявления» and scrolls to the top; a failed request opens a new draft too. There is no guard against a second tap (LB-APP-084). Legacy has no gate (LB-APP-088); HOMI: DEC-89, DEC-90, DEC-94. | `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:99-102,161-172`; `$KVADRO_ROOT/demo/app/src/features/feed/OwnerEntry.jsx:10-31`; `ListingScreen.jsx:347`; `App.jsx:169-187,752-756,913,970,1016` (at r38); `$KVADRO_ROOT/docs/api.md:368,1276,1303-1305,1406-1407,1453-1454,1564-1566` (r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:13` at r39; parity `listing-owner-entry`, `-open`, `-limit`, `feed-owner-entry`, `feed-end-many`, `feed-empty-owner-entry`, `-open` |
| BR-APP-116 | **Survey after "where found" and the landlord block** (since release `index-YX9bFVws.js`). On the `where` step of «Нашли жильё?» a choice of any of the seven rows no longer closes the sheet with the toast «Поздравляем! 🎉 Спасибо, что рассказали»: it gives a light haptic, sends `POST /api/found/where`, goes to the step `moved` («Поздравляем!», «Спасибо, что рассказали — это помогает нам стать лучше.», «Готово») and scrolls the sheet to the top. Both congratulation steps, `kvadro` and `moved`, show the block «Съезжаете со старой квартиры?» with the button «Отправить хозяину», with no condition. A tap on it gives a light haptic, sends `landlord_share {src}` (`kvadro` on the step `kvadro`, `elsewhere` on `moved`) at every tap, and shares «Здравствуйте! Я съезжаю. Нового жильца можно найти бесплатно и без риелтора здесь: {url}», where `{url}` is `https://kvadro.app` + `/sdat-kvartiru/` (ru), `/uz/kvartira-ijaraga-berish/` (uz_Latn) or `/en/list-your-apartment/` (en; any other locale: the ru page) + `?s=tenant`. The share puts the whole text into the `url` parameter of `t.me/share/url` inside Telegram, uses Web Share `{text}` outside it, and else opens the share link in a new tab (TMA-048, LB-APP-090). No API request is sent for it. HOMI: DEC-89, DEC-91. | `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:79-101,139-151,171-201,236-247`; `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:101-119` (at r38); `$KVADRO_ROOT/docs/api.md:1198-1203,1277,1303-1305,1411-1412` (r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:14` at r39; parity `found-moved-landlord`, `found-kvadro-landlord-uz` |
| BR-APP-117 | **Favourite heart and burst** (since release `index-YX9bFVws.js`). Each tap that is not refused as busy replays the heart: `fav-like`, a 0.8 s squash and stretch, when the tap makes the listing a favourite, `fav-dip`, 0.6 s, when it removes it. A tap that adds also plays a burst of eight sparks of 6 px at `index / 8 × 2π + 0.2` rad, which fly over 0.55 s from 8 px to 24 px (`--heart`) or 29 px (`--accent`, every second spark) while they fade. The first render plays nothing. Under reduced motion the heart does not move and the burst is not drawn; there is no lite rule (LB-APP-086). A failed save rolls the state back (BR-APP-039) without a new key (LB-APP-087). | `$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:8-77`; `$KVADRO_ROOT/demo/app/src/styles/listing-card.css:396-535` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:16` at r39; parity `fav-like` |
| BR-APP-118 | **Countdown ring of an action toast** (since release `index-YX9bFVws.js`). A toast with an action shows a 16 px ring before the action's label; its arc empties over 6 s (`ACTION_TOAST_MS`), linear. When the time is up the toast goes without running the action; a tap on the button runs the action and closes the toast. Plain toasts have no ring and still live 4 s. Under reduced motion the ring stays full. The ring is keyed by the toast's text (LB-APP-085). | `$KVADRO_ROOT/demo/app/src/components/Toast.jsx:29-32,50-53,86-112`; `$KVADRO_ROOT/demo/app/src/styles/feedback.css:65-91` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:16` at r39 |
| BR-APP-119 | **Owner photo upload progress** (since release `index-YX9bFVws.js`). The owner form sends each photo by `XMLHttpRequest` and reads `upload.onprogress` when the length is known. The tile being sent shows a ring and the percent; the ring eases toward the sent share (about 0.25 s behind it, frame by frame) and shows the percent between 0.5 % and 99.5 %; from 99.5 % it pulses (opacity to 0.45 every 1.6 s) while the answer is awaited. Queued tiles show only a grey ring at half opacity. A photo whose id was not in the listing before the answer shows a 34 px green tick for 1.5 s. Under reduced motion the ring jumps to the share, does not pulse, and the tick is hidden. A `2xx` without a JSON body fails like an error; a network error and the 90 s timeout fail with status 0 (BR-APP-082). Photo ids must therefore be stable between answers, which legacy's contract asks of the server. HOMI: DEC-92, Q-APP-031. | `OwnerForm.jsx:120-187,572-590,1249-1253,1269-1281`; `$KVADRO_ROOT/demo/app/src/lib/api/owner.js:61-89`; `$KVADRO_ROOT/demo/app/src/lib/api/client.js:35`; `$KVADRO_ROOT/demo/app/src/features/owner/owner.css:60-134` (at r38); `$KVADRO_ROOT/docs/api.md:46,60,1408-1410,1580-1584` (r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:15,23` at r39; parity `owner-form-photo-upload` |
| BR-APP-120 | **Description limit ring** (since release `index-YX9bFVws.js`). The owner form's description field (at most 600 characters) shows an 18 px ring from the first character on. It fills by `length / 600`, is `near` (`--high`) from 90 %, that is 540 characters, and `full` (`#dc2626`) at 600. A keystroke while the text already has 600 characters and the selection is collapsed shakes the ring for 0.32 s (±3 px); under reduced motion it does not shake. The counter line «{n} из {max}. Номер здесь не пишите — мы его скроем.» stays. | `OwnerForm.jsx:81,189-220,1537-1566`; `owner.css:1565-1614` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:15` at r39; parity `owner-form-limit`, `owner-form-limit-shake` |
| BR-APP-121 | **Segmented thumb** (since release `index-YX9bFVws.js`). Where the browser supports `selector(:has(*))`, every segmented control draws a thumb under its active segment, which slides over 0.42 s on `--ease-spring` when the active segment changes; the active segment itself becomes transparent, and the thumb is invisible until a segment is active. Its width follows the number of segments, two or three. The thumb has no reduced-motion rule, and the global reduced-motion rule does not reach it, so it also slides under reduced motion (`inferred` from the selectors); there is no lite rule (LB-APP-086). Without `:has()` the segments look as before. | `$KVADRO_ROOT/demo/app/src/styles/owner-shared.css:484-542`; `$KVADRO_ROOT/demo/app/src/styles/fallbacks.css:69-71`; `$KVADRO_ROOT/demo/app/src/styles/states.css:70-77` (at r38); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:19,32` at r39 |

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

#### LB-APP-002 — `t()` throws on a missing key, including server-driven keys (`bug`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** `t()` dereferences `entry.other` with no fallback. Keys built from server values (`subs.mode.${mode}`,
  `type.${type}` in radar titles, `market.v3.rooms${n}`) can crash the whole app through the ErrorBoundary.
- **Since release `index-CBlEKxdL.js`:** the lookup of the owner chunk's own dictionary throws the same way
  (LB-APP-064).
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** `t()` and `plural()` fall back to the ru entry, then to
  the key itself, and report the missing key once (`$KVADRO_ROOT/demo/app/src/i18n/index.js:110-125,180-193` at r33;
  §3.1). Still open: the owner dictionary's own lookup, which has no such fallback (LB-APP-064; that it still throws is
  `inferred`).
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

#### LB-APP-008 — GL map stays blank when points or pmtiles fail (`bug`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** `fetchMapPoints` has no rejection handler. A rejected `registerPmtiles` never calls `onFail`, so there is
  no fallback and no error.
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** a failed `GET /api/map` is handled on both engines: the
  points of the previous filters go, and a banner with «Повторить» shows (SCR-011;
  `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapPoints.js:16-45`,
  `$KVADRO_ROOT/demo/app/src/features/map/gl/MapViewGL.jsx:125-140,186-190`,
  `$KVADRO_ROOT/demo/app/src/features/map/leaflet/MapView.jsx:152-188,236-240` at r33). Still open: a rejected
  vector-tile registration (`registerPmtiles`); the release notes say nothing about it.
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

#### LB-APP-011 — UZS boundary and price-input parsing (`bug`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** amounts from 999 500 to 999 999 сум render as «1 000 000 сум» instead of «1 млн сум», because rounding
  to thousands happens after the threshold check. `parsePriceInput("1.000.000")` returns `null`.
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** the price input reads more texts. In dollars a text of
  digit groups with a dot, a comma or a space as the separator and an optional `$` is a whole number, and in the English
  number locale `1,200.5` is read as English (§3.5; `$KVADRO_ROOT/demo/app/src/lib/money.js:72-117` at r33). Still open:
  in сум «1.000.000» is still `null` (`RECOVERY.md:169`), and the display boundary of 999 500 to 999 999 сум is
  unchanged.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/money.js:32-46,91-101`; `RECOVERY.md:169-170`.
- **Proposed fix:** round first, then choose the unit. Parse with locale-aware rules: strip spaces and thousands
  separators, treat a single `,` or `.` as the decimal mark. Cover both with unit tests.

#### LB-APP-012 — DeviceStorage receives every key but restores only three (`bug`, CONFIRMED)

- **Symptom:** `kv-locale` and `kv-new-*` are mirrored but never restored.
- **Since release `index-DY_DH7h-.js`:** four keys are restored, `kv-visits` joined `DEVICE_SYNCED_KEYS` (`storage.js:6`
  at the pin); the title keeps the audited count. `kv-locale` and `kv-new-*` are still not restored. Release
  `index-BnFvC-Ft.js` adds `kv-new-cards`, written by the same `markFeatureSeen`: mirrored and not restored, like
  `kv-new-pets` (`$KVADRO_ROOT/demo/app/src/lib/newFeatures.js:18`, unchanged since r6). Since release
  `index-CBlEKxdL.js` six keys are restored: `kv-owner-tip` and `kv-req-tip` joined `DEVICE_SYNCED_KEYS` (`storage.js:6`
  at r31; the release's unit `100-modified-DEVICE_SYNCED_KEYS.jsx.diff`).
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

#### LB-APP-017 — Map selection card spins forever after a failed preview (`bug`, CONFIRMED; fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** after a failed fetch, the spinner stays until the index changes.
- **Fixed in legacy since release `index-CIa0Ldj2.js`:** the failed slot shows «Не загрузилось» with «Повторить», which
  reloads the current card and its neighbours (SCR-013;
  `$KVADRO_ROOT/demo/app/src/features/map/MapSelectionCard.jsx:22-54,111-121` at r33). The symptom above is the
  behaviour of the releases before it.
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
- **Since release `index-YX9bFVws.js`** one key is handled after the restore: `syncReqTipDismissed()` runs when
  `restoreFromDeviceStorage()` has finished and hides the request tip when the restored `kv-req-tip` is `done`
  (BR-APP-092; `useHomeScreenOffer.js:26-31` at r38). The race of `kv-city`, `kv-locale` and `kv-visits` is unchanged.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:23-25`; `$KVADRO_ROOT/demo/app/src/main.jsx:25`.
- **Proposed fix:** restore before the first data request (with a short timeout), or rely on the server profile
  (`meta.city`, `meta.locale`) as the source of truth.

#### LB-APP-022 — Favourites and history ignore the cursor (`bug`, code CONFIRMED; trigger UNVERIFIED, Q-APP-009; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** `fetchFavorites()` and `fetchHistory()` are called without a cursor, but the shared hook stores
  `next_cursor`. If the server ever returns a non-null cursor, the same page is fetched again in a loop while the
  sentinel is visible.
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** favourites follow `next_cursor` until it is `null`
  (BR-APP-024; `$KVADRO_ROOT/demo/app/src/lib/api/user.js:26-27`,
  `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:31-42` at r33). Still open: history is fetched without a
  cursor.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:31-62`; `$KVADRO_ROOT/demo/app/src/lib/api/user.js:23-26`.
- **Proposed fix:** give the API proper pagination for these lists, or treat them as single-page lists explicitly.

#### LB-APP-023 — Sort options before meta loads (`bug`, CONFIRMED)

- **Symptom:** `city?.zones.length !== 0` is `true` when `city` is `null`, so «Ближе к центру» is offered before meta
  loads. It throws if the fallback city has no `zones`.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:27`; `$KVADRO_ROOT/demo/app/src/features/filters/summary.js:49-64`.
- **Proposed fix:** compute options only from a loaded city config; hide unavailable sorts until meta is known.

#### LB-APP-046 — The Settings button leaves sheets open (`bug`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** the Telegram Settings button closes the listing, the filters and the radar editor, but not sort, quick
  filter, city picker or create-radar. Those keep rendering over the settings tab.
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** the handler now also closes the radar-create sheet, the
  quick filter, the city picker and the sort sheet (`$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:12-40` at r33).
  The four sheets of the symptom are closed now; since `index-CBlEKxdL.js` two more layers stay open: the owner form
  (SCR-050) and «Мои объявления» (SCR-057), so the defect is still open for them.
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

#### LB-APP-051 — An unknown `card_style` crashes the Settings tab (`bug`, CONFIRMED)

- **Since:** release `index-BnFvC-Ft.js`.
- **Symptom:** the value of the «Вид карточек» row is `t('settings.cards.' + card_style)`, and `t()` throws on a
  missing key (§3.1), so any `card_style` other than `classic`, `rich` or a missing value replaces the app with the
  crash screen of the root error boundary (SCR-045). Legacy records it as a contract rule, not as a guard.
- **Evidence:** `SettingsScreen.jsx:151,325` (at r31); `$KVADRO_ROOT/docs/api.md:982,986-989,1269-1270` (r31);
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:69`.
- **Proposed fix:** the client shows and treats an unknown value as `classic`; the v1 contract allows only the two
  values and answers `422 validation_failed` to anything else.

#### LB-APP-052 — A `card-sample` answer without a JSON body hangs the sample button (`bug`, CONFIRMED)

- **Since:** release `index-BnFvC-Ft.js`.
- **Symptom:** the client reads `response.sent` inside the success handler of `sendCardSample()`. On a `204`
  `apiFetch` resolves `undefined`, the read throws, and the error handler of the same `.then` does not catch it. The
  state stays `sending`: the button stays disabled at «Отправляем пример в чат…», and every style pick is ignored,
  until the Settings tab unmounts.
- **Evidence:** `SettingsScreen.jsx:162-171` (at r31); `$KVADRO_ROOT/demo/app/src/lib/api/client.js:51,108` (at r31);
  `$KVADRO_ROOT/docs/api.md:1053-1055` (r31); `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:69`.
- **Proposed fix:** any answer without a boolean `sent`, and any error, counts as `failed`; the v1 method always
  answers JSON with a boolean `sent`.

#### LB-APP-059 — A status change on the panel leaves the counters stale (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** «Сдано», «Пауза» and «Снять» on the owner panel (SCR-059) reload only the listing screen. Requests that
  `rented` cancels keep the red dot, the tab tip and the Settings counter until the next return to the app. The list
  «Мои объявления» does refresh the counter after the same action.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:87-113`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:245`; compare
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:350-352` and `App.jsx:144-147` (all at r31).
- **Proposed fix:** one owner-state store that every cabinet mutation (status, answer, publish) invalidates.

#### LB-APP-060 — The old-Telegram phone path cannot resume the draft (`bug`, CONFIRMED; trigger UNVERIFIED, Q-APP-027)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** below Telegram 6.9 the owner is told to open the bot, share the number there, «потом вернитесь сюда». On
  clients older than Bot API 7.0, `openTelegramLink` closes the Mini App (Telegram documentation; external, not verified
  here). Reopening the app from the bot carries no pointer to the draft, an `owner_new` link would create a new draft
  (LB-APP-054), and the poll stops after 90 s. What the bot offers such a client is not known (`04` Q-BOT-047).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:50-58`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:1600-1620,1684-1693`;
  `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:55-69` (all at r31).
- **Proposed fix:** the bot answers the contact with a Mini App button or a `startapp` link to that draft (for example
  `owner_<id>`), and the app resumes it on the phone step.

#### LB-APP-061 — A failed photo conversion uploads the original file (`bug`, CONFIRMED; security)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** when `createImageBitmap` or the canvas fails, the untouched original is sent, still named `photo.jpg`. It
  keeps its EXIF data, including the GPS position of the flat, which the 500 m circle exists to hide. It may also be
  HEIC or very large. Whether the server re-encodes an upload and strips its metadata is not documented (Q-API-073).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/shrinkPhoto.js:13-25`;
  `$KVADRO_ROOT/demo/app/src/lib/api/owner.js:57-59`; `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:29` (all at
  r31).
- **Proposed fix:** the server re-encodes every upload, strips all metadata and checks the real type by content. The
  client reports a failed conversion instead of silently sending the original.

#### LB-APP-062 — Ambiguous weekday initials; days counted by the device clock (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** ru `own.weekdays` is «П,В,С,Ч,П,С,В»: two «П», two «В» and two «С». The week chart of the owner panel
  assumes that the last value of `daily` is "today" by the device clock, and the days since publishing use the device
  clock too.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:197`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:35-38,249-280` (at r31).
- **Proposed fix:** the server sends dated points in Tashkent time, and the labels come from `Intl` short weekday names
  («Пн», «Вт»…).

#### LB-APP-063 — "Inside Uzbekistan" is a rectangle (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** lat 37–46 / lon 55–74 also covers large parts of Kazakhstan, Turkmenistan, Kyrgyzstan and Tajikistan
  (`inferred` from the geography). This one test gates the label lookup, «Готово» and the form's point error. Whether
  the server checks the point against the country is not documented (Q-API-074).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/PlacePicker.jsx:15-16,73,147`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:990-992` (at r31).
- **Proposed fix:** the server validates the point against the country and city polygons (PostGIS) and answers
  `422 invalid:point`. The client keeps the rectangle only as a cheap pre-check.

#### LB-APP-064 — An unknown key or enum value crashes owner screens (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** a new request or listing status, a new `who`, or a missing translation throws a `TypeError`. That takes
  down «Мои объявления», the requests page or the panel; the panel's `LazyBlock` shows an `ErrorState`, and the others
  fall to the boundary. It is LB-APP-002 in the owner dictionary: its lookup returns `undefined` for an unknown key, and
  `formatEntry` reads `entry.other` of it. Keys built from server data make this reachable: `own.status.${status}`,
  `own.req.${status}`, `own.answered.${action}` and `contact.who.${who}`. Legacy records it as a contract rule, not as a
  guard, as for LB-APP-051. Since release `index-CIa0Ldj2.js` the main dictionary no longer throws (LB-APP-002), while
  `ownT` and `ownPlural` have no fallback (`$KVADRO_ROOT/demo/app/src/features/owner/owner.js:701-707`, r31); that they
  still throw is `inferred`.
- **Evidence:** §3.1; `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:4,701-704`;
  `$KVADRO_ROOT/demo/app/src/i18n/index.js:119-121`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:50,542,571,606` (all at r31);
  `$KVADRO_ROOT/docs/api.md:1283-1285` (r31).
- **Proposed fix:** a lookup that never throws, with a neutral fallback (HOMI's `@homi/i18n` already has never-throw
  handlers), and a generic label for an unknown status.

#### LB-APP-068 — A city change or erasing the address silently drops data (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** in the owner form another city chip clears the district, the landmark and the map point. Erasing the
  address text to retype it also removes the map point. Unlike the map's own replacement, which shows a toast with
  «Вернуть», neither can be undone.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:1027-1034,1140-1158`; compare
  `OwnerForm.jsx:607-620` (at r31).
- **Proposed fix:** keep the point when the text is cleared, since they are separate facts, and offer «Вернуть» after a
  city change.

#### LB-APP-070 — The own-listing footer can be empty, and the «Это ваше объявление» bar is unreachable (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** `ListingCtaBar` has a branch for the user's own listing («Это ваше объявление» / «Отклики — в «Мои
  объявления»», the keys `contact.mineBar` and `contact.mineBarHint`), but the screen never renders the bar for such a
  card: it renders the owner footer instead, and the panel that fills that footer loads only with `owner_listing_id`.
  With `owner_mine` but no `owner_listing_id` the screen shows neither the panel nor a CTA: the footer is an empty bar,
  and the user sees no actions at all. While the panel loads, the footer is empty too.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:105-121`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:237-249,310-324`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:83-85` (all at r31).
- **Proposed fix:** one owner of the footer: the panel's buttons when the panel is available, a footer skeleton while it
  loads, else the «Это ваше объявление» bar. If the bar is not used so, drop the branch and its two keys.

#### LB-APP-071 — The waitlist sign-up is not remembered (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** after «Сообщите, когда откроете…» (SCR-054) the confirmation is local state only. The next visit offers
  the button again, and the answer of the call is not read.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:1639-1655` (at r31);
  `$KVADRO_ROOT/docs/api.md:1469-1470` (r31).
- **Proposed fix:** the server returns a `waitlisted` flag (on the listing or with the user's profile), and the screen
  shows the confirmation from it.

#### LB-APP-072 — A chip tap before the card loads logs `owner_info_opened` and burns the tip (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** the owner chip shows from the preview (`owner_verified`), but its open handler is a no-op until the full
  card arrives. A tap in that window still writes `kv-owner-tip = done`, hides the tip and sends `owner_info_opened`; no
  sheet opens.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:232-233`;
  `$KVADRO_ROOT/demo/app/src/features/listing/OwnerChip.jsx:54-62` (at r31).
- **Proposed fix:** the chip is inert (or opens a sheet from preview data) until the card is loaded; the event and
  `done` only when the sheet opens.

#### LB-APP-074 — `given` without a phone offers a second request; the re-read resets the screen (`bug`, CONFIRMED; trigger UNVERIFIED, Q-API-076)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** after `given` the card is re-read; the re-read clears the details (skeletons, shimmer CTA) and scrolls to
  the top. While it runs, and for good if the new card has `my_request: given` but no `phone`, gate mode holds and
  `given` is not a closed status, so the CTA is «Связаться с хозяином» again. Whether the server puts `phone` on the
  card after `given` is not verified (Q-API-076): the legacy document only expects it («ожидается, что в ней появится
  `phone`»).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:206-210,337-339`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:40-52`;
  `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:42-44` (all at r31);
  `$KVADRO_ROOT/docs/api.md:390-391` (r31).
- **Proposed fix:** `given` is its own CTA state («Позвонить» once the number can be fetched, a waiting state before);
  re-read in the background without clearing the screen.

#### LB-APP-078 — The info sheet still says «Номер он даёт сам, после вашего отклика» after the number was given (`bug`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** the gate test of the owner info sheet (SCR-062) lacks the screen's "no phone" condition, so with a given
  number (a phone on the card) it still shows the gate point and the gate foot.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/OwnerInfoSheet.jsx:22,28-30,74` against
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:206` (at r31).
- **Proposed fix:** one shared gate predicate.

#### LB-APP-079 — The radar link fails without a word (`bug`, CONFIRMED; trigger UNVERIFIED, Q-API-083)

- **Since:** release `index-CIa0Ldj2.js`.
- **Symptom:** the radar link `?radar=<id>` (BR-APP-107) compares the id with `===` to a number, so a radar whose `id`
  arrives as a string never matches; the legacy contract types `Subscription.id` as `number | string`. A miss or a
  failed `GET /api/subscriptions` shows nothing: the user stays on the default search and is not told why. The default
  feed is drawn first and then replaced by the radar's. The sort reset is dead code (`inferred`: it closes over the sort
  of the first render, `new`, which is always offered). There is no Back to the radar, and no event carries the radar
  id: `entry` of `app_launch` and `app_opened` stays `menu` or `news`.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/radar/radarLink.js:7-13`;
  `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:135-149`;
  `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-34` (at r33); `$KVADRO_ROOT/docs/api.md:428,1314-1317`
  (r35). Whether the server sends the id as a number or as a string is not known (`02` Q-API-083).
- **Proposed fix:** compare ids as strings; on a miss or an error stay on the default search and say so once; open the
  radar's search as the first feed instead of replacing it; record the entry in `app_opened`.

#### LB-APP-080 — After a reload the launch still counts as a link (`bug`, CONFIRMED)

- **Since:** release `index-CIa0Ldj2.js`.
- **Symptom:** `kv-start-done` stops the card on a reload inside one launch (BR-APP-106), but four readers still take
  the listing of the launch through `getStartListingId()`, which ignores the mark: `app_launch.entry`,
  `app_opened {entry: "link", listing_id}`, the `/start` payload of the no-access screen (SCR-003) and the guard of the
  radar link (BR-APP-107). So the reload is logged as a second link entry, and a `?radar=` beside the listing stays
  ignored although the listing is no longer opened.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:38-52`;
  `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:61,107-122,135` (at r33).
- **Proposed fix:** one "launch target" value that the mark empties for every reader.

#### LB-APP-084 — A double tap on an owner invitation sends everything twice (`bug`, CONFIRMED)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** `openOwnerEntry` has no guard while its request runs. A second tap on the row, the line or the listing's
  «Тоже сдаёте квартиру?» sends a second `owner_entry` event and a second `GET /api/owner/listings`. The event is sent
  before the request, so it is also sent when the request fails. Both answers set the same state, so one form opens:
  the layer is keyed `ownerFormId ?? 'new'`. An answer that arrives after the user has closed the form would open it
  again, with a new draft (`inferred` from the code; not seen running).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/App.jsx:161,169-187,1016-1019` (at r38).
- **Proposed fix:** one request at a time; the event once per opening.

#### LB-APP-085 — The countdown ring can end before its toast (`bug`, code CONFIRMED; the effect `inferred`)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** the timer of a toast restarts whenever its message object changes (effect dependencies `[msg, onDone]`),
  but the ring of an action toast is keyed by the text only. When an action toast replaces another with the same text,
  the 6 s timer starts again while the ring goes on from where it was, so the ring is empty before the toast goes
  (`inferred`; the check is to show two action toasts with the same text within 6 s on legacy, for instance two hides
  in a row, and watch the ring).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/components/Toast.jsx:50-53,96-108`; `$KVADRO_ROOT/demo/app/src/app/App.jsx:1124`
  (at r38).
- **Proposed fix:** key the ring by the toast's identity, so that a new toast restarts it.

#### LB-APP-087 — A failed un-favourite plays the burst of an add (`bug`, code CONFIRMED; the effect `inferred`)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** the heart and the burst are keyed by the tap counter, and the burst renders while `taps > 0` and the
  listing is a favourite. A tap on a favourite removes it (`dip`, no burst). When the save fails, the state is flipped
  back without a new key, so the listing is a favourite again under the same counter: the burst mounts and plays as if
  the user had added it, and the heart's class changes from `dip` to `like` (`inferred`; the check is an un-favourite
  with the network off on legacy).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:29-44,57-74` (at r38).
- **Proposed fix:** play the burst only on a tap that adds, and only while the add stands (not on a rollback).

## 5b. Questionable UX and logic decisions (LB-APP, tag `decision`)

These are not crash bugs: the behaviour looks logically wrong or confusing. The current behaviour is exact; the fixes
are proposals.

#### LB-APP-024 — Map selection card ignores Telegram Back (`decision`, CONFIRMED)

- **Symptom:** the card registers no Back handler, so on the map the BackButton is hidden while a card is open. Android
  hardware Back may close the whole Mini App.
- **Evidence:** `MapSelectionCard.jsx` has no `pushBackHandler`; compare `$KVADRO_ROOT/demo/app/src/lib/telegram/buttons.js:14-35`.
- **Proposed fix:** treat the card as a layer that Back closes.

#### LB-APP-025 — History dates and times use the device time zone (`decision`, CONFIRMED; fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** dates and times in price history use the device time zone, not Asia/Tashkent. Settings tell the user
  times are Tashkent time.
- **Fixed in legacy since release `index-CIa0Ldj2.js`:** the dates and times of the price history are formatted in
  Asia/Tashkent (BR-APP-069; `$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx:9-16`,
  `$KVADRO_ROOT/demo/app/src/i18n/index.js:86-104` at r33). The symptom above is the behaviour of the releases before
  it.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx:7-12`; `$KVADRO_ROOT/demo/app/src/i18n/index.js:83-93`;
  `notify.tz`.
- **Proposed fix:** format every product date in `Asia/Tashkent`.

#### LB-APP-026 — «Весь Ташкент» is hard-coded, and six keys are dead (`decision`, CONFIRMED)

- **Symptom:** `sum.wholeCity` is «Весь Ташкент» / «Butun Toshkent» / «All of Tashkent» for every city. It appears in
  the collapsed title before meta loads, even for Samarkand users. Six i18n keys are unused. Since release
  `index-CIa0Ldj2.js` `listing.loadFailed` is a seventh
  (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:175-201` at r33; §3.1), and since release
  `index-YX9bFVws.js` `found.thanksYes` an eighth (LB-APP-091).
- **Evidence:** `summary.js:95,125`; §3.1.
- **Proposed fix:** use «Весь город» or the city name; delete the dead keys.

#### LB-APP-027 — Failures with haptic feedback only (`decision`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** these failures (and some successes) give haptic feedback only, with no text:
  - language picker (`$KVADRO_ROOT/demo/app/src/features/onboarding/LanguagePicker.jsx:37-40`);
  - settings saves (`$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:92-95,108-112,124-126`);
  - hidden list (`$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:34-37`);
  - radar mode, unhide, delete and toggle (`$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:115-121,139-142,158-160,179-181`);
  - clear history (`$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:99-101`).
  - Haptics do nothing outside Telegram and on many devices.
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** every failure of the list now shows «Не получилось
  сохранить», as a toast and in the language picker as a line under the list; so does the favourite heart, which the
  list did not name (SCR-042, with the evidence per place; SCR-004). Still open: the successes that give haptic
  feedback only, which the symptom names too. The symptom above is the behaviour of the releases before it.
- **Proposed fix:** a consistent error toast (`common.saveFailed`) and success confirmation for destructive actions.

#### LB-APP-028 — Call button dead end, and calls over-counted (`decision`, CONFIRMED)

- **Symptom:** off Android, with no `call_url` (`contact` is `null`), «Позвонить» does nothing visible. It still logs
  `contact_call` with `via: 'browser'`.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:54-81`; `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:14-19`.
- **Proposed fix:** fetch the call link on demand when it is missing. Log the event only when something actually
  opened.

#### LB-APP-029 — Tenant and pets filters stay visible for daily rent (`decision`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** switching to daily rent resets them, yet they stay visible and selectable (they are shown by base deal).
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** the pets section is hidden for daily rent (BR-APP-019;
  `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:214-217` at r33). Still open: the tenant section shows
  for daily rent although the switch to daily rent clears `tenant`.
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
  10 radars, on every visit. Since release `index-CIa0Ldj2.js` the three requests per radar repeat after every load of
  the list, at most once per 10 s (BR-APP-063; `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:48-50,61-74` at
  r33).
- **Evidence:** `useRadarPreviews.js:41-66`.
- **Proposed fix:** one batched preview endpoint (or `limit=5`) with caching.

#### LB-APP-037 — Most layers are not tracked as screens (`decision`, CONFIRMED)

- **Symptom:** these layers never produce a `$pageview`: language picker, no-access screen, first-launch city picker,
  map card, actions sheet, report view, report detail view, photo viewer, market sheet, fullscreen map, radar sheet,
  survey, settings sub-pages, hidden list. Since release `index-CIa0Ldj2.js` a listing closed before its details load
  sends no `$pageview` either. `owner/listing` is a new name, and the error-report screen of the user's own listing is
  still `listing` (`$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:147-156`,
  `$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:54-57` at r33).
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

#### LB-APP-044 — The map has no loading, empty or error state (`decision`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Symptom:** no state is shown for points (SCR-011).
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** the error state exists: the points banner, the slot of
  the selection card and the error boundary of the map views (SCR-011, SCR-013, with the evidence). Still open: no
  loading indicator and no empty state.
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

#### LB-APP-053 — The card-style sample result outlives the sub-page (`decision`, CONFIRMED; intent UNVERIFIED)

- **Since:** release `index-BnFvC-Ft.js`.
- **Symptom:** the sample state lives in the settings screen, and closing «Вид карточек» does not reset it. Reopening
  the sub-page still shows «Пример — в чате с ботом» or the failure line until the next pick or until the Settings tab
  unmounts. The sync report places the state "after `closePage`, as in the bundle", so this is the shipped behaviour;
  whether it is intended is not recorded.
- **Evidence:** `SettingsScreen.jsx:94-96,153-160` (at r31);
  `$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md:29`.
- **Proposed fix:** reset the result when the sub-page closes. Undecided; WP-31 keeps the legacy behaviour until it is
  decided.

#### LB-APP-054 — Every entry creates a new draft; abandoned drafts pile up (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** the Settings row, «Сдать ещё одну», the panel and every `owner_new` launch each send
  `POST /api/owner/listings`. A user who opens the cabinet and backs out of the first map step leaves an empty draft
  behind (Back from «where» closes the form). Each one shows in «Мои объявления» as «Черновик». Whether the server
  reuses an untouched draft is not documented (Q-API-068).
- **Evidence:** BR-APP-075; `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:183-186,374-375` (at r31);
  `$KVADRO_ROOT/docs/api.md:1434` (r31).
- **Proposed fix:** the server answers `POST` with the user's existing untouched draft, or the client creates the draft
  only with the first saved field. An `owner_new` launch resumes the open draft.

#### LB-APP-055 — Editing a published listing autosaves, yet the last step says «Сохранить изменения» (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** in edit mode every change is sent by `PATCH` after 600 ms and again when the form closes. Photo uploads,
  deletes and the cover change act at once. Closing the form without «Сохранить изменения» therefore still persists the
  edits, and it is not documented whether the public listing shows them before `publish` (Q-API-070).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:308-337,435-524,668-691`;
  `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:122` (at r31); `$KVADRO_ROOT/docs/api.md:1439-1442,1450-1451`
  (r31).
- **Proposed fix:** choose one model. Either keep the edits of a published listing as a revision that only «Сохранить
  изменения» applies (photos included), or let every save go live and rename the button «Готово».

#### LB-APP-056 — Publish is possible with no contact mode chosen (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** when `contact_mode` is `null`, neither option is selected, and «Опубликовать» works anyway. The server
  picks a mode the owner never saw; which one is not documented (Q-API-078).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:906-929,668-741` (at r31);
  `$KVADRO_ROOT/docs/api.md:1365` (r31).
- **Proposed fix:** preselect «Через kvadro²» (the recommended mode) for `null`, or block publish until a mode is
  chosen. The server answers `missing:contact_mode`.

#### LB-APP-057 — Limits are written into the texts (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:**
  - In the owner cabinet «Уже две квартиры», «Сдавать можно до 2 квартир сразу», «С этим номером уже сдаются 2 квартиры»
    and «сейчас n из 10» are written into the strings, while `max` comes from the server and the photo cap is a client
    constant.
  - In the contact request «до 10 откликов в день», «Сегодня вы уже отправили 10 откликов», «через 10 минут» and «За
    неделю — 30 откликов» are fixed strings, while the server decides the limits (open question 17 of the legacy
    document).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:107,136-137,170,175`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:74`; `ru.js:632-640` (all at r31);
  `$KVADRO_ROOT/docs/api.md:1321-1325,1408-1409` (r31).
- **Proposed fix:** interpolate `{max}` from the server and the photo cap from configuration shared with the server. The
  request limits come from the API (reference data or the error body) and fill the texts.

#### LB-APP-058 — No analytics in the owner funnel (`decision`, CONFIRMED; partly fixed in legacy since `index-CIa0Ldj2.js`)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** the owner chunks send no event at all. One screen name, `owner/form`, covers all five steps of the form.
  A form opened from the panel is reported as `listing`. A launch through `owner_new` has no source.
- **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** six attention and form events exist: `owner_attention`,
  `owner_mascot_tap`, `owner_limit_sheet`, `owner_place_set`, `owner_place_autofill` and `owner_hint_opened` (§3.3;
  `$KVADRO_ROOT/demo/app/src/lib/ownerAttention.js:5-39`,
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:554-557,616-620,631-636,805-809`,
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerPanel.jsx:78-83,247-251,270-275`,
  `$KVADRO_ROOT/demo/app/src/features/settings/OwnerLimitSheet.jsx:18-26` at r33). Still open: the funnel steps
  themselves still send none (`inferred`); the other three parts of the symptom are unchanged — one screen name
  `owner/form` for all steps, the form opened from the panel counted under the open listing, and the launch through
  `owner_new` without a source (`$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:30-46` at r33).
- **Evidence:** §3.3; `$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:30-51`;
  `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:32-35` (at r31). A search for `trackEvent` in
  `src/features/owner`, `src/lib/ownerPending.js`, `src/components/ReqTip.jsx` and
  `src/features/settings/OwnerLimitSheet.jsx` at r31 found nothing.
- **Proposed fix:** add events for:
  - the cabinet opened (with its entry point);
  - a step reached;
  - a photo upload result;
  - the phone result: shared, denied, timeout, or rejected with the reason;
  - the mode chosen;
  - the publish result;
  - status changes and request answers.

  Give each step its own screen name, let the form win over the listing, and record the launch source `owner_new`.

#### LB-APP-065 — A rejected owner gets no way forward (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** the rejection texts end with «напишите в поддержку», but the screen (SCR-054) has no support button. In
  «Мои объявления» a rejected listing stays in «Актуальные» with the chip «Не принято», no reason, no action and no way
  to delete it. `reject_reason` mixes two vocabularies.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:1622-1664`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:160-170`;
  `$KVADRO_ROOT/demo/app/src/features/owner/owner.js:104-107` (all at r31); `$KVADRO_ROOT/docs/api.md:1357,1368-1369`
  (r31).
- **Proposed fix:**
  - a support button on the rejection screen and on the rejected card (HOMI: the support bot of DEC-56);
  - the reason shown on the card;
  - separate fields `phone_error` (`not_uz | not_own`) and `reject_reason` (`agent | fraud | limit`);
  - «Удалить» for a rejected listing.

#### LB-APP-066 — The pending counter is fetched for every user on every launch and resume (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** `App` mounts the counter for everyone, so `GET /api/owner/pending` runs at start and on every return to
  the app, also for the large majority who never listed a flat.
- **Evidence:** `App.jsx:141`; `$KVADRO_ROOT/demo/app/src/lib/ownerPending.js:40-55` (at r31);
  `$KVADRO_ROOT/docs/api.md:1460-1462` (r31).
- **Proposed fix:** carry the pending count in a call the app already makes at start, and fetch it separately only for
  users with owner listings and after cabinet actions.

#### LB-APP-067 — Photo delete without confirmation or undo (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** one tap on the trash icon deletes the photo on the server at once. On a published listing it probably
  disappears from the public listing at once too (`inferred`; LB-APP-055, Q-API-070).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/owner/OwnerForm.jsx:511-524` (at r31).
- **Proposed fix:** an undo toast with a deferred delete.

#### LB-APP-069 — The request tip leads to Settings, not to the requests (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** «Пришёл первый отклик!» only switches to the Settings tab. The owner still has to find «Мои объявления»
  and then the listing's «Отклики», three more taps. After the first visit to any requests page the tip never shows
  again, and new requests have only the red dot.
- **Evidence:** `App.jsx:719-734`; `$KVADRO_ROOT/demo/app/src/components/ReqTip.jsx:16-34`;
  `$KVADRO_ROOT/demo/app/src/features/owner/OwnerListings.jsx:495` (at r31).
- **Proposed fix:** a tap opens the requests (or «Мои объявления») directly, and the signal for later requests is an
  explicit decision.

#### LB-APP-073 — `open`, `closed` and `own` leave the card stale (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** these errors of the contact request only print a line in the sheet (SCR-061). The card keeps gate mode
  and «Связаться с хозяином»; a second tap sends again and fails again. «Хозяин открыл номер — обновите карточку и
  позвоните.» asks the user to refresh, but nothing on the screen refreshes the card.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ContactRequestSheet.jsx:71-80`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:334-340`; `ru.js:642-644` (at r31).
- **Proposed fix:** `open` → close the sheet and re-read the card (it then shows «Позвонить»); `closed` → the closed
  bar; `own` → re-read (the card becomes the user's own).

#### LB-APP-075 — The author label is hidden by comparing server text with the client catalogue (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** whether the `owner` label repeats the chip is decided by matching the server's string with the UI
  language's «Проверенный хозяин» / «Хозяин — со слов объявления». A label in another language, with other punctuation
  or reworded on the server, shows twice.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/sections/AuthorSection.jsx:7-23` (at r31);
  `$KVADRO_ROOT/docs/api.md:392-395` (r31). The parity mock sets `owner: 'Проверенный хозяин'` on a self-placed card
  (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:300`); that the real server prefixes the label is `inferred` from it
  (Q-API-078).
- **Proposed fix:** a structured owner tier in the contract; the label carries only what the tier does not say.

#### LB-APP-076 — An expired request closes contact for good (`decision`, CONFIRMED in the UI; server UNVERIFIED, Q-API-075)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** `expired` is a closed status: the seeker sees «Хозяин пока не ответил» and has no way to ask again or to
  call. Whether the server would accept a new request after `expired` is not known (Q-API-075). `response_minutes` is
  printed as minutes for any value («за 600 мин»).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:45-46,209-210`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:111-112`;
  `$KVADRO_ROOT/demo/app/src/features/listing/sections/AuthorSection.jsx:40-45`; `ru.js:645,661` (all at r31).
- **Proposed fix:** after expiry allow one new request (server rule to confirm); format `response_minutes` with hours
  and days.

#### LB-APP-077 — Picking «Кто будет жить» overwrites the count the user set (`decision`, CONFIRMED)

- **Since:** release `index-CBlEKxdL.js`.
- **Symptom:** in the contact request sheet (SCR-061) a tap on a chip of «Кто будет жить» sets «Сколько человек» to 1 /
  2 / 3 / 2 / 2, also after the user has changed the stepper.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/ContactRequestSheet.jsx:121-125` (at r31).
- **Proposed fix:** the default count applies only while the user has not touched the stepper.

#### LB-APP-081 — The radar limit on the switch reads «Не получилось сохранить» (`decision`, CONFIRMED)

- **Since:** release `index-CIa0Ldj2.js`.
- **Symptom:** since the failure toasts of this release (SCR-042), a `409` limit answer to
  `PATCH /api/subscriptions/:id {active: true}` on the radar tab shows the generic «Не получилось сохранить», while the
  create path names the limit: «Уже {max} радаров — удалите ненужный во вкладке «Радар»» (BR-APP-041). Up to
  `index-CBlEKxdL.js` the switch rolled back without a text. The legacy contract still says that the switch rolls back
  silently.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:130-134` (at r33);
  `$KVADRO_ROOT/docs/api.md:83` (r35).
- **Proposed fix:** show the limit text of BR-APP-041 for a `409` that is not `no_chat`.

#### LB-APP-082 — The fresh pill and the return banner ask and show independently (`decision`, CONFIRMED)

- **Since:** release `index-CIa0Ldj2.js`.
- **Symptom:** after one long return (BR-APP-104) both the fresh pill (SCR-063) and the return banner (SCR-046) can send
  `GET /api/feed/new`, each with its own `since`, and both can be on screen: neither hides the other, and both are
  hidden only while the search list is covered. The banner keeps its own rules (the 1.8 s delay, an `AbortSignal`, no
  radar for the search, the radar limit, the cooldowns). The pill's request has no `AbortSignal`, and its `since` is the
  moment the feed was created, not the moment its first page arrived. After a long return the banner's `since` is the
  last recorded visit, which is the moment the app went to the background on the search tab (`inferred` from
  `recordVisit` and `resetVisitSession`).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/App.jsx:321-331,430-468,793-794`;
  `$KVADRO_ROOT/demo/app/src/app/useReturnNudge.js:17,105-145`;
  `$KVADRO_ROOT/demo/app/src/features/feed/followNudge.js:131-148`; `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:111-117`
  (at r33).
- **Proposed fix:** one request and one count per return when both would fire for the same filters; abort the pill's
  request on a filter change; take `since` from the first page.

#### LB-APP-083 — The age label trusts the device clock (`decision`, CONFIRMED; the time zone of `posted_at` UNVERIFIED, Q-API-083)

- **Since:** release `index-CIa0Ldj2.js`.
- **Symptom:** the age label (BR-APP-109) compares `posted_at` with `Date.now()` of the device. A wrong device clock
  shifts every label; a `posted_at` in the future reads «только что»; there is no form beyond days; and the radar strip
  does not follow the minute clock, so its label stays as it was when the strip rendered. Legacy asks about the time
  zone of `posted_at` itself (open question 18 of its contract).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/listing/format.js:141-166`;
  `$KVADRO_ROOT/demo/app/src/features/radar/RadarStrip.jsx:43` (at r33);
  `$KVADRO_ROOT/demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/REPORT.md:116` at r35;
  `$KVADRO_ROOT/docs/api.md:1422-1426` (r35).
- **Proposed fix:** compare with server time (the `Date` header of the answer), or keep the server's `age` string as the
  truth and tick only below one hour.

#### LB-APP-086 — The new motion ignores lite graphics (`decision`, CONFIRMED)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** the leave animation is off in lite graphics, as are the entrance and leave of the listing layer, but the
  rolling numbers, the favourite heart and burst, the segmented thumb and the 900 ms done phase of the save buttons
  have no lite rule; `SaveState` says so in a comment. They run on the slow devices that lite mode is for, and the
  done phase delays the close by 900 ms there too.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/leave.js:122-124`; `$KVADRO_ROOT/demo/app/src/components/SaveState.jsx:5-7,19`;
  `$KVADRO_ROOT/demo/app/src/components/RollNumber.jsx:8-31`; `$KVADRO_ROOT/demo/app/src/styles/lite.css` (no rule
  for `.roll-strip`, `.fav svg`, `.fav-burst`, `.save-btn` or `.segmented:after`); `$KVADRO_ROOT/demo/app/src/styles/listing.css:33`
  (at r38).
- **Proposed fix:** none of this motion in lite, as for the leave and the listing layer; the done phase then holds
  250 ms, as under reduced motion. HOMI has not adopted it: DEC-93 ports the motion with lite graphics as in legacy, and
  keeps this as a proposal.

#### LB-APP-088 — The owner invitations have no gate (`decision`, CONFIRMED)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** the invitations of the search feed and the listing (BR-APP-115) depend on no switch, no `new_features`
  entry and no role; the feed shows them to every user on the search tab, and the listing whenever the server sends
  `owner_entry`. `lib/newFeatures.js` is not used for them.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/app/App.jsx:169-187,913,970`;
  `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:161-172`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:347` (at r38).
- **Proposed fix:** show them only while the owner cabinet is on. HOMI has decided so: DEC-89 (the switch of DEC-81).

#### LB-APP-089 — «Это всё по вашему поиску» exists only with the invitation (`decision`, CONFIRMED)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** the end line `feed.end` is rendered only inside the invitation block `.feed-end`, behind the same
  condition as the invitation row, so whatever hides the invitation also hides the word that the search is complete.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:161-172` (at r38).
- **Proposed fix:** show the end line on its own at the end of the search feed. HOMI has decided so: DEC-90.

#### LB-APP-090 — The landlord share puts the whole message into `url` (`decision`, CONFIRMED)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** `shareText` opens `https://t.me/share/url?url=<encoded message>` with no `text` parameter, so the
  message with the link inside it is passed as the URL to share; legacy's contract states it the same way.
- **Evidence:** `$KVADRO_ROOT/demo/app/src/lib/telegram/share.js:101-119` (at r38); `$KVADRO_ROOT/docs/api.md:1201-1202`
  (r38); `05` TMA-048.
- **Proposed fix:** `url` = the link, `text` = the message.

#### LB-APP-091 — `found.thanksYes` stays in the dictionaries unused (`decision`, CONFIRMED)

- **Since:** release `index-YX9bFVws.js`.
- **Symptom:** «Поздравляем! 🎉 Спасибо, что рассказали» was the toast after a "where found" choice; the step `moved`
  replaced it, and nothing reads the key any more (§3.1, unused keys).
- **Evidence:** `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:139-144`; `ru.js:538`, `uz_Latn.js:507`,
  `en.js:508` (at r38).
- **Proposed fix:** drop the key when the `moved` step is built.

## 6. Reconstruction guesses and open questions

### 6.1 `// TODO: inferred from build` spots (4)

| # | Location | What was guessed | Status |
| - | -------- | ---------------- | ------ |
| 1 | `$KVADRO_ROOT/demo/app/vite.config.js:67` | `build.target` `chrome80 / edge80 / firefox72 / safari13.1`, from bundle syntax | UNVERIFIED (Q-APP-001) |
| 2 | `$KVADRO_ROOT/demo/app/src/features/map/MapScreen.jsx:7` | an engine-name debug badge stripped from the build (`SHOW_ENGINE_BADGE = false`; `.map-kind` CSS is dead) | UNVERIFIED (Q-APP-002) |
| 3 | `$KVADRO_ROOT/demo/app/src/features/map/gl/style.js:306` | the rationale of the label-halo width formula (`stroke/2 + 0.25`); the value matches the bundle, the reasoning is guessed | UNVERIFIED (Q-APP-003) |
| 4 | `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:118` | `zoom < 11` (default 12) marks a "region", not a city, for nearest-city search; `$KVADRO_ROOT/docs/api.md:499-500` (r31) now states the rule, the code comment is unchanged | UNVERIFIED (Q-APP-004) |

The recovery also states that file names, module boundaries and the versions of four range-pinned libraries are
guesses (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:88-95`).

### 6.2 Open questions (Q-APP)

| ID | Question | Check that closes it |
| -- | -------- | -------------------- |
| Q-APP-001 | What is the real minimum WebView the Mini App must support? | Pull the `platform` / `tg` distribution from `app_launch` (with `tg` since release `index-BnFvC-Ft.js`) and `app_error` in the legacy journal or PostHog; run a syntax checker over the prod bundle in `tools/parity/original/assets/` (read-only). |
| Q-APP-002 | Did the engine badge ever ship to users? | Inspect the prod chunks `MapView-*.js` / `MapViewGL-*.js` in `tools/parity/original/assets/` for the badge render. Product decision: drop it. |
| Q-APP-003 | Is the GL label halo correct? | Confirm with the existing `gl-parity` style comparison (16/16 identical per RECOVERY.md:71-74); visual check against a prod screenshot. |
| Q-APP-004 | Does `zoom < 11` really mean "region"? | Read `cities[].zoom` from a real `GET /api/meta` and confirm with the backend owner. `$KVADRO_ROOT/docs/api.md` §4 repeats the rule (`:499-500`, and as its open question 12 at `:1310`, r31), but it was derived from code. |
| Q-APP-005 | Can `GET /api/feed/flow` return 204 or an empty body? (LB-APP-006) | Call it with very narrow filters on a test account and record the status and body. |
| Q-APP-006 | Do `POST` / `PUT /api/subscriptions` always return `relaxed[]` when `starter = 0` and `options` is empty? (LB-APP-005) | Contract check against `$KVADRO_ROOT/docs/api.md` §7 and a live call. |
| Q-APP-007 | What values can `median_rooms` take (0, fractions)? (LB-APP-015) | Sample `GET /api/listings/:id` responses with `median_scope = near`. |
| Q-APP-008 | Which `nearby[].kind` values exist? (LB-APP-016) | Sample listing responses; ask the backend owner for the enum. |
| Q-APP-009 | Can favourites or history return a non-null `next_cursor`? (LB-APP-022) **Narrowed by release `index-CIa0Ldj2.js`:** favourites are paged by the contract and the client follows the cursor. Still open: history, and the page size (`02` Q-API-084). | Call both with more than 20 entries. |
| Q-APP-010 | What are the server enums for `subscription.mode` and filter `types`? | Backend contract; the radar list with legacy radars. |
| Q-APP-011 | Do server-formatted strings (`price`, `age`, `label`, `title`) follow the user's currency and locale? | Call `/api/feed` and `/api/listings/:id` after `PUT /api/settings` with each currency and locale. |
| Q-APP-012 | Can map `label` contain HTML or user text? (LB-APP-020) | Sample `GET /api/map`; `$KVADRO_ROOT/docs/api.md` warns about HTML in labels. |
| Q-APP-013 | When are `meta.locale_chosen` and `meta.city_chosen` false, and can they reset? | Backend owner; a fresh Telegram test account. |
| Q-APP-014 | Are the closed-beta gates (`invite`, `full`, `join`, and `paused` since release `index-CIa0Ldj2.js`) active in production? | Open the bot with a fresh account; ask the backend owner. |
| Q-APP-015 | Is `meta.tiles` in production a `.pmtiles` URL, a `{z}/{x}/{y}` template or `null`? On which host? | Read `GET /api/meta`. This affects the RES items, CSP and tile prefetch. |
| Q-APP-016 | What is the legacy CSP header for `app.kvadro.app` (script hashes, connect-src)? | `curl -sI https://app.kvadro.app/` from an allowed machine; record it in `17-infrastructure-and-deployment.md`. |
| Q-APP-017 | What does `contact_paid` mean, given the button «Номер платный»? | Backend owner; sample a listing with `contact_paid: true`. |
| Q-APP-018 | How many sessions use GL, Leaflet or lite? (decides whether to port Leaflet) | PostHog: `build` plus screen events joined with UA; or add a temporary event in the new app. |
| Q-APP-019 | Do bot buttons open the Mini App with `?listing=` / `?news=` (URL) or with `startapp`, and with `?radar=` since release `index-CIa0Ldj2.js` (`04` Q-BOT-050)? | Read the bot's `web_app` button URLs in `$KVADRO_ROOT/docs/telegram-bot.md` and `04-telegram-bot-audit.md`. |
| Q-APP-020 | Do the parity mocks match real API shapes for every state above? | Record real responses for each endpoint on a test account and diff them against `tools/parity/mocks*.mjs`; since `index-CBlEKxdL.js` these include the owner and contact mocks (`tools/parity/mocks.mjs:253-301` at r31), and since `index-CIa0Ldj2.js` the mocks of that release (`tools/parity/mocks.mjs:190-195,320,323-326,331,345,348` at r33). |
| Q-APP-021 | Does `GET /api/bot` return `support`, and which account? | Call `GET /api/bot`. |
| Q-APP-022 | Do support staff use `?map=gl|leaflet|auto` overrides? | Ask the operators; otherwise treat it as a debug-only feature. |
| Q-APP-026 | Can `GET /api/feed/new` answer `200` without a numeric `count`? (LB-APP-048) | Call it on a test account with narrow filters, with `since` in the future and with `since=0`, and record the status and the body. |
| Q-APP-027 | On a Telegram client below 6.9 the phone step sends the owner to the bot (LB-APP-060). Does `openTelegramLink` close the Mini App there, and does reopening it bring the owner back to the same draft or to a new one (LB-APP-054)? | Take the phone step on a client below 6.9 with a test account on legacy; record what the bot offers and what the reopened app shows (with `04` Q-BOT-047). |
| Q-APP-028 | Two spots of the owner form were read from code and CSS but not checked on a device. (a) At a first launch through `owner_new` without a chosen city, is the blocking city picker (z 60) above the form layer (z 46), so that the city is picked first (SCR-050)? (b) When both map engines fail in the place picker, does the map stay blank with «Готово» disabled and no message (SCR-051)? | Run both cases on legacy with a test account; or, at the next intake, read the rule order of `.city-backdrop` against `.sheet-backdrop` and the Leaflet mount path of `PlacePicker.jsx`. |
| Q-APP-029 | The once-per-launch mark of a listing link compares `<initData hash>:<id>` (BR-APP-106). Does a reload of the WebView inside one launch keep the same `hash` and `start_param`, and does every new launch bring a new `hash`, so that the mark stops the reload and nothing else? | Open one listing link twice on a test account and reload the WebView in between; compare whether the `hash` values are equal (never record the values). |
| Q-APP-031 | Which transport of the owner photo upload reports the upload progress that DEC-92 keeps from legacy (BR-APP-119)? Legacy sends the file by `XMLHttpRequest` to read `upload.onprogress`; WP-81 specifies the upload as a Server Action, and a browser reports upload progress only to `XMLHttpRequest`. The options are an XHR to an allow-listed `/bff` write route that forwards the multipart body, or an XHR straight to the API with the session token (header mode). | Decide in WP-81, with the read-only rule of the `/bff` pass-through (WP-22) in view. |

## 7. Summary

| Kind | Count | Status |
| ---- | ----- | ------ |
| Screens and states (SCR) | 63: 24 `screen`, 14 `sheet`, 11 `overlay`, 2 `modal`, 12 `state` (SCR-046 and SCR-047 since `index-DY_DH7h-.js`, SCR-048 since `index-BnFvC-Ft.js`, SCR-049 to SCR-062 since `index-CBlEKxdL.js`, SCR-063 since `index-CIa0Ldj2.js`) | 63 CONFIRMED in the client (SCR-011 contains 2 inferred style details; for SCR-048 the bot side is UNVERIFIED; the server and bot sides of SCR-049 to SCR-062 are DOCUMENTED_ONLY or UNVERIFIED) |
| i18n keys | 597 per locale (ru, uz_Latn, en) at the pinned release `index-YX9bFVws.js`, 587 at `index-CIa0Ldj2.js`, 569 at `index-CBlEKxdL.js`, 510 at `index-BnFvC-Ft.js`, 482 at `index-DY_DH7h-.js`, 461 at the audit (§3.1); 0 missing; 16 plural since `index-CIa0Ldj2.js` (15 at `index-CBlEKxdL.js`, 14 up to `index-BNLZFfL0.js`); 8 unused (`listing.loadFailed` since `index-CIa0Ldj2.js`, `found.thanksYes` since `index-YX9bFVws.js`); plus 207 keys per locale in the owner chunk's own dictionary (3 plural), unchanged | CONFIRMED |
| Client storage keys | 13 `kv-*` in localStorage at the pin (8 mirrored to DeviceStorage, 6 restored; 11, 6 and 4 at `index-BnFvC-Ft.js`; 10, 5 and 3 at the audit) + 2 in sessionStorage (`kv-own-focus`, `kv-start-done`) + 1 dev-only | CONFIRMED |
| Analytics | 30 journal events (`POST /api/events`) at the pinned release (`owner_entry` and `landlord_share` since `index-YX9bFVws.js`; 28 at `index-CIa0Ldj2.js`, with six owner events; 22 at `index-CBlEKxdL.js`, with `owner_info_opened`), 16 at the audit, + PostHog `$pageview` with 19 screen names (`owner/form` and `owner/mine` since `index-CBlEKxdL.js`, `owner/listing` since `index-CIa0Ldj2.js`), autocapture, web vitals, exceptions, replay | CONFIRMED |
| Business rules (BR-APP) | 121 (BR-APP-070 to 073 since `index-DY_DH7h-.js`, BR-APP-074 since `index-BnFvC-Ft.js`, BR-APP-075 to 103 since `index-CBlEKxdL.js`, BR-APP-104 to 111 since `index-CIa0Ldj2.js`, BR-APP-112 to 121 since `index-YX9bFVws.js`) | CONFIRMED (in BR-APP-112 the swipe-back case and in BR-APP-121 the effect of reduced motion are `inferred` from the code) |
| Legacy bugs (LB-APP, `bug`) | 45 (LB-APP-001 to 023, 046, 048, 049, 051, 052, 059 to 064, 068, 070, 071, 072, 074, 078, 079, 080, 084, 085, 087; 14 from RECOVERY.md §7, 31 found here); of them fixed in legacy since `index-CIa0Ldj2.js`: 017; partly: 002, 008, 011, 022, 046 | 33 CONFIRMED; 10 with the defect CONFIRMED but the trigger or impact UNVERIFIED (005, 006, 015, 016, 020, 022, 048, 060, 074, 079); 2 with the code CONFIRMED and the effect `inferred` (085, 087) |
| Questionable decisions (LB-APP, `decision`) | 46 (LB-APP-024 to 045, 047, 050, 053, 054 to 058, 065 to 067, 069, 073, 075 to 077, 081, 082, 083, 086, 088 to 091); of them fixed in legacy since `index-CIa0Ldj2.js`: 025; partly: 027, 029, 044, 058; decided for HOMI: 088 (DEC-89), 089 (DEC-90) | CONFIRMED (the intent of 053, the server side of 076 and the time zone behind 083 UNVERIFIED) |
| `TODO: inferred from build` | 4 (3 in `src`, 1 in `vite.config.js`); the owner files of `index-CBlEKxdL.js` have none | UNVERIFIED |
| Open questions (Q-APP) | 27 (Q-APP-001 to 022, 026 to 029 and 031 here; Q-APP-023 to 025 and 030 are in `24`) | open |
| Telegram integration points (TMA) | 48 in `05-telegram-miniapp-audit.md` (43 used, 5 confirmed absences; TMA-048, `shareText`, since `index-YX9bFVws.js`) | CONFIRMED (2 server-side parts DOCUMENTED_ONLY, and the bot side of TMA-034) |
