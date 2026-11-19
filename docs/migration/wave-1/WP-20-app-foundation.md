# WP-20 — App foundation: routes, localisation, tokens, themes, brand, base components

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #52 on 2026-11-15; production track: deploy, then staging and production serve the placeholder app) |
| Depends on | WP-13 (and the packages installed by WP-03) |
| Size | ≈ 2 800 changed lines without the generated catalogues, L |
| Behaviour reference | `25` §3.2, §3.6, §3.7, §3.11, §4.4; `03` §1.7, §3.1, §3.6; `05` TMA-017, TMA-018; earlier tasks KV-FE-011, KV-FE-012, KV-FE-015, KV-FE-016 (behaviour, texts and test ideas only — not their file layout, `t()` runtime or navigation) |
| Needs from the production track | Nothing new: the app is deployed as today; after this package it serves placeholder pages on staging and production |

## Goal

`frontend/app` stops being a starter: it has the whole route tree of `25` §3.2 under `app/[locale]/` with a
placeholder on every address, the locale redirect, next-intl with the legacy catalogues in the new package
`@homi/i18n`, the legacy look as Tailwind tokens and themes in `@homi/ui`, the brand layer, the restyled base
components, and the "demo data" marker. Every later package of Stage B replaces placeholders and adds no plumbing.

## Scope

**In.** Route files and slots; `proxy.ts` with the locale redirect; next-intl wiring; `@homi/i18n` (importer, two
message layers, enum label tables, key checks); tokens, themes, lite and motion CSS; shadcn/ui base components;
`lib/brand`; `lib/navigation/routes.ts`; `lib/flags.ts`; the no-op analytics and error facades; the demo marker and
its store; removal of the starter files.

**Out.** Boot script, Telegram SDK, session, BackButton, storage, theme and lite detection in JavaScript, CSP
(WP-21). API calls, formatters, `@homi/search` (WP-22). Shell, sheets with gestures, toast, crash screen (WP-23).
Real screens (WP-23 … WP-31). Event transport and PostHog (WP-32).

## Decisions that bind this package

- DEC-44 and `25` §3.2: a file route per screen, sheets and overlays as intercepting routes in parallel slots, the
  locale as the first segment. The tree below is the only allowed shape; later packages do not add route files
  (one exception: the development gallery `[locale]/dev/ui/page.tsx` of WP-23, which answers 404 in production).
- DEC-44 and `25` §3.7: next-intl; catalogues in `@homi/i18n`, one file per locale, legacy key names; `uz` is the
  address and file name for legacy `uz_Latn` (CF-006). `uz_Latn` exists only inside Laravel's legacy driver.
- DEC-36: LB-APP-002 is fixed here — a missing key or an unknown server value never throws. The typed flag module
  for `DEV` behaviour is created here with every flag off (DEC-58 later turned five on by default).
- DEC-40 and `25` §2 rule 5: the interface is the legacy one, brand words are HOMI's and live in one layer.
- DEC-32 and `25` §2 rule 3: tokens are re-typed from the audit table; no legacy CSS file or asset is copied.
- DEC-49: nothing outside the approved batch is added here. WP-03 installs the Radix primitives this package uses
  (dialog, slot, switch, tabs, toast, toggle, toggle-group, radio-group). Read the imports of the copied shadcn/ui
  source: if a component needs a primitive that is not in WP-03's table, WP-03 lets this package add it under the
  same decision — install it into `@homi/ui` at an exact version and name it with a vetting note in the PR. If any
  other package this specification names is missing, stop and fix WP-03.
- `25` §4.4 and RK-27: the demo marker ships in this package because every merge reaches production (DEC-45).
- `25` §8: the catalogues are imported from the legacy release pinned by WP-02 (Q-APP-024), `index-DY_DH7h-.js`,
  which the audit now describes: 482 keys per locale (461 at the release first audited; `03` §3.1).

## Design

### Read before coding

`frontend/app/node_modules/next/dist/docs/01-app/`: `03-api-reference/03-file-conventions/parallel-routes.md`,
`intercepting-routes.md`, `default.md`, `route-groups.md`, `dynamic-routes.md`, `layout.md`, `not-found.md`,
`proxy.md`; `02-guides/internationalization.md`; `02-guides/preventing-flash-before-hydration.md`;
`03-api-reference/05-config/01-next-config-js/cacheComponents.md`; `02-guides/tailwind-v3-css.md` only for
contrast. Then the next-intl documentation for the App Router with a locale segment, for `proxy.ts` on Next.js 16
and for static rendering — everything this file says about next-intl is **verify before use**.

### Route tree

```text
frontend/app/app/
├── global-error.tsx                 placeholder; WP-23 writes it
├── [locale]/
│   ├── layout.tsx                   root layout
│   ├── error.tsx  not-found.tsx     placeholders; WP-23
│   ├── (main)/
│   │   ├── layout.tsx               renders children, then overlay, then sheet (WP-23 turns it into the shell)
│   │   ├── default.tsx
│   │   ├── [...rest]/page.tsx       calls notFound() for unknown addresses (rule 2)
│   │   ├── page.tsx                                         feed            WP-24
│   │   ├── map/page.tsx                                     map             WP-27
│   │   ├── saved/page.tsx  saved/history/page.tsx           saved           WP-29
│   │   ├── radars/page.tsx  radars/new/page.tsx  radars/found/page.tsx      WP-30
│   │   ├── radars/[id]/layout.tsx  page.tsx  edit/page.tsx                  WP-30
│   │   ├── settings/layout.tsx  page.tsx                                    WP-31
│   │   ├── settings/{theme,graphics,language,currency,quiet-hours,digest,hidden}/page.tsx   WP-31
│   │   ├── filters/page.tsx  filters/[kind]/page.tsx  sort/page.tsx  city/page.tsx          WP-25
│   │   ├── listing/[number]/layout.tsx  page.tsx  photos/  market/  actions/                WP-26
│   │   ├── listing/[number]/location/page.tsx                                               WP-28
│   │   ├── @sheet/default.tsx  @sheet/page.tsx  @sheet/[...rest]/page.tsx              null
│   │   ├── @sheet/(.)filters/page.tsx  (.)filters/[kind]/page.tsx  (.)sort/page.tsx  (.)city/page.tsx
│   │   ├── @sheet/(.)radars/new/page.tsx  (.)radars/found/page.tsx
│   │   ├── @sheet/(.)radars/[id]/layout.tsx  page.tsx  edit/page.tsx
│   │   ├── @overlay/default.tsx  @overlay/page.tsx  @overlay/[...rest]/page.tsx        null
│   │   └── @overlay/(.)listing/[number]/layout.tsx  page.tsx  photos/  location/  market/  actions/
│   ├── welcome/language/page.tsx  welcome/city/page.tsx                     WP-23
│   └── no-access/page.tsx  outside/page.tsx                                 WP-23
└── bff/                             created by WP-21 and WP-22
```

Rules of the tree:

1. **Root layout** is `[locale]/layout.tsx` (allowed by `internationalization.md`); there is no `app/layout.tsx`.
   It validates the segment against `locales` of `@homi/config` and calls `notFound()` otherwise, exports
   `generateStaticParams` for the three locales, renders `<html lang data-scheme="light" suppressHydrationWarning>`
   (the boot script of WP-21 changes the attributes before paint, see `preventing-flash-before-hydration.md`),
   sets the viewport with `viewport-fit=cover`, loads no web font, and wraps children in the next-intl provider.
   `params` is a promise (`LayoutProps<'/[locale]'>`). Through `proxy.ts` an unknown first segment (`/de/x`) is
   redirected under a locale and ends in `[...rest]`, which renders `[locale]/not-found.tsx`; the layout's own
   `notFound()` is reached only by paths the matcher skips. What Next.js renders in that case — a root layout
   under a dynamic segment is the case `not-found.md` names for the experimental `global-not-found` — was
   **verify before use**; any `404` answer is acceptable there and `globalNotFound` is not switched on. Verified:
   `/de/x` redirects to `/ru/de/x` and answers `404` (e2e).
2. **Slots.** `(main)/layout.tsx` receives `children`, `sheet`, `overlay` and renders them in this DOM order:
   children, overlay, sheet — the legacy stacking (listing layer below sheets, `03` §3.6). Each slot has
   `default.tsx`, a `page.tsx` for the root address and a catch-all page, all returning `null`, so a hard load
   shows no layer and a soft navigation to an unrelated address — the root included — closes the layer
   (`parallel-routes.md`, "Closing the modal", shows the slot page for the root next to the catch-all).
   `children` also has `default.tsx`. The two slot catch-alls and `[locale]/[...rest]` describe the same address
   pattern from different folders and with different parameter names. Verified at step 13: the build refuses it
   ("Ambiguous route pattern `/[*]/[...*]`" for `[locale]/[...catchAll]` and `[locale]/[...rest]`), so the default
   applies — all three are named `[...rest]` and the page that calls `notFound()` is `(main)/[...rest]/page.tsx`;
   a direct load of `/ru/unknown` answers `404` (e2e).
3. **Interception.** `@sheet/(.)filters` and its siblings intercept soft navigations from any page under `(main)`;
   a hard load of the same address renders the page of the same name outside the slot (`intercepting-routes.md`).
   The bundled documentation says `(.)` ignores `@slot` folders; it does not say the same about route groups.
   Verified: `(.)` inside `(main)/@sheet` matches `(main)/filters` and its siblings, and `(.)listing` inside
   `(main)/@overlay` matches `(main)/listing` (e2e "layers").
4. **Layouts that keep a layer mounted.** `listing/[number]/layout.tsx` (in both trees) will render the listing
   and `{children}`; `page.tsx` renders `null`; `photos`, `location`, `market`, `actions` are its children. The
   same shape is used for `radars/[id]` with its `edit` child and for `settings` with its seven sub-pages (the
   settings screen stays under a sub-page). In this package these layouts render a placeholder plus `{children}`
   so the nesting is proven, and their `page.tsx` renders `null`.
5. **Placeholders.** Every `page.tsx` renders `RoutePlaceholder` (`frontend/app/features/shell/RoutePlaceholder.tsx`)
   with the route name, the locale, a translated string and one `Button`; the copy in a slot passes
   `layer="sheet"` or `layer="overlay"`. The addresses with a parameter mount the placeholders of
   `features/shell/RouteParamPlaceholder.tsx`, which validate it. A later package replaces the import and
   nothing else. `filters/[kind]` accepts `rooms`, `price`, `owner` and calls `notFound()` for anything else;
   `listing/[number]` accepts positive integers only; `radars/[id]` accepts a ULID string (26 characters of
   Crockford base32 — the radar identifier of the WP-13 contract, so `routes.radar(id)` takes a string); both
   call `notFound()` otherwise.
6. Route files contain no logic: they read `params` / `searchParams` and mount a component from `features/…`.
   With `cacheComponents`, `searchParams` and every dynamic parameter that `generateStaticParams` does not list
   (`number`, `id`, `kind` — only `locale` is listed) are runtime data (`dynamic-routes.md`, "With Cache
   Components"): a route file never awaits them at the top of the page; it passes the promise to a component
   inside `<Suspense>`, the placeholders of this package included.

### Navigation vocabulary

`frontend/app/lib/navigation/routes.ts` — typed builders, the single place where an address is spelled:
`routes.feed(q?)`, `routes.map(q?)`, `routes.filters(q?)`, `routes.quickFilter(kind, q?)`, `routes.sort(q?)`,
`routes.city(q?)`, `routes.listing(number)`, `routes.listingPhotos(number, index?)`,
`routes.listingLocation(number)`, `routes.listingMarket(number)`, `routes.listingActions(number)`,
`routes.saved()`, `routes.history()`, `routes.radars()`, `routes.radarNew(q?)`, `routes.radar(id)`,
`routes.radarEdit(id)`, `routes.radarFound(q)`, `routes.settings()`, `routes.settingsPage(name)`,
`routes.welcomeLanguage()`, `routes.welcomeCity()`, `routes.noAccess(reason?)`, `routes.outside()`. Builders
return locale-less paths; `Link`, `useRouter`, `usePathname`, `redirect` from `frontend/app/i18n/navigation.ts`
add the locale.

Pure helpers in the same file, used by WP-21 and WP-32:

| Helper | Result |
| ------ | ------ |
| `isRootTab(pathname)` | true for `/`, `/map`, `/saved`, `/saved/history`, `/radars`, `/settings` |
| `parentOf(pathname, searchParams)` | an address or `null`, decided in this order: (1) a layer parameter is present (`pick`, `draw`, `pin`, `step`) → the same address without it (`step=detail` → `step=report`); (2) `/filters`, `/filters/<kind>`, `/sort`, `/city` → `/map` when `from=map`, else `/`, carrying the search state (the 25 filter keys and `sort`) and nothing else; (3) `/listing/<n>` → `/`; its four children → `/listing/<n>`; `/radars/new`, `/radars/<id>`, `/radars/found` → `/radars`; `/radars/<id>/edit` → `/radars/<id>`; the seven settings sub-pages → `/settings`; (4) `null` for root tabs and for the gates (`/welcome/*`, `/no-access`, `/outside`) |
| `RESERVED_PARAMS`, `searchStateOf(searchParams)` | the parameters that are never filter keys — `from`, `focus`, `pick`, `draw`, `pin`, `step`, `i`; `searchStateOf` returns the parameters without them |
| `screenNameOf(pathname, searchParams)` | the 16 legacy analytics names (`03` §3.3): `search/list`, `search/map`, `map/draw` (`/map` with `draw=1`), `saved/favorites`, `saved/history`, `subs`, `settings`, `listing`, `radar/edit`, `radar/new`, `filters`, `filters/rooms`, `filters/price`, `filters/owner`, `sort`, `city`; any other address returns its route pattern until WP-32 completes the table |

### `proxy.ts` (locale only in this package)

`frontend/app/proxy.ts` exports the function `proxy` and `config` with a constant `matcher` that skips `_next`,
`bff`, and files with an extension (`proxy.md`, "Matcher" and "Negative matching"). Behaviour:

- a path without a locale prefix is redirected to the same path under a locale; the query string is kept. The
  launch data Telegram puts into the fragment (`#tgWebAppData=…`) is never sent to the server; browsers carry a
  fragment over a redirect whose `Location` has none — this is covered by an end-to-end test because the whole
  launch depends on it;
- the locale is the one stored by next-intl's cookie when present, else `ru`. `Accept-Language` is **not** used:
  it describes the device, while the legacy rule uses the Telegram language (BR-APP-050), which only the browser
  knows; WP-21 replaces the segment after sign-in;
- the function is written as a small pipeline (`withLocale(request)` returns a response) so WP-21 can add the CSP
  nonce and the security headers to the same response. How next-intl's own middleware composes with a custom
  `proxy` function on Next.js 16 was **verify before use** (`25` §3.7 marks it unverified). Resolved: next-intl's
  middleware is not used. Read in next-intl 4.15.1 (`dist/esm/development/middleware/resolveLocale.js`,
  `syncCookie.js`): with `localeDetection: true` it falls back to `Accept-Language`, with `false` it ignores the
  cookie too, and its cookie sync consults `Accept-Language`; none is the rule above. `withLocale` is twelve lines;
  next-intl gets the locale from the segment (below). The redirect is `307`.

### next-intl wiring

| File | Content |
| ---- | ------- |
| `frontend/app/i18n/routing.ts` | locales and default from `@homi/config`; the prefix is always present |
| `frontend/app/i18n/request.ts` | request configuration: the locale from `next/root-params` (`locale()`), `getMessages(locale)` from `@homi/i18n`, `timeZone` `Asia/Tashkent`, the error hook and the fallback hook (below) |
| `frontend/app/i18n/navigation.ts` | locale-aware `Link`, `useRouter`, `usePathname`, `redirect` |
| `frontend/app/i18n/IntlClientProvider.tsx` | `NextIntlClientProvider` for Client Components with the same hooks: functions cannot cross from the root layout, so they are set in this Client Component |
| `frontend/app/i18n/labels.ts` | `labelFor` of `@homi/i18n` bound to `reportError` |
| `frontend/app/global.d.ts` | next-intl's `AppConfig`: `Locale` and `Messages` from `@homi/i18n` |
| `frontend/app/next.config.ts` | the next-intl plugin wrapped around the existing configuration; `cacheComponents` and `partialPrefetching` stay on |

Two things to verify before use, because `cacheComponents` is on: that next-intl can supply the locale to Server
Components without reading request headers (otherwise the static shell is lost), and that its type augmentation
gives typed keys from the `ru` catalogue. Both resolved. next-intl 4.15.1 marks `setRequestLocale` deprecated in
favour of `next/root-params`; `i18n/request.ts` reads `locale()` from it, and the build lists `/ru`, `/uz`, `/en`
and every address without a parameter as static (`○`). `tests/i18n/typed-keys.test.ts` holds `@ts-expect-error`
lines that `pnpm typecheck` checks.

### `@homi/i18n` (new workspace package, `frontend/packages/i18n`)

```text
frontend/packages/i18n/
├── package.json  tsconfig.json
├── scripts/import-legacy.mjs          Node built-ins only
├── messages/legacy/{ru,uz,en}.json    generated, never edited by hand
├── messages/legacy/keys.json          { release, keys, dropped }: legacy key names of the pinned release, for the next release diff
├── messages/homi/{ru,uz,en}.json      brand overrides and HOMI-only keys, hand-written
├── brand-words.json                   patterns that must not reach a user (legacy brand names, handles, hosts)
├── src/{index,labels,locale,messages,report}.ts
└── tests/*.test.ts                    Vitest project @homi/i18n (package tests may live in src/ or tests/)
```

**Importer.** Input: a directory holding a *copy* of the three legacy locale files of the pinned release
(`$KVADRO_ROOT/demo/app/src/i18n/locales/{ru,uz_Latn,en}.js`); nothing is run inside the legacy tree. Output: the
`legacy` layer. Rules:

1. `uz_Latn` becomes `uz`. Keys keep their names; a dotted key becomes a nested path (`sheet.title` →
   `sheet` → `title`), which is how next-intl addresses it (`t('sheet.title')`).
2. **Leaf-and-prefix rule (one rule for every package).** A nested catalogue cannot hold a key that is both a
   message and the prefix of other keys. The importer maps every such leaf to `<key>._` automatically and writes
   the list to `messages/legacy/leaf-and-prefix.json`. Known from the audit and the earlier tasks: `sheet.market`
   («Дом») → `sheet.market._` next to `sheet.market.new`; `sheet.posted` → `sheet.posted._` next to
   `sheet.posted.1`; `settings.theme` → `settings.theme._` next to `settings.theme.auto`; `settings.graphics` →
   `settings.graphics._` next to `settings.graphics.hint`. Code and specifications use the mapped name; the
   legacy name stays in `keys.json` so a release diff still matches. No other renaming is allowed.
3. The 15 plural objects (`03` §3.1; `back.new` of the return banner is the fifteenth, since legacy release
   `index-DY_DH7h-.js`) become ICU plural messages selected by the argument `n`, with the forms the locale has
   (`one/few/many/other` in ru, `one/other` in uz and en, `map.missing` `one/other` everywhere).
   Placeholders `{name}` are already ICU arguments.
4. Characters that ICU message syntax treats specially (apostrophe, braces that are not placeholders, `#` inside a
   plural, `<`) are escaped; the importer prints every value it changed.
5. The six dead keys are dropped (`feed.historyHint`, `subs.count`, `subs.inFeed`, `subs.edit`, `subs.delete`,
   `subs.modeAria`), the dead-key half of LB-APP-026.
6. Values are otherwise byte-identical to legacy. No wording fix happens in this layer.

**The `homi` layer** overrides a legacy value or adds a key. It holds (a) every key whose legacy value matches
`brand-words.json` — rewritten with the HOMI name, bot and links; (b) HOMI-only keys; (c) a legacy key whose wording
a decision changed — in Wave 1 only `sum.wholeCity` (DEC-54, written by WP-22). Keys added by this package:

| Key | ru | uz | en |
| --- | -- | -- | -- |
| `demo.label` | «Демо-данные» | «Demo maʼlumotlar» | «Demo data» |
| `demo.hint` | «Раздел пока работает на тестовых данных» | «Boʻlim hozircha sinov maʼlumotlarida ishlaydi» | «This section still runs on test data» |
| `fallback.other` | «Другое» | «Boshqa» | «Other» |

Later packages add their keys to the same files and list them in their own specification.

**Runtime rules (fix of LB-APP-002).**

| Situation | Result |
| --------- | ------ |
| key present in the locale | that message |
| key missing in `uz` or `en` | the `ru` message — `getMessages(locale)` deep-merges the locale over `ru` |
| key missing everywhere | the key path as text; never a throw, never an empty string |
| placeholder without a value, or a malformed message | the key path as text |
| any of the three cases above | `reportError(…, { kind: 'i18n' })` once per key per launch (no-op until WP-32) |
| server value used as a label (`type`, `deal`, radar mode, sort, report reason, verdict tone, no-access reason) | `labelFor(table, value)` returns the key from an explicit table, or `fallback.other` for an unknown value and reports once; a key is never built by string concatenation from a server value |

The two hooks of next-intl that turn a formatting error into a report and a fallback string were expected to be
`onError` and `getMessageFallback` — **verify before use**. Verified in use-intl 4.15.1 (`createBaseTranslator`):
for a missing message, a formatting error and an invalid message it calls `onError` and then
`getMessageFallback({ error, namespace, key })`. `createIntlHandlers(report)` therefore reports those from
`getMessageFallback`, by key, and leaves `onError` to the other codes (once per message).

Label tables (`src/labels.ts`): `type`, `deal`, `radarMode` (`subs.mode.*`), `sort`, `reportReason`, `verdictTone`
(the long verdict `fmt.market*` of each tone; WP-22's formatter still decides where the wording depends on the
delta) and the no-access reason as two tables, `noAccessTitle` and `noAccessText`.

`src/locale.ts`: `htmlLang(locale)`; `numberLocale(locale)` (`ru-RU` for ru and uz, `en-GB` for en — the legacy
rule of `03` §3.1; note that `intlLocale` of `@homi/utils` maps `en` to `en-US` and is not used for Mini App
display). Formatters themselves arrive with WP-22.

### Tokens, themes, lite mode (`@homi/ui`)

`frontend/packages/ui/src/styles/`, exported as `@homi/ui/styles.css` and imported by
`frontend/app/styles/app.css` after `@import "tailwindcss"`. Tailwind must also scan the package sources (the
`@source` directive of Tailwind 4 — verify in the Tailwind documentation).

| File | Content |
| ---- | ------- |
| `tokens.css` | the colour roles of `03` §3.6 with the same names and values: `--bg`, `--bg2`, `--text`, `--hint`, `--sheet`, `--material`, `--dim`, `--sep`, `--fill`, `--good`, `--high`, `--warn`, `--heart`, the four `--badge-*` pairs; radii `--r-s 12px`, `--r-m 16px`, `--r-l 24px`, `--r-photo 18px`; `--tabbar-h 62px`; `--bottom-chrome`; `.danger-row` colour `#ff5c5c` |
| `brand.css` | `--accent #ffd23f`, `--accent-text #0b0b0b` — the only colours that belong to the brand |
| `themes.css` | `html[data-scheme="light"]:not([data-theme])` reads `--tg-theme-bg-color`, `--tg-theme-secondary-bg-color`, `--tg-theme-text-color`, `--tg-theme-hint-color` with the light fallbacks; `html[data-theme="light"]` is the fixed light palette; `html[data-scheme="dark"]` is the fixed dark palette. No `prefers-color-scheme` rule |
| `layout.css` | `--top-inset = --tg-safe-area-inset-top + --tg-content-safe-area-inset-top`, `--bottom-inset = --tg-safe-area-inset-bottom` (TMA-017); no `env(safe-area-inset-*)`, no `dvh` / `svh`, no `--tg-viewport-*`; full-screen layers are `position: fixed; inset: 0` (TMA-018); 16 px gutters; feed column ≤ 608 px; system font stack `15px/1.4`, tabular numbers; `html.fullscreen` and `html.chrome-mini` hooks declared, filled by WP-23 |
| `theme.css` | Tailwind `@theme` mapping: colours (`--color-bg` …; Tailwind's default palette is removed with `--color-*: initial`), radii as `rounded-small`, `rounded-medium`, `rounded-large`, `rounded-photo`, `rounded-pill` (`rounded-s` would collide with Tailwind's logical-corner utilities), font, the z-index ladder as named `:root` tokens used as `z-(--z-tabbar)` (map note 5, topbar 10, CTA 20, view toggle 29, tab bar 30, map card and mini title 31, nudge 35, sub-page 40, listing 45, sheet backdrop 50, toast and city sheet 60, viewer and fullscreen map 100, active pin 1000), easing `cubic-bezier(.2,.9,.3,1)`, durations 0.25–0.35 s; the variables shadcn components expect are mapped onto the roles |
| `lite.css` | everything under `html.lite`: no `backdrop-filter`, solid glass, simpler shadows, translate-only chrome collapse, no mini title, `content-visibility: auto` on cards, no radar animation (`03` §1.7). The class is set by WP-21 |
| `motion.css` | keyframes `spin`, `shimmer`, `fade`, `rise`, `rise-in`; `prefers-reduced-motion` stops shimmer and spinner and removes transitions |

Glass is `blur(22px) saturate(190%)` over `--material`. The `color-mix` fallback of legacy is not ported: the
browser floor of DEC-44 supports `color-mix` and `:has()`.

### Base components

Added to `frontend/packages/ui/src/components/` from shadcn/ui (source copied in; the CLI must not change
`package.json` or the lockfile — verify its flags before use): `Button` (variants `primary` accent pill 48 px,
`secondary`, `ghost`, `danger`, `text`; sizes), `Dialog`, `Sheet`, `Switch`, `Tabs`, `ToggleGroup`, `RadioGroup`,
`Skeleton` (shimmer), Radix `Toast` primitive, and `Spinner`. All colours, radii and motion come from the tokens;
no shadcn default palette remains. `cn` becomes `clsx` + `tailwind-merge` if WP-03 installed them, else stays.
Icons are `lucide-react`. `@homi/ui` knows nothing about Telegram or routing. Gesture behaviour (sheet drag,
swipe-back) is WP-23.

### Brand layer

`frontend/app/lib/brand/index.ts` exports `brand`:

| Field | Value |
| ----- | ----- |
| `name` | `HOMI` |
| `botUsername` | `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (already in `.env.example`); empty hides every bot link |
| `storagePrefix` | `homi` (client storage keys are `homi-*`, WP-21) |
| `links.methodology`, `links.instagram`, `links.privacy` | per locale `string \| null`; all `null` until the product owner supplies them; a `null` link hides its row |
| `assets` | paths under `frontend/app/public/brand/`: logo, favicon, mascots `empty-magnifier` and `empty-shrug` (120 px), `hooray` (132 px) |

The legacy artwork is not copied (`25` §2 rule 3). This package ships neutral placeholders of the same sizes; the
final artwork is a product-owner input and replaces the files without a code change. Document title and
`aria-label`s take `brand.name`. A test fails when a string matching `brand-words.json` appears in the merged
catalogues or under `frontend/app` outside `lib/brand`.

### Flags and facades

- `frontend/app/lib/flags.ts`: `devFlags` (`as const`, all `false` as built; DEC-58 later turned five on) and `DevFlags`: `dev001AnyForbiddenShowsAccess`,
  `dev005RadarDropsPostedDays`, `dev010RealtorVoteWording`, `dev013BackClosesMapCard`,
  `dev014TashkentDates`, `dev016ErrorToastOnFailure`, `dev017TenantPetsDailyRule`, `dev018ResetKeepsDaily`,
  `dev019OneDistanceFormatter`, `dev020OneLanguageDetector`, `dev021OneFlowVocabulary`, `dev022RadarCountLabel`,
  `dev023CityCountsIncludeDaily`, `dev024ResetOnlyWithActiveFilters`, `dev025ValidateRanges`, `dev051RentedUndo`,
  `dev052UnifiedBelowMedianRule` — 17 flags. Each has a comment naming its `DEV` row. There is no flag for paged
  favourites and history (DEC-53) or for the whole-city label (DEC-54): both were decided and are plain behaviour
  (WP-29, WP-22). Workspace packages never import this file; they take a rules argument.
  `frontend/app/tests/helpers/flags.ts`: `withDevFlags(overrides, fn)`.
- `frontend/app/lib/analytics/events.ts`: `track(name, props)` typed by the map of the 21 journal events of `03`
  §3.3 (16 at the release first audited, five more since `index-DY_DH7h-.js`);
  `frontend/app/lib/errors/report.ts`: `reportError(error, { kind })`. Both are no-ops that keep the last 20 calls
  in memory for tests; WP-32 implements them.

### Demo marker

- `frontend/app/lib/data/sources.ts`: a tiny store. `reportSource(source)` records `stub | legacy | native` for
  the current address; the set is cleared when the pathname changes. `useHasStubData()`.
- `frontend/app/features/shell/SourceReporter.tsx`: a Client Component a Server Component renders with the
  `meta.source` of what it fetched. WP-22 calls `reportSource` from every fetch path.
- `frontend/app/features/shell/DemoDataMarker.tsx`: mounted in the root layout; when the set contains `stub` it
  shows a small pill with `demo.label` and the accessible description `demo.hint`, fixed under the top inset on
  the trailing side, above the tab bar layer, `pointer-events: none`, never covering a control. It disappears by
  itself when the last method of a screen leaves its stub.

## Files

- New package `frontend/packages/i18n/**` (see the tree above), with the `lint`, `typecheck` and `test` scripts
  the other workspace packages have and its own project in `frontend/vitest.config.ts` (WP-03);
  `frontend/pnpm-lock.yaml` (workspace links; a Radix primitive only in the case named under "Decisions"). The
  config file is `frontend/vitest.config.mts`.
- `frontend/app/package.json`: the workspace dependencies `@homi/config`, `@homi/ui`, `@homi/i18n`
  (`workspace:*`). Today the app declares none — its dependencies are `next`, `react` and `react-dom` only.
  `transpilePackages` is not needed: `transpilePackages.md` says Turbopack compiles workspace packages by itself.
- `frontend/packages/ui/src/styles/{tokens,brand,themes,layout,theme,lite,motion}.css`, `src/styles.css`,
  `src/components/*.tsx`, `src/index.ts`, `package.json` (exports, the Radix primitives);
  `frontend/packages/ui/tests/*.test.ts(x)`.
- `frontend/app/app/**` — the tree above; removed: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`,
  `app/favicon.ico`, `public/{file,globe,next,vercel,window}.svg`.
- `frontend/app/{proxy.ts,next.config.ts}`, `frontend/app/i18n/{routing,request,navigation}.ts`,
  `frontend/app/styles/app.css`, `frontend/app/public/brand/*`.
- `frontend/app/lib/`: `brand/index.ts`, `flags.ts`, `navigation/routes.ts`, `analytics/events.ts`,
  `errors/report.ts`, `data/sources.ts`.
- `frontend/app/features/shell/{RoutePlaceholder,SourceReporter,DemoDataMarker}.tsx`.
- `frontend/app/tests/{navigation,i18n,shell}/*.test.ts(x)`, `frontend/app/tests/helpers/flags.ts`,
  `frontend/app/e2e/foundation.spec.ts`.
- `frontend/app/README.md`. `frontend/app/.env.example` (comments only) and the `CLAUDE.md` "Layout" paragraph (the
  new workspace package) are shared files: they travel in the small follow-up PR after the merge
  (`docs/handoff/parallel-work.md` §2).

## Steps

1. Read the documents listed under "Read before coding". Confirm that WP-03 installed next-intl, the Radix
   packages, `lucide-react`, the class helpers, Vitest, Testing Library and Playwright; if not, stop.
2. Create `@homi/i18n` with `src/locale.ts`, `src/labels.ts` and their unit tests.
3. Write `scripts/import-legacy.mjs` with unit tests on small hand-made inputs (nesting, plural, escaping,
   collision, dropped keys).
4. Copy the three locale files of the pinned release to a scratch directory outside both repositories, run the
   importer, commit the `legacy` layer and `keys.json` as a commit of their own.
5. Fill `brand-words.json`; write the `homi` layer for every key the brand test reports; add the three new keys.
6. Add `src/index.ts` (`getMessages`, merge over `ru`) and the catalogue tests (parity, plural shapes, every
   message formats with dummy arguments, brand words).
7. Wire next-intl (`i18n/*`, plugin), write `[locale]/layout.tsx` and `[locale]/[...rest]/page.tsx`, delete the
   starter files, run `pnpm --filter app build`.
8. Write `proxy.ts` (locale redirect) and its end-to-end cases.
9. Write the token files and `theme.css`; add the token parity test; check light, explicit light and dark by hand
   on a placeholder page.
10. Add the base components, restyled; one smoke test per component.
11. Add `lib/brand`, placeholder assets, document title and favicon.
12. Add `lib/navigation/routes.ts` with table-driven tests for the builders, `isRootTab`, `parentOf`,
    `screenNameOf`.
13. Create the route tree with `RoutePlaceholder` on every page, the two slots, their defaults and catch-alls.
14. Verify interception with the route group: soft navigation from `/` to `/filters` keeps the feed placeholder
    mounted and shows the sheet placeholder; reload on `/filters` shows the direct-load page; Back closes the
    layer. Do the same for `/listing/1` → `/listing/1/photos` (the listing placeholder stays under its child).
15. Add `lib/flags.ts`, the two facades and the test helper.
16. Add the sources store, `SourceReporter`, `DemoDataMarker` and their tests; mount the marker.
17. Update `README.md`, `.env.example` comments and the shared `CLAUDE.md` paragraph; run `make ci-frontend`.

## Behaviour to reproduce

**Localisation.** Three locales `ru`, `uz`, `en` in the address. `<html lang>` follows the segment. All legacy
keys of the pinned release exist with their legacy values except brand words; plural keys select the form by
`Intl` rules of the locale (ru: 1 → one, 2 → few, 5 → many, 11 → many, 21 → one). The rules table above
replaces the legacy `t()` that throws (LB-APP-002): a changed server enum can no longer white-screen the app (`03` §0
finding 4).

**Themes** (`03` §3.6, TMA-019, TMA-021; the attributes are set by WP-21 and WP-31):

| State | `data-scheme` | `data-theme` | Palette |
| ----- | ------------- | ------------ | ------- |
| auto, Telegram light | `light` | absent | Telegram's four colours with light fallbacks |
| explicit light | `light` | `light` | fixed light (`#ffffff`, `#f2f2f7`, `#0f0f10`, `#8a8f98`) |
| dark (auto or explicit) | `dark` | absent or `dark` | fixed dark (`#000000`, `#151517`, `#ececee`, `#8f8f97`, sheet `#151517`) |

The accent stays the brand yellow in every state; Telegram's `button_color` is never used.

**Lite mode** (`03` §1.7): with `html.lite` the CSS effects listed under `lite.css` apply by rule, not per
component. **Reduced motion:** shimmer and spinner stop, transitions are removed.

**Layout.** Phone layout only, no width or orientation breakpoints; safe areas only through the two inset
variables.

**Addresses.**

- `/` → `/ru` (or the cookie's locale) with the query and the fragment intact; `/listing/5?x=1` →
  `/ru/listing/5?x=1`.
- `/de/…` and any unknown address → the not-found placeholder with status 404.
- Every address of the tree answers 200 on a direct load in three locales.
- A soft navigation to a sheet or overlay address keeps the page below mounted; Back removes the layer; a reload
  on that address shows the direct-load page.

**Demo marker.** Shown on a screen as soon as one of its answers reports `stub`; hidden when none does; cleared on
navigation; never intercepts taps.

## Tests

**Unit (Vitest).**

- `packages/i18n/tests/import.test.ts`: dotted key → nested path; plural object → ICU plural with the right forms
  per locale; escaping of apostrophes and stray braces; a leaf that is also a prefix moves to `<key>._` and is
  listed in `leaf-and-prefix.json`; the
  six dead keys are absent; `uz_Latn` → `uz`.
- `packages/i18n/tests/catalogue.test.ts`: the three merged catalogues have identical key sets; the 15 plural keys
  are plural messages; every message formats without an error; ru plural matrix for 1, 2, 5, 11, 12, 14, 21, 22,
  25, 101, 111; no value matches `brand-words.json`; `keys.json` equals the keys of the `legacy` layer.
- `packages/i18n/tests/labels.test.ts`: known values of every table; `type: "villa"` and radar mode `"weekly"`
  give `fallback.other` and one report.
- `packages/ui/tests/tokens.test.ts`: every role, radius, inset and ladder value equals a table typed from `03`
  §3.6; the dark and explicit-light selectors exist; no `prefers-color-scheme` and no `env(safe-area` in the CSS.
- `app/tests/navigation/routes.test.ts`: each builder; `parentOf` and `isRootTab` for every address of the tree,
  plus `/filters?city=x&from=map` → `/map?city=x`, `/sort?rooms_min=2&focus=pets` → `/?rooms_min=2`,
  `/map?draw=1&city=x` → `/map?city=x`, `/listing/5/actions?step=detail` → the same with `step=report`;
  `screenNameOf` for the 16 legacy names including the precedence of `03` §1.1.

**Component (Vitest + Testing Library).**

- `@testing-library/jest-dom` is not installed (WP-03 did not list it), so component tests assert DOM attributes and
  text directly.
- A component asking for an unknown key renders the key path, does not throw, reports once on two renders.
- A message with a missing argument renders the key path.
- `DemoDataMarker`: hidden with `legacy` and `native` only; visible after `reportSource('stub')`; hidden again
  after a pathname change.
- Each base component renders with its variants and carries no hard-coded colour class.

**End to end (Playwright).** `e2e/foundation.spec.ts`:

- redirect `/` → `/ru` keeps `?listing=7` and `#tgWebAppData=x` (read `location.hash` after the redirect);
- with next-intl's cookie set to `uz`, `/` → `/uz`;
- `lang` attribute per locale; unknown locale → 404;
- table-driven direct load of every address × three locales → 200 and the placeholder name;
- soft navigation feed → filters → Back; feed → listing → photos → Back → Back;
- forcing `data-scheme="dark"` and `class="lite"` on `<html>` changes the computed background and removes
  `backdrop-filter` from the glass sample.

## Acceptance checklist

Run in ru, uz and en, and in light, explicit light and dark where a line is visual.

- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build` and the Vitest and Playwright suites are green.
- [ ] No starter file, Geist font or `create-next-app` asset remains in `frontend/app`.
- [ ] Every route of `25` §3.2 exists at the path of the tree and answers on a direct load in three locales.
- [ ] `/` redirects to a locale and keeps the query string and the launch fragment.
- [ ] A sheet address opened by navigation shows over the page below; reload shows its direct-load page; Back
      closes it.
- [ ] A listing child address (`photos`, `market`, `actions`, `location`) keeps the listing placeholder mounted in
      both trees.
- [ ] The interception matcher used with the `(main)` group is recorded in "Handoff".
- [ ] The catalogues are generated from the release pinned by WP-02; the importer's report is attached to the PR.
- [ ] No legacy brand word is visible in any locale; the brand test is green.
- [ ] `messages/legacy/leaf-and-prefix.json` is committed; every listed key is used as `<key>._` and nowhere else
      is a key renamed.
- [ ] A missing key shows its key path and reports once; nothing throws (fix of LB-APP-002).
- [ ] An unknown server enum value shows «Другое» / «Boshqa» / «Other».
- [ ] Token values equal the table of `03` §3.6 in all three theme states.
- [ ] `html.lite` removes blur and animation; reduced motion stops shimmer and spinner.
- [ ] Safe-area variables come only from Telegram's CSS variables (TMA-017); no viewport units of TMA-018 are used.
- [ ] Base components render with tokens only; `@homi/ui` imports nothing from `frontend/app`.
- [ ] `devFlags` exists with every flag `false`.
- [ ] The demo marker appears when a screen reports `stub` and is absent otherwise.
- [ ] The what-next-intl-does items marked "verify before use" are each resolved and noted in the PR description.
- [ ] Staging and production serve the placeholder app after deploy.

## Handoff

- **Shape of the tree.** The slot catch-alls and the not-found page are all `[...rest]`; the page that calls
  `notFound()` is `app/[locale]/(main)/[...rest]/page.tsx` (rule 2). `(.)` inside `(main)/@sheet` and
  `(main)/@overlay` matches the `(main)` routes as written (rule 3).
- **A closed layer stays in the DOM.** With `cacheComponents`, Next.js 16 hides a page it navigated away from in a
  React `<Activity>` (`display: none`, `02-guides/preserving-ui-state.md`) instead of unmounting it. After Back the
  sheet or overlay copy is still in the document, hidden. WP-21 (BackButton depth) and WP-23 (sheets) must test
  visibility, not presence, and reset per-open state in a `useLayoutEffect` cleanup where the guide says so.
- **Invalid parameters.** `/ru/listing/abc`, `/ru/filters/sort`, `/ru/radars/12` render the not-found placeholder,
  but with status `200`: the parameter is runtime data, so `notFound()` runs inside `<Suspense>` after the static
  shell has started streaming (`not-found.md`: "After streaming starts, the status code remains 200"). Unknown
  addresses answer `404`.
- **Locale cookie.** `NEXT_LOCALE` keeps next-intl's default attributes (`SameSite=Lax`). Inside Telegram Web's
  frame a Lax cookie is not sent; WP-21, which writes the locale after sign-in, decides the attributes together
  with `homi_session` (`25` §3.4).
- **next-intl in Client Components.** The root layout passes the merged messages of the locale to
  `IntlClientProvider`; the fallback hooks live there. A later package may narrow the messages per screen.
- **Soft navigation in end-to-end tests.** `window.next.router.push` (Next.js keeps it for debugging in production
  builds) stands in for a `Link` until the shell has real links; `e2e/foundation.spec.ts` uses it.
- **The WP-03 smoke spec** now looks for `[data-route="feed"]` instead of `main`.
- **Merged** on 2026-11-15 on «сливай #52» (merge commit `2ef9b2f`), after `frontend` (run 43696680754) and
  `frontend-e2e` (run 43696680767) were green on `422ef06`; `frontend` run 43697001406 green on `main`. This status,
  the `frontend/app/.env.example` comment and the `CLAUDE.md` update are in the follow-up docs PR.
- **Next:**
  1. ~~review and merge~~ (done);
  2. the production track deploys; staging and production serve the placeholder app (the last box of the
     acceptance checklist);
  3. set the status to `DONE`. WP-21 (Telegram layer and session) builds on this tree.
