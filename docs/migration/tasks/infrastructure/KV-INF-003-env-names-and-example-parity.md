# KV-INF-003 — Environment variable names per feature and `.env.example` parity

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) — shared files, separate small PRs reviewed by the other developer |
| Complexity | S |
| Feature IDs | Technical migration task — the env key list is the interface between the tracks (`docs/handoff/parallel-work.md` §1, §6); every feature that reads configuration depends on it |
| Dependencies | — (feature tasks add their own keys; this task adds the missing existing ones, the per-feature table and the parity check) |

## Goal

Every environment variable the backend reads is listed in `backend/.env.example` (blank or safe default) and named
per feature in `docs/infrastructure/environments.md`; a check fails when code reads a key that the template lacks, so
the production track can never miss a new key at deploy time.

## Legacy reference

- Variable names per feature: `17` §4 (backend and frontend tables, all `PROPOSED`); secret inventory SEC-REQ-034.
- Gap found in `17` §4 row "Telegram (read by `config/telegram.php`, missing from `.env.example`)":
  `TELEGRAM_WEBHOOK_MAX_CONNECTIONS`, `TELEGRAM_API_BASE_URL`, `TELEGRAM_HTTP_TIMEOUT`,
  `TELEGRAM_HTTP_CONNECT_TIMEOUT`, `TELEGRAM_UPDATES_RETENTION_DAYS` (`backend/config/telegram.php:25`, `:38-40`,
  `:48`; `backend/.env.example:87-90`).
- New keys from the bot tasks (scratch registry, shared design decisions): `TELEGRAM_WEBHOOK_SECRET_PREVIOUS`,
  `TELEGRAM_UPDATES_ENCRYPTION_KEY`, `TELEGRAM_MINIAPP_URL`, `TELEGRAM_SUPPORT_BOT_USERNAME`,
  `TELEGRAM_SEND_RATE_GLOBAL`, `TELEGRAM_SEND_RATE_PER_CHAT`, `TELEGRAM_CONVERSATION_TTL`, `TELEGRAM_ADMIN_USER_IDS`,
  `PHONE_HMAC_PEPPER`; added while the task files were written (full list in `11b` §2.3 row 6):
  `TELEGRAM_STICKER_SET`, `TELEGRAM_BROADCAST_ENABLED`, `TELEGRAM_PROFILE_SYNC_ALLOWED`, `OPS_HEARTBEAT_URL`,
  `METRICS_TOKEN`, `METRICS_ALLOWED_IPS`, `OPS_DASHBOARD_TELEGRAM_IDS`, `OPS_DASHBOARD_MODE`.
- Existing tooling: `scripts/dev/env-keys.sh` (compares `.env` with `.env.example` by key name only).
- Rule: a new key = `.env.example` + the config file that reads it + the name in `environments.md`, announced in the
  PR (`docs/handoff/parallel-work.md` §6).

## Implementation

1. Add the five missing Telegram keys to `backend/.env.example` with the defaults already in
   `config/telegram.php` (non-secret values only) — one small PR.
2. Add a "Variables per feature" table to `docs/infrastructure/environments.md` mirroring `17` §4: feature, backend
   names, frontend names, secret yes/no, who sets the staging/production value (always the production track). Only
   names; the local column may say "blank" or the default.
3. `scripts/dev/env-names.sh` (new, read-only, no values): collect every `env('NAME'` in `backend/config/*.php`,
   `backend/bootstrap/*.php` and `backend/app/**` and every `process.env.NAME` / `NEXT_PUBLIC_*` in
   `frontend/*/{next.config.ts,app,src}`; FAIL for names missing from the matching `.env.example`; WARN for template
   keys no code reads (allow-list for framework keys such as `APP_*`, `DB_*`, `REDIS_*`, `MAIL_*`, `VITE_*`).
4. Call it from `make dev-check` (section "env parity") and from `.github/workflows/backend.yml` /
   `frontend.yml` as a cheap step before tests (development-owned workflows).
5. Propose a "new key checklist" (template line, config reader, `environments.md` name, PR announcement) in the PR
   description; `docs/handoff/parallel-work.md` is a shared file, so changing it is the other developer's call.
6. Each later task that introduces a key (KV-TG-001, KV-TG-003, KV-TG-007, KV-TG-019, KV-TG-050, …) adds it in the same
   three places; this task's check catches omissions.

## Files

- `backend/.env.example` (shared; separate PR)
- `docs/infrastructure/environments.md` (names table; staging/production cells "set by the production track")
- `scripts/dev/env-names.sh` (new), `scripts/dev/check.sh`, `.github/workflows/backend.yml`, `.github/workflows/frontend.yml`

## API contract

n/a — configuration only.

## Business rules

n/a — no product rule; the governing rules are `docs/handoff/parallel-work.md` §6 and SEC-REQ-034 (names, never values).

## Acceptance criteria

- `scripts/dev/env-names.sh` exits 0 on `main` after this task; it exits 1 when a branch adds `env('FOO_BAR')` to a
  config file without a template line, printing only the name.
- `environments.md` lists every key of `17` §4 that exists in code, by feature.
- No value of any secret appears in the repository or in the script output.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `scripts/dev/env-names.sh` on the branch | `PASS  backend: all config env() names in .env.example` |
| 2 | add `env('KV_PROBE_KEY')` to a scratch config file, re-run | `FAIL  backend: missing in .env.example: KV_PROBE_KEY`, exit 1 |
| 3 | CI run of `backend.yml` with that change | job fails at the env-names step |
| 4 | `make dev-check` | new "env parity" section, no values printed |

## Edge cases

- `env()` calls with computed names are ignored and reported as WARN with file:line.
- Keys read only by packages' own config (published or not) are covered by the allow-list, reviewed in the PR.
- Frontend apps: only `NEXT_PUBLIC_*` and server-only names in `next.config.ts` are scanned; per-app templates.

## Security

- SEC-REQ-034 (inventory per environment, names only), SEC-REQ-035 (no secrets in the repository), SEC-REQ-047
  (script output never contains values).

## Definition of done

Script and workflow step merged with green CI (`make ci-backend`, `make ci-frontend`); `.env.example` PR merged
separately and announced to the production track; `environments.md` table reviewed by the first developer.
