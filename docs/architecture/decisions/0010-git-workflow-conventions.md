# ADR-0010: Git workflow without server-side branch protection

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D6, D7, CO)
- Source: `docs/ai/reports/phase-0.md` §1, §14; master prompt §14, §23.0

## Context

`github.com/amediateam/homi` is private on the free plan: branch protection and required status checks return 403. Two developers and several AI agents (some in parallel worktrees) will commit. The mandate asks for a protected `main`, feature branches, PRs, CODEOWNERS, worktrees, conventional commits and a commit after every phase.

## Decision

Protection by convention and tooling, enforced where we control the tooling:

- `main` receives changes only through PRs; nobody pushes to `main` directly. A local `pre-push` hook (installed by `dev-setup`) refuses pushes to `main`; Claude Code `settings.json` denies `git push` to `main` and force-pushes.
- Branch names: `feat/<area>-<slug>`, `fix/…`, `chore/…`, `docs/…`; phase work uses `chore/phase-<N>-<slug>`.
- Commits: Conventional Commits (`type(scope): subject`), English, one logical change each; AI-authored commits carry the `Co-Authored-By` trailer the tooling adds.
- CI runs on every PR and on `main`; a red CI is treated as blocking even though GitHub cannot enforce it.
- `.github/CODEOWNERS`: `@amediateam` owns `backend/database/migrations/`, `backend/composer.*`, `frontend/pnpm-lock.yaml`, `frontend/packages/`, `infra/`, `.claude/`, `.ai/`, `docs/api/`; a second owner is added when the second developer's login is known.
- Parallel agents work in separate `git worktree`s under `.worktrees/` (gitignored), one worktree = one agent = one task contract; only the coordinator merges.
- Destructive Git operations (`reset --hard`, `clean -f`, `push --force`, history rewrites on shared branches) require explicit human approval.
- Revisit this ADR if the organisation moves to a paid GitHub plan: enable branch protection + required checks and keep everything else.

## Consequences

- Phase 0 landed as PR from `chore/phase-0-discovery`; Phase 1 continues on `chore/phase-1-foundation`.
- Scaffolding (`backend/`, `frontend/`) is committed in Phase 1 on a branch after the pnpm conversion (ADR-0004).
- `scripts/git/install-hooks.sh` (Phase 6) installs `pre-push` and `pre-commit` (gitleaks, Pint on staged PHP).

## Alternatives considered

- Paid GitHub plan — deferred; revisit when budget allows.
- Public repository — rejected: infrastructure details and product code would be exposed.
- Direct commits to `main` — rejected: parallel agents would collide; the mandate requires review.
