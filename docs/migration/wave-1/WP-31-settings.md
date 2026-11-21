# WP-31 — Settings and nudges

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (#101) |
| Depends on | WP-23; the intake of legacy release `index-BnFvC-Ft.js` (the card-style contract); WP-34 (the failure toast), WP-36 (the fallback close of sub-pages), WP-38 (the feed epoch and the scroll memory), WP-39 (the leave of `SubPageFrame`, *added by the intake of `index-YX9bFVws.js`*) |
| Size | ≈ 2 300 changed lines, M; ≈ 2 800 with the card style of the intake of `index-BnFvC-Ft.js` |
| Behaviour reference | `03` §2 (SCR-032 … SCR-039, SCR-041, SCR-048), §1.7 (lite mode), §3.2 (storage), §3.3 (events), §3.4 (constants), §3.5 (time zone), §4, §5, §5b; `05` TMA-019 … TMA-021, TMA-036; task files KV-FE-081, KV-FE-082, KV-FE-083, KV-FE-084, KV-FE-085, KV-FE-086, KV-FE-026, KV-FE-027 |
| Needs from the production track | nothing |

The task files above were written for another architecture. Their states, texts, constants, edge cases and test
ideas are taken; their file layout, navigation stack, API paths and transport are not.

## Goal

The «Настройки» tab and its eight sub-pages work on stubs: theme, graphics, language, currency, quiet hours, digest
time, the card style «Вид карточек» (since legacy release `index-BnFvC-Ft.js`, in Wave 1 by DEC-57) and «Скрытое»,
plus the «О приложении» block. A language change replaces the locale segment of the address and
a currency change refreshes the data, both without reloading the app. The home-screen nudge is offered once, on the
right day count, and only when it was really shown.

## Scope

**In.** Owned audit items: screens SCR-032, SCR-033, SCR-034, SCR-035, SCR-036, SCR-037, SCR-038, SCR-039,
SCR-041 and SCR-048; rules BR-APP-045, BR-APP-051, BR-APP-052, BR-APP-053 and BR-APP-074; defects LB-APP-010,
LB-APP-040, LB-APP-041, LB-APP-051 and LB-APP-052, the decision LB-APP-053 (kept as legacy until it is decided), and
the home-offer half of LB-APP-049 (the slot and its priority are WP-30's).

- The settings screen with its groups, values, loading and error states.
- The eight sub-pages and their save rules; the hidden list with its three "return" actions; the card-style
  picker with the mocks of both bot messages and «Прислать пример в чат».
- The about block: home-screen row, support, Instagram, about text.
- The home-screen nudge inside `NudgeHost`, the visit-day counter and the "added" toast.

**Out.**

- Theme application, graphics detection, storage policy, the home-screen adapter calls: WP-21. This package calls
  `setThemePreference`, `setGraphicsMode`, `tg.homeScreen.*` and does not change them.
- `SubPage`, `ChoiceList`, toast, `failed()`: WP-23. `NudgeHost`, the follow nudge, `useSettings`: WP-30.
- Hiding a listing or blocking an author: WP-26. The radar's delivery mode: WP-30.
- City, news, account and data deletion are not in the legacy Mini App (SCR-032, `05` §2) and are not added; they
  are bot functions (WP-56).
- The first group «Сдаю квартиру» (SCR-032 since `index-CBlEKxdL.js`): WP-82; this package leaves its slot first.
  While `owner_enabled` is `false` the group is hidden for a user without owner listings and shows only «Мои
  объявления» for one with listings (WP-82; the plan's reading of DEC-81, confirmed by the developer on 2026-11-20)
  (*added by the owner-cabinet plan*).

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| Rebuild and parity (DEC-32, DEC-46) | Rebuilt from the audit; the checklist below is the proof of parity |
| Defects and flags (DEC-36) | LB-APP-010, LB-APP-040 and LB-APP-041 are fixed without a flag. Failures that only vibrated in legacy go through `failed()`, which adds the toast only with `dev016ErrorToastOnFailure` (LB-APP-027, owned by WP-23). The flag is on by default since the intake of `index-CIa0Ldj2.js`, because legacy shows «Не получилось сохранить» itself since that release (DEC-58); both branches stay tested (*added by the intake of `index-CIa0Ldj2.js`*) |
| Brand (DEC-40, 25 §2 rule 5) | Name, Instagram, support and legal links come from `lib/brand`; a link that is `null` hides its row. Brand words in texts are overridden in the `homi` catalogue layer |
| Localisation (DEC-44, 25 §3.7) | The locale is the first address segment. Changing the language changes the address, not a stored key |
| Session modes (25 §3.4) | `GET /settings` and `GET /hidden` run on the server when the cookie exists and through `/bff` in header mode; every save is the `updateSettings` Server Action (token argument in header mode) |
| Card styles (DEC-57) | Both styles, «Классический» (`classic`) and «Новый» (`rich`), with the legacy mocks; no «Новое» pill: `features` of `GET /reference` stays `["pets"]`, and the row does not call `useNewFeature('cards')` |
| API methods (25 §4.2) | Methods: `GET /settings`, `PATCH /settings`, `POST /settings/card-sample`, `GET /hidden`, `DELETE /hidden/authors/{id}`, `DELETE /hidden/listings/{number}`, `DELETE /hidden`; `GET /radars` (digest hint only) |
| API conventions (25 §4.1) | The currency of every display string comes from the user's settings, the locale from `Accept-Language`: after either changes, server-formatted values must be fetched again |

Read before coding: `02-guides/internationalization.md` (locale segment, `next/root-params`),
`03-api-reference/04-functions/use-router.md` (`replace`, `refresh`), `03-api-reference/04-functions/cookies.md`
(cookies are written only in Server Functions and Route Handlers), `02-guides/preserving-ui-state.md` (state of
routes kept hidden by `cacheComponents`), `03-api-reference/03-file-conventions/layout.md`. The next-intl router
(`replace` with a `locale` option, its locale cookie) is not in the repository's docs: **verify before use** in the
next-intl documentation.

## Design

### Routes

| Address | File under `app/[locale]/(main)/settings/` | Renders |
| ------- | ------------------------------------------ | ------- |
| `/settings` | `layout.tsx`, `page.tsx` | layout: `<Suspense>` around a server part that loads settings and the hidden list, then `SettingsScreen` and `{children}`; `page.tsx` renders `null` |
| `/settings/theme` | `theme/page.tsx` | `ThemePage` (SCR-033) |
| `/settings/graphics` | `graphics/page.tsx` | `GraphicsPage` (SCR-034) |
| `/settings/language` | `language/page.tsx` | `LanguagePage` (SCR-035) |
| `/settings/currency` | `currency/page.tsx` | `CurrencyPage` (SCR-036) |
| `/settings/quiet-hours` | `quiet-hours/page.tsx` | `QuietHoursPage` (SCR-037) |
| `/settings/digest` | `digest/page.tsx` | `DigestPage` (SCR-038) |
| `/settings/cards` | `cards/page.tsx` | `CardStylePage` (SCR-048); WP-20 has no placeholder for it, and `routes.ts` gains the page name `cards` |
| `/settings/hidden` | `hidden/page.tsx` | `HiddenPage` (SCR-039) |

- The settings screen is the **layout** of the segment (vocabulary rule for layers): it stays mounted and visible
  under a sub-page, so the slide-in and the swipe-back show the list below, and its data is loaded once. The file
  `settings/layout.tsx` already exists as a placeholder in the tree of WP-20 and is replaced here.
- Every sub-page is wrapped in `SubPage` (WP-23): fixed layer, 24 % slide-in, swipe-back except on Android, header
  shadow when scrolled, Telegram Back. Closing is `back()` of `useBack()`; a direct load of a sub-page address
  closes to `/settings`. While the SDK is absent the eight sub-pages show the fallback close through `SubPage`,
  built by WP-36 (legacy since `index-CIa0Ldj2.js`, `05` TMA-047; *added by the intake of `index-CIa0Ldj2.js`*).
- A row opens its page with `router.push(routes.settingsPage(name), { scroll: false })` after a light haptic.
- A hidden listing opens with `router.push(routes.listing(number))`; the `@overlay` slot shows it over the hidden
  page, and Back returns to the list.
- No pull-to-refresh on this tab (rule of WP-23).

### Modules

| Path under `frontend/app/` | Content |
| -------------------------- | ------- |
| `features/settings/SettingsScreen.tsx`, `AboutGroup.tsx` | Groups and rows |
| `features/settings/{ThemePage,GraphicsPage,LanguagePage,CurrencyPage,QuietHoursPage,DigestPage,HiddenPage}.tsx` | Sub-pages |
| `features/settings/{CardStylePage,CardStylePicker,CardPreview}.tsx`, `useCardSample.ts` | SCR-048: the radio group with the two mocks, the hint, the bottom panel; the sample state `idle \| sending \| sent \| failed`, held by the settings layout so that it outlives the sub-page as in legacy (LB-APP-053) |
| `features/settings/useSettings.ts` (from WP-30, extended) | `{ settings, status, error, refetch, patch(optimistic), replace(server) }` |
| `features/settings/useHidden.ts` | `useResource('hidden', …)` with optimistic removal |
| `features/settings/format.ts` (from WP-30, extended) | `quietLabel`, `formatDigestHours`, `graphicsLabel`, `themeLabel` |
| `features/settings/applyProfileChange.ts` | `changeLanguage(locale)`, `changeCurrency(code)` |
| `features/settings/useHomeScreenStatus.ts` | `'unsupported' | 'unknown' | 'missed' | 'added'` for the about row |
| `features/nudges/{homeScreen.ts,useHomeScreenOffer.ts,HomeScreenNudge.tsx}` | Visit days, offer rules, card |
| `lib/actions/settings.ts` (from WP-23, extended) | `updateSettings(patch, auth?)` accepts `locale`, `city`, `theme`, `currency`, quiet hours, digest hours, `card_style`; `sendCardSample(auth?)` (`POST /settings/card-sample`) answers `{ sent }`, `sent: false` for any failure or an answer without a boolean `sent` (LB-APP-052) |
| `lib/actions/hidden.ts` (from WP-26, extended) | adds `unblockAuthorById(id)` (`DELETE /hidden/authors/{id}`, `id` a ULID) and `unhideAll()` (`DELETE /hidden`) next to `unhideListing(number)` — the names WP-22 reserved. `unblockAuthor(number)` of WP-26 is a different method (`DELETE /listings/{number}/blocked-author`) and keeps its name |

### Data

- Server part of the layout: when `getSessionToken()` returns a token, `GET /settings` and `GET /hidden` in
  parallel through `serverApi()`; the results are `initial` props. Without a token (header mode, first paint) the
  client hooks fetch `/bff/settings` and `/bff/hidden`.
- Only the settings request decides loading and error of the screen. The hidden list, the radar list (for the
  digest hint) and the support account fail silently: their rows are simply absent.
- Option lists and current values come from `GET /settings` as WP-11 fixes them: `options.locales` and
  `options.currencies` (`code`, `name`), `options.quiet_hours` (each `null` or `{ from, to }`),
  `options.digest_hours` (each an array of hours); the values `quiet_hours` (`null` = off, or `{ from, to }`) and
  `digest_hours` (array of hours) are structured — the fix of LB-API-050 — and are sent back in the same form.
  `format.ts` is the only place that turns them into «23–08», «Выкл», «9 и 21», and it must render a value that
  is in no preset (set in the bot, Q-API-029).
- Uzbek is `uz` on the v1 wire (25 §4.5); nothing here writes `uz_Latn`.

### Save rules (BR-APP-051)

| Setting | Sequence | On failure |
| ------- | -------- | ---------- |
| Theme | `setThemePreference(next)` at once (page colours, `homi-theme`, Telegram header and background) → `updateSettings({ theme })` | restore the previous preference the same way, `failed()` |
| Graphics | `setGraphicsMode(mode)`: `homi-graphics` set for `full` / `lite`, removed for `auto`, which also clears `homi-graphics-measured`; `html.lite` toggles at once. No request | — |
| Language | rows disabled → `updateSettings({ locale })` → `changeLanguage` | nothing changes, `failed()` |
| Currency | rows disabled → `updateSettings({ currency })` → `changeCurrency` | nothing changes, `failed()` |
| Quiet hours, digest | optimistic `patch` → `updateSettings` → `replace` with the answer | restore the previous settings, `failed()` |
| Card style (BR-APP-074) | nothing when the pick is the current style or a sample is sending; else the sample state back to `idle`, optimistic `patch({ card_style })` with a light haptic → `updateSettings({ card_style })` → `replace` | restore the previous settings, `failed()` |

`failed()` shows «Не получилось сохранить» by default: `dev016ErrorToastOnFailure` is on since the intake of
`index-CIa0Ldj2.js` (DEC-58), and with the flag off a failed save only vibrates (*added by the intake of
`index-CIa0Ldj2.js`*).

`changeLanguage(locale)` — the fix of LB-APP-041, no `location.reload()`:

1. `patchMe({ locale })` of WP-21's session store, so the locale guard (session step 5) agrees with the address —
   also on stubs, where a re-read of `me` would return the old locale.
2. Replace the address with the same route under the new locale segment through the next-intl router (`replace`
   with the `locale` option; verify before use). The search parameters are kept.
3. `invalidate('')` drops every client cache; server parts re-render under the new segment, so texts, number
   formats and server-formatted strings arrive in the new language. Reference data is cached per locale (WP-22) and
   is simply read under the new key.
4. History entries below still carry the old segment. Check that the locale guard also runs on navigation, not only
   at launch, so Back from `/uz/settings/language` lands on `/uz/settings`; extend the guard if it does not.

`changeCurrency(code)`: `patchMe({ currency })`, `router.refresh()` (documented: re-fetches and re-renders Server
Components and keeps client state), `invalidate('')`. `useMoney()` then formats with the new currency, and UZS is
used only when the rate is above 0 (rule of WP-22).

For both: `invalidate('')` does not reach the search feed's list, which `useCursorFeed` holds by its list key. The
feed epoch of WP-38 does: bump it, and forget the feed's scroll memory, where the list must be read again
(*added by the intake of `index-CIa0Ldj2.js`*).

A failed follow-up fetch after a successful save keeps the new language or currency and shows stale strings until
the next load; it never rolls the setting back.

### Home-screen offer (BR-APP-045)

- `homeScreen.ts`: `homi-home` (policy mirrored and restored) = `{ days: string[≤10], offered: boolean }`; a broken
  value reads as `{ days: [], offered: false }`. `recordVisitDay()` adds today's key when it is new and keeps the
  last 10. The key is `Intl.DateTimeFormat('en-CA', { timeZone: displayTimeZone })` with `displayTimeZone` from
  `@homi/config` (Asia/Tashkent) — the fix of LB-APP-010.
- `useHomeScreenOffer` (mounted by `NudgeHost`): calls `recordVisitDay()` once per launch when the session is
  `ready`. It offers when all hold: `tg.isVersionAtLeast('8.0')`; `days.length ≥ 3`; `offered === false`; the host's
  rule for the home slot (feed list, nothing open, no follow nudge or candidate, no return banner or pending return
  check, no toast; BR-APP-046 as of legacy release `index-DY_DH7h-.js`). Then it waits 4 s of the same calm, asks
  `tg.homeScreen.status()` (1.5 s limit → `unknown`), and only for `missed` shows the card, calls
  `track('home_screen_offered')` and then writes `offered: true`. Any other status leaves `offered` false — the fix
  of LB-APP-040.
- A return banner or a follow nudge that takes the slot while the card is on screen hides it without an event and
  writes `offered: false` again, so the offer comes back at a later calm moment — the home part of the fix of
  LB-APP-049 (legacy lets the banner cover the card, which is then used up unseen). The priority itself is
  `NudgeHost`'s (WP-30).
- `tg.homeScreen.onAdded` (registered once): `track('home_screen_added')`, hide the card, status `added`, toast
  `home.added`.

## Files

New, under `frontend/app/`:

- `app/[locale]/(main)/settings/layout.tsx`; `settings/page.tsx` and the seven `settings/<name>/page.tsx` replace
  the WP-20 placeholders; `settings/cards/page.tsx` is new.
- The modules of the table in "Design" that are not marked "from WP-…".
- `tests/settings/{format,applyProfileChange}.test.ts`, `tests/settings/{SettingsScreen,ThemePage,GraphicsPage,
  LanguageCurrencyPages,QuietDigestPages,HiddenPage,AboutGroup}.test.tsx`, `tests/nudges/{homeScreen.test.ts,
  HomeScreenNudge.test.tsx}`.
- `e2e/{settings,settings-language,settings-hidden,home-nudge}.spec.ts`.

Changed:

- `lib/actions/settings.ts`, `lib/actions/hidden.ts`, `lib/api/bffAllowList.ts` (`GET settings`, `GET hidden`);
  `lib/navigation/routes.ts` (the page name `cards`); `frontend/packages/ui/src/icons/index.ts` (`GalleryHorizontal`,
  `Image`, `Check` if missing).
- `features/settings/useSettings.ts`, `features/settings/format.ts`.
- `features/nudges/NudgeHost.tsx` (mounts the home offer in its slot).
- The locale guard of WP-21 if step 4 of `changeLanguage` needs it.
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json`: overrides and the new key listed below.

## Steps

1. Read the Next.js files named above and the next-intl documentation for locale switching. Check in `@homi/types`
   the shapes of the settings answer (lists, value forms) and of the hidden list; note them in the PR.
2. Extend `updateSettings`; add `unblockAuthorById`, `unhideAll`; allow-list entries; unit tests of the
   header-mode token argument.
3. `format.ts` with tests.
4. `settings/layout.tsx` with the server part, `SettingsScreen` (loading, error, groups, row visibility),
   `AboutGroup` without the home row.
5. `ThemePage` and `GraphicsPage`.
6. `QuietHoursPage` and `DigestPage`.
7. `applyProfileChange.ts`, `LanguagePage`, `CurrencyPage`; verify the locale guard on Back.
8. `useHidden`, `HiddenPage` with the three actions and the session-map reset.
9. `homeScreen.ts`, `useHomeScreenStatus`, the about row, `useHomeScreenOffer`, `HomeScreenNudge`, the toast.
9a. The group «Чат с ботом», `sendCardSample`, `useCardSample`, `CardStylePage` with the two mocks (SCR-048).
10. Catalogue overrides and the new key; component tests; Playwright specs in both session modes.
11. Run the checklist in three locales and two themes; update the queue and the handoff.

## Behaviour to reproduce

### Settings screen (SCR-032)

Opens from the tab bar or the Telegram Settings button (wired in WP-21). Loading: centred spinner. Error (settings
failed, nothing loaded): tall `ErrorState` — offline «Нет связи» (`error.offline`) + `error.offlineText`, else «Не
загрузилось» (`common.loadFailed`) + `error.serverText`; «Повторить» (`error.retry`) runs every request again.

Since `index-CBlEKxdL.js` the first group is «Сдаю квартиру» (`own.group`): `SettingsScreen` renders the slot
`ownerGroup` before «Оформление» and this package leaves it empty; WP-82 fills it. While `GET /reference` says
`owner_enabled: false` the group is hidden for a user without owner listings and keeps only «Мои объявления» for one
with listings, so DEC-81's actions stay reachable (WP-82) (*added by the owner-cabinet plan*).

| Group | Rows (key, ru) and values |
| ----- | ------------------------- |
| `settings.group.look` «Оформление» | `settings.theme._` «Тема» (the leaf-and-prefix name of WP-20's importer; options stay `settings.theme.auto` …): «Как в Telegram» / «Светлая» / «Тёмная». `settings.graphics._` «Графика»: «Авто · полная», «Авто · облегчённая», «Полная», «Облегчённая» |
| `settings.group.region` «Язык и валюта» | `notify.language` «Язык»: name of the current language from the list, else its code. `notify.currency` «Валюта»: the same from the currency list |
| `settings.group.notify` «Когда присылать» | `notify.quiet` «Тихие часы»: «23–08» or `notify.quietOff` «Выкл». `notify.digest` «Время подборок»: «9 и 21» (no leading zeros, joined with `notify.and`). Group footer `notify.tz` «Время — ташкентское.» |
| `settings.group.chat` «Чат с ботом» | `settings.cards._` «Вид карточек» (leaf-and-prefix after the import of `index-BnFvC-Ft.js`), icon `GalleryHorizontal` (`@homi/ui` gains it): `settings.cards.classic` «Классический» or `settings.cards.rich` «Новый»; an unknown value shows «Классический» (LB-APP-051). No «Новое» pill (DEC-57) |
| `settings.group.feed` «Лента» | `settings.hidden` «Скрытое» with the count of hidden listings plus blocked authors |
| `settings.group.about` «О приложении» | see "About block" |

- The graphics row is shown only on Android (`tg.platform()` or the User-Agent) or when `homi-graphics` is set;
  decided once on mount (BR-APP-052).
- The «Лента» group is shown only when hidden listings plus blocked authors > 0 (BR-APP-053); it appears when the
  hidden list arrives and disappears after everything was returned.
- Rows are buttons with a right-aligned value and a chevron; long values truncate.

### About block

| Row | Shown when | Action |
| --- | ---------- | ------ |
| `settings.home` «Значок на экране телефона» with value `home.add` «Добавить» | home-screen status is `missed` or `unknown` | `tg.homeScreen.add()` (Telegram's own dialog, SCR-044) |
| `settings.support` «Написать в поддержку» | reference data has a support account (`bot.support_username`) | `tg.openLink(supportUrl(username))` of WP-21 |
| `settings.instagram` «Мы в Instagram» with the handle as value | `brand.links.instagram[locale]` is set | `tg.openLink(brand.links.instagram[locale])` |
| `settings.privacy` (new key) | `brand.links.privacy` is set | `tg.openLink(brand.links.privacy[locale])` |
| `settings.about` (static text) | always | — |

Legacy has no privacy row in the Mini App. Whether HOMI shows one is a brand-layer decision that waits for the
legal texts of Q-SEC-021; with the link `null` (the default) the screen has exactly the legacy rows. The legacy
Instagram account is not HOMI's: the row stays hidden until the brand layer has HOMI's own.

### Card style «Вид карточек» (SCR-048, BR-APP-074)

*Added by the intake of legacy release `index-BnFvC-Ft.js`.* A `bare` sub-page with the title `settings.cards._`:

- two options side by side in a `role="radiogroup"`, each a `role="radio"` button with `aria-checked`, holding a
  mock of the bot's message (`aria-hidden`), the name `settings.cards.classic` / `settings.cards.rich` and the hint
  `settings.cards.classicHint` / `settings.cards.richHint`;
- «Классический»: a photo placeholder (icon `Image`), caption lines 🏠 `settings.cards.demo.title` (bold),
  💰 `.price` (bold), 📊 `.median`, 📍 `.place`, 🏢 `.area`, 🏠 `.owner`, the quote `.quote`; button rows
  [📱 📍] [🔗 📷 +5] [⭐ …];
- «Новый»: a photo placeholder with four dots, `.price` as a heading, `.title` in bold, 📊 `.median`, a table
  `.rowDistrict` / `.district`, `.rowMetro` / `.metro`, `.rowArea` / `.areaShort`, `.rowOwner` / `.ownerShort`, the
  line `.details` with «›»; button rows [📱 📍] [🔗 ⭐] [… ];
- the mock texts are those of the catalogue; since legacy release `index-CIa0Ldj2.js` the en mocks read
  «Yunusabad» (`settings.cards.demo.place` «Yunusabad · Minor metro», `.district` «Yunusabad»; before it
  «Yunusobod») (*added by the intake of `index-CIa0Ldj2.js`*);
- the hint `settings.cards.hint`; a bottom panel with the full-width primary button `settings.cards.send`
  «Прислать пример в чат», disabled with a spinner and `settings.cards.sending` while sending; `sent` shows a check,
  `settings.cards.sent` and the second line `settings.cards.minimize`; `failed` shows `settings.cards.failed`.

The button plays a light haptic and calls `sendCardSample`; `sent: true` → the success haptic, `sent: false` or a
failure → the warning haptic. The result stays until the next pick or until the Settings tab unmounts (LB-APP-053,
legacy behaviour until decided). The styles of the mocks follow the legacy `card-style.css` as tokens (DEC-46: small
visual differences are accepted).

### Theme (SCR-033) and graphics (SCR-034)

- Theme options `auto` «Как в Telegram», `light` «Светлая», `dark` «Тёмная»; the current one has a check. Picking
  another: light haptic, the whole app and Telegram's header re-colour before the request ends; a failed save puts
  the previous theme and check back. Picking the current value sends nothing. Two quick picks end on the last one.
- Graphics options in the order `auto`, `full`, `lite`: «Авто · полная» or «Авто · облегчённая» (from the measured
  state), «Полная», «Облегчённая»; hint `settings.graphics.hint` «Облегчённая — без размытия под панелями и на
  фото: на слабых телефонах лента листается плавнее. «Авто» включает её сама, если телефон слабый или лента
  подтормаживает.». Device-local, no request; blur, shadows and the radar animation switch at once.

### Language (SCR-035) and currency (SCR-036)

- Language: options from the settings answer; hint `notify.languageHint` «Для приложения, бота и карточек
  объявлений.». Currency: options such as «Доллары ($)», «Сумы»; hint `notify.currencyHint` «Цены в ленте, на карте
  и в карточках бота.».
- While a save runs the rows are disabled and the check stays on the old value. On success the check moves; texts,
  numbers and prices switch in place; the open sub-page stays open; the session maps (favourites, seen, hidden),
  the filters in the address and the scroll of the screen below survive; no second launch event is sent.
- A second pick waits for the first; the final state is the last choice.

### Quiet hours (SCR-037) and digest time (SCR-038)

- Quiet hours: preset rows («23–08», «Выкл»); hint `notify.quietHint` «Карточки не приходят; всё, что появилось за
  ночь, — одной подборкой утром.».
- Digest: preset rows («9», «9 и 21»); hint `notify.digestHint` «Во сколько присылать новое от радаров в режиме
  «Подборкой».» when an active radar in digest mode exists, else `notify.digestHintNone` «Для радаров в режиме
  «Подборкой» — режим переключается в карточке радара, вкладка «Радар».»; then `notify.tz`.
- A pick (also of the current value, as legacy) checks the row at once and saves; the answer replaces the local
  settings. A later answer wins over an earlier one; a failed earlier request does not undo a later success.
- A current value that is in no preset is shown in the settings row and no option is checked. An empty preset list
  renders only the hint.
- The radar sheet reads the same `useSettings()` data, so its «Списком в …» follows without a refetch.

### Hidden «Скрытое» (SCR-039)

| Part | Content |
| ---- | ------- |
| Intro | `hidden.intro` «Эти объявления и авторы не приходят ни в ленту, ни в радар.» |
| Empty | `hidden.empty` «Ничего не скрыто» |
| `hidden.authors` «Заблокированные авторы» | phone or channel icon; bold label (phones carry the replay-mask class); `hidden.phone` «Номер» or `hidden.channel` «Канал» · «N объявлений» (plural `listings`) or `hidden.noListings` «сейчас нет объявлений»; `hidden.return` «Вернуть» |
| `hidden.listings` «Скрытые объявления» | thumbnail (empty square when missing); price or `card.negotiable` «Цена договорная»; title · district; tap opens the listing; `hidden.return` «Вернуть» |
| Footer | `hidden.all` «Показать всё снова» |

- Return an author: `unblockAuthorById(id)` with the entry id of the list (`DELETE /hidden/authors/{id}`).
- Return a listing: `unhideListing(number)` (`DELETE /hidden/listings/{number}`).
- Return all: `tg.confirm(hidden.confirmAll)` «Снова показывать все скрытые объявления и заблокированных
  авторов?»; Cancel sends nothing; OK → `unhideAll()` (`DELETE /hidden`).
- Each action: light haptic, the row leaves at once, then the request. Success: success haptic,
  `resetHidden()` of WP-22's session maps, a bump of the feed epoch and the feed's scroll memory forgotten (the two
  functions WP-38 exports; legacy reloads the search feed on a change of the hidden list since
  `index-CIa0Ldj2.js`), and `invalidate` of the map points, the count and the radar previews, so returned items
  show again without a manual refresh. Failure: only that row comes back, `failed()`. A failed «Показать всё
  снова» restores only the rows that action removed; rows returned by other actions meanwhile stay returned
  (legacy since `index-CIa0Ldj2.js`; *added by the intake of `index-CIa0Ldj2.js`*).
- An unknown author kind renders a generic icon and the server label. When the list empties, the page shows
  «Ничего не скрыто» and stays open.

### Home-screen nudge (SCR-041)

Card in `NudgeHost`: smartphone icon; `home.title` «HOMI на экране телефона»; `home.what` «Открывать в одно
касание, как обычное приложение»; «Добавить» (`home.add`); × (aria `common.close`). No Back handler; a tap outside
does not close it.

| Ends by | Effect |
| ------- | ------ |
| 10 s | hide, no event |
| × | hide, `track('home_screen_closed')` |
| «Добавить» | medium haptic, hide, `tg.homeScreen.add()` |
| A return banner or a follow nudge takes the slot | hide, no event, `offered: false` again (LB-APP-049) |
| Telegram reports "added" (from the card, the settings row or Telegram's own menu) | `track('home_screen_added')`, card and settings row disappear, toast `home.added` «Значок HOMI добавлен на экран телефона» |

Nothing renders and no home-screen call is made below Telegram 8.0 or outside Telegram. The offer waits while a
follow nudge, its candidate, a return banner, a pending return check or a toast is present (BR-APP-046, owned by
WP-30).

### New and overridden texts

New key (`homi` layer): `settings.privacy` — ru «Политика конфиденциальности», uz «Maxfiylik siyosati», en
«Privacy policy».

Brand overrides to check and add in the `homi` layer: `settings.about` «HOMI собирает объявления из открытых
Telegram-каналов. В каждой карточке — ссылка на оригинал.», `home.title`, `home.added` (texts above). The uz and en
overrides replace the brand word only. The Instagram handle is not a catalogue text; it comes from the brand layer.

## Tests

**Unit (Vitest).**

- `format.test.ts`: quiet `null`, `{ from: 23, to: 8 }`, `{ from: 0, to: 9 }`; digest `[9]`, `[9, 21]`,
  `[12, 20]`, a non-array, an empty list; graphics labels for auto lite and auto full.
- `applyProfileChange.test.ts`: language → session store, address replace with the new segment and kept search
  parameters, `invalidate('')`, no reload call; currency → session store, `router.refresh()`, `invalidate('')`;
  a failed save changes nothing; `uz` is sent as `uz`.
- `homeScreen.test.ts` (fake clock, fake adapter): day key at 18:59 and 19:00 UTC (00:00 Tashkent); the same day
  twice adds nothing; 11 days keep the last 10; broken JSON; status limit 1.5 s → `unknown`; `offered` stays false
  for `unknown`, `unsupported`, `added` and becomes true only after the card was shown.

**Component (Vitest + Testing Library).**

- `SettingsScreen`: row matrix (Android × stored graphics mode; hidden count 0 and 2; support known or not;
  Instagram and privacy links set or `null`; home status); unknown language code falls back to the code; error
  state and retry.
- `ThemePage`: pick applies before the save resolves; failure restores; same value sends nothing; both values of
  `dev016ErrorToastOnFailure`.
- `GraphicsPage`: each mode writes or clears storage and toggles `html.lite`; auto label variants.
- `LanguageCurrencyPages`: rows disabled while saving; check moves only on success.
- `QuietDigestPages`: optimistic check, rollback, answer replaces state, both digest hints, value outside presets.
- `HiddenPage`: authors only, listings only, both, empty, unknown kind; plural forms 1, 3, 5; rollback of one row;
  confirm cancel; a failed «Показать всё снова» restores what it removed and leaves a row returned meanwhile returned;
  a success bumps the feed epoch and forgets the feed's scroll memory (*added by the intake of `index-CIa0Ldj2.js`*).
- `CardStylePage`: a pick saves optimistically and the answer replaces it; the failure restores; the current style
  sends nothing; a pick while sending sends nothing; a pick resets the result; `sent: true`, `sent: false`, a
  failure and an answer without `sent` (a mocked action) give the right line and haptic; the result survives
  closing and reopening the sub-page; an unknown `card_style` shows «Классический»; no «Новое» pill.
- `HomeScreenNudge`: 10 s timeout without event; × event; «Добавить» calls the adapter; refused while a follow
  nudge or a return check is pending; displaced by a return banner or a follow nudge → hidden, no event,
  `offered: false`, offered again at the next calm moment.

**End to end (Playwright, fake Telegram, cookie mode and header mode).**

- `settings.spec.ts`: tab → groups and values of the stub; each row opens its page and Back returns; theme pick
  changes `data-scheme`; quiet and digest picks update the row value; direct load of `/settings/theme` closes to
  `/settings`.
- `settings-language.spec.ts`: ru → en changes the address segment and the tab labels with no document reload (a
  marker set on `window` before the switch is still there); Back from the language page lands under the new
  segment; currency switch: an amount the client formats (the presets of the price quick filter) reads in сум
  and the server parts are requested again. The stub's server-formatted card prices do not follow the setting —
  that half is ticked on real sources in WP-48.
- `settings-hidden.spec.ts`: return an author, return a listing, return all with confirm; open a hidden listing and
  Back.
- `settings-cards.spec.ts`: the row shows «Классический»; the scenario `card_rich` shows «Новый»; a pick sends
  `PATCH /settings {card_style}`; «Прислать пример в чат» shows the sent line, the scenario `card_sample_unsent`
  the failure line.
- `home-nudge.spec.ts`: three stored days and status `missed` → card after 4 s and `offered: true` in
  `homi-home` (the `home_screen_offered` event is asserted in `homeScreen.test.ts` — the `track` facade sends
  nothing before WP-32); status `unknown` → no card and `offered` false; the "added" event → toast and no
  settings row.

## Acceptance checklist

Run in ru, uz, en and in light and dark; cookie mode and header mode where a request is involved.

- [ ] «Настройки» shows the six groups with the legacy rows, values and order (five before legacy release
      `index-BnFvC-Ft.js`); spinner first; a failed load shows
      the error state and «Повторить» recovers.
- [ ] The Telegram Settings button opens the tab from any screen with no sheet left over it.
- [ ] The graphics row appears on Android or after the mode was changed, not otherwise.
- [ ] «Скрытое» appears only when something is hidden and shows the right count.
- [ ] Every row opens its sub-page with the slide-in; Back, swipe-back (not on Android) and a direct load close to
      the settings list.
- [ ] Theme: each option re-colours the app and Telegram's header at once and survives a relaunch.
- [ ] Graphics: «Облегчённая» removes blur at once; «Авто» shows the measured mode in its label; no request is
      sent.
- [ ] Language: the address segment, all texts and number formats change without a reload; filters, open tab and
      session favourites survive; Back stays in the new language.
- [ ] Currency: prices in the feed, on the map and in an open listing change without a reload. On stubs only the
      amounts the client formats change (presets, market scale); server-formatted prices are ticked in WP-48.
- [ ] A failed language or currency save changes nothing.
- [ ] «Чат с ботом» › «Вид карточек»: both mocks, the current one checked; a pick saves and the row shows it; the
      sample button gives the sent line with the minimise hint, or the failure line; no «Новое» pill (DEC-57).
- [ ] Quiet hours: «Выкл» and each preset check at once; the settings row shows the new value.
- [ ] Digest time: presets check at once; the hint text depends on an active digest radar; «Время — ташкентское.»
      follows it; the radar sheet shows the new hours.
- [ ] Hidden list: intro, both groups, masked phones, correct plurals, thumbnails, «Цена договорная».
- [ ] «Вернуть» on an author and on a listing removes the row; the listing is back in the feed without a refresh.
- [ ] «Показать всё снова» asks first; Cancel keeps everything; OK leaves «Ничего не скрыто».
- [ ] Tapping a hidden listing opens it over the list; Back returns to the list.
- [ ] About block: support row only with a support account; no Instagram and no privacy row while the brand links
      are empty; the about text names HOMI.
- [ ] Home-screen row shows «Добавить» while the icon is missing and disappears after adding.
- [ ] Home-screen nudge: appears once, after three visit days, 4 s after the feed is calm; hides after 10 s; never
      together with the follow nudge, the return banner or a toast, and a card they push away comes back later;
      not on Telegram below 8.0.
- [ ] After adding the icon the toast «Значок HOMI добавлен на экран телефона» shows once.
- [ ] A launch at 02:00 Tashkent time counts for that Tashkent day.
- [ ] No text shows the legacy brand name; the demo marker is visible while settings come from stubs.
- [ ] A failed save shows «Не получилось сохранить»: `dev016ErrorToastOnFailure` is on by default (DEC-58). With
      the flag off it only vibrates; both branches pass their tests.
- [ ] Without the SDK (`launchApp(page, { sdk: false })`) each of the eight sub-pages shows the fallback close, and
      it closes the sub-page (*added by the intake of `index-CIa0Ldj2.js`*).

## As built

The package is built as designed. These points were decided in the code (rule 6); they are listed for the reviewer.

- **The language switch, checked in the browser first.** A replace of the address with another locale segment renders
  in place under the one root layout. A marker on `window` survived, the session was not exchanged again, and the
  body, the tab bar and the settings list stayed the same nodes. So `changeLanguage` only gives the profile the new
  locale (`patchMe`). The locale guard of WP-21 (`LocaleGuard`), which follows `me.locale` on every navigation,
  replaces the address, keeping the search, through next-intl's router, which writes its locale cookie. The same guard
  sends Back from an entry with the old segment to the new one, so step 4 needed no change. The reads run again only
  once the document's `lang` is the new locale (a `MutationObserver` on it, not an effect of a screen, so a tab switched
  before the answer still gets its reads): `bffFetch` takes its `Accept-Language` from that attribute.
- **What the rows read.** The language row reads the address's locale and the currency row the profile's currency
  (`me.currency`), not the settings answer. On stubs `GET /settings` always answers the fixture (KI-68), so a saved
  language or currency would otherwise read old after the reads that follow it.
- **No request for the checked preset.** The design says a pick of the current quiet-hours or digest preset saves
  again, as legacy does. `ChoiceList` (Radix RadioGroup) reports no pick of the checked option, as for the theme,
  language and currency, so nothing is sent; the setting is unchanged either way.
- **One save rule for the presets** (`usePresetSave`: quiet hours, digest, card style). The change shows at once.
  Next sends Server Actions one at a time, each after the answer of the one before (a save repeated after a
  re-authentication joins the queue again), so the answers arrive in the order the server took the writes and the
  last success to arrive is what it holds. While the latest pick waits, earlier answers change nothing on screen; the
  latest one's success is shown, and its failure puts back the last success that arrived meanwhile, else the settings
  before the saves. A success that arrives after the latest pick settled is shown. The theme restores by the same
  rule.
- **Language and currency rows are disabled while a save runs**, so the second pick of the design ("waits for the
  first") cannot happen.
- **The hidden list's follow-up.** The design names "the map points, the count and the radar previews":
  - the radar lists are invalidated (`invalidate("radars")`);
  - the map's points now follow the feed epoch (`useMapPoints`: a bump asks the same search again and keeps the points
    until the answer, whose `responseId` stays, so the camera and an open card stay), which also covers a language or
    currency change and WP-38's long return. Only an answer the camera could fit keeps the id — one with points, or
    any answer for a drawn area: before the first answer, or after one without points, the next answer fits;
  - the live count of the filter sheets is read anew whenever a sheet opens, so nothing keeps it.
  A failure puts back exactly the rows its change removed, among the rows shown now, in the list's order as first read.
  Legacy's `applyChange` filtered the rows of before the change, which lost a row that a second failure had put back
  (two «Вернуть» that fail in turn); a row returned before a change began stays returned, a change that fails after a
  «Показать всё снова» succeeded puts nothing back, and a successful «Показать всё снова» empties the list even of a
  row another failure put back meanwhile (the server returned it too). Each change starts from the list shown at that
  moment, so a confirm that waited sees a row put back meanwhile. When a row leaves, the
  focus moves to the next row's «Вернуть», else to the previous one's, else to the page (the last row takes
  «Показать всё снова» with it).
- **The «Лента» count** is the sum of hidden listings and blocked authors (legacy's), shown as the row's value.
- **«О приложении».** Without an Instagram icon in lucide the row has a camera icon; it shows only once the brand layer
  has HOMI's own link. The support row opens `t.me/<support>` through `tg.openLink`.
- **The card-style mocks** follow legacy's `card-style.css` as Tailwind classes on the tokens. The two options are a
  radio group with one Tab stop and the arrow keys, locked (focus included) while a sample is on its way. The sample
  result is a small store that the screen resets when the
  tab unmounts; an answer that arrives after a reset is dropped, as legacy's is with its screen. The result line is a
  polite live region.
- **The home offer.** The card's frame, button and × moved from `FollowNudge.tsx` to `features/nudges/NudgeFrame.tsx`,
  so the card does not pull the subscribe flow. `tg.haptic` gained `warning()` (the card sample's failure). The visit
  day is recorded once per launch when the session is ready; `homi-home` is a synced key since WP-21.
- **Graphics.** `lib/graphics.ts` gained `autoIsLite()`, what `auto` chooses on this device, for the label «Авто · …»
  of the page; `isLiteGraphics` uses it.
- **Theme.** `features/settings/themeChoice.ts` wraps `setThemePreference` with a listener set, so the settings
  screen, which stays mounted under the theme page, follows a pick.
- **Specs that used the settings placeholder.** The two theme checks of `foundation.spec.ts` read the glass sample and
  a primary button on the development gallery now; no placeholder route is left. The route tree check gained
  `/settings/cards`.
- **Server read and hydration.** The layout's `<Suspense>` fallback is a static spinner with no reads: a fallback that
  read would keep the server read from being adopted and read twice. The graphics row is decided once on the client
  (`useSyncExternalStore` with a server snapshot of "hidden"), so the server render cannot mismatch it.
- **Accessibility.** The screen's root is a `div` (the shell holds the `main`). The groups are sections without an
  accessible name, so the screen and an open page are the only regions; a group is found by its heading.
- **Size.** About 1 900 changed lines of code and 1 900 of tests and specs: above the estimate, by the tests. Steps 9
  and 9a were not split off.

Not done here: the acceptance checklist inside Telegram on staging (production track), and the sentence of `CLAUDE.md`
that still names the settings placeholder (a shared file: a separate small PR).

## Handoff

Finished: every step, with unit, component and end-to-end tests; three independent review rounds, their findings at
medium and above fixed; PR #101.
Nothing is half-done. Known and left: a direct load of a sub-page address may read the settings once more in the
browser before the layout's server read arrives (the shown data is the same). Next: the queue's next
package; the production track's deploy and the acceptance checklist on staging.
