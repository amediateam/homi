# `.ai/` — the shared knowledge base for every agent

One canonical source, generated views per agent (master prompt §9–11). Nothing here is duplicated by hand.

| Path | Tracked | Purpose |
|---|---|---|
| `memory/` | yes | Repository memory read at session start: `current-state.md`, `session-handoff.md`, `known-issues.md`, generated `package-capabilities.md` |
| `skills/` | yes | **Canonical skills** — vendored third-party skills (`SOURCES.md` lists repo, commit, licence) and HOMI's own (`save-session`); every skill must be listed in `backend/boost.json` to be synced |
| `hooks/` | yes | Agent hooks wired in `.claude/settings.json`: path guard (reference codebases read-only, secrets never printed), session context, format-on-edit. Python 3.9+ stdlib, unit-tested (`make ai-hooks-test`). See `hooks/README.md` |
| `rules/` | yes (when created) | Path-scoped project rules with `paths` frontmatter; indexed by `php artisan boost:index-rules` |
| `agents/` | yes | **Canonical subagent definitions** (Claude Code frontmatter). `.claude/agents` is a symlink to this directory, so Claude Code loads them without a copy; other agents get adapters in Phase 4 D6 |
| `tasks/` | yes (when created) | Task contracts (Phase 4) |
| `local.env.example` | yes | Template for `.ai/local.env` (gitignored): machine-specific paths (`APPUZ_ROOT`, nginx mirrors, ports) |

How the views are produced
- `backend/.ai` is a symlink to this directory, so Laravel Boost (run from `backend/`) reads and writes the canonical store.
- `cd backend && php artisan boost:update` regenerates the agent directories at the repository root: `.claude/skills` (Claude Code), `.agents/skills` (Codex), `.grok/skills` (Grok Build), plus `backend/.cursor`, `backend/.junie`, … for the agents selected in `backend/boost.json`. Official Boost skills are copied from `vendor/`; skills from `.ai/skills` are symlinked. All generated directories are gitignored.
- Boost's Laravel guidelines are regenerated into `backend/AGENTS.md` (gitignored). Repository-wide instructions live in `CLAUDE.md` (Claude Code) and the root `AGENTS.md` (Codex, Grok — hand-written, points at `CLAUDE.md`; Boost does not touch it). `GEMINI.md` does not exist yet.
- Adding a skill: `BOOST_GITHUB_TOKEN="$(gh auth token)" php artisan boost:add-skill owner/repo --skill=name` (in `backend/`), then `boost:update`, then record it in `skills/SOURCES.md`.
- MCP: for Claude Code the Boost server is declared in the root `.mcp.json` (`php backend/artisan boost:mcp`, project scope). Codex does not read that file; it gets the same server as a user-level entry (`codex mcp add homi-boost -- php <repo>/backend/artisan boost:mcp`, `docs/handoff/environment.md` §4).
