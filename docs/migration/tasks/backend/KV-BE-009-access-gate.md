# KV-BE-009 — Access gate (closed-beta reasons)

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); the production `ACCESS_MODE` value is set by the production track **[PT]** (DEC-25) |
| Complexity | M |
| Feature IDs | F-ACCESS-002 |
| Dependencies | KV-BE-007, KV-DB-007 |

## Goal

One access decision — `private`, `invite`, `full`, `blocked`, `join` or granted — is computed in one service and
enforced by one middleware on every protected legacy route and by one guard method for bot handlers. `GET /api/meta`
returns the reason as `403 {"detail": "<reason>"}` byte-identical to legacy; `blocked` stops everything.

## Legacy reference

- Gate on `GET /api/meta`: `403 {"detail": "private"|"invite"|"full"|"blocked"|"join"}`; unknown `detail` shown as
  `private` (`$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:13`, `:22`;
  `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:130-139`); re-check 3 × 2.5 s except `blocked`
  (`useAppBootstrap.js:26`, `:134-137`, `:150-157`).
- Meanings: `private` owner only, `invite` link + bot «Старт», `full` seats taken, `blocked` by the operator, `join` bot
  not started (`$KVADRO_ROOT/docs/about.md:248-252`; `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:33-37`); mode and
  owner list are configuration (`about.md:453`).
- Rules BR-API-011…016, BR-DATA-007; questions Q-API-005 (which routes enforce), Q-API-006 (conditions); LB-API-002,
  LB-API-021; DEV-001 (`PROPOSED`); SEC-REQ-005, SEC-REQ-006; GAP-020; `15` §3.1 rows 10–11; `16` §5.1 last row.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/pennant-development/` (only to confirm that the mode
   stays in config, not Pennant — one source of truth), `.ai/agents/security-reviewer.md`.
2. Tests first (below).
3. `php artisan make:enum Enums/Access/AccessState --no-interaction` (`Private`, `Invite`, `Full`, `Blocked`, `Join`,
   `Granted`; `legacyDetail()` returns the five wire strings).
4. `php artisan make:config access --no-interaction`: `mode` (`ACCESS_MODE`: `private|invite|open`, default `private`
   locally safe), `max_seats` (`ACCESS_MAX_SEATS`, `null` = unlimited).
5. `php artisan make:class Services/Access/AccessGate --no-interaction`: `decide(User): AccessDecision` (readonly:
   state, reason) with the precedence (spec-tested, `PROPOSED` until Q-API-006): `access_grants.state = blocked` →
   `Blocked`; `users.bot_chat_state !== 'active'` → `Join`; `access_grants.state = admitted` or `role = owner` →
   `Granted`; mode `private` → `Private`; mode `invite` → `Invite`; mode `open` and admitted count ≥ `max_seats` →
   `Full`; otherwise admit atomically (insert `access_grants` row `admitted`, `admitted_via = open`, under a lock that
   counts seats — no over-admission past `max_seats`). `forBot(User): AccessDecision` returns the same decision for bot
   handlers (M5). Admission through an invite is done by the bot `/start` with an invite payload (M5) via
   `AccessGate::admitByInvite(User, string $token)` — implemented here, token compared by hash against `beta_invites`
   (`max_uses`, `used_count`, `expires_at`).
6. `php artisan make:middleware Legacy/EnsureAccessGranted --no-interaction`, alias `legacy.access`: throws
   `AccessDenied($state)` (rendered `403 {"detail": "<reason>"}` by KV-BE-005). Attach to every authenticated route of
   `routes/legacy.php` (not to `GET /api/bot`, `/media`, `/call`, `/api/csp-report`, `POST /api/events` — events from a
   gated user answer `204` and are dropped, M7).
7. Cache the decision per user for 2 seconds at most (the client re-checks every 2.5 s after «Старт», BR-API-013); a
   change of `access_grants` or `bot_chat_state` flushes it (model events).
8. Raise `AccessStateChanged` (`app/Events/Access`) on admission and blocking for later bot notices (`10` §4.12).
9. Pint, PHPStan, tests.

## Files

- `backend/app/Enums/Access/AccessState.php`, `backend/app/Domain/Access/AccessDecision.php`,
  `backend/app/Services/Access/AccessGate.php`, `backend/app/Events/Access/AccessStateChanged.php` (new)
- `backend/app/Http/Middleware/Legacy/EnsureAccessGranted.php` (new), `backend/bootstrap/app.php` (alias)
- `backend/config/access.php` (new), `backend/routes/legacy.php`
- `backend/tests/Feature/Access/{AccessGateTest,AccessMiddlewareTest}.php` (new)
- `backend/.env.example` (`ACCESS_MODE`, `ACCESS_MAX_SEATS`, separate PR)

## API contract

Any protected legacy route for a denied user → `403 {"detail": "private"}` | `{"detail": "invite"}` |
`{"detail": "full"}` | `{"detail": "blocked"}` | `{"detail": "join"}` — exactly these five strings, nothing else ever
(an unknown value would show as «Бот приватный», LB-API-002). `GET /api/bot` stays `200` for everyone. A granted user
passes through unchanged.

## Business rules

Kept: BR-API-011 (five strings), BR-API-012 (meanings; conditions spec-tested), BR-API-013 (gate opens within seconds
after «Старт»), BR-API-014, BR-API-015 (the no-access screen's bot link is client-side), BR-API-016, BR-DATA-007 (users
admitted before the cut-over stay admitted). `PROPOSED`: DEV-001 — the legacy client keeps its behaviour; the same reason
on every route matters only for the new client; its client-facing test is `->todo('DEV-001 PROPOSED')`, while the `403`
on every route is required now by SEC-REQ-006. Defect fix asserted: LB-API-021 (`401` for authentication, `403` only for
access).

## Acceptance criteria

- For each of the five states, every protected route of the group returns `403` with that reason; a granted user gets
  the route's response; `GET /api/bot` returns `200` in every state.
- `blocked` beats every other condition, including owner and admitted.
- In `open` mode with `max_seats = 2`, 20 concurrent first requests admit exactly 2 users; the others get `full`
  (PostgreSQL group).
- After `bot_chat_state` becomes `active`, the next request (≤ 2 s later) is no longer `join`.
- An invite token is stored only as a hash; a used-up or expired invite does not admit.

## Tests

`backend/tests/Feature/Access/AccessGateTest.php` — dataset over (mode, grant state, role, `bot_chat_state`, seats) →
expected state, named after the rule it pins; `it('admits by invite token once per use')`;
`it('never admits past max_seats under concurrency')` (`pgsql` group, KV-QA-008).
`backend/tests/Feature/Access/AccessMiddlewareTest.php` — test-only protected route under `/api/__selftest/gated`:
one case per state with `assertLegacyError(403, '<reason>')` (KV-QA-004 assertions); `it('does not gate api/bot')`;
`it('re-evaluates after bot start within two seconds')` with a frozen clock.
Later, the IDOR/gate matrix of KV-QA-015 runs every registered legacy route × state.

## Edge cases

- `join` opens live only when the bot maintains `users.bot_chat_state` from `/start` and `my_chat_member` (F-RADAR-008,
  F-BOT-012, telegram track); until then tests set the column through the factory.
- Owner listed but also blocked → `blocked` (an operator can lock out a compromised owner account).
- Mode switched from `invite` to `open`: already admitted users stay admitted; seat counting includes them.
- A user who blocked the bot after admission (`bot_chat_state = blocked`): legacy behaviour unknown (Q-API-006) —
  spec: `join`; recorded in the test name as spec-tested.
- Team accounts (`users.is_team`) are not special for the gate (only for analytics).

## Security

SEC-REQ-006 (one gate everywhere, `blocked` gets no phone through any route), SEC-REQ-005 (status semantics),
SEC-REQ-014 (decisions per authenticated user only), invite tokens hashed (`14` §3), race-safe seat counting
(SEC-REQ-015).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; `ACCESS_MODE`/`ACCESS_MAX_SEATS` announced;
DEC-25 recorded as the production value decision in `session-handoff.md`.
