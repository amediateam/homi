# Working in parallel: development track and production track

Purpose: the rules that let two developers (each with AI agents) work at the same time without overwriting each other. Since 2026-11-09 the **development track** (second developer) builds the application and the **production track** (first developer) builds staging/production. Applies ADR-0010 (git workflow) to this split; change it by PR when the split changes.

## 1. Who owns what

| Area | Owner | Rule for the other track |
|---|---|---|
| `backend/app`, `routes`, `database/` (migrations, factories, seeders), `tests/`, application config in `backend/config/` | development | production asks for changes (PR comment or note); does not edit them on its branches |
| `frontend/**` (apps and `packages/`) | development | — |
| `scripts/dev/**`, local targets in `Makefile`, `infra/local/**`, `docs/infrastructure/local-development.md` | development | — |
| `.github/workflows/{backend,frontend,tooling}.yml`, `docs/api/**`, `docs/development/**` | development | — |
| `infra/staging/**`, `infra/production/**`, `infra/server/**`, deploy workflows (`.github/workflows/deploy*.yml`), `docs/infrastructure/{deployment,cdn,backup-recovery}.md` and the staging/production rows of `environments.md` — all created by the production track when its work starts | production | development reads, does not edit |
| Servers, DNS, TLS certificates, MinIO buckets/users, server-side `.env`, staging/production Telegram bots and their webhooks, backups, monitoring | production — every action approved by the first developer | development never receives these credentials |
| **Shared:** `backend/.env.example`, `frontend/*/.env.example`, `backend/config/{horizon,logging,queue,filesystems}.php` (production-relevant parts), `backend/boost.json`, `.ai/**`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `.claude/settings.json`, `.github/CODEOWNERS`, ADRs | both | small separate PRs, never mixed into a feature PR; the other developer reviews |

**Interfaces between the tracks** — change them only with a note in the PR description so the other side can react: env key names (`.env.example`), queue names (`config/horizon.php`), the health endpoint `/up`, ports (ADR-0008 local, ADR-0013 servers), disk names (`config/media.php`, `config/filesystems.php`), and the artisan commands a deploy runs (`migrate --force`, `config:cache`, `horizon:terminate`, `scramble:export` once T3 lands).

When production needs an application change (trusted proxies, a health check, a production config value), it describes it; the development track implements it. One-line config or `.env.example` additions may come from production as a tiny PR reviewed by the development track.

## 2. Branches and pull requests

- Base: `main` (the phase stack was merged into it on 2026-11-09, `HANDOFF.md` §3). Branch from the latest `origin/main`, open PRs against `main`; the `chore/phase-*` branches are history.
- One task = one branch from the latest base: `feat/<area>-<slug>`, `fix/…`, `docs/…`, `chore/…` (ADR-0010); production work uses `chore/infra-<slug>`.
- **Never push to `main`** — PRs only. This is not blocked technically yet (KI-19), so it is on you.
- Never force-push a branch someone else works on. Your own unshared feature branch may be rebased on `main` and pushed with `--force-with-lease`; with a shared branch merge `main` into it instead.
- Merge method: **merge commit** (no squash, no rebase-merge) — the phase stack #1 → #4 was merged that way, and history keeps matching the phase reports. Revisit together if you want squash later.
- PRs stay small (one task, roughly ≤ 400 changed lines without generated files) with green CI. The other developer reviews every PR (CODEOWNERS paths always); the author merges after that approval. Generated files are committed together with the change that produced them.
- Parallel agents on one machine: one worktree per agent under `.worktrees/<name>` (gitignored), one task each.
- Before opening or updating a PR: `git fetch` and rebase your own branch on `origin/main`, then run the gate for the side you touched (`make ci-backend` / `make ci-frontend`).

## 3. Migrations

- Only the development track writes migrations (`php artisan make:migration`); production only runs them (`php artisan migrate --force` in the deploy). The deploy script runs new migrations on staging automatically. On production it stops until the production track approves them with `homi-deploy production --migrate` (`docs/infrastructure/deployment.md`).
- Never edit a migration once it is merged into `main` — add a new one.
- Before merging: rebase on `main`, then locally `php artisan migrate:fresh --seed` and `php artisan test` (destructive for your local database only; agents must ask before running it).
- Tables that will grow (listings, `intake_events`, `telegram_updates`): additive changes first, backfills in queued jobs, indexes and constraints that do not lock — see `.ai/agents/postgis-geo-engineer.md`.
- A migration that needs downtime, a backfill or a data fix on staging/production is flagged in the PR description so the production track can schedule it.

## 4. Dependencies, lockfiles and generated files

- Dependency changes need the first developer's approval (mandate §3): add the package with a reason to `scripts/packages/proposed.json`, install in a separate PR, then `make registry` and commit `docs/backend/package-registry.md` + `.ai/memory/package-capabilities.md` (CI checks it).
- Lockfile conflicts are never merged by hand: take `main`'s lockfile, re-run the install (`composer install`, `pnpm install`), re-apply only your package change, regenerate the registry.
- Never edit generated files: `backend/AGENTS.md`, `.claude/skills/**`, `.agents/skills/**`, `.grok/skills/**`, `backend/resources/js/{actions,routes,wayfinder}/**`, `docs/backend/package-registry.md`, `.ai/memory/package-capabilities.md`. `backend/boost.json` is rewritten by `php artisan boost:update` — commit what Boost writes.

## 5. Shared memory and numbering (KI-20)

- `.ai/memory/session-handoff.md` belongs to the **development track**: it is what the next development session reads first (Claude Code's SessionStart hook injects it; `AGENTS.md` tells Codex to read it). The production track keeps its session state in its own notes file under `docs/ai/reports/` and does not rewrite `session-handoff.md` — when it runs the `save-session` skill it skips step 2 (rewrite the handoff) and writes that content into its notes instead, until KI-20 is fixed.
- `.ai/memory/current-state.md`: each track edits its own sections (Infrastructure → production; Repository/Backend/Frontend/AI tooling → development). On a merge conflict keep both sides' facts.
- Numbers (`KI-<n>`, `AM-<n>`, ADR `NNNN`): take the next free number when you write it (`grep -oh 'KI-[0-9]*' .ai/memory/known-issues.md | sort -t- -k2 -n | tail -1`). After rebasing on `main`, renumber yours if the other track took the number first.
- Phase reports: the development track writes `docs/ai/reports/phase-3.md` and later phase reports for its work; production work is reported in its own notes.

## 6. Configuration and secrets

- `.env.example` is the authoritative key list (`make dev-check` enforces parity). A new key = `.env.example` (blank or safe default) + the config file that reads it + the name in `docs/infrastructure/environments.md`, announced in the PR.
- Values never go into git, chat, tickets or agent prompts. Secrets travel only through a password manager.
- Local code never points at staging/production services (database, MinIO, Redis, bots).

## 7. Telegram bots

- Each developer uses **their own dev bot** locally. A bot has exactly one webhook URL, so a shared dev bot means overwriting each other's webhooks and receiving each other's updates.
- Staging and production bots belong to the production track; registering their webhooks needs the first developer's explicit approval each time.

## 8. Telling the other track

Put in the PR description whatever the other side must act on: new env keys, queues, scheduled commands, migrations with data impact, deploy-time commands, changed ports or hosts. Decisions you need from the first developer go into the PR and into the "Waiting for the developer" section of `session-handoff.md`.
