# KV-FE-036 — Error boundary, crash screen and session-expired state

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-009, F-ACCESS-001 |
| Dependencies | KV-FE-016 (catalogues), KV-FE-025 (layers), KV-FE-034 (`reportError`); uses KV-FE-012 (ErrorState, mascot), KV-FE-021 (`ApiError` classes), KV-FE-029 (`closeApp`); decisions DEV-002 `PROPOSED` (server `auth_expired`), FD-2 |

## Goal

A render crash never leaves a white screen: a crash inside a layer closes that layer, a crash of the whole app shows the
legacy crash screen (SCR-045); an expired or invalid Telegram session (`401`) shows a dedicated «session expired» state
instead of silent retries and «Сервер не ответил» (LB-APP-047); every screen classifies API errors the same way.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/app/ErrorBoundary.jsx:11-42` (one boundary around `<App/>`, `reportError('render')`,
  shrug mascot, `crash.*` texts, `location.reload()`); `$KVADRO_ROOT/demo/app/src/lib/analytics.js:192`
  (`captureException` hook); `$KVADRO_ROOT/demo/app/src/components/ErrorState.jsx:13-26` (offline vs server).
- SCR-045 (`03` §2), `03` §1.6 (error-handling table), §1.12; `08` §1.5 (`detail` only when a string; `status 0` with
  `timeout`/`network`); `10` §5.14 (boundary per layer).
- Defects: LB-APP-047 (no `401` branch), LB-APP-002 / LB-APP-015 / LB-APP-016 (crash classes that the boundary now
  contains to one layer).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` — the Mini App
   does not use route-level `error.tsx` for screens (no routing between screens); it uses a class boundary component.
   `app/(miniapp)/global-error.tsx`-style fallbacks only cover the root layout.
2. `frontend/app/lib/errors/ErrorBoundary.tsx`: `getDerivedStateFromError` → failed; `componentDidCatch` →
   `reportError('render', error)` (KV-FE-034, which also calls the PostHog hook). Two variants:
   - **root** (around the whole app, as legacy): renders SCR-045;
   - **layer** (wrapped by KV-FE-025 around every layer): reports, closes the layer through the navigation reducer,
     shows the toast `common.loadFailed` «Не загрузилось» (KV-FE-014) — the user lands on the screen below instead of the
     crash screen (`10` §5.14).
3. `frontend/app/lib/errors/classify.ts`: `classifyError(e)` → `offline` (`status 0`, `network` or `timeout`),
   `sessionExpired` (`401`), `forbidden(reason)` (`403`, to KV-FE-042 / DEV-001), `notFound` (`404`), `server` (other).
   Screens render `ErrorState` (KV-FE-012) from it.
4. Session expired (fix of LB-APP-047): the API client (KV-FE-021) raises `SessionExpiredError` for any `401`
   (`{"detail": "unauthorized"}` today, `{"detail": "auth_expired"}` once DEV-002 is approved); the bootstrap provider
   (KV-FE-040) switches the whole app to the session-expired state, cancels pending retries and stops further requests.
   Button «Закрыть» calls `closeApp()` (`WebApp.close()`), so the next open brings fresh `initData`. Reported once per
   session: a PostHog event `session_expired` if analytics is loaded (a journal post would fail with the same `401`).
5. Under FD-2 = B the same state appears when the token re-exchange fails because `initData` is older than the
   exchange window (`10` §5.7 item 4).

## States and texts

| State | Shown when | Texts (keys, ru) | Action |
| ----- | ---------- | ---------------- | ------ |
| crash (SCR-045) | render exception outside any layer | `crash.title` «Что-то пошло не так», `crash.text` «Ошибка записана. Обновите приложение — обычно это помогает.», button `crash.reload` «Обновить» | `location.reload()` |
| layer crash | render exception inside a layer | toast `common.loadFailed` «Не загрузилось» | layer closed |
| session expired | any `401` | new key (not in legacy) `error.sessionExpired` «Сессия устарела — закройте и откройте приложение снова» (ru from LB-APP-047; uz/en to be translated, product owner review); button `common.close` «Закрыть» | `WebApp.close()` |
| offline (for screens) | `status 0` | `error.offline` «Нет связи», `error.offlineText` «Проверьте интернет и попробуйте ещё раз.», `error.retry` «Повторить» | retry |
| server (for screens) | 5xx, other | `common.loadFailed` «Не загрузилось», `error.serverText` «Сервер не ответил. Попробуйте ещё раз через минуту.», `error.retry` | retry |

uz/en crash texts: «Nimadir xato ketdi» / «Yangilash»; «Something went wrong» / «Reload» (catalogues of KV-FE-016).
Layout: shrug mascot `empty-shrug.svg` 120 px (brand layer, FD-8), `empty tall crash` block, secondary button with the
rotate icon.

## Interaction

- Crash screen: one button; no Back handler (base state).
- Session-expired: one button; Telegram Back hidden (stack cleared).
- No animations beyond the `fade` of the empty state.

## Telegram integration

TMA-039 (`close` for session-expired), TMA-044 (exceptions from Telegram callbacks reach the global handler, not the
boundary).

## Storage and analytics

- Storage: none.
- Journal: `app_error` with `kind: 'render'` (via KV-FE-034); PostHog `captureException` hook; new PostHog event
  `session_expired` (once per session, no properties).

## Files

- `frontend/app/lib/errors/ErrorBoundary.tsx`, `classify.ts`, `SessionExpiredScreen.tsx`, `CrashScreen.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}` (new key `error.sessionExpired`, via KV-FE-016)
- `frontend/app/tests/errors/ErrorBoundary.test.tsx`, `classify.test.ts`; `frontend/app/e2e/session-expired.spec.ts`

## API contract

Any legacy endpoint may answer `401 {"detail": "unauthorized"}` (SEC-REQ-005) or, with DEV-002,
`401 {"detail": "auth_expired"}`; the client treats both as session expired. `403`, `404`, `5xx`, `status 0` per the
table.

## Business rules

- Kept: SCR-045 behaviour and texts.
- LB-APP-047 defect fix `APPROVED` (policy): dedicated `401` state.
- DEV-002 `PROPOSED` (server side): the `auth_expired` detail; client already compatible.

## Acceptance criteria

- A component throwing inside the listing layer closes the listing, shows «Не загрузилось», reports one `app_error`
  (`render`), and the feed stays interactive.
- A throw in the shell shows SCR-045 with the three texts per locale; «Обновить» reloads.
- A `401` from `GET /api/meta` shows the session-expired state immediately (no 1/3/7/15/30 s retries), and later
  requests are not sent.
- `classifyError` maps `ApiError(0,'timeout')` → offline, `ApiError(503)` → server, `ApiError(401)` → sessionExpired.
- Visual: no KV-QA-019 baseline exists for SCR-045 (`15` notes it as a gap); compare with the legacy markup and the
  `x-feed-error` baseline styling of `ErrorState`.

## Tests

- Component (`ErrorBoundary.test.tsx`): root vs layer variant; report called once; reload button.
- Unit (`classify.test.ts`): the mapping table, non-string `detail` → `null`.
- E2E (`session-expired.spec.ts`, contract mocks of KV-FE-022): meta `401` → state; feed `401` after a good start →
  state; «Закрыть» calls the fake `WebApp.close`.

## Edge cases

- A crash inside the crash screen itself (missing catalogue): the root boundary renders a static ru fallback without
  `t()` (t never throws anyway, KV-FE-015).
- Repeated layer crashes on reopen: each reported once by dedupe (KV-FE-034); the layer can still be opened.
- `401` during the boot prefetch before React mounts: the error is held by the request cache and surfaces through the
  bootstrap provider.

## Security

SEC-REQ-005 (`401` only for authentication), SEC-REQ-007 (no credential persisted to "remember" a session),
TMA-009 (error reports scrubbed by KV-FE-034); error text never echoes server `detail` strings to the user.

## Definition of done

`make ci-frontend` green; component and E2E tests green (with KV-FE-010); SCR-045 side-by-side review recorded; new key
added to all three catalogues with the translation request; parity gate G4 for F-TMA-009 and F-ACCESS-001 ticked
(with KV-FE-034, KV-FE-021); `09` rows updated; PR reviewed by the other developer.
