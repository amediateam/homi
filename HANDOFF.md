# HANDOFF — continuing HOMI on a second machine

Purpose: everything the second developer and their AI agent need to continue development exactly where the first developer's sessions stopped, without re-analysing the project. Prepared 2026-11-09 on `chore/phase-4-ai-infra`; every "verified" statement names the check in §6. Update this file when the plan or the ownership changes.

| Track | Who | Scope |
|---|---|---|
| **Development** | second developer (+ Claude Code with Fable, or Codex) | application code, tests, migrations, API docs, local tooling — the plan in §4 |
| **Production** | first developer (+ Claude Code) | staging/production servers, deploy pipeline, DNS/TLS, MinIO, server `.env`, staging/production bots — **not part of this plan** |

Rules for working at the same time: [`docs/handoff/parallel-work.md`](docs/handoff/parallel-work.md). The first developer's standing rule «Пока я не скажу — не пиши код проекта» was a gate for their own agent; with this split (2026-11-09) application code is written on the development track, per §4.

## 1. Quick start

1. **Get** (how to transfer each item safely: §5)
   - collaborator access to `github.com/amediateam/homi` (private; `amediateam` is a user account — its owner invites you);
   - a Mac with Apple Silicon and Homebrew in `/opt/homebrew` — the local stack assumes it (ADR-0008);
   - `brew install gh jq ripgrep && brew install --cask codex`, then `gh auth login` and `codex login` (optionally Claude Code ≥ 2.1.319);
   - your own **dev** Telegram bot from @BotFather — only needed from T1 on.
2. **Set up** — run these yourself in a terminal (sudo prompts; not through the agent). The full runbook — every step with its check, who runs it, and the manual nginx, PHP-extension and PostgreSQL prerequisites — is **[`docs/handoff/setup.md`](docs/handoff/setup.md)**; the short version:
   ```bash
   gh repo clone amediateam/homi homi.uz && cd homi.uz      # location notes (macOS privacy): setup.md B4
   cp .ai/local.env.example .ai/local.env
   make dev-setup                  # warns that backend/.env was just created and skips the migration → set DB_*, REVERB_*; createdb homi
   make dev-setup                  # second run migrates and completes (idempotent)
   (cd backend && npm ci && npm run build)
   codex mcp add homi-boost -- php "$PWD/backend/artisan" boost:mcp
   ```
3. **Run and verify**
   ```bash
   make dev-start && make dev-check     # last line: dev:check OK (0 warning(s))
   make ci-backend                      # exit 0 — 47 tests passed, PHPStan 0 errors
   make ci-frontend                     # exit 0
   make ai-hooks-test                   # Ran 46 tests … OK
   ```
   Then open `https://app.homi.loc` and `https://api.homi.loc/up`.
4. **Read**, in this order: this file → `AGENTS.md` → `CLAUDE.md` → [`docs/handoff/project-context.md`](docs/handoff/project-context.md) → [`docs/handoff/parallel-work.md`](docs/handoff/parallel-work.md) → `.ai/memory/current-state.md` and `known-issues.md` → before each task, the files in its "read first" line.
5. **Start with T0** — set up your machine and write down what breaks. Then continue the Wave 1 queue (§4): `.ai/memory/session-handoff.md` names the package and the step to take.
6. **Order:** T0, then the packages of `docs/migration/wave-1/README.md` in its order. §4 says what became of each task T1 … T11: done by a package, moved to Wave 2, replaced, or unchanged. The unchanged T4 and the tooling tasks T9–T11 fit between packages. Anything marked **gate** waits for the first developer's answer.

## 2. Where the project is (2026-11-09)

| Phase (mandate §23) | State | Evidence |
|---|---|---|
| 0 Discovery | done | `docs/ai/reports/phase-0.md`, PR #1 |
| 1 Foundation — ADRs 0001–0011, standards, CI, registry, reference catalogue | done | `phase-1.md`, PR #2 |
| 2 Local environment — nginx + mkcert vhosts, dev scripts, Makefile | done on the first machine | `phase-2.md`, PR #3, `make dev-check` 24 PASS |
| 3 CDN & webhook | **in progress, paused 2026-11-08** — media module, API envelope, request ids, queues, schema done; webhook, intake, OpenAPI, docs open | `docs/ai/reports/phase-3-notes.md`, `.ai/memory/current-state.md` |
| 4 AI infrastructure | partly applied — skills, Boost MCP, hooks, permissions, subagents, `save-session`, root `AGENTS.md`; plugins, Gemini/Grok, `.ai/rules`, `.ai/tasks` wait | `docs/ai/reports/phase-4-plan.md` |
| 5 Memory & docs, 6 Quality & security, 7 Verification | not started (hooks, permissions and the `tooling` CI were pulled forward from Phase 6) | — |

What the code does today and what is missing: [`project-context.md`](docs/handoff/project-context.md) §6. Open problems: `.ai/memory/known-issues.md` — the ones that matter first are KI-13 (nginx never through `brew services`), KI-19 (pushes to `main` are not blocked technically), KI-20 (one `session-handoff.md` for two tracks).

## 3. Start branch

**Done 2026-11-09:** the whole phase stack is in `main` — PRs #1 → #2 → #3 → #4 merged with merge commits (`98a2cac`, `8218c13`, `3bf945c`, `834d69d`); GitHub's backend and tooling workflows passed on PR #4, the first CI run for the Phase 3/4 code. **Branch every task from the latest `origin/main` and open PRs against `main`.** The `chore/phase-*` branches are history; do not commit to them.

- Open Dependabot PR #5 bumps TypeScript to 7.0.2 in `frontend/` — do **not** merge it: `typescript-eslint` 8.x rejects TS 7 (KI-4, ADR-0004 pin `^6`).
- Reviews: the other developer reviews every PR (CODEOWNERS paths always); the author merges after the approval and green CI (`docs/handoff/parallel-work.md` §2).

## 4. Plan for the development track

Since 2026-11-14 the order of work is the Wave 1 queue in `docs/migration/wave-1/README.md` (`docs/migration/24-three-wave-strategy.md` §7). T3 and T5 are done by WP-10; T6 by WP-40; T8 by WP-03 and WP-20 … WP-33; T1 by WP-50. T2 (intake) is Wave 2. T7 is replaced by the native modules of Wave 1 and by Wave 2. T0, T4, T9, T10 and T11 are unchanged.

| ID | Pri | Task | Depends on | Gate |
|---|---|---|---|---|
| T0 | P0 | Onboard, verify the environment, record the clean-machine run *(unchanged)* | access (§5) | — |
| T1 | P1 | Telegram webhook pipeline *(Wave 1: WP-50)* | T0 | none for the tests; the optional live check needs your dev bot and an HTTPS tunnel tool (not chosen yet → approval) |
| T2 | P1 | Intake accept layer (`/api/v1/intake/*`) *(Wave 2)* | T0 | — |
| T3 | P1 | OpenAPI export + CI drift check *(Wave 1: WP-10)* | T1, T2 | — |
| T4 | P1 | Close Phase 3: dev-check additions, ADR-0014, docs, phase-3 report *(unchanged)* | T1–T3 | — |
| T5 | P2 | Generated TypeScript API client *(Wave 1: WP-10)* | T3 | generator = new npm dependency → approval |
| T6 | P2 | Telegram sign-in (`POST /api/v1/auth/telegram`) *(Wave 1: WP-40)* | T0 (T1 helps) | — |
| T7 | P2 | Domain modules: Geo → Listings → dedup → pricing → radar → ARM → AI tagging *(replaced by the native modules of Wave 1 and by Wave 2)* | T2, T6 | product questions OPQ-1…5, PostGIS, AI vendor |
| T8 | P2 | Frontend foundation in the Next apps *(Wave 1: WP-03, WP-20 … WP-33)* | T5, T6 | test runner = new npm dependency → approval |
| T9 | P2 | Guard rails for Codex (hook adapters) *(unchanged)* | T0 | first developer (Phase 4 D6) |
| T10 | P2 | Technical protection of `main` (ADR-0010 git hooks) *(unchanged)* | T0 | new tools (e.g. gitleaks) need approval |
| T11 | P3 | Remaining Phase 4–7 items *(unchanged)* | — | each item listed below |

**T0 — onboard and verify.** Read first: §1, `docs/handoff/environment.md`.
Result: running local stack, Codex wired to the repository (instructions, skills, Boost MCP), a written record of the clean-machine install.
Done when: every check in `docs/handoff/setup.md` §B–§E gives the expected result; problems found are recorded as `KI-`/`AM-` rows (and fixed in the docs/scripts if small); the run is written down in a new `docs/testing/verification-log.md` as a **preliminary** scenario A record (one row per check: date, command, output excerpt, PASS/FAIL) — the formal Phase 7 run is done later by an independent verifier (mandate §23); your GitHub login is added next to `@amediateam` on each line of `.github/CODEOWNERS` (ADR-0010). All of it lands in one small PR.

**T1 — Telegram webhook pipeline** (Phase 3 step 5–6). Read first: `.ai/agents/telegram-bot-engineer.md`, master prompt §8, `docs/reference-codebase/b-bot-i18n-geo-ops.md` §B1–B2 (the port plan: middleware, `insertOrIgnore` dedup, `telegram_updates` shape, tests to mirror), the porting caveats in `docs/ai/reports/phase-3-notes.md` §C, `backend/config/telegram.php`. Everything is built from these cards — no `app.uz` access is needed (the source dump mentioned in §C was temporary).
Result: `VerifyTelegramSecretToken` compares `X-Telegram-Bot-Api-Secret-Token` with `config('telegram.webhook.secret')` in constant time; `TelegramWebhookController` stores the update atomically (`insertOrIgnore` on `telegram_updates`, unique bot + `update_id`), dispatches `ProcessTelegramUpdateJob` on queue `telegram` and answers 200 at once; `TelegramClient` / `TelegramBot` / `TelegramException`; `php artisan telegram:webhook set|info|delete` for the **local dev bot** that refuses staging/production; a scheduled prune of old updates. Decide and test whether the route is limited to the `hook.*` host: today `routes/hooks.php` has no domain constraint, so `POST /telegram/webhook` is also reachable through `api.*`.
Done when: Pest tests written first and green — missing/wrong secret rejected, a duplicate update processed exactly once (Phase 7 scenario F), malformed payload, job retry/failure; `make ci-backend` exit 0; the application side of `docs/infrastructure/telegram-webhook.md` written; PR merged. A live check with your dev bot is optional: Telegram cannot reach `.loc`, so it needs an HTTPS tunnel that forwards to `hook.homi.loc` with that `Host` header and `TELEGRAM_WEBHOOK_URL` set to the tunnel URL — the tunnel tool is not chosen yet and needs approval.

**T2 — intake accept layer** (ADR-0009). Read first: ADR-0009, `docs/api/intake-sources.md` (payload v1), `.ai/agents/intake-pipeline-engineer.md`, `backend/config/intake.php`.
Result: `StoreIntakeListingsRequest`; `IntakeListingController` — batch of 1–100, `Idempotency-Key` replay through `intake_requests`, upsert of `source_listings` by source + `external_id`, raw payload in `intake_events`, `202` with HOMI ids; `IntakeEventController` for lifecycle events, applied in `source_version` order (ADR-0009); `GET /api/v1/intake/listings/{id}` for reconciliation (ADR-0009); `SourceListingResource`; `php artisan intake:token` issuing a Sanctum token with `intake:write` and its own expiry for a `Source`; routes under `/api/v1/intake/*` with `ability:intake:write` and `throttle:intake`. Locally a `Source` row comes from `php artisan db:seed --class=SourceSeeder` (`DatabaseSeeder` does not call it yet — wire it in this task).
Done when: tests for 401/403 (no token, wrong ability), the 422 envelope, idempotent replay returning the same response, no duplicate rows, out-of-order events, batch bounds and rate limiting; `docs/api/intake.md` written; `make ci-backend` exit 0; PR merged. Cross-source deduplication is **not** part of T2 (T7, OPQ-1); the "dedup cluster" field of the reconciliation response stays empty until then.

**T3 — OpenAPI export.** Read first: ADR-0007, `backend/config/scramble.php`, skill `scramble-development`.
Result: `php artisan scramble:export` writes `docs/api/openapi.json` (committed); a step in `.github/workflows/backend.yml` fails when the committed spec is stale, and `docs/api/openapi.json` is added to that workflow's `paths` filters (today it runs only for `backend/**`); `viewApiDocs` gate limits the docs UI.
Done when: a deliberately un-exported API change makes the check fail (Phase 7 scenario L), the spec is committed, PR merged.

**T4 — close Phase 3.** Read first: master prompt §26 (report format), `docs/ai/reports/phase-2.md` as an example.
Result: `make dev-check` also checks media (write + read on the public disk) and the Horizon queues; ADR-0014 "media stack and Scramble" (the earlier plan said 0013 — that number went to the Next SSR decision); `overview.md` / `environments.md` updated; `docs/ai/reports/phase-3.md`. Phase 3 steps that belong to production (CDN configuration for staging/production, nginx templates for `cdn.`/`hook.homi.uz`, MinIO provisioning, `docs/infrastructure/cdn.md`) are listed in the report as handed to the production track.
Done when: report and ADR committed, `current-state.md` updated, PR merged.

**T5 — generated TypeScript client** (ADR-0007; gate: the generator is a new npm dependency — propose it with a reason in the PR description and get the first developer's OK before installing; `scripts/packages/proposed.json` covers Composer only). Result: generator from `docs/api/openapi.json` into `@homi/types` / `@homi/api-client`, regeneration check in CI (add `docs/api/openapi.json` to the `paths` filter of `frontend.yml`), one typed call used in `frontend/app`. Done when: changing an API Resource changes the generated types and CI catches stale output (Phase 7 scenario K).

**T6 — Telegram sign-in** (ADR-0003). Read first: ADR-0003, `docs/reference-codebase/a-auth-api-media.md` (the auth port plan), `.ai/agents/security-reviewer.md`. Result: `POST /api/v1/auth/telegram` (the ADR's route — the card's `/verify` suffix and `homi.telegram.*` config key come from app.uz; HOMI uses `config/telegram.php`) verifying Mini App `initData` and the Login Widget hash server-side, issuing a Sanctum token with abilities and expiry; refresh = revoke + reissue. Write the verifier from the algorithm described in the card (HMAC key, field ordering); copying the app.uz file needs read access from the first developer. Done when: tests for valid, forged and expired data and for abilities; the security-reviewer checklist is clean; PR merged.

**T7 — domain modules** (gate). Suggested order: Geo → Listings (promote `source_listings`, photos through Media) → deduplication/matching (`.ai/agents/listing-matching-engineer.md`; gate OPQ-1) → Pricing & Stats (gate OPQ-2) → Radar & notifications → ARM API (gate OPQ-4) → AI tagging (gate: AI vendor). PostGIS is not decided yet: adopting it is an ADR plus a check with the production track that the shared PostgreSQL server offers the extension. Each module: a short plan or ADR first where `overview.md` lists an open question; done = tests, OpenAPI updated, docs, PR merged.

**T8 — frontend foundation** (gate: a test runner for the Next apps is a new npm dependency — same approval route as T5). Result: shared UI in `@homi/ui`, ru/uz/en per ADR-0006, the generated client and token auth wired into `frontend/app`, a test setup for the Next apps (none exists yet). Done when: lint, typecheck, build and the first tests run in `frontend.yml`.

**T9 — guard rails for Codex** (gate: first developer, Phase 4 D6). Codex 0.167 reports the `hooks` feature as stable (`codex features list`). Adapt `.ai/hooks/guard_paths.py` and `format_on_edit.py` to Codex's hook protocol (check its documentation for the event schema first), add tests in `.ai/hooks/tests/`. Done when: a Codex session is refused reading a probe `backend/.env.probe`, like the Claude Code check in `phase-4-plan.md`.

**T10 — protect `main` technically** (closes KI-19). Result: `scripts/git/install-hooks.sh` (pre-push refuses `main`; pre-commit Pint on staged PHP, gitleaks only after approval) run by `make dev-setup`; a deny rule for pushing to `main` in `.claude/settings.json`. Done when: `git push origin HEAD:main` is refused locally on both machines.

**T11 — remaining items** (P3, each gated by the first developer): KI-20 per-track handoff files (needs a change in `.ai/hooks/session_context.py`); `.ai/rules` + `boost:index-rules` and `.ai/tasks` task contracts; Claude Code plugins (D5); `GEMINI.md` / Grok setup (D6); the rest of the SEO skill pack (D8); KI-18; Phase 5 (component registry, dependency-change detection); Phase 6 (frontend tests, dependency audits, migration-safety checks); Phase 7 verification log — scenarios D/E (media through real S3) need staging and are done together with the production track.

**Production track (first developer — not yours):** `infra/{staging,production,server}/**`, nginx vhosts for `*.homi.uz`, MinIO buckets/users (`homi-public`, `homi-private`, `homi-tmp` + staging), DNS, TLS, deploy pipeline and process manager (ADR-0013), server `.env`, the Redis-per-environment decision, staging/production bot webhooks, backups, monitoring. Inputs: `docs/ai/reports/phase-3-notes.md` §A–§B, ADR-0011, ADR-0013. Progress log: `docs/ai/reports/production-notes.md`. As of 2026-11-09:
- production (`*.homi.uz`) and staging (`*.staging.homi.uz`) are live on `159.253.19.121`, with `DB_SSLMODE=disable`;
- deploys run with `homi-deploy` (`docs/infrastructure/deployment.md`) — on production, new migrations need the production track's `--migrate` (`parallel-work.md` §3);
- where the track stopped: that file, "Resume here".

## 5. What has to be handed over by hand

| Item | Needed for | How (never through git, chat, e-mail or an agent prompt) |
|---|---|---|
| GitHub access to `amediateam/homi` | everything | the owner of the `amediateam` account (a user account, not an organisation) adds your login as collaborator; then `gh auth login` |
| PHP extensions `redis`, `imagick` | `make dev-check`, Redis queue/cache (`REDIS_CLIENT=phpredis`) | not files to copy — install them on your machine (`setup.md` B2) |
| Codex / OpenAI account | your agent | your own account; `codex login` |
| Dev Telegram bot token + username, webhook secret | T1, T6 | create your own bot with @BotFather; generate the secret locally (`openssl rand -hex 32`); put both into your `backend/.env` only |
| `backend/.env` values | local run | not transferred — `make dev-setup` creates the file from `.env.example`; `APP_KEY` is generated; `DB_*` and `REVERB_*` are yours (`setup.md` C3) |
| `.ai/local.env` | hooks, scripts | per machine, from `.ai/local.env.example` |
| mkcert CA and certificates | local HTTPS | per machine (`make dev-certs`); a CA private key never leaves its machine |
| Reference codebases (`app.uz`, `telegram.uz`, `datahub.uz`, `geo.uz`) and the nginx mirrors | only for porting details beyond `docs/reference-codebase/` | separate repositories/folders; ask the first developer for read access if a task needs them; read-only; paths into `.ai/local.env` |
| `BOOST_GITHUB_TOKEN` for `boost:add-skill` | adding skills | your own: `BOOST_GITHUB_TOKEN="$(gh auth token)"` for that one command, never stored |
| Claude Code user-level setup of the first developer (plugins, auto-memory) | — | plugins are personal and not required. The project memory travels with the repository (`CLAUDE.md` + the SessionStart hook injecting `.ai/memory/*`); a portable copy of the first developer's auto-memory is in `docs/handoff/claude-memory/` and is installed by `setup.md` E1.5 |
| Staging/production credentials, SSH, DNS, MinIO keys, staging/production bot tokens | — | **not handed over** — production track only |
| The first developer's agent conversations | — | not transferable; everything they produced is in the files listed in §1 step 4 |

## 6. Checks run before the handoff (first developer's machine, 2026-11-09)

| Check | Result |
|---|---|
| `make dev-check` | 24 PASS, `dev:check OK (0 warning(s))` |
| `make ci-backend` | **failed** first (AM-36): Vite+ formatting of `backend/boost.json`, Vite+ lint of a template inside a vendored skill reached through `backend/.ai`, PHPStan on the published `config/boost.php` — fixed in `backend/vite.config.ts` and `backend/phpstan.neon`; rerun: exit 0, 47 tests passed / 157 assertions, PHPStan 0 errors |
| Independent review of these documents (a fresh agent checking every claim against the repository) | 25 findings; the confirmed ones are fixed in this commit (clean-machine prerequisites, PR base before L1, T1/T2/T6 scope, session-handoff wording); one was refuted (`amediateam` is a user account, so `@amediateam` in CODEOWNERS is valid) |
| `make ci-frontend` | exit 0 (lint, typecheck, build of landing/app/arm) |
| `make ai-hooks-test` | `Ran 46 tests` … `OK` |
| `make registry-check` | `package registry is current` |
| `npm ci` with `backend/package-lock.json` (scratch copy) | exit 0, 223 packages |
| Codex 0.167 `codex debug prompt-input "ping"` at the repository root | the root `AGENTS.md` text is in the prompt (its "Hard rules" found); the skill roots include `<repo>/.agents/skills` (37 skills); nested `AGENTS.md` files are not loaded from the root (probe repository) |
| `make ai-sync` after adding the root `AGENTS.md` | exit 0; root `AGENTS.md` and `backend/boost.json` unchanged (Boost writes only `backend/AGENTS.md`) |
| Boost MCP via `php <repo>/backend/artisan boost:mcp` from another directory | `initialize` OK, `tools/list` → 9 tools |
| `codex mcp add homi-boost -- php <repo>/backend/artisan boost:mcp` (throw-away `CODEX_HOME`) | entry written, listed as enabled |
| Branch stack and PRs | linear stack confirmed with `git merge-base --is-ancestor`; PRs #1–#3 `MERGEABLE`/`CLEAN`; then #1–#4 merged into `main` with merge commits |
| GitHub CI on PR #4 (phase 3/4 code) | `backend` and `tooling` workflows passed; `frontend` not triggered (no `frontend/` changes since `main`) |
| Claude Code `claude mcp list` | `laravel-boost` "Pending approval" until approved in a session |

**Not verified:** `make dev-setup` on a clean machine (T0 is the first run); a live Codex session calling the Boost tools; anything on staging/production.

## 7. First message for your AI agent

Paste this into the agent started at the repository root — Claude Code (e.g. Fable) or Codex (Russian version: in the handoff message from the first developer). For the setup alone, the shorter message at the end of `docs/handoff/setup.md` is enough:

```text
You are continuing development of HOMI (homi.uz) on a new machine; the previous sessions ran elsewhere and their context is in the repository, not in your memory.
1. Read AGENTS.md (Codex) or CLAUDE.md (Claude Code), then HANDOFF.md, docs/handoff/setup.md, docs/handoff/project-context.md, docs/handoff/parallel-work.md and .ai/memory/{current-state,known-issues,session-handoff}.md.
2. Do task T0 from HANDOFF.md §4: walk me through docs/handoff/setup.md from the first unfinished step. Steps that need sudo or a password (make dev-setup, nginx, /etc/hosts, mkcert, pecl) I run myself in a terminal and paste the output; you run the read-only checks and the gates (ask me for approval when a command needs network or writes outside the repository). Report each check with its command and output. Do not fix anything outside the plan without asking me.
3. Then continue the Wave 1 queue: read docs/migration/wave-1/README.md (its rules 1–8) and "State at handoff" in .ai/memory/session-handoff.md, tell me which package and step you take, and wait for my OK before writing code.
Rules: the "Hard rules" in AGENTS.md are binding; staging/production work is out of scope; talk to me in Russian, write repository artifacts in English; never claim a check you did not run.
```
