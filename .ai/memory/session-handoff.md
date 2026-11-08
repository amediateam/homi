---
updated: 2026-11-09 (handoff to the second developer prepared; backend gate fixed; root AGENTS.md)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for the next **development-track** session (second developer, Codex). The first developer's own agent rules (production track) are not in this file and do not apply to you.

## Developer's standing instruction
- 2026-11-09, work split: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» — the plan is `HANDOFF.md` §4 (T0 → T1 → …). Production/staging work belongs to the first developer: «Не включай настройку production-среды в задачи коллеги».
- Gates that need the first developer's OK: dependency changes, new tools, anything on staging/production, the items marked **gate** in `HANDOFF.md` §4.
- 2026-11-08: «безопасность не важно сейчас» — do not re-raise the app.uz security findings (card C0) unprompted.

## State at handoff
- `main` holds everything: the phase stack was merged 2026-11-09 (PRs #1–#4, merge commits, last `834d69d`; GitHub backend + tooling CI green on #4). Branch from `origin/main`, PRs against `main`. Dependabot PR #5 (TypeScript 7) stays unmerged (KI-4).
- Entry points: `HANDOFF.md`, `docs/handoff/setup.md` (runbook for a new machine), `AGENTS.md`, `docs/handoff/{project-context,environment,parallel-work}.md`.
- Next task: T0 (set up and verify the second machine), then T1 Telegram webhook.
- Verify with `make dev-check`, `make ci-backend`, `make ci-frontend`, `make ai-hooks-test` (expected results: `docs/handoff/setup.md` §D).

## Done this session
- Handoff docs written and checked by an independent review agent (25 findings, confirmed ones fixed); links added to `CLAUDE.md`, `docs/README.md`, `getting-started.md`, `workflows.md`, `.ai/README.md`.
- Root `AGENTS.md` for Codex/Grok: `codex debug prompt-input` (no model call) shows its hard rules and 37 skills from `.agents/skills`; `make ai-sync` leaves it and `boost.json` unchanged.
- Backend gate (AM-36): `make ci-backend` had failed on three counts since `0f888d6`; fixed in `backend/vite.config.ts` and `backend/phpstan.neon` → exit 0, 47 tests, PHPStan 0.
- Checks: `make dev-check` 24 PASS; `make ci-frontend` exit 0; `make ai-hooks-test` 46 OK; `make registry-check` current; `npm ci` on the backend lockfile (scratch copy) exit 0; Boost MCP via absolute artisan path → 9 tools; `codex mcp add` tested with a throw-away `CODEX_HOME`.
- `environments.md` env-name list corrected. KI-19, KI-20 added.

## Waiting for the developer (do NOT start on your own)
1. First developer: grant GitHub access (the stack merge is done).
2. First developer's answers on the gates: T1 tunnel tool, T5/T8 npm dependencies, T7 product questions OPQ-1…5, PostGIS, AI vendor, T9 Codex hook adapters (D6), T10 gitleaks, T11 items (D5, D8, `.ai/rules`, `.ai/tasks`, KI-18, KI-20 fix).
3. Read access to `app.uz` only if a task needs more than the `docs/reference-codebase/` cards.

## Gotchas learned this session
- `codex debug prompt-input "ping"` renders what Codex would see (AGENTS.md, skill roots) without a model call. Codex does not load nested `AGENTS.md` files from the root — read `backend/AGENTS.md` / `frontend/<app>/AGENTS.md` yourself.
- `php artisan boost:update` rewrites `backend/boost.json` with PHP's pretty-printer — never reformat it.
- A fresh clone needs `npm ci && npm run build` in `backend/` before `make ci-backend`; `make dev-check` needs the PECL extensions `redis` and `imagick`; `postgresql@18` is keg-only (PATH); a fresh Homebrew nginx lacks the `sites-enabled` layout — all in `docs/handoff/setup.md` §B–§C.
- `POST /telegram/webhook` has no domain constraint (reachable through `api.*` too); `DatabaseSeeder` does not call `SourceSeeder`.
- zsh: `echo =====` fails (`=` expansion) and `set -- $var` does not word-split.

## Active subagent work at handoff
- None.
