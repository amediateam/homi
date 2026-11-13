# KV-FE-034 — Event journal and global error reporting

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-ANALYTICS-001, F-TMA-009 |
| Dependencies | KV-FE-021 (API client); backend KV-BE-151 (API-034); consumers: every task that sends a journal event (table below), KV-FE-032 (boot handover), KV-FE-036 (render errors), KV-FE-035 (screen name, render hook) |

## Goal

The new Mini App writes the same 16 journal events as legacy to `POST /api/events` (fire-and-forget, surviving the app
closing), and reports uncaught errors and rejections with the legacy filtering, sanitising and per-session cap, taking
over from the boot watchdog. No `initData`, phone number or e-mail ever reaches the journal.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/api/events.js:9-35` (`trackEvent`, `sendErrorEvent`, `keepalive: true`, errors
  swallowed); `$KVADRO_ROOT/demo/app/src/lib/errors.js:9-123` (dedupe `kind|name|message`, max 5, `stage`
  `boot`→`app`, `screen`, sanitisers, ignored errors, `__kvBoot.watching`); `$KVADRO_ROOT/demo/app/src/lib/buildVersion.js`
  (`v`).
- `03` §1.6 (error-handling layers), §3.3 (a) (the 16 events), `$KVADRO_ROOT/docs/api.md` §11; TMA-003 (handover from
  the boot script), TMA-009 (no `initData` in error sources).
- Contract: API-034 (`08` §2: body `{"name": string, …props}` at the top level, recommended `204`, never read).

## Implementation

1. `frontend/app/lib/analytics/journal.ts`: `trackEvent(name, props = {})` → `POST /api/events` through the API client
   of KV-FE-021 with `keepalive: true`, body `{name, ...props}`; every error swallowed; **not sent without `initData`**
   (legacy sent an empty `tma ` header that the server rejects, `08` §1.2 — the boot script already skipped it); body
   truncated to stay below 8 KB (SEC-REQ-022).
2. `frontend/app/lib/analytics/events.ts`: a typed map `JournalEvent → props` for the 16 events (table below); unknown
   names are a type error.
3. `frontend/app/lib/errors.ts`:
   - `reportError(kind: 'error'|'rejection'|'render', error, source?)`: `name` = `error.name` or `typeof`, sanitised to
     `[\w.$/-]` ≤ 40; `message` ≤ 300; `source` = given or the first `http(s)://…:line:col` of the stack, with `?…` and
     `#…` removed but `:line:col` kept, ≤ 300; `stage` `boot` until `markAppStarted()` (called by KV-FE-040 on meta
     success), then `app`; `screen` from `setErrorScreen()` (KV-FE-035 / KV-FE-025) ≤ 40; `tg` (client version) ≤ 10;
     `platform` ≤ 20; then scrub `message` and `source` of `tgWebAppData=…`, `+998` phone patterns and e-mail addresses
     (client side of SEC-REQ-022); dedupe by `kind|name|message`; at most 5 distinct reports per session; for `render`
     also call the hook set by KV-FE-035 (`posthog.captureException`).
   - `installGlobalErrorHandlers()` (called from `instrumentation-client.ts`, KV-FE-032): set `__kvBoot.watching = true`;
     `error` listener ignores «Script error.» and empty messages; `unhandledrejection` ignores the API client's
     `ApiError` and `AbortError`.
4. `BUILD_VERSION` (`v`): a build-time constant (`NEXT_PUBLIC_BUILD_VERSION`, set by the deploy pipeline KV-INF-023, ≤ 40
   characters, `dev` locally), shared with the boot script (KV-FE-032).
5. Event ownership — each task calls `trackEvent` exactly where legacy did:

| # | Event | Properties | Fired by |
| - | ----- | ---------- | -------- |
| 1 | `app_launch` | `entry` (`link`/`news`/`menu`), `ms`, `v`, `sdk?`, `js`, `platform` | KV-FE-040 |
| 2 | `app_opened` | `entry: 'link', listing_id, ms` or `entry: 'news'/'menu', ms` | KV-FE-040 (meta success only) |
| 3 | `app_error` | `v`, `error {kind, name, message, source, stage, screen, tg, platform}` | KV-FE-032 (`boot`), this task (`error`, `rejection`), KV-FE-036 (`render`) |
| 4 | `follow_prompt_shown` | — | KV-FE-080 |
| 5 | `follow_prompt_expired` | — | KV-FE-080 |
| 6 | `follow_prompt_closed` | — | KV-FE-080 |
| 7 | `home_screen_offered` | — | KV-FE-086 |
| 8 | `home_screen_closed` | — | KV-FE-086 |
| 9 | `home_screen_added` | — | KV-FE-086 |
| 10 | `chat_access_declined` | — | KV-FE-030 |
| 11 | `chat_access_allowed` | — | KV-FE-030 |
| 12 | `listing_shared` | `listing_id` | KV-FE-069 |
| 13 | `original_opened` | `listing_id`, `src` (`button`/`video`/`sources`/`price_history`/`offers`) | KV-FE-063 (`video`), KV-FE-064 (`price_history`), KV-FE-065 (`sources`), KV-FE-068 (`button`, `offers`) |
| 14 | `original_copied` | `listing_id` | KV-FE-065 |
| 15 | `contact_call` | `listing_id`, `via` (`tel`/`browser`), `src?` (`text`) | KV-FE-068 (also for the phone button in the original text, KV-FE-065) |
| 16 | `contact_write` | `listing_id` | KV-FE-068 |

## States and texts

n/a — no UI.

## Interaction

n/a — no UI.

## Telegram integration

TMA-003 (handover: `__kvBoot.watching`), TMA-009 (no `initData` in any reported field), TMA-041 (`platform`), TMA-042
(`tg` version).

## Storage and analytics

- Storage: none (the dedupe set lives in memory for the session).
- The journal is the analytics channel (a) of `03` §3.3; event names and property names are unchanged for continuity
  (12 §1 rule 10).

## Files

- `frontend/app/lib/analytics/journal.ts`, `events.ts`, `buildVersion.ts`, `frontend/app/lib/errors.ts` (new)
- `frontend/app/tests/analytics/journal.test.ts`, `frontend/app/tests/errors.test.ts`

## API contract

API-034 `POST /api/events`, `Authorization` per FD-2 (`tma <initData>` on the legacy surface), `Content-Type:
application/json`, `keepalive: true`; response `204` (never read); any failure ignored; never retried.

## Business rules

- Kept: the 16 events and properties of `03` §3.3; error filtering, dedupe and the cap of 5 (`03` §1.6, §3.4).
- Internal fix: no send without `initData` (no user-visible effect; avoids the `401` noise of `08` §1.2).

## Acceptance criteria

- Each of the 16 events is emitted once by its owning task with exactly the listed property names (contract test
  against the KV-QA-002 fixture of API-034).
- A thrown error, an unhandled rejection and a render error each produce one `app_error`; the sixth distinct error in a
  session produces none; the same error twice produces one.
- `ApiError` and `AbortError` rejections and «Script error.» produce nothing.
- `source` of an error raised in a script loaded from `…/page#tgWebAppData=…` is stored without the hash; a message
  containing `+998 90 123 45 67` is masked.
- Without `initData` no request is made.

## Tests

- Unit (`journal.test.ts`): body shape, `keepalive`, swallowing of network errors, no call without `initData`, 8 KB
  truncation.
- Unit (`errors.test.ts`): sanitisers, `stripUrlQuery` with and without `:line:col`, dedupe, cap of 5, `stage`
  switch after `markAppStarted`, ignored error classes, scrubbing of `tgWebAppData`, phones and e-mails, render hook
  called for `render` only.
- Contract: event names and property keys match the API-034 allowlist of KV-BE-151.

## Edge cases

- `keepalive` body limit (64 KB in browsers) is far above our 8 KB cap.
- Errors thrown by the Telegram SDK inside `safeCallback` arrive asynchronously and are reported once.
- An error storm during boot before `watching` is set is handled by the boot script (KV-FE-032), not here.

## Security

SEC-REQ-022 (bounded body, allow-listed names, scrubbed `message`/`source`), SEC-REQ-047 (no `Authorization`,
`initData`, phones or texts in logs), TMA-009.

## Definition of done

`make ci-frontend` green; unit and contract tests green (with KV-FE-010); parity gate G4 for F-ANALYTICS-001 and
F-TMA-009 ticked (the latter with KV-FE-036); `09` rows updated; PR reviewed by the other developer.
