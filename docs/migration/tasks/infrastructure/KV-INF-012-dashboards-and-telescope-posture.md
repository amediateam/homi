# KV-INF-012 — Dashboard gates and Telescope posture

| Field | Value |
| ----- | ----- |
| Status | TODO (the access path itself is Q-SEC-019, production track) |
| Owner | DevOps (track: development) |
| Complexity | S |
| Feature IDs | Technical migration task — SEC-034: Horizon, Telescope and Pulse show payloads with personal data; serves F-PRIVACY-004 |
| Dependencies | Q-SEC-019 (how admins reach dashboards on servers); DEC-22 (ARM roles, later); the backend log/Telescope redaction work owns `TELESCOPE_ENABLED` and Telescope's hidden fields (F-PRIVACY-004, SEC-REQ-047) — this task does not repeat it |

## Goal

`/horizon`, `/telescope` and `/pulse` are reachable only by named operators in staging and production (today their gates
compare an empty e-mail list and users sign in with Telegram, not e-mail), and stay open locally; the configuration
makes Telescope-off the production default visible to the production track.

## Legacy reference

- No legacy dashboards are known (SEC-023 lists admin operations without tooling).
- HOMI today: `backend/app/Providers/HorizonServiceProvider.php:28-34` and
  `backend/app/Providers/TelescopeServiceProvider.php:58-64` gate by an empty e-mail list; Pulse has no explicit gate;
  CLAUDE.md lists `/horizon`, `/telescope`, `/pulse` as local dashboards.
- SEC-034, SEC-REQ-046 (dashboards reachable only by admins), SEC-REQ-047; Q-SEC-019; `10` §4.8 row "Dashboards"
  (ARM role or SSH tunnel only).

## Implementation

1. `config/ops.php` (new): `dashboard_user_ids` from `OPS_DASHBOARD_TELEGRAM_IDS` (comma list of internal admin
   Telegram ids; blank by default) and `dashboard_mode` from `OPS_DASHBOARD_MODE` (`local-open` | `allowlist` |
   `tunnel-only`).
2. One gate helper `App\Ops\DashboardAccess::allows(?User $user): bool` used by `viewHorizon`, `viewTelescope` and
   `viewPulse`: `local` environment → true; `allowlist` → the signed-in user's `telegram_user_id` is listed (and,
   once ARM roles exist, has the admin role — DEC-22); `tunnel-only` → false for every web request (operators use an
   SSH tunnel to a loopback-bound vhost that the production track configures).
3. Register `viewPulse` in a service provider (Pulse reads the gate of that name).
4. Feature test per dashboard and mode.
5. `.env.example`: the two new names (shared file, separate PR); `docs/infrastructure/environments.md` names via
   KV-INF-003; the PR asks the production track to answer Q-SEC-019 and pick the mode per environment.

## Files

- `backend/config/ops.php`, `backend/app/Ops/DashboardAccess.php` (new)
- `backend/app/Providers/HorizonServiceProvider.php`, `backend/app/Providers/TelescopeServiceProvider.php`,
  `backend/app/Providers/AppServiceProvider.php` (changed)
- `backend/tests/Feature/Ops/DashboardAccessTest.php` (new); `backend/.env.example` (shared)

## API contract

`GET /horizon`, `/telescope`, `/pulse`: `200` for allowed operators; `403` otherwise (framework behaviour of the
packages' gates).

## Business rules

None; SEC-REQ-046 is the requirement.

## Acceptance criteria

- In `production` with `allowlist` and an empty list, all three dashboards answer 403 for every user.
- A listed operator gets 200 on all three; an unlisted signed-in user 403.
- `tunnel-only` answers 403 to every web request.
- Locally (`APP_ENV=local`) the dashboards stay open (developer workflow unchanged).

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `APP_ENV=production`, mode `allowlist`, no list, GET `/horizon` | 403 |
| 2 | same, user with listed Telegram id | 200 |
| 3 | `APP_ENV=production`, mode `tunnel-only`, listed user, GET `/pulse` | 403 |
| 4 | `APP_ENV=local`, guest, GET `/telescope` | 200 (if Telescope enabled) |
| 5 | `APP_ENV=staging`, unlisted user, GET `/pulse` | 403 |

## Edge cases

- Users without `telegram_user_id` (pre-migration starter-kit users) never match the allow-list.
- Telescope disabled (`TELESCOPE_ENABLED=false`): its routes do not exist; the test skips it.
- Staff sign-in for dashboards depends on the identity work (CF-015); until then `tunnel-only` is the safe default for
  servers.

## Security

SEC-034 and SEC-REQ-046; the allow-list holds Telegram ids of operators, which are personal data — names only in the
repository, values in server `.env` (production track).

## Definition of done

Tests green (`make ci-backend`), the production track has the mode decision request (Q-SEC-019) in the PR, env names
announced, PR reviewed by the other developer and the `security-reviewer` agent.
