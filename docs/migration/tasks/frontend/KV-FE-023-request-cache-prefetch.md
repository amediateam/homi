# KV-FE-023 — Request cache, boot prefetch and session maps

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-ONBOARD-001, F-FEED-001 |
| Dependencies | KV-FE-021 (port and transport); used by KV-FE-032 (boot shell starts the prefetch), KV-FE-040, KV-FE-048, KV-FE-063; optional query library per KV-FE-005 entry 12 (in-house by default) |

## Goal

A small in-house request cache sits between screens and `KvadroApi`: it adopts the requests the boot shell started
before React mounted (meta, the first feed page, a deep-linked listing), de-duplicates in-flight GETs, lets mutations
invalidate what they change, and holds the session-only maps of legacy (favourite toggles, seen, locally hidden), so
first paint is as fast as legacy and the session behaviour is identical.

## Legacy reference

- Prefetch (`03` §1.3 step 4, `08` §1.6): `$KVADRO_ROOT/demo/app/src/main.jsx:20-39` — `prefetch('/api/meta')`,
  `prefetch(feedUrl(defaultFilters('rent_long', getSavedCity()), null))`, then preload of the first photo of the first
  2 items; `prefetch('/api/listings/<id>')` when `start_param` / `?listing=` names a listing; nothing without initData
  (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:35-43`). The first `apiFetch(url)` **without options** and with the
  **identical URL string** consumes the prefetched promise once; a failed prefetch is repeated immediately
  (`client.js:56-60`).
- First paint before meta: the feed for the locally saved city (`03` §1.3 step 9, `App.jsx:52`).
- Session-only state (`03` §1.11, `App.jsx:65-90`): `favs` (toggles overriding server flags), `seen` (opened this
  session), `hidden` (hidden or blocked this session), `subs`, `cityStats`; the hidden screen resets `hidden` after any
  change (`App.jsx:499`). Server is the source of truth after a reload (`item.favorite`, `item.viewed`, server-side
  exclusion of hidden listings).
- Rules: BR-APP-039 (favourite toggle optimistic, server result wins), BR-APP-040 (viewed eye = `seen[id] ??
  item.viewed`).
- Target: `10` §5.5 (request cache inside the client: dedupe, prefetch at boot, invalidate after mutations; a query
  library is optional, DEC-23); LB-APP-021 (restored DeviceStorage city arrives too late).

## Implementation

1. `frontend/app/lib/data/cache.ts`: keyed by the request URL string (the legacy key, so prefetch adoption stays a
   string match); entries `{promise, status, value, error, at}`; `get(key, fetcher)` de-duplicates in-flight requests;
   `invalidate(prefix)`; `set(key, value)` for optimistic updates; no persistence (memory only, SEC-REQ-007).
2. Boot adoption: the boot shell (KV-FE-032) starts `fetch` for meta, the first feed page (built with the same
   `feedUrl` logic in ES5 from `kv-city`) and an optional listing, and stores the promises in a frozen
   `window.__kvPrefetch` map; `cache.adoptPrefetch()` moves them into the cache once and deletes the global. A failed
   adopted request is retried once immediately (legacy).
3. City for the prefetch: `kv-city` from `localStorage` synchronously (DeviceStorage is asynchronous; its restore
   timing is the LB-APP-021 fix of KV-FE-028), and `meta.city` wins after meta (BR-APP-010), so a restored city is never
   needed for correctness — only for the first paint.
4. Photo preload: after the first feed page resolves, insert `<link rel="preload" as="image">` (or `new Image()`) for the
   first photo of the first 2 items, using the thumbnail rule of KV-FE-047 (`.s.jpg` for Save-Data/≤ 3g/lite).
5. `frontend/app/lib/data/session.ts`: `SessionMaps` context with `favs: Map<id, boolean>`, `seen: Set<id>`,
   `hidden: Set<id>`; helpers `isFavorite(item)` (`favs.get(id) ?? item.favorite`), `isSeen(item)`
   (`seen.has(id) || item.viewed`), `isHidden(id)`; `resetHidden()` for the hidden screen.
6. Invalidation map (documented in the file): favourite toggle → `/api/favorites`; hide/block/report/undo →
   `/api/hidden`, feed/map pages (filtered locally until the next refetch); settings locale/currency change → meta,
   cities, feed, listings (server strings change, KV-FE-083); radar mutations → `/api/subscriptions` and the radar
   previews; clear history → `/api/history`.
7. Hooks: `useQuery(key, fetcher, {enabled})` returning `{status, data, error, reload}`; `useMutation(fn, {onSuccess})`;
   statuses `idle | loading | success | error` mapped from `ApiFailure` types.

## States and texts

| State | Meaning |
| ----- | ------- |
| `loading` | no value yet (screens show skeletons) |
| `success` | value present (may be stale while a reload runs — screens keep showing it) |
| `error` | typed `ApiFailure`; screens choose offline vs server texts (`error.offline` / `common.loadFailed`) |
| prefetch adopted | first `get` resolves from the boot request without a second network call |

## Interaction

n/a (data layer).

## Telegram integration

TMA-006 (no initData → no prefetch, legacy), TMA-010 (deep-linked listing prefetch), TMA-040 (visibility return
triggers the meta retry in KV-FE-040, not here).

## Storage and analytics

Reads `kv-city` synchronously at boot (KV-FE-028 owns the storage API). No credentials or responses are persisted
(SEC-REQ-007). `app_launch.ms` (KV-FE-034) is measured from navigation start to the first rendered feed card using this
cache's adoption timestamp.

## Files

- `frontend/app/lib/data/{cache,session,hooks}.ts(x)` (new)
- `frontend/app/tests/data/*.test.ts` (after KV-FE-010)

## API contract

Keys are the legacy URL strings of API-001, API-004 (first page with `limit=20`, no `sort` for `new`), API-008; the
cache never changes request shapes.

## Business rules

- Kept: BR-APP-010 (server city wins after meta), BR-APP-039, BR-APP-040; the session-only semantics of `03` §1.11.
- LB-APP-021 fix `APPROVED` (policy) — restore timing as above.

## Acceptance criteria

- With the boot shell prefetch, the first meta and first feed requests are each sent exactly once (network log in E2E).
- A failed prefetch is retried once, immediately; a second failure surfaces as `error`.
- Two components asking for the same URL share one request.
- Favourite toggled off in the session hides the item from the favourites list until reload; after reload the server
  flag rules (legacy).

## Tests

Unit: adoption of a resolved / rejected / pending prefetch; de-duplication; invalidation by prefix; session map helpers.
E2E (mocks): request count per boot; favourite toggle + favourites tab consistency.

## Edge cases

- `kv-city` holds a city that no longer exists: the prefetched feed is still shown until meta replaces it (legacy).
- The user changes filters before the prefetched feed resolves: the adopted promise is ignored (key differs).
- Prefetch started without initData (outside Telegram): nothing is prefetched (SCR-002 path).

## Security

No responses persisted; nothing in `window` after adoption (the global is deleted); TMA-009 (no initData in cache keys —
keys are URLs without auth).

## Definition of done

`make ci-frontend` green; tests green (after KV-FE-010); request-count E2E recorded; PR reviewed by the other developer.
