# KV-FE-048 — Search feed list with header chips and paging

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FEED-001 |
| Dependencies | KV-FE-019 (query builder), KV-FE-023 (request cache, first-page prefetch, session maps), KV-FE-045 (shell slots), KV-FE-047 (card, skeleton); backend KV-BE-031 (API-004); decisions: DEV-001 `PROPOSED` (403 handling, flag owned by KV-FE-042), Q-API-008 |

## Goal

The main search list (SCR-007) with its loading and error states (SCR-008) works as in legacy: the header chip row,
cursor paging of 20 with de-duplication, the prefetched first page, local hiding, favourites and «viewed» marks, and
re-creation on any change of filters, sort or pull-to-refresh. The owner chip no longer pretends a filter is applied
(LB-APP-042).

## Legacy reference

- SCR-007, SCR-008 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/feed/FeedHeader.jsx:21-62`,
  `ListingFeed.jsx:63-144` (states `:114-141`, few-results hook `:89-92`), `useInfiniteFeed.js:14-64`;
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:403-418` (header wiring), `:513-527` (list key and props).
- Constants `03` §3.4: page size 20, sentinel 800 px, eager photos for the first 2 cards, first two photos preloaded.
- Rules: BR-APP-011 (badge), BR-APP-024 (paging), BR-APP-064…BR-APP-066 (chip labels), BR-APP-006 (rooms chip hidden),
  BR-API-014 (gated users get 403 on the feed). Defects: LB-APP-042 (owner chip), LB-APP-045 → DEV-001.
- Visual baselines (KV-QA-019): `feed` → `SCR-007-*` (ru light), `feed-dark-uz`, `feed-uzs-en-lite`; `x-feed-error` →
  `SCR-008-*`.

## Implementation

1. `frontend/app/app/(miniapp)/features/feed/FeedHeader.tsx`: chips in legacy order (HeaderChip of KV-FE-012):
   - filters (SlidersHorizontal icon, aria `sheet.title`, count badge when `countActiveFilters > 0`);
   - sort (ArrowUpDown, aria `sort.title`, label `sort.<value>`);
   - «Своя область» (`map.areaOn`, highlighted) when a polygon is set → switches to the map with a light haptic;
   - rooms (hidden when every type is `room`/`commercial`/`land`): summary or `head.rooms` + ChevronDown;
   - price: summary or `head.price` + ChevronDown;
   - owner: `owner.<value>` highlighted when not `any`; **LB-APP-042 fix:** with `any` the label is `sheet.who`
     «Кто размещает» (legacy showed `owner.no_agents` unhighlighted);
   - city (MapPin + `meta` city name) only with more than one city.
   Summaries `roomsLabel` / `priceLabel` come from KV-FE-020 (BR-APP-066).
2. `features/feed/ListingFeed.tsx` + `useInfiniteFeed.ts`, shared with favourites and history (`source: 'feed' |
   'favorites' | 'history'`): pages through `GET /api/feed?<FilterQuery>&limit=20[&sort][&cursor]` (`new` never
   sent); `next_cursor === null` ends; items de-duplicated by `id`; next page when the sentinel is within 800 px
   (IntersectionObserver `rootMargin: '800px'`); no automatic retry after an error.
3. The first page for the default filters of the saved city is the boot prefetch of KV-FE-023: the list consumes it
   when its query string is identical.
4. The list is keyed by `feedVersion:sort:JSON(filters)` so a change re-creates it (scroll to top done by the caller).
5. Visible items: search hides locally hidden ids (session map); favourites also hide items un-favourited this session.
   First two cards `eager`. `favorite = favs[id] ?? item.favorite`; `viewed = seen[id] ?? item.viewed` (not in history).
6. Open a card: add to session `seen`, pass the card as `preview` to the listing layer (KV-FE-063).
7. Errors (`ApiError` of KV-FE-021): no items and not 403 → `ErrorState` (offline vs server); items present, or 403 →
   inline button `feed.retry` with `common.loadFailed` / `common.noAccess`. DEV-001 flag on → a 403 raises
   `AccessDenied` and the app shows the access screen (KV-FE-042) instead.
8. Few-results and empty states are rendered through the slot of KV-FE-049 when the list is done.
9. Report `$pageview search/list` through the shell (KV-FE-045).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| loading (first page) | no items yet | 3 card skeletons (shimmer) |
| loading (next page) | sentinel reached | spinner at the sentinel |
| success | items | cards (KV-FE-047) |
| error, no items, offline | `status 0` (`network`/`timeout`) | `error.offline` «Нет связи», `error.offlineText` «Проверьте интернет и попробуйте ещё раз.», button `error.retry` «Повторить» |
| error, no items, server | other non-403 error | `common.loadFailed` «Не загрузилось», `error.serverText` «Сервер не ответил. Попробуйте ещё раз через минуту.», `error.retry` |
| error with items | later page failed | inline `feed.retry` «{error} — повторить» with `common.loadFailed` «Не загрузилось» |
| no access (flag off) | 403 | inline `feed.retry` with `common.noAccess` «Нет доступа» |
| empty / few | done with < 10 visible | slot of KV-FE-049 |
| chip labels | header | `sheet.title` «Фильтры», `sort.title` «Сортировка», `sort.new` «Сначала новые» …, `map.areaOn` «Своя область», `head.rooms` «Комнаты», `head.price` «Цена», `sheet.who` «Кто размещает», `owner.no_agents` «Без риелторов», `owner.owners` «Только хозяева» |

## Interaction

- Chip taps: filters → SCR-014 (KV-FE-050); sort → SCR-016 (KV-FE-056); rooms / price / owner → SCR-015 (KV-FE-055);
  city → SCR-017 (KV-FE-044); area → map. Light haptics as legacy.
- Gestures: vertical scroll drives the collapsing chrome (KV-FE-045); photo swipe inside cards; pull-to-refresh
  (KV-FE-046).
- The header chip row scrolls horizontally (`.hchips`), excluded from swipe-back.
- Responsive: one column, max 608 px, cards with `content-visibility: auto`.

## Telegram integration

TMA-025 (haptics). The list itself uses no Telegram API.

## Storage and analytics

- Storage: `kv-city` read through the initial filters (KV-FE-019 defaults, KV-FE-028 restore).
- Analytics: `$pageview search/list` (KV-FE-035); the first loaded photo starts PostHog loading (`markFirstContent`).

## Files

- `frontend/app/app/(miniapp)/features/feed/{FeedHeader,ListingFeed}.tsx`, `useInfiniteFeed.ts` (new)
- `frontend/app/tests/feed/{useInfiniteFeed,FeedHeader}.test.tsx`, `frontend/app/e2e/feed.spec.ts`

## API contract

- API-004 `GET /api/feed` — `FilterQuery` (`08` §1.7, key order as built by KV-FE-019) + `limit=20` + `sort`
  (`cheap|expensive|deal|center|ppm`) + `cursor`; `200 {"items": ListingPreview[], "next_cursor": string|null}`;
  errors `403 {"detail": reason}`, `422`, `429`, `5xx`, timeout after 15 s (KV-FE-021).
- API-011 via the card's heart (KV-FE-047).

## Business rules

- Kept: BR-APP-006, BR-APP-011, BR-APP-024, BR-APP-064…BR-APP-066, BR-API-014.
- Defect fix `APPROVED` (policy): LB-APP-042 (neutral owner chip).
- DEV-001 `PROPOSED` (flag of KV-FE-042; test `todo('DEV-001 PROPOSED')`).

## Acceptance criteria

- Scrolling through a 47-item mock yields three requests (cursor 1, cursor 2, `null`) and 47 distinct cards; a
  duplicated id across pages appears once.
- Changing a filter, the sort or pulling to refresh issues a new first-page request and resets the scroll.
- The prefetched first page is consumed: the boot shows no second identical `/api/feed` request.
- Offline first page shows «Нет связи»; a failing second page keeps the cards and shows «Не загрузилось — повторить».
- With owner `any` the chip reads «Кто размещает» unhighlighted; with `no_agents` «Без риелторов» highlighted.
- Visual: side by side with `SCR-007` (ru light, uz dark, en UZS lite) and `SCR-008` baselines — chips, card spacing,
  skeletons and error state equal except the owner-chip label (LB-APP-042).

## Tests

- Unit (`useInfiniteFeed.test.ts`): paging to `null`, de-duplication, no auto-retry after error, explicit retry,
  favourites single page with `next_cursor: null` (LB-APP-022 handled in KV-FE-072).
- Component (`FeedHeader.test.tsx`): chip set per filter state (polygon, no-rooms types, single city), labels per
  locale, badge count.
- E2E (`feed.spec.ts`, contract mocks of KV-FE-022): `feed`, `x-feed-error` (500 on page 1), 500 on page 2, 403 on
  page 2 (flag off), `last-page-next-cursor-null`.

## Edge cases

- `next_cursor` missing (legacy server defect): treated as `null` by the normaliser of KV-FE-021 — no endless loop.
- Hidden items reduce the visible count below 10 → few-results logic uses the visible count.
- Filters change while page 2 is in flight: the old request result is dropped (list re-created).
- `meta` still loading: no city chip, default sort options only.

## Security

- SEC-REQ-021: chip labels and card strings are text.
- SEC-REQ-017: the client never sends `limit` other than 20 and only cursors it received.
- TMA-009: no `initData` in URLs or analytics properties.

## Definition of done

`make ci-frontend` green; unit, component and E2E tests green (or added when KV-FE-010 lands); side-by-side review of
the SCR-007 / SCR-008 baselines recorded in the PR; parity gate G4 for F-FEED-001 ticked (`15` §4); the `09` row
updated; PR reviewed by the other developer.
