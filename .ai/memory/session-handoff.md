---
updated: 2026-11-08 (Phase 4 second batch: hooks, settings.json, six subagents, save-session + better-accessibility skills)
source-of-truth: this session; overwritten every session
---

# Session handoff

## Developer's standing instruction
**"Пока я не скажу — не пиши код проекта."** No application code (PHP/TS) until the developer says so. Tooling, docs, ADRs and agent setup are allowed and were requested. On 2026-11-08: «безопасность не важно сейчас давай сделаем по пунктам 1–6 все грамотно» — do not re-raise the app.uz security findings (card C0) unprompted.

## State at handoff
- Branch `chore/phase-4-ai-infra` (stacked on `chore/phase-3-cdn-webhook`, no PR yet). Open PRs: #1, #2, #3 (`gh pr list`). Phase 3 is **paused WIP** (remaining work: `git log -p -- .ai/memory/session-handoff.md`, `docs/ai/reports/phase-3-notes.md`).
- Phase 4 status block, AM-35 and what is still open: `docs/ai/reports/phase-4-plan.md`. Card C status table: `docs/reference-codebase/c-agent-config.md`.
- Verify the tooling state with `make ai-hooks-test` (46 tests) and `make ai-skills`.

## Done this session
- `.claude/settings.json` (committed): permissions allow/ask/deny, `worktree.baseRef: head`, three hooks. `jq -e` over every hook command → OK.
- `.ai/hooks/guard_paths.py` (PreToolUse): reference codebases read-only, secrets never printed. Live in this session: Read and `cat` of a dummy `backend/.env.probe` were denied (probe removed).
- `.ai/hooks/session_context.py` (SessionStart) and `format_on_edit.py` (PostToolUse: Pint / `eslint --fix` / `vp fmt`). Pipe-tested: Pint rewrote a probe class and reported it; eslint reported `react/jsx-key`.
- Tests: `make ai-hooks-test` → OK, 46 tests on `/usr/bin/python3` 3.9 and Homebrew 3.15. CI workflow `.github/workflows/tooling.yml` added (not yet run on GitHub).
- `.ai/agents/` with six subagents; `.claude/agents → ../.ai/agents`. A one-shot `claude -p` session listed all six, and this session picked them up live.
- Skills: `better-accessibility` vendored (`jakubkrehel/skills` `157da6201633`, MIT); `save-session` written (HOMI's first own skill), tested baseline vs. with-skill (9 files incl. an unasked ADR → 4 files). `boost:list-skills`: no duplicate names. `.claude/skills` = 37 (17 official + 20 symlinks).
- Docs: `CLAUDE.md` "Agent guard rails", `getting-started.md`, `.ai/README.md`, `.ai/hooks/README.md`, `.ai/agents/README.md`, `SOURCES.md`, catalogue rows C1–C4 marked applied; KI-18; AM-35.

## Waiting for the developer (do NOT start on your own)
1. D5 plugins (`php-lsp`, `security-guidance`, `hookify`, `claude-md-management`) — user-level.
2. D6 Codex / Gemini / Grok: root `AGENTS.md`, `GEMINI.md`, `boost:install --mcp`, hook adapters, smoke tests.
3. D8 remaining `coreyhaines31/marketingskills` skills.
4. `.ai/rules` + `boost:index-rules`, `.ai/tasks` — not approved.
5. KI-18: whether to drop `WorktreeCreate`/`WorktreeRemove` from the user-level sound hooks.
6. Phase 3 application code — only when told. Merge order of PRs #1 → #2 → #3.

## Gotchas learned this session
- Hooks run with `python3` from `PATH`; keep them 3.9-compatible (no `match`, no runtime `X | Y`).
- `boost:add-skill` adds the skill to `backend/boost.json` itself; a hand-written skill in `.ai/skills` is synced only after you add it there.
- `.ai/local.env` did not exist on this machine (AM-35); without it the guard matches reference codebases by folder name only.
- The Agent tool's `isolation: worktree` fails here (KI-18); use `git worktree add --detach .worktrees/<name> HEAD`.
- Subagent and skill files added mid-session are picked up live; `.claude/settings.json` hooks were live once the file existed.
- The app.uz archive personas have buggy samples (non-atomic dedup, unreachable branches); each agent's "Not inherited" section lists them. Their PostGIS guidance was empty — rules 11–17 in `postgis-geo-engineer` are HOMI's and marked "verify".

## Active subagent work at handoff
- None. Reports used this session: Claude Code docs answers and the persona digest (folded into `.ai/agents/`).
