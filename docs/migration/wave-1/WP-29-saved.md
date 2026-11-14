# WP-29 — Favourites and history

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-26 |
| Size | about 700 changed lines, S |
| Behaviour reference | `03` §2 (SCR-024, SCR-025; shared states SCR-008, SCR-009; confirm SCR-043), §1.11 (session maps), §4 (BR-APP-067; used: BR-APP-039, BR-APP-040, BR-APP-058), §5 (LB-APP-022; used: LB-APP-027, LB-APP-045); `05` (TMA-025, TMA-026); task files `tasks/frontend/KV-FE-072-favourites.md`, `KV-FE-073-history.md`. Their file layout, navigation stack, API paths and transport are not taken |
| Needs from the production track | nothing beyond the usual deploy of the merge to staging and production |

## Goal

The Heart tab shows the user's favourites at `/saved` and the listings they opened at `/saved/history`, rendered on
the server when a session cookie exists and by the client otherwise, with the feed's loading, error and empty states,
the «Очистить» tool for history, and lists that can never loop on a cursor.

## Scope

In: the two route pages with their server part; `FavoritesScreen` and `HistoryScreen`; the whole-list loading of
both lists with the flagged paging branch; filtering by the session maps; the history refetch after a listing was
opened; «Очистить» with its confirm and Server Action; pull-to-refresh wiring; tests.

Out: `ListingCard`, `FavButton`, `ListingFeed`, `useCursorFeed`, the skeleton, error and empty states (WP-24); the
top bar with the title tabs «Избранное» / «Смотрели», the tab bar, `PullToRefresh`, `tg.confirm` use and `failed()`
(WP-23, WP-21); the listing screen opened from a card and the recording of a view (WP-26); the «Скрытое» list
(WP-31); screen tracking (WP-32).

## Decisions that bind this package

- Server rendering with a client fallback (DEC-44, 25 §3.1, §3.4): one screen implementation; the client part takes
  `initial` when the server had a session and fetches through `/bff` when it did not (first request of a launch,
  header mode).
- Contract (DEC-41, 25 §4.1, §4.2): `GET /favorites`, `GET /history`, `DELETE /history`. Both lists are **whole
  lists**: one request, `meta.next_cursor` is `null` — the legacy behaviour. 25 §4.1 gives cursors to feed-like
  lists, but paging these two is the deviation DEV-003, still `PROPOSED`, so it sits behind the flag
  `dev003PaginatedLists` (off) like every other `DEV` row (DEC-36). If the contract of WP-13 pages them, fix the
  contract in the same PR (queue rule 6).
- Defects (DEC-36): LB-APP-022 is fixed here. The silent failure of «Очистить» (LB-APP-027) and the 403 text
  (LB-APP-045) follow the flags `dev016ErrorToastOnFailure` and `dev001AnyForbiddenShowsAccess`, both off.
- Personal data stays per user: nothing here is cached on the server (25 §3.1); the server part sits inside
  `<Suspense>` because it reads the cookie.
- Read before coding: `02-guides/authentication-with-cache-components.md` (session read behind Suspense),
  `03-api-reference/04-functions/cookies.md`, `02-guides/preserving-ui-state.md` (hidden routes keep state) under
  `frontend/app/node_modules/next/dist/docs/01-app/`.

## Design

### Routes and rendering

| Address under `/[locale]` | File | Renders |
| ------------------------- | ---- | ------- |
| `/saved` | `(main)/saved/page.tsx` | static shell + `<Suspense>` with three `ListingCardSkeleton`s as fallback + `FavoritesServer` |
| `/saved/history` | `(main)/saved/history/page.tsx` | the same with `HistoryServer` |

- `FavoritesServer` / `HistoryServer` (async Server Components in `features/saved/server.tsx`): call
  `getSessionToken()`; with a token, `serverApi()` fetches the first page and passes the `ApiResult` as `initial`;
  without one, `initial` is `null`. They never throw for an API failure: a failed `ApiResult` is passed down and
  becomes the error state.
- Both addresses are root tabs: the title tabs and the tab bar switch between them with `router.replace` (WP-23), so
  there is no Back button here. A card opens the listing with `router.push(routes.listing(number))`, intercepted
  into `@overlay`; the list stays mounted below.

### Client screens

- `features/saved/FavoritesScreen.tsx` and `HistoryScreen.tsx` (Client Components) mount WP-24's
  `ListingFeed` with `source="favorites"` or `source="history"`. Props are WP-24's; if one of these is missing, add it
  there in this PR: an item filter, a switch for the «viewed» eye, a slot above the first card, a version key.
- Loading: `useCursorFeed` with the path `favorites` or `history` and the option `singlePage: true` (add the
  option in WP-24's hook in this PR if it is missing): the list is the first answer — from `initial`, or one
  `bffFetch` — and the sentinel never asks for more. A non-null `next_cursor` is ignored and reported once
  (`reportError`, kind `contract`); this is the fix of LB-APP-022, whose legacy lists re-requested the same page
  forever when a cursor came back. With `dev003PaginatedLists` on, `singlePage` is `false` and the cursor is
  followed like the feed's. The guard of the hook stays for both modes and is harmless here: a cursor that is
  `null`, missing or equal to the one just used ends the list; items are de-duplicated by listing number.
- Favourites visibility: an item shows unless `favs[number] === false` or `hidden[number]` in the session maps
  (`useSessionMap`). Heart state is `favs[number] ?? item.favorite`; the eye is `seen[number] ?? item.viewed`.
- History visibility: every returned item shows; the session `hidden` map is not applied (legacy behaviour recorded in
  KV-FE-073). The eye is never shown. The audit's SCR-025 does not state this either way: **verify against legacy
  when the baseline is pinned (WP-02)** and, if legacy does filter, change this line and its test in the same PR.
- History refetch: the list's version key includes the number of entries in the `seen` session map. Opening a
  listing in this launch and returning to «Смотрели» therefore re-creates the list once; the re-created list fetches
  through `bffFetch` and ignores the stale `initial`.
- Pull-to-refresh: each screen registers a reload with WP-23's `PullToRefresh` (its registration API); the reload
  bumps the version key, so the list starts again from the first page.
- «Очистить»: `features/saved/ClearHistoryButton.tsx`, in the slot above the first card, only when the list has
  items.

### Server Action

`lib/actions/history.ts` — `clearHistory(_: void, auth?)` → `ActionResult<void>`: `DELETE /history` with the cookie
token or `auth.token`; any 2xx is success, the body is not read. Called through `useAction`, so header mode passes
the token as an argument.

## Files

New, under `frontend/app/`:

- `app/[locale]/(main)/saved/page.tsx`, `app/[locale]/(main)/saved/history/page.tsx` (replace the WP-20
  placeholders)
- `features/saved/server.tsx`, `features/saved/{FavoritesScreen,HistoryScreen,ClearHistoryButton}.tsx`
- `tests/saved/{FavoritesScreen,HistoryScreen}.test.tsx`, `e2e/saved.spec.ts`

Changed: `lib/actions/history.ts` (action body); `lib/api/bffAllowList.ts` (only if `GET favorites` and
`GET history` are not yet allowed); `features/feed/ListingFeed.tsx` or `useCursorFeed.ts` (only for a missing prop
or the cursor guard, with their tests).

## Steps

1. Read the docs listed under "Decisions". Check what `ListingFeed` and `useCursorFeed` already accept; list the gaps
   in the PR description.
2. `singlePage` option and the cursor guard in `useCursorFeed` (whatever WP-24 did not ship): one request and a
   single report for an unexpected cursor; with the option off, a `null`, missing or repeated cursor ends the list;
   unit tests for both.
3. `clearHistory` Server Action with its test.
4. `features/saved/server.tsx` and the two route pages; both render the skeleton as Suspense fallback.
5. `FavoritesScreen`: session-map filter, heart and eye state, version key, pull-to-refresh registration.
6. `HistoryScreen`: no eye, `seen`-based version key, `ClearHistoryButton` with confirm, success and failure paths.
7. Component tests, then `e2e/saved.spec.ts` in both session modes.
8. Acceptance checklist on staging in ru, uz, en and light, dark.

## Behaviour to reproduce

### Favourites (SCR-024)

- Opens from the Heart tab; «Избранное» (`app.saved.favorites`) is the default title tab.
- Loading: 3 card skeletons with shimmer (SCR-008). The first 2 cards load their photo eagerly.
- Success: cards in the order the server returns them. Tap a card → listing with the card as preview. The heart
  toggles in place (optimistic, server answer wins, failure rolls back — BR-APP-039, owned by WP-24); a card
  un-favourited in this launch disappears at once and returns if the request fails.
- Listings hidden or whose author was blocked in this launch are not shown.
- Empty (SCR-009): shrug mascot, `feed.favEmpty` «Здесь пока пусто», `feed.favEmptyHint` «Нажмите ♡ на объявлении,
  чтобы сохранить его».
- Error with no items: offline → `error.offline` «Нет связи» + `error.offlineText` «Проверьте интернет и попробуйте
  ещё раз.»; otherwise (including `503 source_unavailable`) → `common.loadFailed` «Не загрузилось» +
  `error.serverText` «Сервер не ответил. Попробуйте ещё раз через минуту.»; button `error.retry` «Повторить».
- Error with items: inline button `feed.retry` «Не загрузилось — повторить».
- 403: with `dev001AnyForbiddenShowsAccess` off, the inline «Нет доступа — повторить» (`common.noAccess`); on, the
  access screen (mapping owned by WP-22).
- 401: handled by `bffFetch` (re-authentication once, then the session-expired state of WP-21).
- A favourite whose listing was withdrawn renders with its status tag; the server decides what it returns.
- A favourite added in the bot while the app is open appears after pull-to-refresh or after re-entering the tab.

### History «Смотрели» (SCR-025)

- Opens from the title tab «Смотрели» (`app.saved.history`).
- Loading, error and 403 states as for favourites.
- Success: cards without the «viewed» eye (BR-APP-040). Tool row above the first card, right-aligned: text button
  with the trash icon `feed.clear` «Очистить».
- Empty: shrug mascot, `feed.histEmpty` «Вы ещё ничего не открывали», `feed.histEmptyHint` «Здесь будут объявления,
  которые вы смотрели»; no tool row.
- A listing opened in this launch is in the list after returning to the tab (one refetch per new listing opened).
- «Очистить» (BR-APP-067): `tg.confirm` with `feed.clearConfirm` «Очистить историю просмотров?» (TMA-026).
  Cancel → nothing is sent. OK → the button is disabled, `clearHistory` runs; success → the list is emptied, the
  empty state shows, success haptic (TMA-025); there is no undo. Failure → the list stays, `failed()`: error haptic,
  and with `dev016ErrorToastOnFailure` on also the toast `common.saveFailed` «Не получилось сохранить».
- Clearing does not touch the `seen` session map: whether «viewed» marks on feed cards reset is the server's answer
  after the next load (Q-API-035).

### Both lists

- Pull-to-refresh is active on both (BR-APP-058) and re-creates the list; the collapsing header does not apply.
- One column up to 608 px; cards as in the feed.
- Screen names expected from `screenNameOf`: `saved/favorites`, `saved/history`.
- Stub answers carry `meta.source = stub`; the demo marker shows through WP-22's reporting, no code here.

## Tests

Unit (Vitest):

- `tests/feed/useCursorFeed.test.ts` (extend): `singlePage` — a first page with cursor `null` sends one request; a
  first page with a non-null cursor still sends one request and reports once; with `singlePage` off (the
  `dev003PaginatedLists` branch) a missing cursor key ends the list, a cursor equal to the previous one ends the
  list after one extra request, and two pages are merged without duplicates.
- `tests/actions/history.test.ts`: `clearHistory` sends `DELETE /history` with the cookie token and with the
  argument token; non-2xx maps to a failed `ActionResult`.

Component (Vitest + Testing Library):

- `FavoritesScreen.test.tsx`: items filtered by `favs` and `hidden`; heart and eye state from the maps; `initial`
  used without a request; `initial = null` fetches through `bffFetch`; empty, offline, server and inline-retry
  states; 403 with `dev001AnyForbiddenShowsAccess` off and on.
- `HistoryScreen.test.tsx`: no eye; hidden items still shown; growth of the `seen` map triggers exactly one refetch;
  clear — cancel sends nothing, OK empties the list and disables the button meanwhile, failure keeps the list with
  `dev016ErrorToastOnFailure` off (no toast) and on (toast); no tool row when empty.

End to end (Playwright, fake Telegram, stubs; cookie mode and header mode):

- `e2e/saved.spec.ts`: Heart tab → favourites from the stub; un-favourite a card → it disappears; title tab
  «Смотрели» → history, no Back button; open a listing from the feed → back → «Смотрели» sends one new request;
  «Очистить» → fake confirm OK → empty state; fake confirm Cancel → no request; an intercepted answer carrying a
  cursor → still exactly one request, no loop; pull-to-refresh re-requests the list.

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging.

- [ ] Heart tab opens «Избранное»; the title tabs switch between «Избранное» and «Смотрели» without a Back button.
- [ ] Favourites show skeletons, then cards; in cookie mode the cards arrive in the server response, in header mode
      after a client request.
- [ ] Un-favouriting a card removes it at once; a failed request brings it back.
- [ ] A listing hidden or blocked in this launch is absent from favourites.
- [ ] Favourites empty state shows the mascot, «Здесь пока пусто» and its hint.
- [ ] Offline and server errors show their texts with «Повторить»; an error after items shows the inline retry.
- [ ] History cards have no «viewed» eye; «Очистить» is visible only with items.
- [ ] A listing opened from the feed appears in «Смотрели» on return.
- [ ] «Очистить» asks «Очистить историю просмотров?»; Cancel does nothing; OK empties the list and shows «Вы ещё
      ничего не открывали».
- [ ] A failed clear keeps the list and vibrates (flag off). Test: `dev016ErrorToastOnFailure` on shows «Не
      получилось сохранить».
- [ ] A 403 shows «Нет доступа — повторить» (flag off). Test: `dev001AnyForbiddenShowsAccess` on opens the access
      screen.
- [ ] Each list is one request; a cursor in the answer is ignored and never causes a second request or a loop
      (flag off). Test: `dev003PaginatedLists` on follows the cursor, and a repeated or missing cursor ends the list.
- [ ] The history rule for listings hidden in this launch is checked against the pinned legacy release (WP-02) and
      the result is noted in the PR.
- [ ] Pull-to-refresh reloads either list from the first page.
- [ ] With stub answers the demo marker is visible on both lists.
- [ ] Every scenario of `e2e/saved.spec.ts` passes in cookie mode and in header mode.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web.

## Handoff

Empty.
