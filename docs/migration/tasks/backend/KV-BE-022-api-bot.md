# KV-BE-022 — API-003 `GET /api/bot`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-TMA-002, F-ACCESS-002 |
| Dependencies | KV-BE-005, KV-BE-010; decision CF-009 (bot identity per environment); question Q-API-056 |

## Goal

The first real endpoint of the legacy surface: an anonymous `GET /api/bot` on the legacy Mini App host returns the
usernames of the environment's main bot and support bot, works for gated users and outside Telegram, and ignores any
`Authorization` header — proving the route group, renderer and anonymous limiter end to end.

## Legacy reference

- `08` API-003: called with plain `fetch` / `XMLHttpRequest` and no `Authorization`
  (`$KVADRO_ROOT/demo/app/src/lib/api/meta.js:15-23`; boot script `$KVADRO_ROOT/demo/app/index.html:94-102`); response
  `{"username": string, "support": string|null}` (`$KVADRO_ROOT/docs/api.md:489-505`); production values are the
  public names `KvadroAppBot`, `KvadroSupportBot` (`$KVADRO_ROOT/docs/telegram-bot.md:975`).
- Uses: no-access screen deep link `?start=s_<source>[--l<id>]`
  (`$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:31`, `:40`, `:66`), boot fallback when
  `WebApp.close` is missing, «Настройки → О приложении» (`src/features/settings/SettingsScreen.jsx:65`), listing
  actions (`src/features/listing/ListingActionsSheet.jsx:46`).
- Non-2xx → client fallback `{username: null}` (drops `support`).
- Rules: BR-API-009 (works without `Authorization`), BR-API-015 (gated users go to the bot), SEC-REQ-005 (ignores any
  `Authorization`), SEC-REQ-027 (`GET /api/bot` IP 60/min); environment-specific bots (BR-API-008, CF-009).
- Cache headers of legacy `/api/*` unknown (Q-API-056).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` and the KV-BE-005 route-group conventions.
2. Add `support_username` to `config/telegram.php` under `bot` (env `TELEGRAM_SUPPORT_BOT_USERNAME`, `17` §4); add the
   key to `backend/.env.example` in a separate small PR (shared file) and announce it.
3. `php artisan make:controller --no-interaction Legacy/BotInfoController --invokable` extending `LegacyController`;
   returns `json(['username' => …, 'support' => …])` — strings without `@`, `null` when not configured.
4. Register in `routes/legacy.php` **outside** `auth:tma` and `legacy.access`, with `throttle:legacy-anon`; the guard
   is not invoked at all, so a garbage `Authorization` cannot produce `401`.
5. Write the contract test first (fixture from KV-QA-002 for API-003), then the route.

## Files

- `backend/app/Http/Controllers/Legacy/BotInfoController.php`
- `backend/routes/legacy.php` (one route)
- `backend/config/telegram.php` (`bot.support_username`)
- `backend/tests/Feature/LegacyApi/Api003BotTest.php`

## API contract

`GET /api/bot` — no auth, no query, no body.

- `200` `{"username": "KvadroAppBot", "support": "KvadroSupportBot"}` in production; staging and dev return their own
  bots' names; `support` may be `null` (hides the item client-side).
- Headers: `Content-Type: application/json`, `Cache-Control: private, no-store` (legacy group default; Q-API-056
  recorded as spec), no `Access-Control-Allow-Origin` (same origin, SEC-REQ-032).
- `429 {"detail":"rate_limited"}` + `Retry-After` above 60/min per IP; any other error in the `{detail}` dialect.
- On a non-legacy host the path answers `404` (host binding of KV-BE-005).

## Business rules

- Kept: BR-API-009, BR-API-008 (per-environment bot), BR-API-015 (enables the gated hand-off).
- Defect fixes and DEVs: none apply.

## Acceptance criteria

- No `Authorization` → `200` with both keys; `Authorization: tma <valid>` → the same body; `Authorization: tma ` (empty)
  and `Authorization: Bearer junk` → still `200` (must not authenticate, SEC-REQ-005).
- A user in every access state (`private`, `invite`, `full`, `blocked`, `join`) gets `200` (`15` §3.1 #11).
- The 61st request in a minute from one IP gets `429` with the legacy body; another IP is unaffected.
- The KV-QA-004 harness case for API-003 turns from `todo` into a passing test.

## Tests

- `Api003BotTest`: the four `Authorization` variants above; gated users via factory states; `support` unset → `null`;
  environment override (`config(['telegram.bot.username' => 'staging_bot'])`) returns it; limiter N / N+1; headers
  snapshot (`assertNoStore()`, `assertNoCors()` from KV-QA-004); envelope absent (`assertNoEnvelope()`).
- Contract: API-003 golden fixture (shape mode).

## Edge cases

- Bot username configured with a leading `@` → emitted without it (the client builds `t.me/<username>`).
- `HEAD /api/bot` is answered like `GET` without a body; `POST /api/bot` → `405 {"detail":"Method Not Allowed"}`.
- Called before meta and on the no-access screen in rapid succession — limiter budget (60/min per IP) covers several
  users behind one carrier NAT; tune with measured traffic (CF-018).

## Security

- No authentication by design; no user data in the response; the guard never runs on this route (SEC-REQ-005).
- IP limiter keyed through the trusted-proxy configuration of KV-BE-010 (SEC-REQ-027).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; `TELEGRAM_SUPPORT_BOT_USERNAME` announced in the PR
and added to `docs/infrastructure/environments.md` by its owner.
