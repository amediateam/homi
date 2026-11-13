# WP-30 — Radars

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-25, WP-26 |
| Size | ≈ 3 000 changed lines, L |
| Behaviour reference | `03` §2 (SCR-026 … SCR-031, SCR-040), §3.2 (nudge storage), §3.3 (events), §3.4 (constants), §4, §5, §5b; `05` TMA-033 and §2; task files KV-FE-074, KV-FE-075, KV-FE-076, KV-FE-077, KV-FE-078, KV-FE-079, KV-FE-080, KV-FE-030 |
| Needs from the production track | nothing |

The task files above were written for another architecture. Their states, texts, constants, edge cases and test
ideas are taken; their file layout, navigation stack, API paths and transport are not.

## Goal

The whole radar part of the Mini App works on stubs: turning a radar on from the feed, the filters sheet and the
nudge; the «Радар» tab with tiles and previews; the radar sheet; the new-radar and editor sheets; the «Нашли
жильё?» survey; the follow nudge. One subscribe flow serves every entry point, and the "bot cannot write to you"
case asks for write access to HOMI's own bot.

## Scope

**In.**

- The subscribe flow (create, reactivate, already on, limit, widen) and the chat-access flow.
- The radar tab, its empty state, tiles, status lines and previews; pull-to-refresh on the tab.
- The radar sheet, the editor and the new-radar sheet (`FiltersForm` in its two radar modes), the survey.
- The follow nudge and `NudgeHost` with its arbitration rules.
- Wiring of the buttons earlier packages left without an action: «Включить радар» in the filters footer (WP-25),
  «Включить радар по этому поиску» in the few-results note (WP-24), «+» in the top bar of the radar tab (WP-23).

**Out.**

- The filters form itself, the live count and the flow line: WP-25. Formatters (`formatFlow`, `filtersTitle`,
  `filtersAreaSummary`): WP-22.
- Delivery of radar results, quiet hours and digests: the API and the bot (WP-45, WP-46, WP-57).
- The home-screen nudge and the settings pages (digest time, quiet hours): WP-31.
- The event transport and screen tracking: WP-32. This package only calls `track()`.

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| DEC-32, DEC-46 | Rebuilt from the audit; the checklist below is the proof of parity |
| Ref. DEC-36 | LB-APP-005, LB-APP-006, LB-APP-014 and LB-APP-036 are fixed. LB-APP-034 is DEV-022: written, tested, behind `dev022RadarCountLabel`, which is off. `dev005RadarDropsPostedDays`, `dev016ErrorToastOnFailure` and `dev021OneFlowVocabulary` are consumed, not owned |
| DEC-40, 25 §2 rule 5 | The bot is HOMI's own. Every bot link and every text with the brand name goes through `lib/brand` and the `homi` catalogue layer |
| Ref. DEC-43 | Radars are HOMI's own data with HOMI's own identifiers (25 §4.1); nothing here knows a legacy radar id |
| DEC-44, 25 §3.2 | Sheets are intercepting routes in the `@sheet` slot; Back closes editor, then radar sheet, then nothing (root tab) |
| 25 §3.4 | Every read works with `initial` data from the server (cookie mode) and through `/bff` (header mode); every mutation is a Server Action that takes the token as an argument in header mode |
| 25 §4.2 | Methods used: `GET /radars`, `POST /radars`, `PUT /radars/{id}`, `PATCH /radars/{id}`, `DELETE /radars/{id}`, `POST /radars/{id}/relax`, `POST /surveys/found`, `POST /surveys/found/where`; reads of `GET /listings/flow`, `GET /listings/count`, `GET /listings` (previews, only if the contract has no preview field) and `GET /settings` (digest hours) |
| 25 §4.4 | A radar answer with `meta.source = stub` shows the demo marker through `reportSource()` |

Read before coding: `03-api-reference/03-file-conventions/parallel-routes.md` (slots, `default.js`, "Closing the
modal"), `intercepting-routes.md`, `02-guides/preserving-ui-state.md` (state of hidden routes),
`03-api-reference/04-functions/use-router.md` (`push`, `replace`, `back`, `scroll: false`),
`02-guides/single-page-applications.md` ("Mutating data with Server Actions").

## Design

### Routes

| Address | Files | Renders |
| ------- | ----- | ------- |
| `/radars` | `(main)/radars/page.tsx` | `<Suspense>` around a server part that calls `GET /radars` when the cookie exists, then `RadarScreen` with `initial` |
| `/radars/new` | `@sheet/(.)radars/new/page.tsx`, `(main)/radars/new/page.tsx` | `RadarCreateSheet` (SCR-030) |
| `/radars/[id]` | `@sheet/(.)radars/[id]/layout.tsx` + `page.tsx`; `(main)/radars/[id]/layout.tsx` + `page.tsx` | layout: `RadarSheetRoute` and `{children}`; `page.tsx` renders `null` (SCR-028) |
| `/radars/[id]/edit` | `edit/page.tsx` under both layouts | `RadarEditSheet` over the radar sheet (SCR-029) |
| `/radars/found` | `@sheet/(.)radars/found/page.tsx`, `(main)/radars/found/page.tsx` | `FoundSheet`; `?trigger=pause|delete` (SCR-031) |

- Route files hold no logic; both trees import the same components from `features/radars/`.
- The direct-load versions render `RadarScreen` under the sheet, so a reload of `/radars/7` shows the same picture
  as a tap on the tile. Closing uses `back()` of `useBack()`: `router.back()` when the app has history, else
  `router.replace(parentOf(pathname))` — `/radars/7/edit` → `/radars/7` → `/radars`.
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
| `lib/actions/surveys.ts` | `submitFound`, `submitFoundWhere` |
| `lib/telegram/chatAccess.ts` | `isNoChat(result)`, `withChatAccess(run)` |
| `features/radars/useRadars.ts` | `useRadars({ initial? })` on `useResource('radars', …)`: `{ radars, status, error, refetch, replace(radar), remove(id) }` |
| `features/radars/normalize.ts` | `normalizeRadar`, `normalizeMutation`, `normalizeFlow` — total functions |
| `features/radars/subscribe.ts` | `subscribe(filters, entry, relaxed?)`, `saveEdit(id, filters, relaxed?)`, `relax(id, code)`; each returns `{ ok, toast }` |
| `features/radars/toasts.ts` | The toast table below as one function per outcome |
| `features/radars/radarStatus.ts` | Status line of a tile and of the sheet header |
| `features/radars/useRadarPreviews.ts` | Finds, matching count and flow per radar |
| `features/radars/{RadarScreen,RadarTiles,RadarEmptyState,RadarSheetRoute,RadarSheet,RadarStrip}.tsx` | Tab and radar sheet |
| `features/radars/{RadarCreateSheet,RadarEditSheet,FoundSheet}.tsx` | Thin wrappers over `FiltersForm`; the survey |
| `features/radars/radarReturn.ts` | `{ id, scrollY }` kept in module memory for the return from a radar feed |
| `features/nudges/{NudgeHost.tsx,store.ts}` | Host and arbitration |
| `features/nudges/{followNudge.ts,useFollowNudge.ts,FollowNudge.tsx}` | Rules, timing, card |
| `features/settings/{useSettings.ts,format.ts}` | `useSettings()` on `useResource('settings', …)` and `digestHours()`, `formatDigestHours()`; WP-31 extends both |

### Subscribe flow (`subscribe.ts`)

One module, no UI. Callers pass `entry`: `filters` (filters footer), `few` (few-results note), `prompt` (follow
nudge), `empty` (new-radar sheet).

1. Re-read `GET /radars` (through `refetch()`); when it fails, compare against the cached list.
2. A radar with `sameFilters` (WP-22; `posted_days` ignored) that is active → no request, toast `toast.alreadyOn`,
   `ok: true`.
3. The same but inactive → `withChatAccess(() => patchRadar(id, { active: true }))` → toast `toast.alertOn`.
4. Otherwise `withChatAccess(() => createRadar({ filters: toRadarFilters(filters, rules), entry, relaxed? }))`;
   `relaxed` is left out of the body when no relax chip was chosen.
5. Result → toast: `starter > 0` → count toast; else the first `options[]` entry with `count ≥ 7`, else the last
   one → "few" toast with the action «Расширить» that calls `relax(radar.id, option.code)`; no option → "empty"
   toast with `hint = relaxed[0] ? ' — ' + relaxed[0].text : ''`.
6. `normalizeMutation` makes `options` and `relaxed` arrays and `starter` a finite number before step 5. A request
   that succeeded always ends in a success toast and `ok: true` — the fix of LB-APP-005.
7. Failure: `no_chat` after the chat-access flow → `toast.noChat`; any other conflict on create → `toast.subLimit`
   with `max` = the radar limit from `useReference()` (legacy `max_subscriptions`), fallback `10`; a conflict whose
   code says "duplicate" → `toast.alreadyOn`; anything else → `common.saveFailed`. The exact codes are the
   contract's (the v1 answer is expected to tell the limit from `no_chat` by code, the fix of LB-API-033).
8. Two calls with the same `filtersKey` while one is in flight share one promise.
9. After every success: `refetch()` of the radar list.

`toRadarFilters` gets `{ dropPostedDays: devFlags.dev005RadarDropsPostedDays }`: off sends `posted_days` as it is
in the search filters (legacy), on sends `null`.

### Chat access (`withChatAccess`)

`run` returns an `ActionResult`. When it is a conflict with the contract's `no_chat` code:

1. `tg.isVersionAtLeast('6.9')` → `tg.requestWriteAccess()`.
2. Answer `false` → `track('chat_access_declined')`, return the failure.
3. Answer `true` → `track('chat_access_allowed')`, run once more; success returns; another `no_chat` falls through.
4. Method unavailable or still `no_chat`: when `brand.botUsername` is set, `tg.confirm(t('chat.restart'))`; on OK
   `tg.openLink(botStartUrl())` (the bare `https://t.me/<bot>` of HOMI's bot). Then return the failure.
5. A second call while the native sheet is open reuses the pending promise.

Turning a radar on, creating, replacing and widening go through it; turning off, mode, unhide and delete do not
(BR-APP-048).

### Previews (BR-APP-063, fix of LB-APP-036)

Look in the generated type of the `GET /radars` item for a preview object: latest finds (at most 5 listing
previews), the count of listings that match now, and the flow (`week`, `days`). 25 §5 lists previews as part of the
radar module, so the field is expected.

- **Present:** `useRadarPreviews` only maps it; the tab sends one request.
- **Absent:** fix the contract specification in the same PR (queue rule 6). Until the stub carries it, the hook
  falls back to `GET /listings?…&limit=5`, `GET /listings/count` and `GET /listings/flow` through `bffFetch`, each
  behind `useResource` keyed by `filtersKey` (two radars with equal filters cost one set; a revisit within 60 s
  costs nothing), started only for tiles within 200 px of the viewport, at most 6 in parallel.

Every flow value passes `normalizeFlow`: anything that is not an object with a numeric `week` and a positive
`days` becomes `null`.

### Return from a radar feed

«Смотреть найденное» stores `{ id, scrollY: window.scrollY }` in `radarReturn`, then
`router.push(routes.feed(query))`, where `query` = `toSearchParams(radar.filters, sort)` plus `from=radar` and
`sort` = `normalizeSort(lastSort, sortOptions(radar.filters, city))`. Back returns to `/radars/[id]`: the sheet
opens without the rise animation (`instant`) and the list scrolls to the stored position.

`lib/search/useSearchState.ts` gets one rule: while `from=radar` is in the address, the feed does not overwrite the
remembered last search (the value the search tab link is built from), so after Back the search tab still holds the
user's own filters. A filter or sort change on that feed, or a tab press, drops `from=radar` and the radar's
filters become the search — the legacy "tab press clears radar-return" (`03` §1.2).

### Nudges

`NudgeHost` is mounted once by `AppShell` above the tab bar (z 35 on the ladder of `03` §3.6) and renders at most
one nudge. `store.ts` holds `{ active: 'follow' | 'home' | null, followPending: boolean }`.

- `nudgesAllowed` (BR-APP-046): the address is the feed list (`/`, no layer parameter), session `ready`.
- The follow nudge may take the slot when `nudgesAllowed` and no toast is visible.
- The home nudge (WP-31) may take it only when also `active === null` and `followPending === false`.

`homi-nudge` (policy mirrored and restored, `lib/storage.ts`): `{ asked: string[≤40], closed: number, quietUntil:
number, lastShown: number }`; a broken value reads as `{ asked: [], closed: 0, quietUntil: 0, lastShown: 0 }`.
The hash of a filter set is djb2 over `filtersKey(filters)`, unsigned, base 36.

## Files

New, under `frontend/app/`:

- `app/[locale]/(main)/radars/page.tsx` (replaces the WP-20 placeholder), `radars/new/page.tsx`,
  `radars/[id]/layout.tsx`, `radars/[id]/page.tsx`, `radars/[id]/edit/page.tsx`, `radars/found/page.tsx`.
- `app/[locale]/(main)/@sheet/(.)radars/new/page.tsx`, `(.)radars/[id]/layout.tsx`, `(.)radars/[id]/page.tsx`,
  `(.)radars/[id]/edit/page.tsx`, `(.)radars/found/page.tsx`; `@sheet/page.tsx` if missing.
- Every module of the table in "Design".
- `tests/radars/{normalize,subscribe,radarStatus}.test.ts`, `tests/radars/{RadarTiles,RadarSheet,RadarForms,
  FoundSheet}.test.tsx`, `tests/telegram/chatAccess.test.ts`, `tests/nudges/{followNudge.test.ts,
  FollowNudge.test.tsx,NudgeHost.test.tsx}`.
- `e2e/{radars,radar-subscribe,radar-forms,follow-nudge}.spec.ts`.

Changed:

- `lib/api/bffAllowList.ts`: `GET radars`, `GET settings` (and the three listing reads if the preview fallback is
  used).
- `lib/search/useSearchState.ts`: the `from=radar` rule; an accessor for the last search if WP-22 has none.
- `features/shell/AppShell.tsx` (mount `NudgeHost`), `features/shell/TopBar.tsx` («+» action).
- `features/filters/FiltersForm.tsx` and the footer (radar modes, «Включить радар» state), `features/feed/
  FewResultsNote.tsx` (button), the apply handlers that call `offerFollowNudge(filters)`.
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json`: the keys of "Behaviour to reproduce", "New and
  overridden texts".

## Steps

1. Read the Next.js files named above. Check three seams and note the result in the PR: the radar types in
   `@homi/types` (item shape, preview field, mutation result, error codes); what `FiltersForm` already does in its
   radar modes; how WP-24 and WP-25 hid their radar buttons (the `radarsReady` seam, whatever its final name).
2. `lib/actions/radars.ts` and `lib/actions/surveys.ts` on `serverApi()`; allow-list entries; unit tests of the
   token argument in header mode.
3. `features/radars/normalize.ts` with tests.
4. `lib/telegram/chatAccess.ts` with tests on the fake adapter.
5. `features/radars/toasts.ts` and `subscribe.ts` with tests.
6. `useRadars`; load the list on the search tab too (it feeds the footer state, the note and the nudge rules).
   Flip the seam of step 1: filters footer and few-results note call `subscribe`.
7. Radar tab: page, `RadarScreen` (loading, error, empty, tiles), `RadarTiles`, `radarStatus`, `RadarEmptyState`,
   pull-to-refresh handler, «+».
8. `useRadarPreviews` by the rule in "Previews".
9. Radar sheet: both layouts, `RadarSheetRoute`, `RadarSheet`, `RadarStrip`, `useSettings` and the digest hint;
   switch, mode, unhide, delete; verify the `replace` interception question.
10. «Смотреть найденное», `radarReturn`, the `from=radar` rule, the count label flag.
11. New radar and editor: routes, wrappers, what `FiltersForm` lacks from step 1.
12. Survey: routes, `FoundSheet`, the two actions, share.
13. `NudgeHost`, `store.ts`, `followNudge.ts`, `useFollowNudge.ts`, `FollowNudge.tsx`; call `offerFollowNudge`
    from the apply handlers of the filters sheet, the quick filter sheet and the lasso.
14. Catalogue overrides and the new key; component tests; Playwright specs in both session modes.
15. Run the checklist in three locales and two themes; update the queue and the handoff.

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
  «Радар снова включён. {count}, которые вы не видели, — в чате с ботом». `ask_found` → the survey with trigger
  `pause`. Failure reverts: `no_chat` → `toast.noChat`; otherwise `failed()` (haptic only; with
  `dev016ErrorToastOnFailure` also «Не получилось сохранить»).
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
- New: `subscribe(draft, 'empty', relaxed)`; `ok` → `back()` and the toast; not `ok` → the sheet stays with the
  draft.
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

Every answer of step 1 calls `submitFound({ answer, trigger })`, every row of step 2 `submitFoundWhere({ where })`;
both are fire-and-forget: not awaited, errors swallowed, rows never disabled. The answer codes are the contract's
enum (legacy: `kvadro`, `elsewhere`, `searching`, `stopped`; seven `where` codes). A missing or unknown `trigger`
in the address → `router.replace(routes.radars())`.

### Follow nudge (SCR-040, BR-APP-043, BR-APP-046)

1. An apply handler calls `offerFollowNudge(filters)`; `followPending` becomes true.
2. When `nudgesAllowed` holds and no toast is visible, wait 1 800 ms. A filter change in between drops the
   candidate.
3. `shouldShowFollowNudge`: filters are custom (`isCustomFilters`), no radar has the same filters, radars < the
   limit, `now ≥ quietUntil`, `now − lastShown ≥ 8 h`, hash not in `asked`. Otherwise stop.
4. `GET /listings/flow` with an `AbortSignal`, through `normalizeFlow` (fix of LB-APP-006: an empty answer shows
   the card without a flow line instead of crashing).
5. Mark asked (keep the newest 40, set `lastShown`), `track('follow_prompt_shown')`, show.

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

### New and overridden texts

New key (`homi` layer), used only with `dev016ErrorToastOnFailure`: `toast.subDeleted` — ru «Радар удалён», uz
«Radar oʻchirildi», en «Radar deleted».

Legacy values with the brand word must have an override in the `homi` layer (the WP-20 test fails without one).
Check and add: `found.text` «Подскажите одной кнопкой — так мы поймём, помогает ли HOMI искать.», `found.kvadro`
«Да, через HOMI», `found.congratsText` «Спасибо, что рассказали. Если HOMI помог — расскажите друзьям, им тоже
пригодится.», `found.shareText` (the legacy sentence with the brand word replaced). The uz and en overrides replace
the brand word only.

## Tests

**Unit (Vitest).**

- `normalize.test.ts`: `relaxed` missing or `null`, `options` `null`, `starter` as a string, filters with a missing
  key, unknown `mode`; `normalizeFlow` for `undefined`, `null`, `{}`, `{ week: 0, days: 7 }`, `days: 0`.
- `subscribe.test.ts`: active twin sends nothing; inactive twin sends one patch; starter toast; few picks the first
  option with `count ≥ 7`; few falls back to the last option; empty toast with and without a hint; success with no
  `options` and no `relaxed` still returns `ok` (regression of LB-APP-005); edit toasts; widen with and without
  starter; limit uses the reference maximum or 10; duplicate code → already on; other error → save failed;
  `posted_days` kept by default and `null` with `dev005RadarDropsPostedDays`; two calls with one key share a
  request; list re-read failure falls back to the cache.
- `chatAccess.test.ts`: granted → one retry and `chat_access_allowed` once; declined → `chat_access_declined`, no
  confirm; version 6.8 → confirm, OK opens the bot link; granted but still `no_chat` → confirm once; other failures
  pass untouched; no bot username → no confirm; concurrent calls share one native sheet.
- `radarStatus.test.ts`: paused; no flow; `week 0`; `week 3, days 7`; `week 21, days 7`; unknown mode; both values
  of `dev021OneFlowVocabulary`.
- `followNudge.test.ts` (fake clock): rule matrix (default vs custom filters, existing radar, at the limit,
  cooldown 8 h, snooze after 3 closes, 40 hashes kept, broken JSON); stable hash for equal filters.

**Component (Vitest + Testing Library).**

- `RadarTiles`: collage with 0, 1, 4, 5 covers; greyscale when inactive; tile and switch are separate controls;
  Enter opens, Space on the switch toggles.
- `RadarSheet`: active vs paused; `hidden` 0 and 3; strip ghost, empty, finds; digest hint with hours, without
  settings; both values of `dev022RadarCountLabel`; delete cancel sends nothing.
- `RadarForms`: titles and buttons per mode; no «Опубликовано»; count line empty and loaded; submit disabled while
  pending; sheet stays open on failure.
- `FoundSheet`: each answer and each `where` code calls the right action; toasts; share hidden without a bot.
- `FollowNudge`, `NudgeHost`: flow `null`, none, week, day; auto-hide at 10 s; × counts; home slot refused while a
  follow nudge or candidate exists.

**End to end (Playwright, fake Telegram, cookie mode and header mode).**

- `radars.spec.ts`: tab shows the stub radars; tile → sheet → Back; switch off and on; mode change; delete with
  confirm; «Смотреть найденное» → feed with the radar's filters → Back → same sheet; find → listing → Back → sheet;
  direct load of `/radars/<id>` and of `/radars/<id>/edit`.
- `radar-subscribe.spec.ts`: filters footer «Включить радар» → toast and ✓ state; few-results note button.
- `radar-forms.spec.ts`: «+» → new radar → toast, sheet closed; edit → save → toast.
- `follow-nudge.spec.ts`: apply custom filters → card after 1.8 s → «Включить» sends the create with entry
  `prompt`.
- Error paths the deterministic stubs cannot produce (`no_chat`, limit, `ask_found`, failures) use the scenario
  switch of the stub framework (WP-10) when it has one; otherwise they stay at the unit and component layers.

## Acceptance checklist

Run in ru, uz, en and in light and dark; cookie mode and header mode where a request is involved.

- [ ] «Радар» tab: spinner, then tiles; a failed list shows the error state and «Повторить» reloads it.
- [ ] No radars: sweep art, both texts and «Включить радар»; the art is static in lite mode.
- [ ] Tile shows collage or icon, title, area summary and status; a paused tile is greyscale and reads «На паузе».
- [ ] Status reads «≈N в день · сразу», «N за неделю · подборкой» or «пока редко · …» for the three flow cases.
- [ ] Keyboard: Tab reaches tile and switch separately; Enter opens the sheet.
- [ ] Opening the tab sends one radar request and no per-radar burst (or the bounded fallback, noted in the PR).
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
      этому поиску уже включён».
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
- [ ] No text shows the legacy brand name; the demo marker is visible while radars come from stubs.
- [ ] With every `dev…` flag off the labels are the legacy ones; the flagged branches pass their tests.

## Handoff

Empty.
