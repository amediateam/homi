# WP-30 — Radars

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #86 on 2026-11-19; production track: the regular deploy, `RADAR_CREATION_ENABLED` left unset (DEC-51); then the "soon" state checked inside Telegram on staging; the other checklist lines run there in WP-57) |
| Depends on | WP-25, WP-26 |
| Size | ≈ 3 700 changed lines, L — above the 3 000 of the PR rule since the return banner and the radar card in the feed of `index-DY_DH7h-.js` joined; steps 14 – 16 hold them, so they can go into a second PR on the same branch if the reviewer asks |
| Behaviour reference | `03` §2 (SCR-026 … SCR-031, SCR-040, SCR-046, SCR-047), §3.2 (nudge and visit storage), §3.3 (events), §3.4 (constants), §4, §5, §5b; `05` TMA-033, TMA-040 and §2; `08` API-019, API-035; `09` F-RADAR-009, F-RADAR-010; task files KV-FE-074, KV-FE-075, KV-FE-076, KV-FE-077, KV-FE-078, KV-FE-079, KV-FE-080, KV-FE-030 |
| Needs from the production track | Nothing new. `RADAR_CREATION_ENABLED` stays unset on staging and production (WP-11, DEC-51), so the radar tab deployed by this package shows its "soon" state there until WP-57 switches radars on |

The task files above were written for another architecture. Their states, texts, constants, edge cases and test
ideas are taken; their file layout, navigation stack, API paths and transport are not.

## Goal

The whole radar part of the Mini App works on stubs: turning a radar on from the feed, the filters sheet and the
nudges; the «Радар» tab with tiles and previews; the radar sheet; the new-radar and editor sheets; the «Нашли
жильё?» survey; the follow nudge, the return banner «С вашего прошлого захода — N новых» and the radar card inside
the search list. One subscribe flow serves every entry point, and the "bot cannot write to you"
case asks for write access to HOMI's own bot. While the server has radars switched off, the tab says that radars
are coming soon and nothing in the app offers one.

## Scope

**In.** Owned audit items: screens SCR-026, SCR-027, SCR-028, SCR-029, SCR-030, SCR-031, SCR-040, SCR-046 and
SCR-047; rules BR-APP-041, BR-APP-042, BR-APP-043, BR-APP-046, BR-APP-047, BR-APP-048, BR-APP-049, BR-APP-063 and
BR-APP-070 … BR-APP-073; defects LB-APP-005, LB-APP-006, LB-APP-014, LB-APP-034, LB-APP-036 and LB-APP-048 …
LB-APP-050; features F-RADAR-009 and F-RADAR-010.

- The subscribe flow (create, reactivate, already on, limit, widen) and the chat-access flow.
- The radar tab, its empty state, tiles, status lines and previews; pull-to-refresh on the tab.
- The radar sheet, the editor and the new-radar sheet (`FiltersForm` in its two radar modes), the survey.
- The follow nudge, the search visits, the return banner (SCR-046) and the radar card in the search list
  (SCR-047); `NudgeHost` with one slot and a fixed priority.
- The switched-off state (DEC-51): the "soon" state of the tab and the one rule that hides every way to create or
  change a radar.
- Wiring of the buttons earlier packages left without an action: «Включить радар» in the filters footer (WP-25),
  «Включить радар по этому поиску» in the few-results note (WP-24), «+» in the top bar of the radar tab (WP-23).

**Out.**

- The filters form itself, the live count and the flow line: WP-25. Formatters (`formatFlow`, `filtersTitle`,
  `filtersAreaSummary`): WP-22.
- Delivery of radar results, quiet hours and digests: the API and the bot (WP-45, WP-46, WP-57).
- The home-screen nudge and the settings pages (digest time, quiet hours): WP-31. The inline slot of the search
  list that holds the radar card: WP-24. The storage keys and their DeviceStorage mirror: WP-21.
- The event transport and screen tracking: WP-32. This package only calls `track()`.

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| Rebuild and parity (DEC-32, DEC-46) | Rebuilt from the audit; the checklist below is the proof of parity |
| Defects and flags (DEC-36) | LB-APP-005, LB-APP-006, LB-APP-014, LB-APP-036 and, from the pinned release, LB-APP-048, LB-APP-049 and LB-APP-050 are fixed (plain fixes in `09` §4.3; LB-APP-050 also changes when the follow nudge counts as shown). LB-APP-034 is DEV-022: written, tested, behind `dev022RadarCountLabel`, which is off. `dev005RadarDropsPostedDays`, `dev016ErrorToastOnFailure` and `dev021OneFlowVocabulary` are consumed, not owned. Since the intake of `index-CIa0Ldj2.js` `dev016ErrorToastOnFailure` is on by default and gates the failure toast only (DEC-58); the success toast «Радар удалён» has its own flag, `dev016SuccessToastOnDestructive`, off (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `failed()` and `RadarSheet` for a later package (`wave-1/baseline.md`, built code behind the pin, row 21)) |
| Brand (DEC-40, 25 §2 rule 5) | The bot is HOMI's own. Every bot link and every text with the brand name goes through `lib/brand` and the `homi` catalogue layer |
| Scope of Wave 1 (DEC-43) | Radars are HOMI's own data with HOMI's own identifiers (25 §4.1); nothing here knows a legacy radar id |
| Radars before delivery (DEC-51) | The server switches radars off until its bot can deliver them and says so in `GET /reference` (`radars_enabled`, WP-11). `radarsReady` stays what it was — a build-time constant that orders the frontend packages. Every radar entry point asks `useRadarsEnabled()` of WP-24, which needs both. The return banner and the radar card in the feed are radar entry points too: while radars are switched off neither is shown, no `GET /listings/new` is sent, and only the local visit record runs — an approved consequence of DEC-51, listed as such in the checklist |
| Routing (DEC-44, 25 §3.2) | Sheets are intercepting routes in the `@sheet` slot; Back closes editor, then radar sheet, then nothing (root tab) |
| Session modes (25 §3.4) | Every read works with `initial` data from the server (cookie mode) and through `/bff` (header mode); every mutation is a Server Action that takes the token as an argument in header mode |
| API methods (25 §4.2) | Methods used: `GET /radars` (with `include=previews` on the radar tab), `POST /radars`, `PUT /radars/{id}`, `PATCH /radars/{id}`, `DELETE /radars/{id}`, `POST /radars/{id}/relax`, `POST /surveys/found`, `POST /surveys/found/where`; reads of `GET /listings/flow` (follow nudge), `GET /listings/new` (return banner), `GET /listings/count` and `GET /listings/flow` through `FiltersForm`, and `GET /settings` (digest hours). `{id}` is a ULID string (WP-13) |
| Demo marker (25 §4.4) | A radar answer with `meta.source = stub` shows the demo marker through `reportSource()` |

Read before coding: `03-api-reference/03-file-conventions/parallel-routes.md` (slots, `default.js`, "Closing the
modal"), `intercepting-routes.md`, `02-guides/preserving-ui-state.md` (state of hidden routes),
`03-api-reference/04-functions/use-router.md` (`push`, `replace`, `back`, `scroll: false`),
`02-guides/single-page-applications.md` ("Mutating data with Server Actions").

## Design

### Routes

| Address | Files | Renders |
| ------- | ----- | ------- |
| `/radars` | `(main)/radars/page.tsx` | `<Suspense>` around `RadarTabServer` (`features/radars/server.tsx`), whose `readRadarTab` reads the cookie, then the cached reference data, then — radars on and the cookie there — `GET /radars?include=previews`, and hands `RadarScreen` `initial`, `renderId` and `serverOff` |
| `/radars/new` | `@sheet/(.)radars/new/page.tsx`, `(main)/radars/new/page.tsx` | `RadarCreateSheet` (SCR-030) |
| `/radars/[id]` | `@sheet/(.)radars/[id]/layout.tsx` + `page.tsx`; `(main)/radars/[id]/layout.tsx` + `page.tsx` | layout: `RadarSheetServer` (the id of its own `params`, `notFound()` for a non-ULID) → `RadarSheetRoute` with `{children}`; `page.tsx` renders `null` (SCR-028) |
| `/radars/[id]/edit` | `edit/page.tsx` under both layouts | `RadarEditSheet` over the radar sheet (SCR-029) |
| `/radars/found` | `@sheet/(.)radars/found/page.tsx`, `(main)/radars/found/page.tsx` | `FoundSheet`; `?trigger=pause|delete` (SCR-031) |

- Route files hold no logic; both trees import the same components from `features/radars/`.
- While radars are switched off (section "Radars switched off"), `/radars` renders the "soon" state and the four
  sheet addresses return to it.
- The direct-load versions render the tab under the sheet (`RadarTabServer`; the editor's through the `[id]`
  layout), so a reload of `/radars/<id>` shows the same picture as a tap on the tile. Closing uses `back()` of
  `useBack()`: `router.back()` when the app has history, else `router.replace(parentOf(pathname))` —
  `/radars/<id>/edit` → `/radars/<id>` → `/radars`.
- The radar sheet stays mounted under its editor because it is the layout of the segment (vocabulary rule for
  layers). The editor renders beside the sheet, not inside it (`RadarSheet` renders `children` after its
  `RouteSheet`): both are portalled dialogs, and an editor inside the sheet's content could not be scrolled by touch.
  `foundation.spec.ts` checks the two apart.
- A listing opened from the strip is intercepted into `@overlay`, and Next leaves `@sheet` as it was, so the slot does
  not hide the sheet. Both copies of `RadarSheetRoute` render only while the address is the radar's own
  (`/radars/<id>` or its editor); Back from the listing brings the sheet back — the legacy "hidden while a listing is
  open" (SCR-028). The sheet is re-opened instantly on Back, and the strip's sideways scroll and the sheet's own
  scroll are restored with it (DEC-64). Legacy keeps the sheet mounted and hidden under the listing (`parked`) since
  `index-CIa0Ldj2.js`; HOMI does not, by the route-layer rules of WP-23, and gives the user the same result by its own
  means (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `RadarSheetRoute` and `radarReturn` for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 37)).
- Next intercepts every soft navigation under the locale, also from a directly loaded sheet, while the `children`
  slot keeps the standalone copy. So the standalone radar sheet yields while a `@sheet` copy shows (the copies count
  themselves, as `ListingLayer`'s do; not a latch), and a copy that takes over from the other opens without the rise.
  The standalone editor renders only on its own address; the standalone new-radar sheet yields while a `@sheet` copy
  shows (a directly loaded `/radars/new?pick=city` closed at depth 0).
- `@sheet/page.tsx` (`null` for the slot's root address) existed since WP-20, so «Смотреть найденное» to `/` leaves
  no sheet over the feed.
- `router.replace` to an intercepted address is intercepted like `router.push` (step 9, from the Next source: both
  dispatch the same navigate action with the same `Next-Url`; only the history entry differs). The survey after a
  pause or a delete in the sheet is `nav.replace(routes.radarFound({ trigger }))`.

### Modules

| Path under `frontend/app/` | Content |
| -------------------------- | ------- |
| `lib/api/server.ts` | `serverApi().radars(query?)` (for `include=previews`) and `relaxRadar(id, { code })` (the contract requires the body) |
| `lib/actions/radars.ts` | Server Actions with one input object, `(input, auth?, locale?)` → `ActionResult<T>`: `createRadar({ filters, entry, relaxed? })`, `replaceRadar({ id, filters, relaxed? })`, `patchRadar` with `{ id, active }`, `{ id, mode }` or `{ id, unhide: true }`, `deleteRadar({ id })` → `{ ask_found }`, `relaxRadar({ id, code })`; the other results are raw contract bodies. The prose below writes `patchRadar(id, …)` and `deleteRadar(id)` as shorthand for these |
| `lib/actions/surveys.ts` | `sendFound({ answer, trigger })`, `sendFoundWhere({ where })` over `serverApi().found` / `foundWhere` (WP-22 had not reserved the names) |
| `lib/actions/useAction.ts`, `lib/data/useResource.ts` | `invokeAction(action, input, locale)`, the form of `useAction` for code outside a component (`useAction` wraps it); `readResource(key)`, the cached data without a subscription |
| `lib/telegram/chatAccess.ts` | `isNoChat(result)`, `withChatAccess(run, { restartText })` |
| `lib/navigation/address.ts` | `currentAddress()`: path and query of the browser, read at a tap and again with the answer (a sheet the user left is not closed again) |
| `features/radars/useRadars.ts` | `useRadars({ previews?, initial?, enabled?, flags? })` on `useResource` with the keys `RADARS_KEY` (`radars`, the search tab) and `RADARS_PREVIEWS_KEY` (`radars?include=previews`, the tab): `{ radars, status, error, refreshing, refetch, replace(radar), remove(id) }`; `fetchRadarList()`, `putRadar(radar)`, `dropRadar(id)`, `refreshRadars()` |
| `features/radars/normalize.ts` | `normalizeRadar`, `normalizeRadarList`, `normalizeMutation`, `normalizePatch` — total functions, server-safe. `normalizeFlow` is not written again: it moved from the client module `features/filters/useLiveStats.ts` (which re-exports it) to `features/filters/flow.ts` |
| `features/radars/subscribe.ts` (a stub since WP-24; bodies written here) | A pure core `runSubscribe(deps, filters, entry, relaxed?)`, `runSaveEdit(deps, id, filters, relaxed?)`, `runRelax(deps, id, code)` → `Outcome { ok, toast, haptic, radar? }`, and the hook `useSubscribe()` → `{ subscribe(filters, entry, relaxed?, { scope? }), saveEdit(id, filters, relaxed?, { scope? }), relax(id, code) }`, each `Promise<{ ok }>`: it binds the deps, plays the haptic and shows the toast. `radarsReady` in `features/radars/capability.ts` becomes `true` |
| `features/radars/match.ts` | `useHasActiveRadar(filters, enabled?)` (footer ✓, note button), `hasActiveRadar`, `hasSameRadar` (follow nudge) and `hasRadarFor` (return banner, feed card: for default filters also any radar of the same base deal and city); the caller owns the "list loaded" gate |
| `features/radars/toasts.ts` | The toast table below as one function per outcome (`toast.subDeleted` is the delete flow's) |
| `features/radars/radarStatus.ts` | Status line of a tile and of the sheet header |
| `features/radars/useRadarPreviews.ts` | Finds, matching count and flow per radar |
| `features/radars/server.tsx` | `readRadarTab()`, `RadarTabServer`, `RadarSheetServer`, `OFF_RENDER_ID` |
| `features/radars/{RadarScreen,RadarTiles,RadarEmptyState,RadarSoonState,RadarSheetRoute,RadarSheet,RadarStrip,RadarSweep}.tsx` | Tab and radar sheet; the "soon" state; `RadarSweep({ size, blips })`, the sweep art of the empty tab and the feed card. `RadarTiles.tsx` also holds `useRadarSwitch` (tile and sheet) and `radarActionFailed` |
| `features/radars/useRadarsOffRedirect.ts` | The switched-off rule of the four sheet addresses |
| `features/radars/{RadarCreateSheet,RadarEditSheet,FoundSheet}.tsx` | Thin wrappers over `FiltersForm`; the survey. `RadarEditSheet.tsx` also holds `useSheetRequest` |
| `features/radars/radarReturn.ts` | `{ id, scrollY }` kept in module memory for the return from a radar feed; `radarFeedHref` |
| `features/nudges/{NudgeHost.tsx,store.ts,storage.ts,constants.ts}` | Host and arbitration; `homi-nudge`; every number of the tables below |
| `features/nudges/{followRules.ts,useFollowNudge.ts,FollowNudge.tsx}` | Rules, timing, card. The rules file is not `followNudge.ts`: on the case-insensitive macOS file system that name collides with `FollowNudge.tsx` |
| `features/nudges/visits.ts` | Search visits and visit sessions on `homi-visits` (BR-APP-070) |
| `features/nudges/{returnRules.ts,useReturnNudge.ts,ReturnNudge.tsx}` | Return banner: rules, timing, the `GET /listings/new` read, card (`returnRules.ts` for the same collision) |
| `features/nudges/{feedRadar.ts,FeedRadarCard.tsx}` | Radar card in the search list: conditions, card (with `useFeedRadar`), its seen event |
| `features/nudges/shown.ts` | `useMarkShownOnRender(kind, mark)`: runs the "shown" bookkeeping in the effect of the first render (fix of LB-APP-050) |
| `features/settings/{useSettings.ts,format.ts}` | `useSettings({ enabled? })` on `useResource('settings', …)`; `digestHours()`, `formatDigestHours()` in `format.ts`, re-exported by `useSettings.ts`; WP-31 extends both |

### Subscribe flow (`subscribe.ts`)

One module: a pure core without UI, and `useSubscribe()`, which presents its outcome — the haptic, then the toast in
the app's host on `ok`, else in `scope` (default `app`; the filters sheet and the radar forms pass a function read
when the answer arrives: `sheet` while the user is still on the sheet, else `app`) — and resolves `{ ok }`. Callers
pass `entry`: `filters` (filters footer), `few` (few-results note), `prompt` (follow
nudge), `return` (return banner), `feed` (radar card in the feed), `empty` (new-radar sheet opened from «+» or the
empty tab); the new-radar sheet opened from the banner or the card passes `return` or `feed` (BR-APP-041,
BR-APP-073, BR-API-086).

1. Re-read `GET /radars` (`fetchRadarList()`, which seeds the plain list); when it fails, compare against the cached
   list (`readResource(RADARS_KEY)`).
2. A radar with `sameFilters` (WP-22; `posted_days` ignored) that is active → no request, toast `toast.alreadyOn`
   without a haptic (legacy), `ok: true`.
3. The same but inactive → `withChatAccess(() => patchRadar(id, { active: true }))` → toast `toast.alertOn`.
4. Otherwise `withChatAccess(() => createRadar({ filters: toRadarFilters(filters, rules), entry, relaxed? }))`;
   `relaxed` is left out of the body when no relax chip was chosen. In the WP-13 contract the server repeats the
   check of steps 2 and 3 and says what it did in `kind`, so the answer is read first: `existing` →
   `toast.alreadyOn` (no haptic); `reactivated` → `toast.alertOn`; `created` → step 5. Steps 2 and 3 stay as the
   fast path for a list that is already loaded.
5. Result → toast: `starter > 0` → count toast; else the first `options[]` entry with `count ≥ 7`, else the last
   one → "few" toast with the action «Расширить» that calls `relax(radar.id, option.code)` (plain text when the
   answer names no radar); no option → "empty" toast with `hint = relaxed[0] ? ' — ' + relaxed[0].text : ''`.
6. `normalizeMutation` makes `options` and `relaxed` arrays and `starter` a finite number before step 5. A request
   that succeeded always ends in a success toast and `ok: true` — the fix of LB-APP-005.
7. Failure, by the `409` codes of WP-13 (the fix of LB-API-033): `no_chat` after the chat-access flow →
   `toast.noChat`; `radar_limit` → `toast.subLimit` with `max` = `limits.radars` from `useReference()` (legacy
   `max_subscriptions`), fallback `10`; `radar_duplicate` (edit and widen only) → `toast.alreadyOn`; the error
   `radars_disabled` of WP-22 (`403`, the server switched radars off after the reference data was cached) → the
   toast `radar.soon.title`; anything else → `common.saveFailed`.
8. Two `subscribe` calls with the same `filtersKey` while one is in flight share one promise and one presented
   outcome (`saveEdit` and `relax` are not keyed: their buttons disable themselves).
9. After every write that succeeded, and after a `not_found`: `refreshRadars()` of both radar lists. The fast-path
   already-on of step 2 sends nothing and reads nothing more (legacy).

`rules` is `searchRules(devFlags)` of WP-22: with `dev005RadarDropsPostedDays` off `toRadarFilters` sends
`posted_days` as it is in the search filters (legacy), on it sends `null`.

### Chat access (`withChatAccess`)

`withChatAccess(run, { restartText })`: `run` returns an `ActionResult`; `restartText` is the caller's
`t('chat.restart')`. When the result is a conflict with the contract's `no_chat` code:

1. `tg.requestWriteAccess()`. No separate `isVersionAtLeast('6.9')`: the adapter answers `null` below 6.9 and
   outside Telegram, which is step 4.
2. Answer `false` → `track('chat_access_declined')`, return the failure.
3. Answer `true` → `track('chat_access_allowed')`, run once more; success returns, and so does another failure (the
   retry's); another `no_chat` falls through.
4. Method unavailable or still `no_chat`: when `botUrl()` (`lib/deeplinks/build.ts`, the bare `https://t.me/<bot>`
   of HOMI's bot, `null` without `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`) is not `null`, `tg.confirm(restartText)`; on OK
   `tg.openLink(url)`. Then return the first failure.
5. A second call while the native sheet or the restart question is open reuses the pending promise; the event is
   tracked once per answer.

Turning a radar on, creating, replacing and widening go through it; turning off, mode, unhide and delete do not
(BR-APP-048).

### Radars switched off (DEC-51)

`useRadarsEnabled()` (`features/radars/capability.ts`, WP-24) is `true` only when `radarsReady` is `true` and
`useReference().radars_enabled` is `true`. While it is `false`:

| Place | Behaviour |
| ----- | --------- |
| `/radars` | `RadarScreen` renders `RadarSoonState` and nothing else: the radar icon (no sweep animation), `radar.soon.title`, `radar.soon.body`, no button. No radar request is sent: the server part reads the cookie, then the cached reference data, and sends nothing when it says off or could not be read (`serverOff`, which decides until the reference data reaches the client); `useRadars` stays disabled |
| «+» in the top bar of the tab | not rendered — also in the server and the hydration render, before the reference data says radars are on |
| `/radars/new`, `/radars/<id>`, `/radars/<id>/edit`, `/radars/found` | loaded directly or reached by a stale link: `useRadarsOffRedirect()` makes one `nav.replace(routes.radars())` once the reference data is there, and then nothing of the sheet is shown. Until then the hook answers `false`, so the server HTML of a direct load keeps the sheet (`foundation.spec.ts` reads it) until the client redirects |
| Few-results note, filters footer | their radar buttons are hidden (WP-24, WP-25 ask the same hook) |
| Follow nudge | never offered: the apply's listener (`useFollowNudge`) makes no candidate, since `shouldShowFollowNudge` needs radars on, so no flow request is sent |
| Return banner | never checked: no wait, no `GET /listings/new`, nothing rendered. Visits are still recorded in `homi-visits`, so the banner has its history when radars come on |
| Radar card in the feed | not passed into the inline slot of the list; nothing rendered, no event |
| Radar list on the search tab | not requested: `useRadars` ANDs the caller's `enabled` with `useRadarsEnabled()` and a ready session |

The tab itself stays in the tab bar. Pull-to-refresh on the "soon" state does nothing. A radar action that is
answered `radars_disabled` although the hook said "on" — the reference data is cached for about ten minutes —
reverts its optimistic change and shows the toast `radar.soon.title`; the entry points disappear with the next
reference refresh. Nothing here reads the stub scenario cookie: the state follows the server's configuration.

### Previews (BR-APP-063, fix of LB-APP-036)

The WP-13 contract carries the previews: `GET /radars?include=previews` adds `preview` to every radar —
`preview.items` (at most 5 listing previews, newest first), `preview.count` (listings that match now, may be
`null`) and `preview.flow` (`week`, `days`, may be `null`); `preview` itself is `null` when it could not be
computed. `useRadarPreviews` only maps it, so the tab sends one request. Legacy reads the previews again after every
list load, at most once per 10 s, since `index-CIa0Ldj2.js` (`03` BR-APP-063); HOMI has no separate preview request,
so it has no pacing rule (*added by the intake of `index-CIa0Ldj2.js`*). The list read for the search tab (footer
state, note, nudge rules) is sent without `include`, through `/bff` in both session modes (it never has a server
`initial`), only while `useRadarsEnabled()`; the footers of the two radar forms send none (`useHasActiveRadar(draft,
mode === "search")`). There is no per-radar fallback to the listing methods.

The tab is read at request time only, the cookie first (`readRadarTab`). Next keeps up to three routes alive under
`<Activity>`, so the tab entered again would keep its old list (AM-96, the class of WP-29's AM-94; legacy re-mounted
the tab on every entry). Every server render that read the user brings a new `renderId`, drawn after `io()`;
`RadarScreen` adopts each new one once (`seedResource` of the render's list; without a server read, as in header
mode, a `/bff` re-read over the list shown), and one seen before — Back, the return from a layer, a hidden copy shown
again — changes nothing. A launch that signed in does not read again over an `initial`: its router refresh brings a
new `renderId`.

Every flow value passes `normalizeFlow` of WP-25: anything that is not an object with a numeric `week` and a
positive `days` becomes `null`.

### Return from a radar feed

«Смотреть найденное» (the footer and the strip's «Все {n}») stores `{ id, scrollY: window.scrollY }` in
`radarReturn`, then `window.scrollTo(0, 0)` (the feed starts at its top whether or not it was mounted before; legacy
`switchTab` scrolled to 0), then `nav.push(radarFeedHref(…))`: `toSearchParams(radar.filters, sort)` plus `from=radar`,
`sort` = `normalizeSort(lastSort, sortOptions(radar.filters, city))`. A find of the strip stores the return as well.
Back returns to `/radars/[id]`: the sheet opens without the rise animation (`instant` of `RouteSheet` and
`BottomSheet`, read on that mount only) and, once the list is loaded, the tab scrolls to the stored position. A radar
sheet address always draws the radar tab's chrome (`AppShell`), although the feed was drawn last.

Since the intake of `index-CIa0Ldj2.js`: «Смотреть найденное» and its Back forget the feed's scroll memory of WP-24,
so a radar's feed starts at its top and does not leave its place to the user's own search (*added by the intake of
`index-CIa0Ldj2.js`*; a parity item of `RadarSheet` for a later package (`wave-1/baseline.md`, built code behind the
pin, row 14)). `radarReturn` also stores the strip's `scrollLeft` and the sheet's own scroll, and both are restored on
the instant opening (DEC-64; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `radarReturn`,
`RadarStrip` and `BottomSheet` for a later package (`wave-1/baseline.md`, built code behind the pin, row 37)).

Three rules make this work. The remembered last search is `lastSearchHref` of `lib/ui/shellState.ts`:
`rememberHref` (called by `AppShell`, unchanged) does not record a search root with `from=radar`, so after Back the
search tab still holds the user's own filters ("the last search filters" in this file are
`searchStateFromHref(lastSearchHref)` of WP-22). `write` of `lib/search/useSearchState.ts` drops `from=radar` — the
one reserved value it removes; every in-place writer goes through it (the deal switch, `FewActions`, the `FeedEmpty`
reset, `setFilters`, `setSort`), so a change on that feed makes the radar's filters the search. And `TabBar`: a
press of the search tab on a radar's feed replaces the address with the same one without `from`, a press of another
tab first remembers it without `from`, and every press forgets the stored return — the legacy "tab press clears
radar-return" (`03` §1.2).

### Nudges

`NudgeHost` is mounted once by `AppShell` above the tab bar (z 35 on the ladder of `03` §3.6) and renders at most
one nudge. `store.ts` holds `{ active: 'return' | 'follow' | 'home' | null, followPending: boolean, returnPending:
string | null }` (`returnPending` is the filter hash of a return check that waits or is in flight).

- `nudgesAllowed` (BR-APP-046): the address is the feed list (`/`, no layer parameter), session `ready`. The
  new-radar sheet has its own address, so no nudge shows while it is open.
- One slot, fixed priority — the fix of LB-APP-049: return banner > follow nudge > home offer. A higher nudge takes
  the slot from a lower one; a lower one never displaces a higher one. A displaced follow nudge, or its candidate,
  is dropped without an event (BR-APP-071); a displaced home offer is hidden without an event and stays available
  for later (WP-31 does not count it as used).
- The return banner and the follow nudge take the slot when `nudgesAllowed` holds and no toast is visible.
- The follow nudge's wait pauses while `returnPending` is the hash of the same filters (BR-APP-046, legacy
  `useFollowNudge.js`); a return check that ends without a banner lets it start.
- A *candidate* (waiting or requesting, not rendered) is dropped without a trace by a change of the filters, a change
  of the radar list (ids, on or paused, filters; not a re-read of the same list), a layer that opens or a higher
  nudge. A *rendered* nudge is suspended (not rendered, no event) while a toast is visible, a layer is open or the
  address is not the feed list, and renders again with its timer restarted when the feed list shows again with no
  toast and the same filters (legacy remounted it). A filter change, or a higher nudge, ends it without an event.
- `NudgeHost` keeps a visually hidden polite live line (`data-nudge-live`) that holds the title of the nudge on screen,
  so a screen reader announces it; the card itself has `aria-live="off"`.
- The home nudge (WP-31) may take the slot only when `active === null`, `followPending === false` and
  `returnPending === null`.
- Shown means rendered — the fix of LB-APP-050. A nudge is marked as shown (`lastShown`, `asked`, `back`, its
  `*_shown` event) by `useMarkShownOnRender` in the effect of its first render in the slot, not when it is
  scheduled. A nudge that a toast, a filter change or a higher nudge drops before it renders leaves no trace: no
  cooldown, no offered hash, no event.

`homi-nudge` (policy mirrored and restored, `lib/storage.ts`): `{ asked: string[≤40], closed: number, quietUntil:
number, lastShown: number, back: Record<string, number>, feedOff: number }` — `back` (the time of the last return
banner per filter hash, the 40 newest kept) and `feedOff` (end of the radar card's snooze) since legacy release
`index-DY_DH7h-.js`; a broken value reads as `{ asked: [], closed: 0, quietUntil: 0, lastShown: 0, back: {},
feedOff: 0 }` (`features/nudges/storage.ts`, with KV-FE-080's in-memory fallback when the write is refused). The hash
of a filter set is `filtersHash(filters)` of `@homi/search`: djb2 over `filtersKey(filters)`, unsigned, base 36, so
`posted_days` is ignored.

## Files

New, under `frontend/app/`:

- The modules of the table in "Design", except the changed `lib/api/server.ts`, `lib/actions/useAction.ts`,
  `lib/data/useResource.ts` and WP-24's `capability.ts` and `subscribe.ts`; and `features/filters/flow.ts`.
- `tests/radars/{normalize,subscribe,radarStatus,match,server}.test.ts`, `tests/radars/{RadarSoon,RadarTiles,
  RadarSheet,RadarSheetRoute,RadarForms,FoundSheet,RadarSweep,useRadars,useRadarsOffRedirect}.test.tsx`,
  `tests/actions/{radars,surveys}.test.ts`, `tests/settings/{format.test.ts,useSettings.test.tsx}`,
  `tests/telegram/chatAccess.test.ts`, `tests/nudges/{followNudge.test.ts,FollowNudge.test.tsx,NudgeHost.test.tsx}`,
  `tests/nudges/{visits,returnNudge,feedRadar,shown}.test.ts`, `tests/nudges/{ReturnNudge,FeedRadarCard}.test.tsx`;
  `frontend/packages/ui/tests/Switch.test.tsx`.
- `e2e/{radars,radar-subscribe,radar-forms,follow-nudge,return-nudge,feed-radar,radars-soon}.spec.ts`.

Changed:

- The WP-20 placeholders of `app/[locale]/(main)/radars/page.tsx`, `radars/new/page.tsx`, `radars/[id]/layout.tsx`,
  `radars/[id]/edit/page.tsx`, `radars/found/page.tsx` and of their `@sheet/(.)radars/…` copies; the two
  `[id]/page.tsx` already rendered `null`, and `@sheet/page.tsx` existed.
- `lib/api/bffAllowList.ts`: nothing to add — `GET radars`, `GET settings` and `GET listings/new` are in the list
  of WP-22.
- `lib/api/server.ts` (`radars(query?)`, `relaxRadar(id, { code })`), `lib/actions/useAction.ts` (`invokeAction`),
  `lib/data/useResource.ts` (`readResource`; `seedResource` aborts a read in flight; `invalidate` keeps an entry
  with data and no user as stale), `lib/navigation/routes.ts` (`entry`, `trigger`, `radarNew`, `radarFound`).
- `lib/search/useSearchState.ts` (`write` drops `from=radar`), `lib/ui/shellState.ts` (`rememberHref` skips it),
  `features/shell/AppShell.tsx` (mounts `NudgeHost`; a radar sheet address draws the radar tab's chrome),
  `features/shell/TabBar.tsx` (the radar feed's tab press), `features/shell/TopBar.tsx` («+» only while radars are
  on), `features/shell/RouteSheet.tsx` (`instant`).
- `features/radars/capability.ts` (`radarsReady = true`), `features/radars/subscribe.ts` (stub of WP-24 replaced).
- `features/filters/FiltersFooter.tsx` (`useHasActiveRadar` of `match.ts`, search mode only),
  `features/filters/FiltersSheetRoute.tsx` («Включить радар» through `useSubscribe`), `features/filters/
  useLiveStats.ts` (`normalizeFlow` re-exported from `flow.ts`), `features/feed/FewResultsNote.tsx` (button),
  `features/feed/FeedScreen.tsx` (passes `FeedRadarCard` into the `inline` slot of WP-24). `FiltersForm.tsx` and the
  apply handlers are not edited: the nudge registers its listener with `onFiltersApplied` of WP-25
  (`features/filters/applyFilters.ts`).
- `frontend/packages/search` (`filtersHash`, exported from the root so specs can seed storage) and
  `frontend/packages/ui` (`BottomSheet` `instant`, the `Switch` restyle, the sweep keyframes with their lite and
  reduced-motion rest, five icons).
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json`: the keys of "Behaviour to reproduce", "New and
  overridden texts".
- Shared files, announced in the PR: `frontend/playwright.config.ts` (the default projects exclude the tag
  `@radars-off`) and `.github/workflows/frontend-e2e.yml` (the step that runs it; see "Tests").

## Steps

1. Read the Next.js files named above. Check three seams and note the result in the PR: the radar types in
   `@homi/types` (item shape, preview field, mutation result, error codes); what `FiltersForm` already does in its
   radar modes; how WP-24 and WP-25 hid their radar buttons (`radarsReady` of `features/radars/capability.ts` and
   the stub `features/radars/subscribe.ts`).
2. `lib/actions/radars.ts` and `lib/actions/surveys.ts` on `serverApi()`; allow-list entries; unit tests of the
   token argument in header mode.
3. `features/radars/normalize.ts` with tests.
4. `lib/telegram/chatAccess.ts` with tests on the fake adapter.
5. `features/radars/toasts.ts` and `subscribe.ts` with tests.
6. `useRadars`; load the list on the search tab too (it feeds the footer state, the note and the nudge rules).
   Flip the seam of step 1: filters footer and few-results note call `subscribe`.
7. Radar tab: page, `RadarScreen` (soon, loading, error, empty, tiles), `RadarSoonState`, `RadarTiles`,
   `radarStatus`, `RadarEmptyState`, pull-to-refresh handler, «+». The switched-off rule for the tab, the «+», the
   sheet addresses, the radar list request and the nudge (section "Radars switched off").
8. `useRadarPreviews` by the rule in "Previews".
9. Radar sheet: both layouts, `RadarSheetRoute`, `RadarSheet`, `RadarStrip`, `useSettings` and the digest hint;
   switch, mode, unhide, delete; verify the `replace` interception question.
10. «Смотреть найденное», `radarReturn`, the `from=radar` rule, the count label flag.
11. New radar and editor: routes, wrappers, what `FiltersForm` lacks from step 1.
12. Survey: routes, `FoundSheet`, the two actions, share.
13. `NudgeHost`, `store.ts`, `followNudge.ts`, `useFollowNudge.ts`, `FollowNudge.tsx`; register
    `onFiltersApplied(offerFollowNudge)` once in `NudgeHost` — `applyFilters` of WP-25 notifies for the filters
    sheet, the quick filter sheet and the lasso (WP-28), so no handler is touched.
14. `visits.ts` with the visit sessions on `tg.onHidden` and `tg.onVisible`; `shown.ts`, and the follow nudge
    moved onto it (LB-APP-050); the priority of the slot (LB-APP-049).
15. Return banner: `returnNudge.ts`, `useReturnNudge.ts` with the `GET /listings/new` read, `ReturnNudge.tsx`, the
    `entry` parameter of the new-radar sheet.
16. Radar card in the feed: `feedRadar.ts`, `FeedRadarCard.tsx`, the `inline` slot in `FeedScreen`.
17. Catalogue overrides and the new keys; component tests; Playwright specs in both session modes; the tag
    `@radars-off` in `playwright.config.ts` and its workflow step.
18. Run the checklist in three locales and two themes; update the queue and the handoff.

## Behaviour to reproduce

### Toasts of the subscribe flow (BR-APP-041, BR-APP-042)

| Outcome | Key and text |
| ------- | ------------ |
| Identical radar is active | `toast.alreadyOn` «Радар по этому поиску уже включён» |
| Identical radar was off, now on | `toast.alertOn` «Радар снова включён» |
| Created, `starter > 0` | `toast.subSaved` «Радар включён. {count} уже в чате с ботом» |
| Created, few | `toast.subSavedFew` «Радар включён, но таких объявлений мало. {what}: {rate}» + action `toast.relax` «Расширить» |
| Created, empty | `toast.subSavedEmpty` «Радар включён — новые придут в чат, как только появятся{hint}» |
| Edited, `starter > 0` | `toast.subUpdated` «Радар обновлён. {count} под новые условия — в чате с ботом» |
| Edited, few | `toast.subUpdatedFew` «Радар обновлён, но таких объявлений мало. {what}: {rate}» + «Расширить» |
| Edited, empty | `toast.subUpdatedEmpty` «Радар обновлён. Пока пусто{hint}» |
| Widened | `starter > 0` → `toast.subUpdated`; else `toast.relaxedEmpty` «Радар расширен — новые придут в чат, как только появятся» |
| No chat | `toast.noChat` «Радар не включён — боту нужно разрешение писать вам в чат» |
| Radars switched off on the server | `radar.soon.title` «Радар скоро заработает» |
| Limit | `toast.subLimit` «Уже {max} радаров — удалите ненужный во вкладке «Радар»» |
| Other failure | `common.saveFailed` «Не получилось сохранить» |

`{count}` is the plural `listings` («3 объявления», `formatCount`); `{what}` and `{rate}` are the option's server
strings `label` and `rate` (the contract has no `what`). A toast with an action lives 6 s, a plain one 4 s (WP-23).
Success and error haptics follow the outcome; already on plays none. The confirm
after an unrecoverable `no_chat` is `chat.restart` «Бот не может писать вам — похоже, он остановлен. Открыть чат с
ботом? Нажмите там «Перезапустить» и включите радар снова.».

Callers: the filters footer shows ✓ «Радар включён» instead of the button when an active radar with the same
filters exists, and disables the button while submitting; the sheet closes on `ok` only while the user is still on
it (`currentAddress()` read at the tap and with the answer), so a sheet left meanwhile (×, Back, «Показать») is not
stepped back once more. The few-results note hides its radar button when such a radar exists.

### Radar tab (SCR-026, SCR-027)

| State | Trigger | What the user sees |
| ----- | ------- | ------------------ |
| Soon | `useRadarsEnabled()` is `false` (reference data loaded; DEC-51) | radar icon; `radar.soon.title` «Радар скоро заработает»; `radar.soon.body` «Мы включим уведомления о новых объявлениях в ближайшее время.»; no button, no «+». Legacy has no such state: its radars work from the first day |
| Loading | list not loaded, no `initial` | centred spinner |
| Error | list failed, nothing cached | tall `ErrorState`: offline «Нет связи» (`error.offline`) + `error.offlineText`, else «Не загрузилось» (`common.loadFailed`) + `error.serverText`; «Повторить» (`error.retry`) |
| Empty | list is `[]` | radar sweep with 3 blips (static in lite mode and with reduced motion); `subs.empty` «Радар следит за каналами за вас»; `subs.emptyHint`; primary «Включить радар» (`sheet.subscribe`) |
| Tiles | one or more radars | per tile: collage of up to 4 covers of the latest finds or the radar icon; title `filtersTitle` (e.g. «2-комн. · до $600»); `filtersAreaSummary`; status line; switch; inactive tiles greyscale |

Status line (`radarStatus`): inactive → `subs.paused` «На паузе». Active without a flow → the mode label in lower
case («сразу», «подборкой»). Active with a flow → `formatFlow` for tiles (`alert.rare` «пока редко», `alert.week`
«{n} за неделю», `alert.day` «≈{n} в день»; BR-APP-044, vocabulary flag `dev021OneFlowVocabulary` in WP-22), then
« · » and the mode label. Mode labels come from `labelFor('radarMode', mode)`; an unknown mode shows a default and
never throws.

Actions:

- Tap, Enter or Space on a tile: light haptic, `router.push(routes.radar(id))`. The tile is a real `<button>`; the
  switch is its sibling, a separate focus stop (fix of LB-APP-014), named «Присылать в чат» and described by the
  tile's title. A find without a cover gives the collage its first preview photo.
- The `Switch` of `@homi/ui` (tile and sheet) takes the legacy `.switch` sizes in px (51 × 31, a 27 px thumb, 20 px
  of travel); off, the track is `--sep` and, in the dark scheme, the thumb the text colour; on, the accent track with
  an `--accent-text` thumb.
- Switch: light haptic, optimistic flip. On → `withChatAccess(patchRadar(id, { active: true }))`; off → plain
  `patchRadar`. Success replaces the radar with the answer. Turning on with `starter > 0` → toast `subs.resumed`
  «Радар снова включён. В чате с ботом — непросмотренные: {count}» (the ru text of the pinned release; up to
  `index-CBlEKxdL.js` «Радар снова включён. {count}, которые вы не видели, — в чате с ботом»; *added by the intake of
  `index-CIa0Ldj2.js`*). Turning off with `ask_found` → the
  survey with trigger `pause`: from a tile `router.push(routes.radarFound({ trigger: 'pause' }))`, from the radar
  sheet `router.replace(…)`, so the sheet gives way to the survey and Back lands on the tab. Failure reverts:
  `no_chat` → `toast.noChat`; otherwise `failed()` (haptic only; with `dev016ErrorToastOnFailure` also «Не
  получилось сохранить»). The flag is on by default since the intake of `index-CIa0Ldj2.js`, so these failures show
  the toast (DEC-58). A `409` limit on the switch takes the same failure path, as in legacy; the limit text that `03`
  LB-APP-081 proposes is not adopted here (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `failed()`
  for a later package (`wave-1/baseline.md`, built code behind the pin, row 21)).
- «+» in the top bar (aria `sheet.createTitle` «Новый радар») and «Включить радар» of the empty state:
  `router.push(routes.radarNew(q))`, `q` = the last search filters.
- Pull-to-refresh reloads the list (BR-APP-058, WP-23); the previews follow the new list.

### Radar sheet (SCR-028, BR-APP-047, BR-APP-048)

Layout: header with title, area summary, status dot and text, ×; «Последние находки» strip; settings card; actions
card; sticky footer button. The header is the compact one of `BottomSheet` (centred 17 px title; legacy's is
left-aligned, 19 px). While the radar is not known yet the title is «Радар» (`tab.subs`) and the strip shows its
ghosts.

| Part | Rule and text |
| ---- | ------------- |
| Strip, loading | 3 ghost mini-cards |
| Strip, finds | title `radar.latest` «Последние находки»; mini-card: cover, badge `radar.new` «новое» only when the radar is active and the find is not viewed (the server's `viewed`, or opened in this launch: the `seen` map, as the card's eye), price (`—` when absent), district · age; then `radar.all` «Все {n} ›». The age is the card's formatter of WP-24 over `posted.at`, computed at render and without the minute clock, since legacy release `index-CIa0Ldj2.js` (`03` BR-APP-109; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `RadarStrip` for a later package (`wave-1/baseline.md`, built code behind the pin, row 20)) |
| Strip, none | `radar.none` «Пока ничего — радар пришлёт, как появится» |
| Send switch | `radar.send` «Присылать в чат»; same action as the tile switch |
| Mode rows | only while active: `subs.mode.instant` «Сразу» + `radar.instantHint` «Каждое новое — как только появится»; `subs.mode.digest` «Подборкой» + `radar.digestHint` «Списком в {time}» (e.g. «Списком в 9 и 21», hours joined with `notify.and`) or `radar.digestHintAny` «Списком в заданное время» when settings are not loaded |
| Edit row | `radar.edit` «Изменить условия ›» → `router.push(routes.radarEdit(id))` |
| Hidden row | only when `hidden > 0`: `subs.hidden` «Скрыто: {n}» + `radar.unhide` «Вернуть» |
| Delete row | red `radar.delete` «Удалить радар» |
| Footer | `radar.found` «Смотреть найденное · {n}», or `radar.foundPlain` «Смотреть найденное» while the count is unknown |

- Mode change (only to a different value): light haptic, optimistic `patchRadar(id, { mode })`, answer replaces the
  radar; failure reverts and calls `failed()`. The two rows are a `radiogroup` named «Когда присылать»
  (`settings.group.notify`; legacy `subs.modeAria` is not in the imported catalogue) whose selection does not follow
  the focus: one tab stop on the selected row, the arrow keys, Home and End move the focus, and Enter, Space or a
  tap picks.
- Unhide: `patchRadar(id, { unhide: true })` → success haptic and toast `radar.unhidden` «Скрытое снова
  показывается»; failure → `failed()`.
- Delete: `tg.confirm(subs.deleteConfirm)` «Удалить радар «{name}»?» with the radar title. Cancel sends nothing.
  OK → `deleteRadar(id)`; success → success haptic, the radar leaves both lists, then — only while
  `currentAddress()` is still the one at the request — `ask_found` → `nav.replace(routes.radarFound({ trigger:
  'delete' }))`, else `back()`; failure → `failed()`. As built, with `dev016ErrorToastOnFailure` on, a success also showed
  `toast.subDeleted` (new key). Since the intake of `index-CIa0Ldj2.js` the two halves have a flag each (DEC-58): the
  failures of the mode, unhide and delete rows show «Не получилось сохранить» by default (`dev016ErrorToastOnFailure`,
  on), and the success toast «Радар удалён» moves to `dev016SuccessToastOnDestructive`, off, because legacy still
  shows none (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `failed()` and `RadarSheet` for a later
  package (`wave-1/baseline.md`, built code behind the pin, row 21)).
- A mini-card opens the listing over the tab (`router.push(routes.listing(number))`).
- Closing: ×, backdrop, drag down, Telegram Back, opening the feed, delete.
- Count label, LB-APP-034 behind `dev022RadarCountLabel`: off — the legacy labels above, `{n}` is the number of
  listings that match now. On — the footer reads `radar.foundPlain`, a muted line above it reads
  `sheet.matchingNow` «Сейчас подходит: {n}», and the strip link reads `radar.foundPlain`.
- A radar that no longer exists (deleted in the bot, unknown id in the address): once the list is loaded,
  `router.replace(routes.radars())`. An action that answers `not_found` reloads the list and does the same; on a
  tile it only reloads the list.

### Launch link `?radar=` (DEC-61)

A launch with `?radar=<id>` in the page query opens the search with that radar's filters: the address is replaced by
the radar's feed without `from=radar`, so there is no return state to the sheet (legacy since `index-CIa0Ldj2.js`,
`03` BR-APP-107). HOMI's radar ids are ULIDs; legacy's are integers. It is built with the bot packages, reader and
link together, in WP-57 (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `parse.ts`, `launch.ts` and
`LaunchRedirector` for a later package (`wave-1/baseline.md`, built code behind the pin, row 36)).

### Editor and new radar (SCR-029, SCR-030)

Both mount `FiltersForm` (WP-25). Since legacy release `index-CIa0Ldj2.js` «Площадь» is offered for rent radars too,
as in the search sheet (DEC-62; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `availability.ts` for a
later package (`wave-1/baseline.md`, built code behind the pin, row 38)). Differences from the search mode (BR-APP-021
is WP-22's rule):

| Mode | Title | Start filters | Footer |
| ---- | ----- | ------------- | ------ |
| `radar-new` | `sheet.createTitle` «Новый радар» | the last search filters, city included | flow line, relax chips, `sheet.matchingNow` «Сейчас подходит: {n}» (empty while unknown), primary `sheet.subscribe` «Включить радар» |
| `radar-edit` | `sheet.editTitle` «Условия радара» | the radar's filters through `normalizeFilters` | the same, primary `sheet.save` «Сохранить» |

- No «Опубликовано» section, no «Показать» button in either mode. `FiltersForm` already had both radar modes
  (step 1); it is not edited.
- Submit: medium haptic; the button is disabled while the request runs (no spinner).
- New: `useSubscribe().subscribe(draft, entry, relaxed, { scope })`; `entry` is the address parameter `entry` when
  it is `return` or `feed` (the sheet opened from «Настроить» of the return banner or «Настроить радар» of the radar
  card in the feed, BR-APP-073), and `empty` otherwise («+», the empty radar tab, a direct load); `ok` → `back()`
  and the toast; not `ok` → the sheet stays with the draft. The start filters are the address's when it has a
  search key (every way in builds it), else `searchStateFromHref(lastSearchHref())`.
- Edit: `saveEdit(id, draft, relaxed, { scope })` = `withChatAccess(replaceRadar({ id, filters, relaxed? }))`; same
  closing rule; a `not_found` answer → `common.saveFailed` and a list reload. The radar comes from the tab's list
  (`useRadars({ previews: true })`, no request of its own); until it is known the sheet shows a spinner («Загрузка…»)
  or `ErrorState` with retry.
- Both close on `ok` only while the user is still on the sheet (`useSheetRequest`: a ticket per tap, cleared when
  `<Activity>` hides the copy, and `currentAddress()` unchanged), and a failure's toast goes to the app's host once
  the user has left.
- A relax chip replaces the draft with the option's filters and remembers its code as `relaxed`.
- Closing without saving drops the draft (no confirmation, as legacy).
- Screen names `radar/new` and `radar/edit` come from `screenNameOf` (WP-20, sent by WP-32).

### Survey «Нашли жильё?» (SCR-031, BR-APP-049)

Opens only when a pause or a delete answered `ask_found`; the client never asks on its own. No × button. Closing:
backdrop, drag, Telegram Back, a final answer (the direct-load copy keeps `RouteSheet`'s standalone rule: no
backdrop or drag close). Steps are component state, not history entries. The header is the compact one of
`BottomSheet` (legacy: a left-aligned 26 px heading). Every row plays a light impact, share included; «Да, через
HOMI» also the success haptic; «Готово» none; «Да, в другом месте» scrolls the body to the top. Each row has its
legacy icon (`PartyPopper`, `ShoppingBag`, `Handshake`, `Users` and `Signpost` are re-exported from `@homi/ui` for
it).

| Step | Texts | Actions |
| ---- | ----- | ------- |
| `ask` | `found.title` «Нашли жильё?»; `found.text` | «Да, через HOMI» (`found.kvadro`) → success haptic, step 3; «Да, в другом месте» (`found.elsewhere`) → step 2; «Ещё ищу» (`found.searching`) → close + toast `found.thanksSearching` «Удачи в поиске! Радар можно снова включить в любой момент»; «Больше не ищу» (`found.stopped`) → close + toast `found.thanksStopped` «Понятно, спасибо! Радар можно снова включить в любой момент» |
| `where` | `found.whereTitle` «Где нашли?»; `found.whereText` | «Другой Telegram-канал», «OLX», «Другой сайт (Uybor, Uysot…)», «Через риелтора», «Знакомые подсказали», «Объявление на доме или на улице», «Другое» (`found.where.*`) → close + toast `found.thanksYes` «Поздравляем! 🎉 Спасибо, что рассказали» |
| congratulations | image `brand.assets.hooray` 132 px; `found.congrats` «Поздравляем с новосельем!»; `found.congratsText` | «Рассказать друзьям» (`found.share`, only when `brand.botUsername` is set) → `tg.shareUrl(botStartUrl('s_friend'), t('found.shareText'))`, then close; «Готово» (`found.done`) → close |

Every answer of step 1 calls `sendFound({ answer, trigger })`, every row of step 2 `sendFoundWhere({ where })`,
through `invokeAction`; both are fire-and-forget: not awaited, errors swallowed, rows never disabled. The codes are
the enums of WP-13: `answer` is `homi` (legacy `kvadro` — the catalogue key stays `found.kvadro`), `elsewhere`,
`searching`, `stopped`; `where` is `telegram`, `olx`, `site`, `agent`, `friends`, `street`, `other`, in the order of
the rows above. The address carries `trigger` only; the contract's body has no radar id. A missing or unknown
`trigger` in the address → `router.replace(routes.radars())`; until then the sheet frame stays without rows and
nothing is sent. A second `ask_found` while the survey is open replaces the trigger and keeps the step.

### Follow nudge (SCR-040, BR-APP-043, BR-APP-046)

1. `notifyFiltersApplied` of WP-25 calls the listener `useFollowNudge` registered once (`onFiltersApplied`). An
   apply ends a rendered follow nudge without an event, and the applied filters become the candidate —
   `followPending` true — only when `shouldShowFollowNudge` already holds for them, so default filters, radars
   switched off or a cooldown never hold the home offer back.
2. When `nudgesAllowed` holds, no toast is visible and no return check for the same filters is pending, wait
   1 800 ms; anything else stops the wait, and it starts afresh. The offer arrives before the new address lands, so
   nothing counts as a filter change until a search root has shown the candidate's filters; before that only another
   tab drops it. Then a filter change, a layer or a radar-list change drops the candidate, and so does a return banner
   that takes the slot (BR-APP-071); another tab or the map only pauses it.
3. `shouldShowFollowNudge`: radars are switched on (`useRadarsEnabled()`), filters are custom (`isCustomFilters`),
   no radar has the same filters, radars < the limit, `now ≥ quietUntil`, `now − lastShown ≥ 8 h`, hash not in
   `asked`. Otherwise stop. A shown return banner counts as a shown nudge here: it sets `lastShown` and puts its
   hash into `asked` (BR-APP-043).
4. `GET /listings/flow` with an `AbortSignal`, through `normalizeFlow` (fix of LB-APP-006: an empty or a failed
   answer shows the card without a flow line instead of crashing).
5. Take the slot and render. On the first render (fix of LB-APP-050; legacy marks it when it is scheduled): mark
   asked (keep the newest 40), set `lastShown`, `track('follow_prompt_shown')`.

Card: radar icon; `nudge.title` «Включить радар по этому поиску?»; `nudge.what` «Новые — сразу в чат»; flow line
(`nudge.none` «Таких пока нет — радар пришлёт, как появятся», `alert.week`, `alert.day`, or nothing); «Включить»
(`nudge.enable`); × (aria `common.close`). It rises in above the tab bar; a tap outside does not close it; Telegram
Back does not close it.

| Ends by | Effect |
| ------- | ------ |
| 10 s | hide, `track('follow_prompt_expired')` |
| × | hide, closes + 1 (3 in a row → `quietUntil = now + 14 days`, counter reset), `track('follow_prompt_closed')` |
| «Включить» | medium haptic, hide, closes reset to 0, `subscribe(filters, 'prompt')` |
| Filters change, a new apply | hide, no event |
| A toast, a layer, another address | suspended, no event; back on the feed list with the same filters it renders again with a fresh 10 s |
| A return banner takes the slot | hide, no event |

### Search visits (BR-APP-070)

Since legacy release `index-DY_DH7h-.js`. `features/nudges/visits.ts` keeps `homi-visits` of WP-21: `{ <filter
hash>: ms }`, the last search visit per filter set, the 40 newest kept; the hash is the one of `homi-nudge`.

- Once the reference data is loaded and the session is ready (before `me` an address without a city would record
  the fallback city's search), a visit of the current filters is recorded on entering the search tab (`/` and
  `/map`), on every filter change, and — on the search tab — when the app goes to the background (`tg.onHidden`,
  TMA-040). The list ↔ map toggle and a layer over the search are no new visit; a radar's feed records the radar's
  filters, as legacy did. Visits are recorded whether radars are switched on or not.
- A visit session starts with the launch and again when the app becomes visible after at least 6 h in the
  background (`tg.onVisible`); a new session also re-reads the radar list and, on the search tab, records the visit
  again, which re-arms the return check (legacy; the banner's main way back for a Mini App left open).
- The previous visit of a filter set is the stored time read at its first visit in the current session; module
  memory (legacy `sessionVisits`) keeps it for the rest of the session, while the stored time moves to now with each
  visit.
- `homi-visits` is restored from DeviceStorage before the first data request (WP-21), so the first visit of a
  launch reads the restored map — the legacy race of LB-APP-021 that loses it does not occur.

### Return banner (SCR-046, BR-APP-071)

1. A recorded visit makes a candidate only while radars are switched on (`useRadarsEnabled()`) and the rules that
   need no radar list hold already (`returnDue` of `returnRules.ts`: the previous visit ≥ 6 h ago, no silence, no
   8 h cooldown, no `back[hash]` in 2 days), so a first or recent visit holds back neither the follow nudge nor the
   home offer. With `nudgesAllowed`, nothing over the list and the reference data and the radar list loaded,
   `shouldCheckReturn` (step 2), then `returnPending` = the hash and the 1 800 ms wait; a toast does not stop the
   wait (legacy). A change of the filters or of the radar list, a layer that opens or another tab, during the wait or
   the request, aborts it (`AbortSignal`) and clears `returnPending`; the map or a session that is not ready only
   stops it, and it starts afresh on the feed list. A candidate that has not started yet — a new visit session's,
   recorded while a listing or a sheet covers the search — waits under the layer and starts once the feed list shows
   again.
2. `shouldCheckReturn`: no radar with the same filters — for default filters also none for the same base deal in
   the same city (`hasRadarFor`); radars < `limits.radars` (else 10); a previous visit at least 6 h ago;
   `now ≥ quietUntil` and `now − lastShown ≥ 8 h` (shared with the follow nudge); no `back[hash]` in the last
   2 days. Otherwise stop. It runs again after the wait.
3. `bffFetch('listings/new', { query, signal })` with `query` = `toApiQuery(filters, { rules })` and
   `query.set('since', …)` = `Math.floor(previousVisit / 1000)` (a spread of `URLSearchParams` would be `{}`). Any
   error ends the check silently: no banner, no toast (API-035).
4. Only a positive integer `count` (`Number.isInteger(count) && count > 0`) shows the banner — the client half of
   the fix of LB-APP-048: `0`, a missing `count`, `null`, a string or a fraction show nothing and never throw. The
   server half is WP-12 (`count` always an integer).
5. The banner takes the slot (a follow nudge or its candidate is dropped, a home offer is hidden). On its first
   render (LB-APP-050): `back[hash] = now` (the 40 newest kept), `lastShown = now`, the hash into `asked`,
   `track('return_prompt_shown', { n: count, custom })`. `custom` is `isCustomFilters(filters)` here and in every
   event below.

Card: the `.nudge` card of the follow nudge — radar icon; bold title `back.title` «С вашего прошлого захода —
{count}», where `{count}` is the number through `formatNumber` (WP-22) followed by the plural `back.new` («новое»,
«новых»), so «С вашего прошлого захода — 12 новых» (uz «Oxirgi kirganingizdan beri — 12 ta yangi», en «12 new since
your last visit»); the hint `back.what` «Радар пришлёт следующие сразу — узнаете о них первыми», which wraps
instead of being cut; the button «Включить» (`nudge.enable`) for custom filters or «Настроить» (`nudge.setup`) for
default filters, with a medium haptic; × (aria `common.close`). It is rendered only without a toast, on the feed
list and while the filters still match; under a toast, a layer or another address it is suspended, and the 15 s
restart when it renders again (legacy remount). Switching radars off ends it without an event. No Back handler; a
tap outside does not close it.

| Ends by | Effect |
| ------- | ------ |
| 15 s | hide, `track('return_prompt_expired', { custom })` |
| × | hide, closes + 1 (the streak of the follow nudge: 3 in a row → `quietUntil = now + 14 days`), `track('return_prompt_closed', { custom })` |
| «Включить» (custom filters) | hide, closes reset to 0, `subscribe(filters, 'return')` (BR-APP-073) |
| «Настроить» (default filters) | hide, closes reset to 0, `nav.push(routes.radarNew(toSearchParams(filters), 'return'))` — the banner's filters without `sort` (a radar has none) — the new-radar sheet with these filters, which sends `entry: 'return'` and `relaxed` when a chip was picked |
| Filters change | hide, no event |

### Radar card in the search list (SCR-047, BR-APP-072)

Since legacy release `index-DY_DH7h-.js`. `FeedScreen` passes `FeedRadarCard` into the `inline` slot of
`ListingFeed` (WP-24), which places it after the 8th card, or after the last card of a short, fully loaded list
without the few-results note. It is not a nudge: it scrolls with the list and never takes the slot of `NudgeHost`.

- Rendered when radars are switched on (`useRadarsEnabled()`), the reference data and the radar list are loaded,
  no radar exists for the search (the first condition of step 2 above), radars < the limit, and `now ≥ feedOff`.
- Layout: a section with the animated radar sweep and two blips (static in lite mode and under reduced motion), a
  22 px title, the hint, a full-width primary button with the radar icon and a medium haptic, and × in the top
  right corner (aria `common.close`).
- Texts: title `feedRadar.titleRent` «Хорошие квартиры снимают в первые часы» for rent, daily rent included, or
  `feedRadar.titleSale` «Выгодные квартиры продают быстро» for sale; hint `feedRadar.what` «Включите радар — новые
  по этому поиску придут в Telegram сразу, как появятся.»; button `feedRadar.enable` «Включить радар» for custom
  filters or `feedRadar.setup` «Настроить радар» for default filters.
- Button: closes reset to 0; custom filters → `subscribe(filters, 'feed')`; default filters →
  `nav.push(routes.radarNew(toSearchParams(filters), 'feed'))`, without `sort` as above (BR-APP-073).
- × → `feedOff = now + 7 days`, hidden on every search; `track('feed_radar_closed', { custom })`. This close does
  not count towards the streak of the nudges.
- `track('feed_radar_shown', { custom })` once 60 % of the card is visible (`IntersectionObserver`, threshold 0.6,
  and `isIntersecting && intersectionRatio >= 0.6`; legacy checked `isIntersecting` only), at most once per launch
  per filter hash (module memory); never where `IntersectionObserver` is missing.
- `useFeedRadar(filters)` reads the snooze through `useSyncExternalStore`, whose server snapshot counts as snoozed:
  the server renders no card.

### Constants of the two (`03` §3.4)

| Item | Value |
| ---- | ----- |
| Return banner | check 1.8 s after a visit; previous visit ≥ 6 h ago; once per filter set per 2 days; auto-hide 15 s; 40 visit hashes and 40 banner hashes kept; the 8 h cooldown and the 14-day snooze shared with the follow nudge |
| Radar card in the feed | after 8 cards; × hides it for 7 days; seen at 60 % visibility |

### New and overridden texts

New key (`homi` layer), used as built only with `dev016ErrorToastOnFailure`: `toast.subDeleted` — ru «Радар удалён», uz
«Radar oʻchirildi», en «Radar deleted». Since the intake of `index-CIa0Ldj2.js` its flag is
`dev016SuccessToastOnDestructive`, off (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `RadarSheet`
for a later package (`wave-1/baseline.md`, built code behind the pin, row 21)).

New keys of the switched-off state (`homi` layer; uz and en are proposals for the reviewer):

| Key | ru | uz | en |
| --- | -- | -- | -- |
| `radar.soon.title` | «Радар скоро заработает» | «Radar tez orada ishga tushadi» | «Radar is coming soon» |
| `radar.soon.body` | «Мы включим уведомления о новых объявлениях в ближайшее время.» | «Yangi eʼlonlar haqidagi bildirishnomalarni yaqin orada yoqamiz.» | «We’ll turn on alerts about new listings shortly.» |

The nine keys of the return banner and the radar card in the feed — `back.title`, `back.new`, `back.what`,
`feedRadar.titleRent`, `feedRadar.titleSale`, `feedRadar.what`, `feedRadar.enable`, `feedRadar.setup`,
`nudge.setup` — are legacy keys of the pinned release and arrive with the import of WP-20; none of them carries the
brand word, so none needs an override.

Legacy values with the brand word must have an override in the `homi` layer (the WP-20 test fails without one).
These four were already in the three `homi` catalogues on `main`, so none was added: `found.text` «Подскажите одной
кнопкой — так мы поймём, помогает ли HOMI искать.», `found.kvadro` «Да, через HOMI», `found.congratsText`
«Спасибо, что рассказали. Если HOMI помог — расскажите друзьям, им тоже пригодится.», `found.shareText` (the legacy
sentence with the brand word replaced). The uz and en overrides replace the brand word only.

The radar sheet's mode group uses the legacy key `settings.group.notify` «Когда присылать» as its name; the editor's
spinner uses `feed.loading` «Загрузка…».

## Tests

**Unit (Vitest).**

- `normalize.test.ts`: `relaxed` missing or `null`, `options` `null`, `starter` as a string, filters with a missing
  key, unknown `mode`; `normalizeFlow` for `undefined`, `null`, `{}`, `{ week: 0, days: 7 }`, `days: 0`.
- `subscribe.test.ts`: active twin sends nothing; inactive twin sends one patch; a create answered with `kind`
  `existing` or `reactivated` gives the already-on or the on-again toast; starter toast; few picks the first
  option with `count ≥ 7`; few falls back to the last option; empty toast with and without a hint; success with no
  `options` and no `relaxed` still returns `ok` (regression of LB-APP-005); edit toasts; widen with and without
  starter; `radar_limit` uses the reference maximum or 10; `radar_duplicate` → already on; `radars_disabled` → the
  "soon" toast and `ok: false`; other error → save failed;
  `posted_days` kept by default and `null` with `dev005RadarDropsPostedDays`; two calls with one key share a
  request; list re-read failure falls back to the cache; `entry` `return` and `feed` reach the create body.
- `chatAccess.test.ts`: granted → one retry and `chat_access_allowed` once; declined → `chat_access_declined`, no
  confirm; version 6.8 → confirm, OK opens the bot link; granted but still `no_chat` → confirm once; other failures
  pass untouched; no bot username → no confirm; concurrent calls share one native sheet.
- `radarStatus.test.ts`: paused; no flow; `week 0`; `week 3, days 7`; `week 21, days 7`; unknown mode; both values
  of `dev021OneFlowVocabulary`.
- `followNudge.test.ts` (fake clock): rule matrix (radars switched off, default vs custom filters, existing radar,
  at the limit, cooldown 8 h, snooze after 3 closes, 40 hashes kept, broken JSON); stable hash for equal filters;
  with radars off no flow request is sent; not offered while a return check of the same hash is pending; a shown
  return banner starts its cooldown and marks its hash.
- `visits.test.ts` (fake clock): a visit on entering the tab, on a filter change and on `onHidden`, none before the
  reference data; the 40 newest kept; the previous visit is the stored time at the first visit of the session;
  visible again after 5 h 59 min keeps the session, after 6 h starts a new one and re-reads the radars;
  `posted_days` does not change the hash; broken JSON reads as empty.
- `returnNudge.test.ts` (fake clock): rule matrix (radars switched off → no request; a radar with the same
  filters; default filters with a radar of the same base deal and city; at the limit; previous visit 5 h 59 min
  and 6 h ago; snooze; 8 h cooldown; `back` 1 and 2 days old); the request carries the filters and `since` in
  seconds; `count` `1` and `12` show, `0`, `"12"`, `null`, `1.5` and a missing `count` show nothing and do not
  throw (LB-APP-048); an error shows nothing; a change of filters or radars during the wait or the request aborts
  it.
- `feedRadar.test.ts`: the four conditions (radars off, a radar for the search, at the limit, `feedOff` ahead or
  past); the title per deal (long rent, daily rent, sale); the button per custom or default filters.
- `shown.test.ts`: a nudge dropped before its first render changes neither `lastShown`, `asked` nor `back` and
  sends no event; the first render marks once, a re-render does not mark again (LB-APP-050).

**Component (Vitest + Testing Library).**

- `RadarSoon` (the reference value is given through `ReferenceProvider`; `radarsReady` is `true` in this package):
  `radars_enabled` `false` and missing → the two texts, no button, no «+», no radar request, pull-to-refresh sends
  nothing; `true` → the normal tab; each of the four sheet routes with `false` → one `router.replace` to the tab
  and nothing rendered; a switch answered `radars_disabled` → reverted, the "soon" toast.
- `RadarTiles`: collage with 0, 1, 4, 5 covers; greyscale when inactive; tile and switch are separate controls;
  Enter opens, Space on the switch toggles.
- `RadarSheet`: active vs paused; `hidden` 0 and 3; strip ghost, empty, finds; digest hint with hours, without
  settings; both values of `dev022RadarCountLabel`; delete cancel sends nothing.
- `RadarForms`: titles and buttons per mode; no «Опубликовано»; count line empty and loaded; submit disabled while
  pending; sheet stays open on failure.
- `FoundSheet`: each answer and each `where` code calls the right action; toasts; share hidden without a bot.
- `FollowNudge`, `NudgeHost`: flow `null`, none, week, day; auto-hide at 10 s; × counts; home slot refused while a
  follow nudge, its candidate or a pending return check exists; a return banner hides a home offer and drops a
  follow nudge; a follow nudge never displaces a return banner (LB-APP-049).
- `ReturnNudge`: titles for 1 («новое»), 12 («новых») and 1 234 (number format) in three locales; «Включить» for
  custom, «Настроить» for default filters; 15 s → `return_prompt_expired`; × → `return_prompt_closed` and the
  streak + 1; «Включить» → `subscribe(filters, 'return')`; «Настроить» → `/radars/new` with `entry=return`; not
  rendered under a toast; `return_prompt_shown { n, custom }` once, on the first render.
- `FeedRadarCard`: rent and sale titles; «Включить радар» and «Настроить радар» with their actions (`entry`
  `feed`); × → `feedOff` 7 days ahead and `feed_radar_closed`, the streak unchanged; `feed_radar_shown` at 60 %
  once per hash, never without `IntersectionObserver`; static art in lite mode.
- `RadarForms` also: `entry=return` and `entry=feed` in the address create with that `entry`; no parameter or
  another value → `empty`.

**End to end (Playwright, fake Telegram, cookie mode and header mode).**

- `radars.spec.ts`: tab shows the stub radars; tile → sheet → Back; switch off and on; mode change; delete with
  confirm; «Смотреть найденное» → feed with the radar's filters → Back → same sheet; find → listing → Back → sheet;
  direct load of `/radars/<id>` and of `/radars/<id>/edit`.
- `radar-subscribe.spec.ts`: filters footer «Включить радар» → toast and ✓ state; few-results note button.
- `radar-forms.spec.ts`: «+» → new radar → toast, sheet closed; edit → save → toast.
- `follow-nudge.spec.ts`: apply custom filters → card after 1.8 s → «Включить» → the success toast (the
  `entry: 'prompt'` argument travels inside a Server Action and is asserted in `subscribe.test.ts`).
- `return-nudge.spec.ts` and `feed-radar.spec.ts` need a search that no fixture radar of WP-13 covers (both offers
  disappear when a radar for the search exists). No default Tashkent search is such a search: by `hasRadarFor`
  (same base deal and city) the fixtures `…0001` … `…0003` cover all of them, and the uncovered default searches of
  other cities are too short for the 8th-card slot (AM-98). So the default-filter cases answer `**/bff/radars*`
  themselves with `page.route`, registered before the launch, with the API envelope
  `{ "success": true, "data": [], "meta": { "source": "stub" } }` — a bare `[]` reads as a failed read, and no offer
  appears. Custom searches (rooms 2–2; sale of apartment and house) keep the real list, and one case per spec checks
  that the offer is absent while the fixture radars are in place.
- `return-nudge.spec.ts`: `homi-visits` seeded before launch with a visit 7 h ago for the default filters → after
  1.8 s «С вашего прошлого захода — N новых» with «Настроить» → «Новый радар» with the search filters; the same with
  custom filters → «Включить» → the success toast; the scenario `new_none` → no banner; × hides it; a visit 1 h ago
  → no banner and no `/bff/listings/new` request.
- `feed-radar.spec.ts`: the card after the 8th card of the default feed; the scenario `few` with custom filters →
  after the 5th card; × → absent on the next search too; «Настроить радар» opens «Новый радар».
- `radars-soon.spec.ts`, tagged `@radars-off` — the switched-off state end to end. Its switch is the API's env
  value, not a stub scenario: `radars_enabled` is HOMI's configuration, and the cached reference call never
  forwards the scenario cookie (WP-22). The default run (API with `RADAR_CREATION_ENABLED=true`, the value of
  `backend/.env.example`) excludes the tag. A CLI `--grep @radars-off` cannot select tests that the config's
  `grepInvert` excludes — Playwright applies it in addition — so `E2E_RADARS_OFF=1` switches the config to
  `grep: /@radars-off/` (AM-97); the tag is in the describe title. In `.github/workflows/frontend-e2e.yml` one more
  step starts a second API on stubs on `127.0.0.1:8081` from the same `.env` and database with
  `RADAR_CREATION_ENABLED: 'false'` in its step env (its readiness loop fails unless `GET /reference` answers
  `"radars_enabled":false`), and another runs `pnpm test:e2e` with `E2E_RADARS_OFF=1` and `API_URL` on that port,
  after a green first run; Playwright's web server builds and starts the app again, so its cached reference data
  starts empty. Locally: `E2E_RADARS_OFF=1 E2E_BASE_URL=…` against an app whose API has radars off. Cases, in both
  session modes: the «Радар» tab shows the two texts and no «+»; a direct load of `/radars/new` and of
  `/radars/<fixture id>` ends on `/radars`; a feed with the scenario `few` shows the note without the radar
  button; the filters footer has no «Включить радар»; applying custom filters shows no nudge after 3 s; with
  `homi-visits` seeded 7 h back no return banner appears and no `/bff/listings/new` request is sent, while the visit
  is still recorded; the default feed has no radar card after its 8th card; no request to `/bff/radars` and no
  Server Action at all was sent during the spec. The visits and feed-card cases also use the uncovered custom search
  rooms 2–2, which with radars on gets the return banner and the card. A direct load of a sheet address is checked in
  its end state (the server HTML keeps the sheet until the client redirects).
- States the default stub answers cannot produce use the scenarios of WP-13 through the `homi_stub_scenario`
  cookie that WP-22 forwards: `no_chat`, `radar_limit`, `radar_duplicate`, `existing`, `starter`, `few`,
  `ask_found`, and the reserved `source_unavailable` for a failing save; of WP-12 `new_none` and `new_one` for the
  return banner. The stub list never changes after a
  write, so the ✓ «Радар включён» state is shown with a search equal to the filters of a fixture radar, and
  «Радар снова включён» with the filters of the paused fixture radar.
- Stub limits (KI-64): a created radar (`…0004`) is in no list, so the few-results case answers `/bff/radars` with
  the created radar once the create was sent, and «Расширить» rewrites the relax body's id to `…0001` in flight (the
  sent body is checked apart); a write that is not stored cannot show a mode surviving a reload. The `no_chat` case
  with write access granted clears the scenario cookie when the retry is intercepted. The journal events stay in the
  page's module memory, so the nudge specs check the marks of `homi-nudge` and `homi-visits` instead, seeded with
  `filtersHash` of `@homi/search`. The settings fixture gives the digest hint «Списком в 9 и 19». Without
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` in the builds `botUrl()` is `null`: the restart question and «Рассказать
  друзьям» are covered by unit tests only, and the specs assert that neither appears.
- `foundation.spec.ts` uses the fixture radar `…0001` and checks the editor and the radar sheet as two visible
  sheets, not as a nesting.

## Acceptance checklist

Run in ru, uz, en and in light and dark; cookie mode and header mode where a request is involved.

Staging and production have radars switched off until WP-57 (DEC-51), so only the first line can be seen there
when this package is deployed. The other lines are run against a local stack whose backend env has
`RADAR_CREATION_ENABLED=true`, as `backend/.env.example` does, with the screenshots in the PR, and once more inside
Telegram on staging and production in WP-57, right after it switches radars on. The developer machine's backend env
had radars switched off on 2026-11-18 (AM-99, KI-65): there the local runs used a second stub API with the key on.

- [ ] Radars switched off: the «Радар» tab shows «Радар скоро заработает» with its second line and no button; no
      «+»; the few-results note and the filters footer offer no radar; no nudge appears — neither the follow nudge
      nor the return banner, and the search list has no radar card (both offer a radar: an approved consequence of
      DEC-51, a difference from legacy until WP-57); a radar sheet address opens the tab. Seen inside Telegram on
      staging and production, in three languages.
- [ ] «Радар» tab: spinner, then tiles; a failed list shows the error state and «Повторить» reloads it.
- [ ] No radars: sweep art, both texts and «Включить радар»; the art is static in lite mode.
- [ ] Tile shows collage or icon, title, area summary and status; a paused tile is greyscale and reads «На паузе».
- [ ] Status reads «≈N в день · сразу», «N за неделю · подборкой» or «пока редко · …» for the three flow cases.
- [ ] Keyboard: Tab reaches tile and switch separately; Enter opens the sheet.
- [ ] Opening the tab sends one radar request (`include=previews`) and no per-radar request.
- [ ] Switch off: tile pauses at once; switch on: active again, toast «Радар снова включён. …» when there are new
      listings.
- [ ] Pull-to-refresh reloads the list.
- [ ] Radar sheet: header, strip («новое» only on unviewed finds of an active radar), switch, mode rows only while
      active, digest hint with the user's hours, «Скрыто: N — Вернуть» only when N > 0, red «Удалить радар».
- [ ] Mode change is instant and survives a reload; unhide shows «Скрытое снова показывается».
- [ ] Delete asks «Удалить радар «…»?»; Cancel keeps it; OK removes the tile and closes the sheet.
- [ ] «Смотреть найденное · N» opens the feed with the radar's filters; Back returns to the same sheet and scroll
      position; the search tab still has the user's own filters afterwards.
- [ ] A find opens the listing; Back returns to the radar sheet.
- [ ] A find opened from a strip scrolled sideways and closed leaves the strip and the sheet's own scroll where they
      were (DEC-64; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `RadarSheetRoute` and `radarReturn`
      for a later package (`wave-1/baseline.md`, built code behind the pin, row 37)).
- [ ] The age of a find reads like the card's («5 мин назад», «3 ч назад») and does not tick (*added by the intake of
      `index-CIa0Ldj2.js`*; a parity item of `RadarStrip` for a later package (`wave-1/baseline.md`, built code behind
      the pin, row 20)).
- [ ] A failed switch, mode change, unhide and delete each show «Не получилось сохранить»; a deleted radar shows no
      «Радар удалён» (`dev016SuccessToastOnDestructive` off; *added by the intake of `index-CIa0Ldj2.js`*; a parity
      item of `failed()` and `RadarSheet` for a later package (`wave-1/baseline.md`, built code behind the pin, row
      21)).
- [ ] «Площадь» is offered in «Новый радар» and in the editor for a rent radar (DEC-62; *added by the intake of
      `index-CIa0Ldj2.js`*; a parity item of `availability.ts` for a later package (`wave-1/baseline.md`, built code
      behind the pin, row 38)).
- [ ] Back order: editor → radar sheet → tab; ×, backdrop and drag close each sheet.
- [ ] «+» opens «Новый радар» with the current search filters, without «Опубликовано», with «Сейчас подходит: N»
      and «Включить радар»; success closes it with the right toast.
- [ ] «Изменить условия» opens «Условия радара» with the radar's filters and «Сохранить»; success closes it with
      «Радар обновлён. …».
- [ ] Filters footer: «Включить радар» creates a radar, then shows ✓ «Радар включён»; a second try says «Радар по
      этому поиску уже включён». On stubs, where a write is not stored: ✓ with a search equal to a fixture radar,
      the second-try text with the scenario `existing`; with stored radars this line is ticked again in WP-57,
      when radars are switched on on the servers.
- [ ] Few-results note: «Включить радар по этому поиску» works and disappears once the radar exists.
- [ ] A "few" result offers «Расширить», and it widens the radar.
- [ ] At the limit the toast reads «Уже N радаров — удалите ненужный во вкладке «Радар»».
- [ ] No chat: Telegram asks for write access; allowed → the radar turns on; declined → «Радар не включён — боту
      нужно разрешение писать вам в чат»; without the method → the restart question opens HOMI's bot.
- [ ] Survey after pause or delete: all three steps, every row, every closing toast; «Рассказать друзьям» shares
      the bot link with `s_friend`.
- [ ] Follow nudge appears 1.8 s after applying custom filters, never for default filters, never twice for the same
      filters, hides after 10 s; three closes silence it.
- [ ] The nudge without a flow answer shows no flow line and no crash.
- [ ] Return banner (SCR-046): back on a search at least 6 h after the last visit with these filters, «С вашего
      прошлого захода — N новых» appears 1.8 s after the list opens, only for N > 0, with «Включить» for custom
      filters and «Настроить» for default ones; it hides after 15 s; × counts towards the three-close snooze; it
      does not come back for the same filters within 2 days, nor within 8 h of another nudge.
- [ ] «Включить» on the banner turns the radar on with the toasts of the subscribe flow; «Настроить» opens «Новый
      радар» with the search filters, and its radar is created with `entry: return` (unit test).
- [ ] The return banner, the follow nudge and the home offer are never on screen together; the banner wins and a
      hidden home offer comes back later (LB-APP-049).
- [ ] A nudge that was dropped before it appeared (a toast or a filter change first) starts no cooldown and sends
      no `*_shown` event (LB-APP-050, unit test).
- [ ] A `GET /listings/new` answer without a positive integer `count` shows no banner and no crash screen
      (LB-APP-048, unit test).
- [ ] Radar card in the search list (SCR-047): after the 8th card, or after the last card of a short complete list
      without the few-results note; «Хорошие квартиры снимают в первые часы» for rent, «Выгодные квартиры продают
      быстро» for sale; «Включить радар» for custom, «Настроить радар» for default filters; × hides it for 7 days
      on every search without counting towards the nudge snooze; absent once a radar for the search exists.
- [ ] No text shows the legacy brand name; the demo marker is visible while radars come from stubs.
- [ ] With every `dev…` flag off the labels are the legacy ones; the flagged branches pass their tests.

## Handoff

- **Done** on `wp-30-radars` (from `main` = `d4c0d88`, after #82; independent of #83, #84 and #85, which are open)
  in `7c573de`, `1350bc2` and `22bd976` (code, tests, specs), `dafe3bb` (the review and end-to-end fixes),
  `0eafcf8` (the tab read at request time only, the cookie first) and the docs commit. Four stages of builders worked
  on disjoint files against the orchestrator's decisions: the data layer beside the UI and shell seams; the subscribe
  flow; the radar tab and sheet beside the new-radar, editor and survey sheets and the nudge host with the follow
  nudge; the visits, the return banner and the feed card. Then one end-to-end stage of three writers, three review
  lenses (state and navigation; data and API; parity, accessibility and tests) with a verifier asked to refute each
  finding, and one fix round. The decisions, the fact maps and the legacy read are reports kept with the session, not
  committed.
- **Step 1, the three seams:**
  - `@homi/types`: an item has `preview` only with `include=previews` (an object or `null`), no title and no
    `ask_found`; a mutation's option is `{ code, label, rate, count }` (no `what`, no `filters`); the `403`, `404`
    and `409` codes are not declared on the radar methods in OpenAPI, only in `docs/api/README.md` and the exception
    classes, and `radar_limit` carries no number. `serverApi().radars()` took no query and `relaxRadar(id)` sent no
    body although `code` is required: both changed.
  - `FiltersForm`: both radar modes were complete (titles, the footer with «Сейчас подходит» and one button,
    «Опубликовано» hidden, the relax code handed on), so it is not edited.
  - WP-24 and WP-25 hid their buttons through `radarsReady = false` and the stub `subscribe.ts` (`{ ok: false }`,
    `useHasActiveRadar` false); the flip broke three tests, which were updated.
- **Step 9:** `router.replace` to an intercepted address is intercepted like `router.push`. From the source of
  `next` 16.4.5: `client/components/sequential-router-queue.js` sends push and replace through one `navigate(href,
  navigateType)` and one navigate action; `router-reducer/reducers/navigate-reducer.js` passes `state.nextUrl` on;
  `app-router-state.js` keys the route cache by `createCacheKey(href, nextUrl)` and reads `navigateType` only for
  `pendingPush` (pushState or replaceState); on the server `lib/generate-interception-routes-rewrites.js` gates the
  rewrite on the `Next-Url` header matching the intercepting route, so every page under `/[locale]` intercepts, a
  directly loaded `/radars/<id>` included. The sheet therefore replaces itself with the survey.
- **Departures recorded under rule 6:**
  - AM-96: the radar tab is re-read on every entry through a `renderId`.
  - AM-97: `E2E_RADARS_OFF=1` selects the `@radars-off` run, not `--grep`.
  - AM-98: the default-filter cases of the nudge specs answer `/bff/radars` themselves.
  - AM-99: the developer machine's backend env has radars switched off; the local runs used a second stub API.
  - `useSubscribe()` presents its outcome and resolves `{ ok }`; `{what}` is `option.label`; already on plays no
    haptic; the in-flight dedupe is `subscribe`'s only.
  - Chat access: no separate `isVersionAtLeast`; `withChatAccess(run, { restartText })`; `botUrl()` of
    `lib/deeplinks/build.ts`; a retry's other failure is returned.
  - `sendFound` / `sendFoundWhere` were not reserved names; `deleteRadar` answers `{ ask_found }`;
    `serverApi().radars(query?)`, `relaxRadar(id, { code })`, `invokeAction`, `readResource`.
  - The search tab's radar list through `/bff` in both modes, gated by `useRadarsEnabled()`.
  - `from=radar` dropped in `write` and skipped by `rememberHref` (not in `AppShell`); the `TabBar` rule.
  - A radar sheet address always draws the radar tab's chrome; the editor renders beside the radar sheet; the sheet
    copies render only on their own address, and the standalone copies yield to a shown `@sheet` copy.
  - While radars are off, the sheet addresses keep their server HTML until the client redirects.
  - The tab is read at request time, the cookie first: read before it, the cached reference ran in the prerender of
    the sheet addresses, and the final render missed its entry ("Unexpected cache miss after cache warming").
  - `RouteSheet` / `BottomSheet` `instant`; `routes.radarNew(q?, entry?)`, `routes.radarFound({ trigger })`, `entry`
    and `trigger` reserved.
  - The rules files `followRules.ts` and `returnRules.ts` (the macOS case collision).
  - The nudge rules as built: a candidate and a rendered nudge; suspend and restore with the timer restarted;
    `followPending` only when the rules hold; the return pre-gate; visits only once the session is ready; a new visit
    session re-arms the return check; an idle return candidate waits under a layer.
  - The feed card's seen ratio; «Настроить» and «Настроить радар» push without `sort`; the survey's haptics, scroll
    and icons.
- **Review** (three lenses; 20 findings, each checked by a verifier asked to refute it; 13 confirmed, 12 distinct,
  7 refuted), and the four app bugs K1 … K4 of the end-to-end stage; all fixed in `dafe3bb`. Each fix's test fails
  against the unfixed code (the mutation counts are failing tests of the test file named):
  - A subscribe, save or delete that answered after the user had left the sheet still called the tap's `back()`, one
    history step too many (medium). Fix: `currentAddress()` at the tap and with the answer in `FiltersSheetRoute` and
    the delete, and `useSheetRequest` in the two radar forms. Mutation: the guard removed fails 1 of 22
    (`FiltersSheetRoute`) and 2 of 28 (`RadarSheet`); in the forms (`RadarForms`) no address check, no ticket, an
    unguarded create or edit each fail 2 of 35.
  - Such a request's failure toast showed in the closed sheet's scope (low). Fix: `scope` may be a function read with
    the answer. Mutation: a fixed `sheet` fails 2 of 35 per form and 1 of 22.
  - `putRadar` / `dropRadar` wrote through `seedResource` without aborting a list read in flight, whose older answer
    then overwrote the switch, mode, unhide or delete (found by two lenses). Fix: `seedResource` aborts it, and an
    aborted read writes not even its time. Mutation: no abort fails 1 of 22 (`useResource`) and 3 of 17
    (`useRadars`); the time stamped before the guard 1 of 22.
  - `refreshRadars()` deleted the hidden tab's previews entry, so Back showed the old server `initial` as fresh, or a
    spinner and a second read. Fix: `invalidate` keeps an entry with data and no user as stale. Mutation: deleting
    again fails 2 of 22 (`useResource`) and 1 of 17 (`useRadars`).
  - A radar write on the radar's feed dropped the tab's list; Back opened a loading sheet and lost the scroll (low).
    Fix: the stored return is taken once the list is loaded, and the sheet keeps the radar it last showed meanwhile.
    Mutation: no loaded gate, or the kept radar unused, each fail 1 of 7 (`RadarSheetRoute`).
  - The editor opened from a directly loaded sheet stacked two radar sheets and three dims. Fixed with K2.
  - A return check re-armed by a new visit session under a listing was dropped at once. Fix: an idle candidate waits
    under a layer. Mutation: a layer dropping every candidate fails 2 of 61 return tests; another tab pausing instead
    of dropping 1.
  - The radar forms' footers sent a plain `GET /bff/radars` that only search mode uses (low). Fix:
    `useHasActiveRadar(draft, mode === "search")`. Mutation: the footer ungated fails 3 of 37 (`FiltersForm`), the
    hook ungated 1 of 17 (`match`).
  - The switch's off state was hard to see in the dark theme, and a rem class stopped the thumb 1.25 px short. Fix:
    the px sizes and the colours of "Radar tab". Mutation: each part reverted fails 1 or 2 tests; the WP-20 file 7 of
    the 9 `Switch` tests.
  - The nudges' `role="status"` was inserted already filled, so screen readers did not reliably announce them. Fix:
    the host's polite live line, the card `aria-live="off"`. Mutation: each part undone fails 2 nudge tests.
  - The mode rows claimed a radio group without its keyboard, named «Присылать в чат». Fix: the radiogroup «Когда
    присылать». Mutation: no key handler, no tab index or the old name each fail 1 of 28
    (`RadarSheet`).
  - The editor's pending spinner was announced as «Условия радара» (low). Fix: «Загрузка…». Mutation: 1 of 35
    (`RadarForms`).
  - K1: a find's listing opened under the radar sheet (the `@sheet` copy stayed open). Fix: both copies render only
    on the radar's own address. Mutation: the layer copy shown on any address fails 2 of 7
    (`RadarSheetRoute`).
  - K2: Back from a directly loaded editor left it open over two radar sheets. Fix: the standalone sheet yields while
    a `@sheet` copy shows (a live count, not a latch; a takeover opens without the rise), the standalone editor
    renders only on its own address, the standalone new-radar sheet yields too. Mutation: no yield fails 2 of 7, no
    takeover `instant` 1 of 7, the editor's address rule 1 of 35, the create sheet's yield 1 of 35.
  - K3: «Смотреть найденное» opened the feed at the tab's scroll position. Fix: store the return, scroll to the top,
    then push. Mutation: no scroll, or the scroll before the store, each fail 2 of 28
    (`RadarSheet`).
  - K4: cookie mode read the list once more after a sign-in. Fix: the `renewed` re-read of `useRadars` is removed;
    the `renderId` adoption covers it. Mutation: the re-read restored fails 2 of 17 (`useRadars`).
- **Size** of `0eafcf8`: 140 files, +16 953 / −220 against `main`. Production code is about +5 800 (the app
  +5 698 / −160, the packages +87 / −8), unit and component tests +8 370 / −45, the end-to-end specs +2 725 / −2,
  the catalogues, the Playwright config and the workflow +73 / −5. The header's estimate was 3 700. Steps 14–16 (the
  visits, the return banner, the feed card) can move to a second PR on the reviewer's request.
- **Checks:** see the PR.
- **Open for the reviewer:**
  - The uz and en proposals of the new keys `radar.soon.title`, `radar.soon.body` and `toast.subDeleted`.
  - The compact centred header of the radar sheet and the survey (17 px) against legacy's left-aligned 19 px (the
    survey's 26 px).
  - The shared data-layer changes every `useResource` user gets: `seedResource` aborts a read in flight; `invalidate`
    keeps an entry with data and no user as stale.
  - The restyled `Switch` of `@homi/ui`.
  - The "hide" of the nudges read as suspend and restore: a listing opened over a rendered nudge brings it back on the
    same filters with a fresh timer, against KV-FE-080's "a listing opened over the nudge → it does not come back".
  - The `TabBar` rule's press on another tab, which first remembers the radar's feed as the search (the spec's wider
    wording; the orchestrator's decision named the search tab only): keep or revert.
  - The restart confirm and «Рассказать друзьям» are untested end to end: the builds have no
    `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, so `botUrl()` is `null`.
  - The address guard (as `useCloseOnce`) cannot see a navigation that has been issued but not committed, such as a
    `history.back()` before its `popstate`.
  - The legacy read was the reconstructed source, not the pinned bundle: the radar files at SVN r6, the nudge files at
    r27 (= the pinned `index-DY_DH7h-`), `App.jsx` at r29 (`index-BnFvC-Ft`, one past the pin; r28 and r29 only add
    «Вид карточек» in the settings). The intake of `index-BnFvC-Ft` (2026-11-19) moved the pin to SVN r29, so this read is of the pinned release.
  - The WP-25 sibling bug found by the create-sheet fix: a directly loaded `/filters?pick=city` closed at depth 0
    stacks two filter sheets (KI-66).
- **Not automated:** the checklist lines stay unticked. The checklist asks for ru / uz / en and light / dark with
  screenshots in the PR, which are not attached yet; its first line also asks for Telegram on staging and
  production.
