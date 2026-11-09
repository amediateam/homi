# KV-FE-072 — Saved tab: favourites

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FAV-001 |
| Dependencies | KV-FE-045, KV-FE-047, KV-FE-048; backend KV-BE-038 (API-011, API-029); decisions: DEV-003 `PROPOSED`, FD-2, Q-APP-009 |

## Goal

The Heart tab opens the saved area with the sub-tabs «Избранное» (default) and «Смотрели»; the favourites list
(SCR-024) loads the server list in one request, hides items un-favourited or hidden in this session, and has the
skeleton, error and empty states of the feed. A non-null cursor can never loop the request (LB-APP-022 fixed).

## Legacy reference

- Screen: SCR-024 (`03` §2), shared states SCR-008, SCR-009 (favourites empty).
- Code: `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:63-144` (`source = favorites`, filter
  `favs[id] !== false && !hidden[id]`, skeletons, inline retry, `FeedEmpty`), `useInfiniteFeed.js:31-63` (cursor
  handling that causes LB-APP-022), `$KVADRO_ROOT/demo/app/src/lib/api/user.js:23`, `$KVADRO_ROOT/demo/app/src/app/App.jsx:516`
  (list key per `feedVersion` and sub-tab), `$KVADRO_ROOT/demo/app/src/app/TopBar.jsx` (title tabs `app.saved.*`).
- Rules: BR-APP-039 (optimistic favourite toggle; the list hides session un-favourites), BR-APP-040 (viewed eye),
  BR-API-094 (server toggle shared with the bot ⭐), BR-API-023.
- Defects and deviations: LB-APP-022 → `APPROVED` fix; LB-API-024 → DEV-003 (v1 pagination); LB-APP-045 → DEV-001
  (403 handling, KV-FE-042).
- Visual baseline (KV-QA-019): `tab-favorites` → `SCR-024-*.png`; empty state without a baseline — compare with
  `ListingFeed.jsx:22-49`.

## Implementation

1. `features/saved/SavedTab.tsx`: base layer for `tab = favorites`; sub-tab state `favorites | history` (default
   `favorites`) shown as the title tabs of the top bar (KV-FE-045: `app.saved.favorites`, `app.saved.history`); sub-tab
   switch: light haptic, scroll to top, `$pageview` `saved/favorites` / `saved/history`.
2. `features/saved/FavoritesList.tsx` reusing the list renderer of KV-FE-048 in a **single-page mode**: one request
   API-029; `next_cursor` is ignored by design (a non-null value is logged once as a contract warning and never
   fetched); the infinite-scroll sentinel is not mounted.
3. Visible items: `items.filter(it => favs[it.id] !== false && !hidden[it.id])` with the session maps of KV-FE-023.
   Card heart state `favs[id] ?? item.favorite`; the viewed eye `seen[id] ?? item.viewed` (KV-FE-047). First 2 cards
   load eagerly.
4. The list is re-created (React `key`) on pull-to-refresh (`feedVersion`, KV-FE-046) and on sub-tab switch.
5. Favourite toggle from the card: optimistic, `POST /api/listings/:id/favorite`, the response `favorite` wins,
   failure rolls back silently (the toggle lives in KV-FE-047).
6. DEV-003 (flag `dev003PaginatedLists`): with FD-2 = B the list uses v1 cursor pagination and mounts the sentinel
   (800 px trigger as the feed); with FD-2 = A the flag stays off (the legacy route returns one page). Test
   `todo('DEV-003 PROPOSED')`.
7. `403`: with the DEV-001 flag on → access screen (KV-FE-042); off → inline «Нет доступа — повторить» (legacy).

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| loading | 3 card skeletons with shimmer |
| success | cards (newest-first as the server sends them) |
| empty | shrug mascot (120 px), `feed.favEmpty` «Здесь пока пусто», `feed.favEmptyHint` «Нажмите ♡ на объявлении, чтобы сохранить его» |
| error, no items | `ErrorState`: offline `error.offline` «Нет связи» + `error.offlineText` «Проверьте интернет и попробуйте ещё раз.», else `common.loadFailed` «Не загрузилось» + `error.serverText` «Сервер не ответил. Попробуйте ещё раз через минуту.»; button `error.retry` «Повторить» |
| error with items / 403 | inline `feed.retry` «{error} — повторить» with `common.loadFailed` or `common.noAccess` «Нет доступа» |
| sub-tab titles | `app.saved.favorites` «Избранное», `app.saved.history` «Смотрели» |

## Interaction

- Tap a card → listing (KV-FE-063) with the card as preview; heart toggles in place (light haptic).
- Pull-to-refresh re-creates the list (KV-FE-046); the collapsing chrome does not apply (search tab only).
- Un-favouriting in the list removes the card at once (session map); a failed toggle brings it back.
- One column up to 608 px; cards use `content-visibility: auto` (intrinsic 420 px) as the feed.

## Telegram integration

TMA-025 (haptics), TMA-022 (no Back handler on the base tab; listing layers push their own).

## Storage and analytics

- Storage: none (favourites live on the server; the session map is memory).
- Analytics: `$pageview` `saved/favorites` (`03` §3.3). First loaded photo marks first content for the PostHog loader
  (KV-FE-035), as on the feed.

## Files

- `frontend/app/app/(miniapp)/features/saved/{SavedTab,FavoritesList}.tsx` (new)
- `frontend/app/lib/deviations.ts` (flag `dev003PaginatedLists`)
- Tests: `frontend/app/tests/saved/FavoritesList.test.tsx`, `frontend/app/e2e/favourites.spec.ts`

## API contract

- API-029 `GET /api/favorites` (no cursor) → `200 {"items": ListingPreview[], "next_cursor": null}`; errors `403`
  (access) and others (error state); the 15 s timeout applies.
- API-011 `POST /api/listings/:id/favorite` (no body) → `200 {"favorite": boolean}` (via KV-FE-047).
- v1 with DEV-003 and FD-2 = B: cursor pagination (`meta.next_cursor`), unnumbered adapter (`11` §12).

## Business rules

- Kept: BR-APP-039, BR-APP-040, BR-API-094, BR-API-023 (lists return arrays, never `null`).
- LB fix `APPROVED` (policy): LB-APP-022 (single-page list, no cursor loop).
- DEV-003 `PROPOSED` (v1 only), DEV-001 `PROPOSED` (via KV-FE-042).

## Acceptance criteria

- One API-029 request per mount; a fixture with `next_cursor: "abc"` still sends exactly one request and renders the
  items.
- Un-favouriting a card hides it immediately; re-opening the tab after a pull-to-refresh shows the server state.
- Listings hidden or blocked in this session (KV-FE-071) are not shown.
- Empty, error (offline and server) and inline-retry states render with the texts above.
- Visual: side by side with the `tab-favorites` baseline (title tabs, cards, spacing).

## Tests

- Component `FavoritesList.test.tsx`: filter by `favs` and `hidden`; non-null cursor guard; empty and error states;
  `403` with DEV-001 off and `todo('DEV-001 PROPOSED')`; DEV-003 `todo`.
- E2E `favourites.spec.ts` (contract mocks): open the tab, un-favourite a card, pull to refresh.

## Edge cases

- A favourite whose listing was withdrawn: rendered with its `status_text` warning tag (server decides, Q-API-023).
- A favourite added in the bot (⭐) while the app is open: appears after pull-to-refresh or a tab re-entry.
- Very long lists (500 items, legacy single page): rendering stays smooth through `content-visibility`; no
  virtualisation required for parity.

## Security

- SEC-REQ-014: the list is the requester's own; no ids are sent.
- SEC-REQ-021: server strings on cards rendered as text (KV-FE-047).

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review against the `SCR-024`
baseline recorded in the PR; parity gate G4 for F-FAV-001 ticked (`15` §4); the feature row in `09` updated; PR
reviewed by the other developer.
