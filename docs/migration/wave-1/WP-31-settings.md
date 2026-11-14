# WP-31 — Settings and nudges

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-23 |
| Size | ≈ 2 300 changed lines, M |
| Behaviour reference | `03` §2 (SCR-032 … SCR-039, SCR-041), §1.7 (lite mode), §3.2 (storage), §3.3 (events), §3.4 (constants), §3.5 (time zone), §4, §5, §5b; `05` TMA-019 … TMA-021, TMA-036; task files KV-FE-081, KV-FE-082, KV-FE-083, KV-FE-084, KV-FE-085, KV-FE-086, KV-FE-026, KV-FE-027 |
| Needs from the production track | nothing |

The task files above were written for another architecture. Their states, texts, constants, edge cases and test
ideas are taken; their file layout, navigation stack, API paths and transport are not.

## Goal

The «Настройки» tab and its seven sub-pages work on stubs: theme, graphics, language, currency, quiet hours, digest
time and «Скрытое», plus the «О приложении» block. A language change replaces the locale segment of the address and
a currency change refreshes the data, both without reloading the app. The home-screen nudge is offered once, on the
right day count, and only when it was really shown.

## Scope

**In.** Owned audit items: screens SCR-032, SCR-033, SCR-034, SCR-035, SCR-036, SCR-037, SCR-038, SCR-039 and
SCR-041; rules BR-APP-045, BR-APP-051, BR-APP-052 and BR-APP-053; defects LB-APP-010, LB-APP-040 and LB-APP-041.

- The settings screen with its groups, values, loading and error states.
- The seven sub-pages and their save rules; the hidden list with its three "return" actions.
- The about block: home-screen row, support, Instagram, about text.
- The home-screen nudge inside `NudgeHost`, the visit-day counter and the "added" toast.

**Out.**

- Theme application, graphics detection, storage policy, the home-screen adapter calls: WP-21. This package calls
  `setThemePreference`, `setGraphicsMode`, `tg.homeScreen.*` and does not change them.
- `SubPage`, `ChoiceList`, toast, `failed()`: WP-23. `NudgeHost`, the follow nudge, `useSettings`: WP-30.
- Hiding a listing or blocking an author: WP-26. The radar's delivery mode: WP-30.
- City, news, account and data deletion are not in the legacy Mini App (SCR-032, `05` §2) and are not added; they
  are bot functions (WP-56).

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| Rebuild and parity (DEC-32, DEC-46) | Rebuilt from the audit; the checklist below is the proof of parity |
| Defects and flags (DEC-36) | LB-APP-010, LB-APP-040 and LB-APP-041 are fixed without a flag. Failures that only vibrated in legacy go through `failed()`, which adds the toast only with `dev016ErrorToastOnFailure` (LB-APP-027, owned by WP-23) |
| Brand (DEC-40, 25 §2 rule 5) | Name, Instagram, support and legal links come from `lib/brand`; a link that is `null` hides its row. Brand words in texts are overridden in the `homi` catalogue layer |
| Localisation (DEC-44, 25 §3.7) | The locale is the first address segment. Changing the language changes the address, not a stored key |
| Session modes (25 §3.4) | `GET /settings` and `GET /hidden` run on the server when the cookie exists and through `/bff` in header mode; every save is the `updateSettings` Server Action (token argument in header mode) |
| API methods (25 §4.2) | Methods: `GET /settings`, `PATCH /settings`, `GET /hidden`, `DELETE /hidden/authors/{id}`, `DELETE /hidden/listings/{number}`, `DELETE /hidden`; `GET /radars` (digest hint only) |
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
| `/settings/hidden` | `hidden/page.tsx` | `HiddenPage` (SCR-039) |

- The settings screen is the **layout** of the segment (vocabulary rule for layers): it stays mounted and visible
  under a sub-page, so the slide-in and the swipe-back show the list below, and its data is loaded once. This adds
  `settings/layout.tsx` to the tree of WP-20.
- Every sub-page is wrapped in `SubPage` (WP-23): fixed layer, 24 % slide-in, swipe-back except on Android, header
  shadow when scrolled, Telegram Back. Closing is `back()` of `useBack()`; a direct load of a sub-page address
  closes to `/settings`.
- A row opens its page with `router.push(routes.settingsPage(name), { scroll: false })` after a light haptic.
- A hidden listing opens with `router.push(routes.listing(number))`; the `@overlay` slot shows it over the hidden
  page, and Back returns to the list.
- No pull-to-refresh on this tab (rule of WP-23).

### Modules

| Path under `frontend/app/` | Content |
| -------------------------- | ------- |
| `features/settings/SettingsScreen.tsx`, `AboutGroup.tsx` | Groups and rows |
| `features/settings/{ThemePage,GraphicsPage,LanguagePage,CurrencyPage,QuietHoursPage,DigestPage,HiddenPage}.tsx` | Sub-pages |
| `features/settings/useSettings.ts` (from WP-30, extended) | `{ settings, status, error, refetch, patch(optimistic), replace(server) }` |
| `features/settings/useHidden.ts` | `useResource('hidden', …)` with optimistic removal |
| `features/settings/format.ts` (from WP-30, extended) | `quietLabel`, `formatDigestHours`, `graphicsLabel`, `themeLabel` |
| `features/settings/applyProfileChange.ts` | `changeLanguage(locale)`, `changeCurrency(code)` |
| `features/settings/useHomeScreenStatus.ts` | `'unsupported' | 'unknown' | 'missed' | 'added'` for the about row |
| `features/nudges/{homeScreen.ts,useHomeScreenOffer.ts,HomeScreenNudge.tsx}` | Visit days, offer rules, card |
| `lib/actions/settings.ts` (from WP-23, extended) | `updateSettings(patch, auth?)` accepts `locale`, `city`, `theme`, `currency`, quiet hours, digest hours |
| `lib/actions/hidden.ts` (from WP-26, extended) | adds `unblockAuthor(id)`, `clearHidden()` next to `unhideListing(number)` |

### Data

- Server part of the layout: when `getSessionToken()` returns a token, `GET /settings` and `GET /hidden` in
  parallel through `serverApi()`; the results are `initial` props. Without a token (header mode, first paint) the
  client hooks fetch `/bff/settings` and `/bff/hidden`.
- Only the settings request decides loading and error of the screen. The hidden list, the radar list (for the
  digest hint) and the support account fail silently: their rows are simply absent.
- Option lists (languages, currencies, quiet presets, digest presets) and current values come from `GET /settings`
  per the contract. If the contract moved a list to `GET /reference`, read it from `useReference()`. Values may be
  the legacy strings (`23-08`, `off`, `09,21`) or structured values (the fix of LB-API-050); `format.ts` is the only
  place that knows which, and it must render a value that is in no preset (set in the bot, Q-API-029).
- Uzbek is `uz` on the v1 wire (25 §4.5); nothing here writes `uz_Latn`.

### Save rules (BR-APP-051)

| Setting | Sequence | On failure |
| ------- | -------- | ---------- |
| Theme | `setThemePreference(next)` at once (page colours, `homi-theme`, Telegram header and background) → `updateSettings({ theme })` | restore the previous preference the same way, `failed()` |
| Graphics | `setGraphicsMode(mode)`: `homi-graphics` set for `full` / `lite`, removed for `auto`, which also clears `homi-graphics-measured`; `html.lite` toggles at once. No request | — |
| Language | rows disabled → `updateSettings({ locale })` → `changeLanguage` | nothing changes, `failed()` |
| Currency | rows disabled → `updateSettings({ currency })` → `changeCurrency` | nothing changes, `failed()` |
| Quiet hours, digest | optimistic `patch` → `updateSettings` → `replace` with the answer | restore the previous settings, `failed()` |

`changeLanguage(locale)` — the fix of LB-APP-041, no `location.reload()`:

1. Update `me.locale` in the session store, so the locale guard of WP-21 (session step 5) agrees with the address.
2. Replace the address with the same route under the new locale segment through the next-intl router (`replace`
   with the `locale` option; verify before use). The search parameters are kept.
3. `invalidate('')` drops every client cache; server parts re-render under the new segment, so texts, number
   formats and server-formatted strings arrive in the new language. Reference data is cached per locale (WP-22) and
   is simply read under the new key.
4. History entries below still carry the old segment. Check that the locale guard also runs on navigation, not only
   at launch, so Back from `/uz/settings/language` lands on `/uz/settings`; extend the guard if it does not.

`changeCurrency(code)`: update `me.currency`, `router.refresh()` (documented: re-fetches and re-renders Server
Components and keeps client state), `invalidate('')`. `useMoney()` then formats with the new currency, and UZS is
used only when the rate is above 0 (rule of WP-22).

A failed follow-up fetch after a successful save keeps the new language or currency and shows stale strings until
the next load; it never rolls the setting back.

### Home-screen offer (BR-APP-045)

- `homeScreen.ts`: `homi-home` (policy mirrored and restored) = `{ days: string[≤10], offered: boolean }`; a broken
  value reads as `{ days: [], offered: false }`. `recordVisitDay()` adds today's key when it is new and keeps the
  last 10. The key is `Intl.DateTimeFormat('en-CA', { timeZone: displayTimeZone })` with `displayTimeZone` from
  `@homi/config` (Asia/Tashkent) — the fix of LB-APP-010.
- `useHomeScreenOffer` (mounted by `NudgeHost`): calls `recordVisitDay()` once per launch when the session is
  `ready`. It offers when all hold: `tg.isVersionAtLeast('8.0')`; `days.length ≥ 3`; `offered === false`; the host's
  rule for the home slot (feed list, nothing open, no follow nudge or candidate, no toast). Then it waits 4 s of
  the same calm, asks `tg.homeScreen.status()` (1.5 s limit → `unknown`), and only for `missed` shows the card,
  calls `track('home_screen_offered')` and then writes `offered: true`. Any other status leaves `offered` false —
  the fix of LB-APP-040.
- `tg.homeScreen.onAdded` (registered once): `track('home_screen_added')`, hide the card, status `added`, toast
  `home.added`.

## Files

New, under `frontend/app/`:

- `app/[locale]/(main)/settings/layout.tsx`; `settings/page.tsx` and the seven `settings/<name>/page.tsx` replace
  the WP-20 placeholders.
- The modules of the table in "Design" that are not marked "from WP-…".
- `tests/settings/{format,applyProfileChange}.test.ts`, `tests/settings/{SettingsScreen,ThemePage,GraphicsPage,
  LanguageCurrencyPages,QuietDigestPages,HiddenPage,AboutGroup}.test.tsx`, `tests/nudges/{homeScreen.test.ts,
  HomeScreenNudge.test.tsx}`.
- `e2e/{settings,settings-language,settings-hidden,home-nudge}.spec.ts`.

Changed:

- `lib/actions/settings.ts`, `lib/actions/hidden.ts`, `lib/api/bffAllowList.ts` (`GET settings`, `GET hidden`).
- `features/settings/useSettings.ts`, `features/settings/format.ts`.
- `features/nudges/NudgeHost.tsx` (mounts the home offer in its slot).
- The locale guard of WP-21 if step 4 of `changeLanguage` needs it.
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json`: overrides and the new key listed below.

## Steps

1. Read the Next.js files named above and the next-intl documentation for locale switching. Check in `@homi/types`
   the shapes of the settings answer (lists, value forms) and of the hidden list; note them in the PR.
2. Extend `updateSettings`; add `unblockAuthor`, `clearHidden`; allow-list entries; unit tests of the header-mode
   token argument.
3. `format.ts` with tests.
4. `settings/layout.tsx` with the server part, `SettingsScreen` (loading, error, groups, row visibility),
   `AboutGroup` without the home row.
5. `ThemePage` and `GraphicsPage`.
6. `QuietHoursPage` and `DigestPage`.
7. `applyProfileChange.ts`, `LanguagePage`, `CurrencyPage`; verify the locale guard on Back.
8. `useHidden`, `HiddenPage` with the three actions and the session-map reset.
9. `homeScreen.ts`, `useHomeScreenStatus`, the about row, `useHomeScreenOffer`, `HomeScreenNudge`, the toast.
10. Catalogue overrides and the new key; component tests; Playwright specs in both session modes.
11. Run the checklist in three locales and two themes; update the queue and the handoff.

## Behaviour to reproduce

### Settings screen (SCR-032)

Opens from the tab bar or the Telegram Settings button (wired in WP-21). Loading: centred spinner. Error (settings
failed, nothing loaded): tall `ErrorState` — offline «Нет связи» (`error.offline`) + `error.offlineText`, else «Не
загрузилось» (`common.loadFailed`) + `error.serverText`; «Повторить» (`error.retry`) runs every request again.

| Group | Rows (key, ru) and values |
| ----- | ------------------------- |
| `settings.group.look` «Оформление» | `settings.theme._` «Тема» (the leaf-and-prefix name of WP-20's importer; options stay `settings.theme.auto` …): «Как в Telegram» / «Светлая» / «Тёмная». `settings.graphics._` «Графика»: «Авто · полная», «Авто · облегчённая», «Полная», «Облегчённая» |
| `settings.group.region` «Язык и валюта» | `notify.language` «Язык»: name of the current language from the list, else its code. `notify.currency` «Валюта»: the same from the currency list |
| `settings.group.notify` «Когда присылать» | `notify.quiet` «Тихие часы»: «23–08» or `notify.quietOff` «Выкл». `notify.digest` «Время подборок»: «9 и 21» (no leading zeros, joined with `notify.and`). Group footer `notify.tz` «Время — ташкентское.» |
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
| `settings.support` «Написать в поддержку» | reference data has a support account | `tg.openLink(supportUrl())` |
| `settings.instagram` «Мы в Instagram» with the handle as value | `brand.links.instagram` is set | `tg.openLink(brand.links.instagram)` |
| `settings.privacy` (new key) | `brand.links.privacy` is set | `tg.openLink(brand.links.privacy[locale])` |
| `settings.about` (static text) | always | — |

Legacy has no privacy row in the Mini App. Whether HOMI shows one is a brand-layer decision that waits for the
legal texts of Q-SEC-021; with the link `null` (the default) the screen has exactly the legacy rows. The legacy
Instagram account is not HOMI's: the row stays hidden until the brand layer has HOMI's own.

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

- Return an author: `unblockAuthor(id)` with the entry id of the list (`DELETE /hidden/authors/{id}`).
- Return a listing: `unhideListing(number)` (`DELETE /hidden/listings/{number}`).
- Return all: `tg.confirm(hidden.confirmAll)` «Снова показывать все скрытые объявления и заблокированных
  авторов?»; Cancel sends nothing; OK → `clearHidden()` (`DELETE /hidden`).
- Each action: light haptic, the row leaves at once, then the request. Success: success haptic,
  `useSessionMap('hidden').reset()`, `invalidate` of feed, map, count and radar previews, so returned items show
  again without a manual refresh. Failure: only that row comes back, `failed()`.
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
| Telegram reports "added" (from the card, the settings row or Telegram's own menu) | `track('home_screen_added')`, card and settings row disappear, toast `home.added` «Значок HOMI добавлен на экран телефона» |

Nothing renders and no home-screen call is made below Telegram 8.0 or outside Telegram. The offer waits while a
follow nudge, its candidate or a toast is present (BR-APP-046, owned by WP-30).

### New and overridden texts

New key (`homi` layer): `settings.privacy` — ru «Политика конфиденциальности», uz «Maxfiylik siyosati», en
«Privacy policy».

Brand overrides to check and add in the `homi` layer: `settings.about` «HOMI собирает объявления из открытых
Telegram-каналов. В каждой карточке — ссылка на оригинал.», `home.title`, `home.added` (texts above). The uz and en
overrides replace the brand word only. The Instagram handle is not a catalogue text; it comes from the brand layer.

## Tests

**Unit (Vitest).**

- `format.test.ts`: quiet `off`, `23-08`, `00-09` and their structured forms; digest `09`, `09,21`, `12,20`, a
  non-string, an empty list; graphics labels for auto lite and auto full.
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
  confirm cancel.
- `HomeScreenNudge`: 10 s timeout without event; × event; «Добавить» calls the adapter; refused while a follow
  nudge is pending.

**End to end (Playwright, fake Telegram, cookie mode and header mode).**

- `settings.spec.ts`: tab → groups and values of the stub; each row opens its page and Back returns; theme pick
  changes `data-scheme`; quiet and digest picks update the row value; direct load of `/settings/theme` closes to
  `/settings`.
- `settings-language.spec.ts`: ru → en changes the address segment and the tab labels with no document reload (a
  marker set on `window` before the switch is still there); Back from the language page lands under the new
  segment; currency switch re-renders a feed price.
- `settings-hidden.spec.ts`: return an author, return a listing, return all with confirm; open a hidden listing and
  Back.
- `home-nudge.spec.ts`: three stored days and status `missed` → card after 4 s → `home_screen_offered`; status
  `unknown` → no card and `offered` false; the "added" event → toast and no settings row.

## Acceptance checklist

Run in ru, uz, en and in light and dark; cookie mode and header mode where a request is involved.

- [ ] «Настройки» shows the five groups with the legacy rows, values and order; spinner first; a failed load shows
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
- [ ] Currency: prices in the feed, on the map and in an open listing change without a reload.
- [ ] A failed language or currency save changes nothing.
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
      together with the follow nudge or a toast; not on Telegram below 8.0.
- [ ] After adding the icon the toast «Значок HOMI добавлен на экран телефона» shows once.
- [ ] A launch at 02:00 Tashkent time counts for that Tashkent day.
- [ ] No text shows the legacy brand name; the demo marker is visible while settings come from stubs.
- [ ] With `dev016ErrorToastOnFailure` off a failed save only vibrates; the flagged branch passes its tests.

## Handoff

Empty.
