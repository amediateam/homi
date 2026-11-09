# KV-FE-040 — Bootstrap provider and render gating

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-ONBOARD-001, F-ACCESS-002, F-LOCALE-001 |
| Dependencies | KV-FE-015 (locale), KV-FE-021 (API client), KV-FE-023 (prefetch consumption, cache invalidation), KV-FE-024 (adapter, visibility), KV-FE-026 (theme), KV-FE-028 (storage restore); uses KV-FE-017 (currency), KV-FE-034 (journal, `markAppStarted`), KV-FE-035 (`initAnalytics`), KV-FE-037 (launch parameters); backend KV-BE-029 (API-001), KV-BE-030 (API-002); decisions DEV-001 `PROPOSED`, FD-2 |

## Goal

One provider reproduces the legacy start-up after mount — `app_launch`, `GET /api/meta` with the legacy retry and
access-check timings, application of the server profile, `app_opened`, the `?news=pets` entry and `GET /api/cities` —
and decides which top-level state renders (outside Telegram, session expired, no access, language picker, app shell).
Locale and currency changes later re-fetch instead of reloading the page (LB-APP-041).

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:23-165` (retry tables `[1000, 3000, 7000, 15000, 30000]` and
  `[2500, 2500, 2500]`, `app_launch`, success path, `403` path, visibility reset); `$KVADRO_ROOT/demo/app/src/app/App.jsx:228-236`
  (render gating), `:52` (first paint with the saved city), `:257` (first-launch city condition);
  `$KVADRO_ROOT/demo/app/src/main.jsx:24-39` (prefetch).
- `03` §1.3 steps 8–9, §1.4 (gating and the `meta = null` consequences), §3.4 (constants); `05` §3.1 (start-up state
  diagram); `08` API-001 (response, client semantics, errors), API-002.
- Rules: BR-APP-010 (server city over the local one, unless geography is chosen), BR-APP-050 (language before and after
  meta; `locale_chosen`), BR-APP-054 (access gate timings), BR-APP-055 (first-launch city, rendered by KV-FE-044),
  BR-APP-057 (`?news=pets`), BR-API-146 (legacy reload after locale/currency change).
- Defects: LB-APP-041 (full reload) — fixed; LB-APP-047 (no `401` branch) — fixed with KV-FE-036; LB-APP-045 → DEV-001.

## Implementation

1. `frontend/app/app/(miniapp)/providers/BootstrapProvider.tsx` (Client Component) with `useBootstrap()` exposing
   `{meta, cityStats, noAccessReason, checking, sessionExpired, refreshMeta(), refreshCities()}`.
2. Step by step, in the first effect (guarded by refs so React StrictMode double-invocation sends nothing twice):
   1. no `initData` (KV-FE-024) → stop; the gate renders the outside-Telegram state (KV-FE-041);
   2. send `app_launch` `{entry, ms: round(performance.now()), v, sdk, js, platform}` with `entry` from KV-FE-037
      (`link` / `news` / `menu`);
   3. `loadMeta()`: skip while in flight or after success; `GET /api/meta` consumes the boot prefetch (KV-FE-023; a
      failed prefetch is repeated once at once, legacy `08` §1.6);
   4. **success:** clear `noAccessReason` and `checking`; `setLocale(meta.locale)` (`uz_Latn` → `uz`, writes
      `kv-locale`); `setCurrency(meta.currency, meta.usd_uzs)` (KV-FE-017; UZS only with a rate > 0);
      `setThemePreference(meta.theme)` (KV-FE-026); **BR-APP-010**: when `meta.city` differs from `kv-city`, save it
      locally without a server call and set the filter city only if no districts, zones or polygon are selected;
      store `meta`; `markAppStarted()` (error stage `app`, KV-FE-034); `initAnalytics(meta.analytics)` (KV-FE-035);
      send `app_opened` (`{entry: 'link', listing_id, ms}` or `{entry: 'news'|'menu', ms}`); **BR-APP-057**: when
      `news === 'pets'` and no listing link, switch to the `rent_long` defaults for the current city if the deal is not
      already `rent_long` and open the full filters focused on pets (KV-FE-025 layer `filters{focus: 'pets'}`);
      `GET /api/cities` → `cityStats` (errors ignored);
   5. **`403`:** `reason = detail ?? 'private'`; set the locale from the Telegram language (KV-FE-015 detector);
      `noAccessReason = reason`; when `reason !== 'blocked'` and fewer than 3 access re-checks happened, `checking =
      true` and retry after 2 500 ms; otherwise `checking = false`;
   6. **`401`:** `sessionExpired = true`; cancel timers; no retry (LB-APP-047, KV-FE-036);
   7. **other failure** (network, timeout, `5xx`): retry after 1, 3, 7, 15, 30 s; after the fifth the app stays without
      meta and without an error screen (legacy; screens show their own errors);
   8. `visibilitychange` → visible while meta is not loaded: reset both counters, clear the timer, `loadMeta()` now
      (also for `blocked`).
3. Render gate (`frontend/app/app/(miniapp)/AppGate.tsx`), first match wins: no `initData` → KV-FE-041;
   `sessionExpired` → KV-FE-036; `noAccessReason` → KV-FE-042; `meta && !meta.locale_chosen` → KV-FE-043; otherwise the
   shell (KV-FE-045), which renders with `meta = null` while loading (feed for the saved city first, no city chip,
   sorts that need meta hidden — KV-FE-020).
4. DEV-001 (flag `dev001AnyForbiddenShowsAccess`): an `AccessDeniedError` from any route sets `noAccessReason` here
   (the API client raises it; KV-FE-042 renders it).
5. No reload anywhere: `refreshMeta()` (used by KV-FE-043 and KV-FE-083 after a locale or currency change) invalidates
   the request cache (KV-FE-023), re-fetches API-001 and re-applies step 2.4 without `app_opened`, and re-creates the
   lists whose server-formatted strings depend on locale or currency (`price`, `age`, `title`; Q-APP-011).
6. Defaults for absent meta fields (`08` API-001): `max_subscriptions` 10, `bot_username: null` hides share and the
   chat-restart link, `tiles: null` → OSM raster, `cities` missing or empty → Tashkent with the top-level
   `districts`/`zones`, `analytics: null` → no PostHog.

## States and texts

The provider renders no UI of its own; the gate chooses:

| State | Condition | Rendered by |
| ----- | --------- | ----------- |
| outside Telegram | no `initData` | KV-FE-041 (`app.openViaBot`) |
| session expired | any `401` | KV-FE-036 (`error.sessionExpired`, new key) |
| no access / checking | `403` reason; re-check pending | KV-FE-042 (`noAccess.*`, `noAccess.checking`) |
| language choice | `meta.locale_chosen` falsy | KV-FE-043 |
| loading | meta pending | shell with `meta = null` (KV-FE-045, KV-FE-048 skeletons) |
| ready | meta applied | shell; first-launch city picker per BR-APP-055 (KV-FE-044) |
| meta never arrived | five retries failed | shell without meta; screens show their own `ErrorState` |

## Interaction

No gestures. Returning to the app (visibility) retries meta immediately. Locale/currency changes re-render in place.

## Telegram integration

TMA-040 (`visibilitychange`), TMA-008 (language for the `403` path), TMA-041 (`platform` in `app_launch`), TMA-006
(`initData` presence), TMA-021 (`meta.theme` replaces the local theme on every start).

## Storage and analytics

- Writes `kv-locale` (via `setLocale`), `kv-theme` (via `setThemePreference`), `kv-city` (server city, local only).
- Journal: `app_launch` `{entry, ms, v, sdk?, js, platform}` (once per launch, only with `initData`); `app_opened`
  (only after meta success, never after a `403`).
- PostHog: `initAnalytics(meta.analytics)`.

## Files

- `frontend/app/app/(miniapp)/providers/BootstrapProvider.tsx`, `AppGate.tsx` (new)
- `frontend/app/lib/bootstrap/applyMeta.ts`, `retry.ts` (new)
- `frontend/app/tests/bootstrap/applyMeta.test.ts`, `retry.test.ts`; `frontend/app/e2e/bootstrap.spec.ts`

## API contract

- API-001 `GET /api/meta` → `200 MetaResponse` (`locale`, `locale_chosen`, `currency`, `usd_uzs`, `theme`, `city`,
  `city_chosen?`, `analytics`, `max_subscriptions?`, `bot_username`, `tiles`, `new_features?`, `cities?`, `districts`,
  `zones`, `renovations`, `appliances`, `price_presets`, `locales`); `403 {"detail": reason}`; `401`; others.
- API-002 `GET /api/cities` → `200 CityStats[]` (`code`, `counts {rent_long, rent_daily, sale}`, `presets`, `typical`);
  all errors ignored. Also fetched each time the filters sheet opens (KV-FE-050).

## Business rules

- Kept: BR-APP-010, BR-APP-050, BR-APP-054, BR-APP-057; retry timings of `03` §3.4.
- LB-APP-041 and LB-APP-047 defect fixes `APPROVED` (policy). BR-API-146 (reload) is replaced by `refreshMeta()`.
- DEV-001 `PROPOSED` (flag; test `todo('DEV-001 PROPOSED')`).

## Acceptance criteria

- Meta answers `500` four times then `200`: requests at about 0, 1, 4, 11 and 26 s, then the shell is ready; no error
  screen in between.
- Meta `403 join` then `200`: no-access screen with the checking line, re-checks at 2.5 s steps, then the shell; a
  `403 blocked` never re-checks until the app becomes visible again.
- Meta `401`: session-expired state at once, no further request.
- `meta.city = samarkand`, local `tashkent`, no geography selected → filters switch to Samarkand and `kv-city` is
  updated without a `PUT /api/settings`; with districts selected → filters unchanged.
- `?news=pets` with deal `sale` → `rent_long` defaults and the filters sheet focused on pets; with a listing link →
  nothing.
- Changing the language in settings re-fetches meta and the feed in the new locale without a page reload; Telegram
  `initData` is not re-read.
- `app_launch` is sent once per launch, `app_opened` once after meta success.

## Tests

- Unit (`retry.test.ts`, fake timers): the two retry tables, visibility reset, `blocked`, `401`.
- Unit (`applyMeta.test.ts`): locale mapping, currency rule, BR-APP-010 matrix, defaults for absent fields.
- E2E (`bootstrap.spec.ts`, contract mocks of KV-FE-022): each acceptance scenario; reference states `no-access-403`,
  `locale_chosen false`, `city_chosen false` of KV-QA-019 reached through this provider.

## Edge cases

- The prefetch of meta resolved before mount: consumed once; a second consumer issues a real request.
- Meta success arrives while the user already picked a city in the first-launch picker: the server city does not
  overwrite a city chosen in this session.
- `meta.locale` unknown (`uz` instead of `uz_Latn`): falls back per KV-FE-015, never throws.
- Two quick visibility toggles: one request in flight at a time.

## Security

SEC-REQ-005 / SEC-REQ-006 (access only from server reasons; `401` vs `403` semantics), TMA-009 (`initData` stays in
the API client), SEC-REQ-007 (no credentials stored by `refreshMeta` under FD-2 = B).

## Definition of done

`make ci-frontend` green; unit and E2E tests green (with KV-FE-010); visual review of the states reached through the
gate (KV-QA-019 `no-access-403`, `locale_chosen false`, `city_chosen false`, `feed`); parity gate G4 for F-ONBOARD-001,
F-ACCESS-002 and F-LOCALE-001 ticked (with KV-FE-042, KV-FE-043); `09` rows updated; PR reviewed by the other developer.
