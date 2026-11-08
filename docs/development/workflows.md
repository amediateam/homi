# Development workflows

Purpose: how work moves through the repository for humans and AI agents. Rules come from `docs/ai/master-prompt.md` §14, §22 and ADR-0010; this page is the practical version.

## Branches, commits, PRs

- Never commit to `main`. Branch from `main`: `feat/<area>-<slug>`, `fix/…`, `chore/…`, `docs/…`; phase work `chore/phase-<N>-<slug>`.
- Conventional Commits in English: `feat(listings): add intake endpoint`, `chore(phase-1): foundation`. One logical change per commit; generated files committed together with the change that produced them.
- Open a PR for every branch; CI (`.github/workflows/*.yml`) must be green; a human reviews paths listed in `.github/CODEOWNERS`. GitHub cannot enforce this on the current plan — the team does.
- Destructive Git (`reset --hard`, `clean -f`, force-push, history rewrite on shared branches) needs explicit approval.

## Every task (short form of master prompt §22)

1. **Understand** the requirement and acceptance criteria.
2. **Discover** existing code (`rg`), the package registry (`docs/backend/package-registry.md`), Laravel/Next built-ins, and `docs/reference-codebase.md` (`app.uz` modules) — in that order.
3. **Plan** the minimal change; architecture changes get an ADR first.
4. **Implement** on a branch (agents: in their own worktree, one task contract each).
5. **Test**: `php artisan test --compact <path>` / `pnpm --filter <app> lint|typecheck|build`; add tests with the change.
6. **Review** the diff (security, reuse, performance); critical paths get an independent reviewer.
7. **Document**: ADR / docs / `.env.example` / registry regeneration as needed.
8. **Hand off**: update `.ai/memory/session-handoff.md` (agents) and the PR description.

## Backend specifics

- Format: `vendor/bin/pint --dirty --format agent`; types: `composer types:check`; full gate: `composer ci:check` (from `backend/`).
- New files via `php artisan make:* --no-interaction`; models get factories and seeders; tests via `php artisan make:test --pest`.
- Dependency changes: add the package to `scripts/packages/proposed.json` with a reason **before** installing; installing is a REVIEW-level action (human approval). After any `composer.lock` change run `scripts/packages/registry` and commit `docs/backend/package-registry.md` + `.ai/memory/package-capabilities.md` (CI checks the checksum).
- Do not touch the frozen starter UI (ADR-0002).

## Frontend specifics

- From `frontend/`: `pnpm install`, `pnpm --filter app dev`, `pnpm -r lint`, `pnpm -r build`. Shared code goes to `frontend/packages/*` as `workspace:*` dependencies; API types are generated, not hand-written (ADR-0007).
- Next.js 16 differs from older versions — read `node_modules/next/dist/docs/` for the installed version before writing code.

## Documentation

- Facts vs decisions vs assumptions vs open questions — label them (see `docs/README.md`).
- New ADR: copy `docs/architecture/decisions/0000-adr-template.md`, next number, add a row to the ADR index, link it from the PR.
- Phase reports: `docs/ai/reports/phase-<N>.md` in the mandate's §26 format, committed with the phase.

## Reference codebase (`app.uz`)

Read-only. Port single files or patterns listed in `docs/reference-codebase.md`, adapt namespaces and config keys, never copy folders, `.env*` or data. A Claude Code hook blocks writes there (Phase 6).

## Agents (detailed in Phase 4)

Task contracts live in `.ai/tasks/HOMI-<area>-<nnn>.md`; subagent definitions in `.claude/agents/`; external CLIs via `scripts/agents/<tool>.sh`. Limits: 3 fix iterations per task, 3 parallel agents during setup, escalation to a costlier model only after a documented failure.
