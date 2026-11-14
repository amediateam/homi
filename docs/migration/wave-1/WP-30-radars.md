# WP-30 — Radars

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
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
| Defects and flags (DEC-36) | LB-APP-005, LB-APP-006, LB-APP-014, LB-APP-036 and, from the pinned release, LB-APP-048, LB-APP-049 and LB-APP-050 are fixed (plain fixes in `09` §4.3; LB-APP-050 also changes when the follow nudge counts as shown). LB-APP-034 is DEV-022: written, tested, behind `dev022RadarCountLabel`, which is off. `dev005RadarDropsPostedDays`, `dev016ErrorToastOnFailure` and `dev021OneFlowVocabulary` are consumed, not owned |
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
| `/radars` | `(main)/radars/page.tsx` | `<Suspense>` around a server part that calls `GET /radars?include=previews` when the cookie exists, then `RadarScreen` with `initial` |
| `/radars/new` | `@sheet/(.)radars/new/page.tsx`, `(main)/radars/new/page.tsx` | `RadarCreateSheet` (SCR-030) |
| `/radars/[id]` | `@sheet/(.)radars/[id]/layout.tsx` + `page.tsx`; `(main)/radars/[id]/layout.tsx` + `page.tsx` | layout: `RadarSheetRoute` and `{children}`; `page.tsx` renders `null` (SCR-028) |
| `/radars/[id]/edit` | `edit/page.tsx` under both layouts | `RadarEditSheet` over the radar sheet (SCR-029) |
| `/radars/found` | `@sheet/(.)radars/found/page.tsx`, `(main)/radars/found/page.tsx` | `FoundSheet`; `?trigger=pause|delete` (SCR-031) |

- Route files hold no logic; both trees import the same components from `features/radars/`.
- While radars are switched off (section "Radars switched off"), `/radars` renders the "soon" state and the four
  sheet addresses return to it.
- The direct-load versions render `RadarScreen` under the sheet, so a reload of `/radars/<id>` shows the same
  picture as a tap on the tile. Closing uses `back()` of `useBack()`: `router.back()` when the app has history,
  else `router.replace(parentOf(pathname))` — `/radars/<id>/edit` → `/radars/<id>` → `/radars`.
- The radar sheet stays mounted under its editor because it is the layout of the segment (vocabulary rule for
  layers). A listing opened from the strip is intercepted into `@overlay`; the `@sheet` catch-all then renders
  `null`, and Back brings the sheet back — the legacy "hidden while a listing is open" (SCR-028).
- `parallel-routes.md` shows a separate `page.tsx` returning `null` for the slot's root address, next to the
  catch-all. «Смотреть найденное» navigates from `/radars/[id]` to `/`; if `@sheet/page.tsx` is missing after WP-20,
  add it here, otherwise the sheet stays over the feed.
- Whether `router.replace` to an intercepted address is intercepted like `router.push` is not stated in the bundled
  docs: **verify before use** (step 9). If it is not, use `push` after `back()` through `closeThen`.

### Modules

| Path under `frontend/app/` | Content |
| -------------------------- | ------- |
| `lib/actions/radars.ts` | Server Actions `createRadar`, `replaceRadar`, `patchRadar`, `deleteRadar`, `relaxRadar`; `(input, auth?)` → `ActionResult<T>` |
| `lib/actions/surveys.ts` | `sendFound`, `sendFoundWhere` (the names WP-22 reserved) |
| `lib/telegram/chatAccess.ts` | `isNoChat(result)`, `withChatAccess(run)` |
| `features/radars/useRadars.ts` | `useRadars({ initial? })` on `useResource('radars', …)`: `{ radars, status, error, refetch, replace(radar), remove(id) }` |
| `features/radars/normalize.ts` | `normalizeRadar`, `normalizeMutation` — total functions. `normalizeFlow` is not written again: it is imported from `features/filters/useLiveStats.ts` (WP-25) |
| `features/radars/subscribe.ts` (a stub since WP-24; bodies written here) | `subscribe(filters, entry, relaxed?)`, `saveEdit(id, filters, relaxed?)`, `relax(id, code)`; each returns `{ ok, toast }`. `useHasActiveRadar(filters)`: true when `useRadars()` holds an active radar with `sameFilters`. `radarsReady` in `features/radars/capability.ts` becomes `true` |
| `features/radars/toasts.ts` | The toast table below as one function per outcome |
| `features/radars/radarStatus.ts` | Status line of a tile and of the sheet header |
| `features/radars/useRadarPreviews.ts` | Finds, matching count and flow per radar |
| `features/radars/{RadarScreen,RadarTiles,RadarEmptyState,RadarSoonState,RadarSheetRoute,RadarSheet,RadarStrip}.tsx` | Tab and radar sheet; the "soon" state |
| `features/radars/{RadarCreateSheet,RadarEditSheet,FoundSheet}.tsx` | Thin wrappers over `FiltersForm`; the survey |
| `features/radars/radarReturn.ts` | `{ id, scrollY }` kept in module memory for the return from a radar feed |
| `features/nudges/{NudgeHost.tsx,store.ts}` | Host and arbitration |
| `features/nudges/{followNudge.ts,useFollowNudge.ts,FollowNudge.tsx}` | Rules, timing, card |
| `features/nudges/visits.ts` | Search visits and visit sessions on `homi-visits` (BR-APP-070) |
| `features/nudges/{returnNudge.ts,useReturnNudge.ts,ReturnNudge.tsx}` | Return banner: rules, timing, the `GET /listings/new` read, card |
| `features/nudges/{feedRadar.ts,FeedRadarCard.tsx}` | Radar card in the search list: conditions, card, its seen event |
| `features/nudges/shown.ts` | `useMarkShownOnRender(kind, mark)`: runs the "shown" bookkeeping in the effect of the first render (fix of LB-APP-050) |
| `features/settings/{useSettings.ts,format.ts}` | `useSettings()` on `useResource('settings', …)` and `digestHours()`, `formatDigestHours()`; WP-31 extends both |

### Subscribe flow (`subscribe.ts`)

One module, no UI. Callers pass `entry`: `filters` (filters footer), `few` (few-results note), `prompt` (follow
nudge), `return` (return banner), `feed` (radar card in the feed), `empty` (new-radar sheet opened from «+» or the
empty tab); the new-radar sheet opened from the banner or the card passes `return` or `feed` (BR-APP-041,
BR-APP-073, BR-API-086).

1. Re-read `GET /radars` (through `refetch()`); when it fails, compare against the cached list.
2. A radar with `sameFilters` (WP-22; `posted_days` ignored) that is active → no request, toast `toast.alreadyOn`,
   `ok: true`.
3. The same but inactive → `withChatAccess(() => patchRadar(id, { active: true }))` → toast `toast.alertOn`.
4. Otherwise `withChatAccess(() => createRadar({ filters: toRadarFilters(filters, rules), entry, relaxed? }))`;
   `relaxed` is left out of the body when no relax chip was chosen. In the WP-13 contract the server repeats the
   check of steps 2 and 3 and says what it did in `kind`, so the answer is read first: `existing` →
   `toast.alreadyOn`; `reactivated` → `toast.alertOn`; `created` → step 5. Steps 2 and 3 stay as the fast path
   for a list that is already loaded.
5. Result → toast: `starter > 0` → count toast; else the first `options[]` entry with `count ≥ 7`, else the last
   one → "few" toast with the action «Расширить» that calls `relax(radar.id, option.code)`; no option → "empty"
   toast with `hint = relaxed[0] ? ' — ' + relaxed[0].text : ''`.
6. `normalizeMutation` makes `options` and `relaxed` arrays and `starter` a finite number before step 5. A request
   that succeeded always ends in a success toast and `ok: true` — the fix of LB-APP-005.
7. Failure, by the `409` codes of WP-13 (the fix of LB-API-033): `no_chat` after the chat-access flow →
   `toast.noChat`; `radar_limit` → `toast.subLimit` with `max` = `limits.radars` from `useReference()` (legacy
   `max_subscriptions`), fallback `10`; `radar_duplicate` (edit and widen only) → `toast.alreadyOn`; the error
   `radars_disabled` of WP-22 (`403`, the server switched radars off after the reference data was cached) → the
   toast `radar.soon.title`; anything else → `common.saveFailed`.
8. Two calls with the same `filtersKey` while one is in flight share one promise.
9. After every success: `refetch()` of the radar list.

`rules` is `searchRules(devFlags)` of WP-22: with `dev005RadarDropsPostedDays` off `toRadarFilters` sends
`posted_days` as it is in the search filters (legacy), on it sends `null`.

### Chat access (`withChatAccess`)

`run` returns an `ActionResult`. When it is a conflict with the contract's `no_chat` code:

1. `tg.isVersionAtLeast('6.9')` → `tg.requestWriteAccess()`.
2. Answer `false` → `track('chat_access_declined')`, return the failure.
3. Answer `true` → `track('chat_access_allowed')`, run once more; success returns; another `no_chat` falls through.
4. Method unavailable or still `no_chat`: when `brand.botUsername` is set, `tg.confirm(t('chat.restart'))`; on OK
   `tg.openLink(botUrl())` — `botUrl()` of WP-21 is the bare `https://t.me/<bot>` of HOMI's bot. Then return the
   failure.
5. A second call while the native sheet is open reuses the pending promise.

Turning a radar on, creating, replacing and widening go through it; turning off, mode, unhide and delete do not
(BR-APP-048).

### Radars switched off (DEC-51)

`useRadarsEnabled()` (`features/radars/capability.ts`, WP-24) is `true` only when `radarsReady` is `true` and
`useReference().radars_enabled` is `true`. While it is `false`:

| Place | Behaviour |
| ----- | --------- |
| `/radars` | `RadarScreen` renders `RadarSoonState` and nothing else: the radar icon (no sweep animation), `radar.soon.title`, `radar.soon.body`, no button. No radar request is sent: the server part reads the cached reference first, and `useRadars` stays disabled |
| «+» in the top bar of the tab | not rendered |
| `/radars/new`, `/radars/<id>`, `/radars/<id>/edit`, `/radars/found` | loaded directly or reached by a stale link: `router.replace(routes.radars())` once the reference data is there; nothing of the sheet is shown |
| Few-results note, filters footer | their radar buttons are hidden (WP-24, WP-25 ask the same hook) |
| Follow nudge | never offered: `offerFollowNudge` returns before the flow request |
| Return banner | never checked: no wait, no `GET /listings/new`, nothing rendered. Visits are still recorded in `homi-visits`, so the banner has its history when radars come on |
| Radar card in the feed | not passed into the inline slot of the list; nothing rendered, no event |
| Radar list on the search tab | not requested |

The tab itself stays in the tab bar. Pull-to-refresh on the "soon" state does nothing. A radar action that is
answered `radars_disabled` although the hook said "on" — the reference data is cached for about ten minutes —
reverts its optimistic change and shows the toast `radar.soon.title`; the entry points disappear with the next
reference refresh. Nothing here reads the stub scenario cookie: the state follows the server's configuration.

### Previews (BR-APP-063, fix of LB-APP-036)

The WP-13 contract carries the previews: `GET /radars?include=previews` adds `preview` to every radar —
`preview.items` (at most 5 listing previews, newest first), `preview.count` (listings that match now, may be
`null`) and `preview.flow` (`week`, `days`, may be `null`); `preview` itself is `null` when it could not be
computed. `useRadarPreviews` only maps it, so the tab sends one request. The list read for the search tab (footer
state, note, nudge rules) is sent without `include`. There is no per-radar fallback to the listing methods.

Every flow value passes `normalizeFlow` of WP-25: anything that is not an object with a numeric `week` and a
positive `days` becomes `null`.

### Return from a radar feed

«Смотреть найденное» stores `{ id, scrollY: window.scrollY }` in `radarReturn`, then
`router.push(routes.feed(query))`, where `query` = `toSearchParams(radar.filters, sort)` plus `from=radar` and
`sort` = `normalizeSort(lastSort, sortOptions(radar.filters, city))`. Back returns to `/radars/[id]`: the sheet
opens without the rise animation (`instant`) and the list scrolls to the stored position.

Two rules make this work. The remembered last search is `lastSearchHref` of `lib/ui/shellState.ts`, written by
`AppShell` (WP-23): while `from=radar` is in the address `AppShell` does not write it, so after Back the search
tab still holds the user's own filters ("the last search filters" in this file are
`searchStateFromHref(lastSearchHref)` of WP-22). And `setFilters` / `setSort` of `lib/search/useSearchState.ts`
drop `from=radar` — the one reserved parameter they remove: a filter or sort change on that feed, or a tab press,
makes the radar's filters the search — the legacy "tab press clears radar-return" (`03` §1.2).

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
- The follow nudge is not offered while `returnPending` is the hash of the same filters (BR-APP-046).
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
feedOff: 0 }`. The hash of a filter set is djb2 over `filtersKey(filters)`, unsigned, base 36, so `posted_days` is
ignored.

## Files

New, under `frontend/app/`:

- `app/[locale]/(main)/radars/page.tsx` (replaces the WP-20 placeholder), `radars/new/page.tsx`,
  `radars/[id]/layout.tsx`, `radars/[id]/page.tsx`, `radars/[id]/edit/page.tsx`, `radars/found/page.tsx`.
- `app/[locale]/(main)/@sheet/(.)radars/new/page.tsx`, `(.)radars/[id]/layout.tsx`, `(.)radars/[id]/page.tsx`,
  `(.)radars/[id]/edit/page.tsx`, `(.)radars/found/page.tsx`; `@sheet/page.tsx` if missing.
- Every module of the table in "Design".
- `tests/radars/{normalize,subscribe,radarStatus}.test.ts`, `tests/radars/{RadarSoon,RadarTiles,RadarSheet,
  RadarForms,FoundSheet}.test.tsx`, `tests/telegram/chatAccess.test.ts`, `tests/nudges/{followNudge.test.ts,
  FollowNudge.test.tsx,NudgeHost.test.tsx}`, `tests/nudges/{visits,returnNudge,feedRadar,shown}.test.ts`,
  `tests/nudges/{ReturnNudge,FeedRadarCard}.test.tsx`.
- `e2e/{radars,radar-subscribe,radar-forms,follow-nudge,return-nudge,feed-radar,radars-soon}.spec.ts`.

Changed:

- `lib/api/bffAllowList.ts`: nothing to add — `GET radars`, `GET settings` and `GET listings/new` are in the list
  of WP-22.
- `lib/search/useSearchState.ts` (drops `from=radar`), `features/shell/AppShell.tsx` (no `lastSearchHref` write
  under `from=radar`; mount `NudgeHost`), `features/shell/TopBar.tsx` («+» action).
- `features/radars/capability.ts` (`radarsReady = true`), `features/radars/subscribe.ts` (stub of WP-24 replaced).
- `features/filters/FiltersForm.tsx` and the footer (radar modes, «Включить радар» state), `features/feed/
  FewResultsNote.tsx` (button), `features/feed/FeedScreen.tsx` (passes `FeedRadarCard` into the `inline` slot of
  WP-24). The apply handlers are not edited: the nudge registers
  `onFiltersApplied(offerFollowNudge)` of WP-25 (`features/filters/applyFilters.ts`).
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

`{count}` is the plural `listings` («3 объявления»); `{what}` and `{rate}` are the option's server strings. A
toast with an action lives 6 s, a plain one 4 s (WP-23). Success and error haptics follow the outcome. The confirm
after an unrecoverable `no_chat` is `chat.restart` «Бот не может писать вам — похоже, он остановлен. Открыть чат с
ботом? Нажмите там «Перезапустить» и включите радар снова.».

Callers: the filters footer shows ✓ «Радар включён» instead of the button when an active radar with the same
filters exists, and disables the button while submitting; the sheet closes on `ok`. The few-results note hides its
radar button when such a radar exists.

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
  switch is its sibling, a separate focus stop (fix of LB-APP-014).
- Switch: light haptic, optimistic flip. On → `withChatAccess(patchRadar(id, { active: true }))`; off → plain
  `patchRadar`. Success replaces the radar with the answer. Turning on with `starter > 0` → toast `subs.resumed`
  «Радар снова включён. {count}, которые вы не видели, — в чате с ботом». Turning off with `ask_found` → the
  survey with trigger `pause`: from a tile `router.push(routes.radarFound({ trigger: 'pause' }))`, from the radar
  sheet `router.replace(…)`, so the sheet gives way to the survey and Back lands on the tab. Failure reverts:
  `no_chat` → `toast.noChat`; otherwise `failed()` (haptic only; with `dev016ErrorToastOnFailure` also «Не
  получилось сохранить»).
- «+» in the top bar (aria `sheet.createTitle` «Новый радар») and «Включить радар» of the empty state:
  `router.push(routes.radarNew(q))`, `q` = the last search filters.
- Pull-to-refresh reloads the list (BR-APP-058, WP-23); the previews follow the new list.

### Radar sheet (SCR-028, BR-APP-047, BR-APP-048)

Layout: header with title, area summary, status dot and text, ×; «Последние находки» strip; settings card; actions
card; sticky footer button.

| Part | Rule and text |
| ---- | ------------- |
| Strip, loading | 3 ghost mini-cards |
| Strip, finds | title `radar.latest` «Последние находки»; mini-card: cover, badge `radar.new` «новое» only when the radar is active and the find is not viewed, price (`—` when absent), district · age; then `radar.all` «Все {n} ›» |
| Strip, none | `radar.none` «Пока ничего — радар пришлёт, как появится» |
| Send switch | `radar.send` «Присылать в чат»; same action as the tile switch |
| Mode rows | only while active: `subs.mode.instant` «Сразу» + `radar.instantHint` «Каждое новое — как только появится»; `subs.mode.digest` «Подборкой» + `radar.digestHint` «Списком в {time}» (e.g. «Списком в 9 и 21», hours joined with `notify.and`) or `radar.digestHintAny` «Списком в заданное время» when settings are not loaded |
| Edit row | `radar.edit` «Изменить условия ›» → `router.push(routes.radarEdit(id))` |
| Hidden row | only when `hidden > 0`: `subs.hidden` «Скрыто: {n}» + `radar.unhide` «Вернуть» |
| Delete row | red `radar.delete` «Удалить радар» |
| Footer | `radar.found` «Смотреть найденное · {n}», or `radar.foundPlain` «Смотреть найденное» while the count is unknown |

- Mode change (only to a different value): light haptic, optimistic `patchRadar(id, { mode })`, answer replaces the
  radar; failure reverts and calls `failed()`.
- Unhide: `patchRadar(id, { unhide: true })` → success haptic and toast `radar.unhidden` «Скрытое снова
  показывается»; failure → `failed()`.
- Delete: `tg.confirm(subs.deleteConfirm)` «Удалить радар «{name}»?» with the radar title. Cancel sends nothing.
  OK → `deleteRadar(id)`; success → success haptic, the radar leaves the list, then `ask_found` →
  `router.replace(routes.radarFound({ trigger: 'delete' }))`, else `back()`; failure → `failed()`. With
  `dev016ErrorToastOnFailure` on, a success also shows `toast.subDeleted` (new key).
- A mini-card opens the listing over the tab (`router.push(routes.listing(number))`).
- Closing: ×, backdrop, drag down, Telegram Back, opening the feed, delete.
- Count label, LB-APP-034 behind `dev022RadarCountLabel`: off — the legacy labels above, `{n}` is the number of
  listings that match now. On — the footer reads `radar.foundPlain`, a muted line above it reads
  `sheet.matchingNow` «Сейчас подходит: {n}», and the strip link reads `radar.foundPlain`.
- A radar that no longer exists (deleted in the bot, unknown id in the address): once the list is loaded,
  `router.replace(routes.radars())`. An action that answers `not_found` reloads the list and does the same.

### Editor and new radar (SCR-029, SCR-030)

Both mount `FiltersForm` (WP-25). Differences from the search mode (BR-APP-021 is WP-22's rule):

| Mode | Title | Start filters | Footer |
| ---- | ----- | ------------- | ------ |
| `radar-new` | `sheet.createTitle` «Новый радар» | the last search filters, city included | flow line, relax chips, `sheet.matchingNow` «Сейчас подходит: {n}» (empty while unknown), primary `sheet.subscribe` «Включить радар» |
| `radar-edit` | `sheet.editTitle` «Условия радара» | the radar's filters through `normalizeFilters` | the same, primary `sheet.save` «Сохранить» |

- No «Опубликовано» section, no «Показать» button in either mode.
- Submit: medium haptic; the button is disabled while the request runs (no spinner).
- New: `subscribe(draft, entry, relaxed)`; `entry` is the address parameter `entry` when it is `return` or `feed`
  (the sheet opened from «Настроить» of the return banner or «Настроить радар» of the radar card in the feed,
  BR-APP-073), and `empty` otherwise («+», the empty radar tab, a direct load); `ok` → `back()` and the toast; not
  `ok` → the sheet stays with the draft.
- Edit: `saveEdit(id, draft, relaxed)` = `withChatAccess(replaceRadar(id, { filters, relaxed? }))`; same closing
  rule; a `not_found` answer → `common.saveFailed` and a list reload.
- A relax chip replaces the draft with the option's filters and remembers its code as `relaxed`.
- Closing without saving drops the draft (no confirmation, as legacy).
- Screen names `radar/new` and `radar/edit` come from `screenNameOf` (WP-20, sent by WP-32).

### Survey «Нашли жильё?» (SCR-031, BR-APP-049)

Opens only when a pause or a delete answered `ask_found`; the client never asks on its own. No × button. Closing:
backdrop, drag, Telegram Back, a final answer. Steps are component state, not history entries.

| Step | Texts | Actions |
| ---- | ----- | ------- |
| `ask` | `found.title` «Нашли жильё?»; `found.text` | «Да, через HOMI» (`found.kvadro`) → success haptic, step 3; «Да, в другом месте» (`found.elsewhere`) → step 2; «Ещё ищу» (`found.searching`) → close + toast `found.thanksSearching` «Удачи в поиске! Радар можно снова включить в любой момент»; «Больше не ищу» (`found.stopped`) → close + toast `found.thanksStopped` «Понятно, спасибо! Радар можно снова включить в любой момент» |
| `where` | `found.whereTitle` «Где нашли?»; `found.whereText` | «Другой Telegram-канал», «OLX», «Другой сайт (Uybor, Uysot…)», «Через риелтора», «Знакомые подсказали», «Объявление на доме или на улице», «Другое» (`found.where.*`) → close + toast `found.thanksYes` «Поздравляем! 🎉 Спасибо, что рассказали» |
| congratulations | image `brand.assets.hooray` 132 px; `found.congrats` «Поздравляем с новосельем!»; `found.congratsText` | «Рассказать друзьям» (`found.share`, only when `brand.botUsername` is set) → `tg.shareUrl(botStartUrl('s_friend'), t('found.shareText'))`, then close; «Готово» (`found.done`) → close |

Every answer of step 1 calls `sendFound({ answer, trigger })`, every row of step 2 `sendFoundWhere({ where })`;
both are fire-and-forget: not awaited, errors swallowed, rows never disabled. The codes are the enums of WP-13:
`answer` is `homi` (legacy `kvadro` — the catalogue key stays `found.kvadro`), `elsewhere`, `searching`,
`stopped`; `where` is `telegram`, `olx`, `site`, `agent`, `friends`, `street`, `other`, in the order of the rows
above. The address carries `trigger` only; the contract's body has no radar id. A missing or unknown `trigger` in the
address → `router.replace(routes.radars())`. A second `ask_found` while the survey is open replaces the trigger.

### Follow nudge (SCR-040, BR-APP-043, BR-APP-046)

1. `notifyFiltersApplied` of WP-25 calls the registered `offerFollowNudge(filters)`; `followPending` becomes true.
   It is not offered while a return check for the same filters is pending (`returnPending`, BR-APP-046).
2. When `nudgesAllowed` holds and no toast is visible, wait 1 800 ms. A filter change in between drops the
   candidate; so does a return banner that takes the slot (BR-APP-071).
3. `shouldShowFollowNudge`: radars are switched on (`useRadarsEnabled()`), filters are custom (`isCustomFilters`),
   no radar has the same filters, radars < the limit, `now ≥ quietUntil`, `now − lastShown ≥ 8 h`, hash not in
   `asked`. Otherwise stop. A shown return banner counts as a shown nudge here: it sets `lastShown` and puts its
   hash into `asked` (BR-APP-043).
4. `GET /listings/flow` with an `AbortSignal`, through `normalizeFlow` (fix of LB-APP-006: an empty answer shows
   the card without a flow line instead of crashing).
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
| Filters change, navigation, a toast, a layer opens | hide, no event |
| A return banner takes the slot | hide, no event |

### Search visits (BR-APP-070)

Since legacy release `index-DY_DH7h-.js`. `features/nudges/visits.ts` keeps `homi-visits` of WP-21: `{ <filter
hash>: ms }`, the last search visit per filter set, the 40 newest kept; the hash is the one of `homi-nudge`.

- Once the reference data is loaded, a visit of the current filters is recorded on entering the search tab (`/`
  and `/map`), on every filter change, and — on the search tab — when the app goes to the background
  (`tg.onHidden`, TMA-040). Visits are recorded whether radars are switched on or not.
- A visit session starts with the launch and again when the app becomes visible after at least 6 h in the
  background (`tg.onVisible`); a new session also re-reads the radar list.
- The previous visit of a filter set is the stored time read at its first visit in the current session; module
  memory (`sessionVisits`) keeps it for the rest of the session, while the stored time moves to now with each
  visit.
- `homi-visits` is restored from DeviceStorage before the first data request (WP-21), so the first visit of a
  launch reads the restored map — the legacy race of LB-APP-021 that loses it does not occur.

### Return banner (SCR-046, BR-APP-071)

1. After a recorded visit, with `nudgesAllowed`, nothing over the list, radars switched on (`useRadarsEnabled()`)
   and the reference data and the radar list loaded: `returnPending` = the hash; wait 1 800 ms. A change of the
   filters or of the radar list, or a layer that opens, during the wait or the request aborts it (`AbortSignal`)
   and clears `returnPending`.
2. `shouldCheckReturn`: no radar with the same filters — for default filters also none for the same base deal in
   the same city; radars < `limits.radars` (else 10); a previous visit at least 6 h ago; `now ≥ quietUntil` and
   `now − lastShown ≥ 8 h` (shared with the follow nudge); no `back[hash]` in the last 2 days. Otherwise stop.
3. `bffFetch('listings/new', { query: { ...toApiQuery(filters), since: Math.floor(previousVisit / 1000) }, signal
   })`. Any error ends the check silently: no banner, no toast (API-035).
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
list and while the filters still match; the 15 s run from its first render. No Back handler; a tap outside does not
close it.

| Ends by | Effect |
| ------- | ------ |
| 15 s | hide, `track('return_prompt_expired', { custom })` |
| × | hide, closes + 1 (the streak of the follow nudge: 3 in a row → `quietUntil = now + 14 days`), `track('return_prompt_closed', { custom })` |
| «Включить» (custom filters) | hide, closes reset to 0, `subscribe(filters, 'return')` (BR-APP-073) |
| «Настроить» (default filters) | hide, closes reset to 0, `router.push(routes.radarNew({ ...q, entry: 'return' }))`, `q` = the current search parameters — the new-radar sheet with these filters, which sends `entry: 'return'` and `relaxed` when a chip was picked |
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
  `router.push(routes.radarNew({ ...q, entry: 'feed' }))` with `q` as above (BR-APP-073).
- × → `feedOff = now + 7 days`, hidden on every search; `track('feed_radar_closed', { custom })`. This close does
  not count towards the streak of the nudges.
- `track('feed_radar_shown', { custom })` once 60 % of the card is visible (`IntersectionObserver`, threshold 0.6),
  at most once per launch per filter hash (module memory); never where `IntersectionObserver` is missing.

### Constants of the two (`03` §3.4)

| Item | Value |
| ---- | ----- |
| Return banner | check 1.8 s after a visit; previous visit ≥ 6 h ago; once per filter set per 2 days; auto-hide 15 s; 40 visit hashes and 40 banner hashes kept; the 8 h cooldown and the 14-day snooze shared with the follow nudge |
| Radar card in the feed | after 8 cards; × hides it for 7 days; seen at 60 % visibility |

### New and overridden texts

New key (`homi` layer), used only with `dev016ErrorToastOnFailure`: `toast.subDeleted` — ru «Радар удалён», uz
«Radar oʻchirildi», en «Radar deleted».

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
Check and add: `found.text` «Подскажите одной кнопкой — так мы поймём, помогает ли HOMI искать.», `found.kvadro`
«Да, через HOMI», `found.congratsText` «Спасибо, что рассказали. Если HOMI помог — расскажите друзьям, им тоже
пригодится.», `found.shareText` (the legacy sentence with the brand word replaced). The uz and en overrides replace
the brand word only.

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
- `return-nudge.spec.ts` and `feed-radar.spec.ts` use a search that no fixture radar of WP-13 covers (both offers
  disappear when a radar for the search exists).
- `return-nudge.spec.ts`: `homi-visits` seeded before launch with a visit 7 h ago for the default filters → after
  1.8 s «С вашего прошлого захода — N новых» with «Настроить» → «Новый радар» with the search filters; the same with
  custom filters → «Включить» → the success toast; the scenario `new_none` → no banner; × hides it; a visit 1 h ago
  → no banner and no `/bff/listings/new` request.
- `feed-radar.spec.ts`: the card after the 8th card of the default feed; the scenario `few` with custom filters →
  after the 5th card; × → absent on the next search too; «Настроить радар» opens «Новый радар».
- `radars-soon.spec.ts`, tagged `@radars-off` — the switched-off state end to end. Its switch is the API's env
  value, not a stub scenario: `radars_enabled` is HOMI's configuration, and the cached reference call never
  forwards the scenario cookie (WP-22). The default run (API with `RADAR_CREATION_ENABLED=true`, the value of
  `backend/.env.example`) excludes the tag. A second step of `.github/workflows/frontend-e2e.yml` restarts the API
  service with `RADAR_CREATION_ENABLED=false`, builds and starts the app again against it (the first build cached
  the reference data with radars on) and runs `pnpm test:e2e --grep @radars-off`; locally the same after setting
  the key to `false` in the backend's env file and `make dev-start`, with `E2E_BASE_URL`. Cases, in both session
  modes: the «Радар» tab shows the two texts and no «+»; a direct load of `/radars/new` and of
  `/radars/<fixture id>` ends on `/radars`; a feed with the scenario `few` shows the note without the radar
  button; the filters footer has no «Включить радар»; applying custom filters shows no nudge after 3 s; with
  `homi-visits` seeded 7 h back no return banner appears and no `/bff/listings/new` request is sent; the default
  feed has no radar card after its 8th card; no request to `/bff/radars` and no radar Server Action was sent during
  the spec.
- States the default stub answers cannot produce use the scenarios of WP-13 through the `homi_stub_scenario`
  cookie that WP-22 forwards: `no_chat`, `radar_limit`, `radar_duplicate`, `existing`, `starter`, `few`,
  `ask_found`, and the reserved `source_unavailable` for a failing save; of WP-12 `new_none` and `new_one` for the
  return banner. The stub list never changes after a
  write, so the ✓ «Радар включён» state is shown with a search equal to the filters of a fixture radar, and
  «Радар снова включён» with the filters of the paused fixture radar.

## Acceptance checklist

Run in ru, uz, en and in light and dark; cookie mode and header mode where a request is involved.

Staging and production have radars switched off until WP-57 (DEC-51), so only the first line can be seen there
when this package is deployed. The other lines are run against the local stack (`https://app.homi.loc`, whose
backend env has `RADAR_CREATION_ENABLED=true` as `backend/.env.example` does) with the screenshots in the PR, and
once more inside Telegram on staging and production in WP-57, right after it switches radars on.

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

Empty.
