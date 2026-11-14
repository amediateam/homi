# `.ai/hooks/` — agent hooks (Claude Code; the scripts are agent-agnostic)

Hooks turn two red lines of the master prompt into tooling and keep every new session informed. They are
wired in `.claude/settings.json` (project scope, committed), run with `python3` (3.9+, standard library
only — the macOS system interpreter is enough), and are tested like code.

| Hook | Event | What it does | On failure |
|---|---|---|---|
| `guard_paths.py` | `PreToolUse` on Read, Edit, Write, NotebookEdit, Grep, Bash | **Reference codebases are read-only**: denies Edit/Write under the paths from `.ai/local.env` (`APPUZ_ROOT`, collectors, nginx mirrors, `KVADRO_ROOT` for the legacy kvadro² checkout; fallback: folder names `app.uz`, `telegram.uz`, `datahub.uz`, `geo.uz`, `kvadro.uz`), destructive shell commands there (`rm`, `mv`, redirects, `sed -i`, `find -delete`, `cp`/`rsync` of folders out of it, `git`/`svn` writes, `composer`/`artisan`/`npm`/`pnpm`/`npx`/`make`). Under the legacy tree the reason also says that builds and dev servers there reach production and that its code is never copied (DEC-32). **Secrets never leave the file**: denies reading, printing or copying `.env*` (except `*.example|dist|sample|template`), `envprod*`, `key.md`, private keys — and, inside a reference codebase, every `.env*`, `settings.local.json` and SQL/SQLite dumps. Names-only reads stay allowed: `grep -c/-q/-l/-o`, `sed 's/=.*//'`, `cut -d= -f1`, `awk '{print $1}'`, `ls`, `wc`, `test`. | denies with a reason the model sees; an internal error never blocks (reported as `systemMessage`) |
| `session_context.py` | `SessionStart` (startup, resume, clear, compact) | Injects `additionalContext`: the mandate rules tooling cannot enforce, git branch/dirty state, the latest phase reports, high-severity known issues, the next `AM-`/`KI-` numbers, environment warnings (missing `.ai/local.env`, `backend/vendor`, `backend/.env`, generated `.claude/skills`) and `.ai/memory/session-handoff.md` verbatim. | prints a `systemMessage`, session continues |
| `format_on_edit.py` | `PostToolUse` on Edit, Write | Formats the edited file with the project's own tool: `vendor/bin/pint --format agent` for `backend/**/*.php`, `pnpm exec eslint --fix` for the three Next.js apps, `npx vp fmt` for `backend/resources/js`. Silent when nothing changed; tells the model when the file was rewritten (re-read before the next edit) or when the tool failed (syntax error, remaining lint errors). Skips vendor, build output, storage, workspace packages and machines without the toolchain. | reports the tool's first lines; never blocks |

## Tests

```bash
make ai-hooks-test                # = python3 -m unittest discover -s .ai/hooks/tests
```

The tests build temporary project/reference trees — they never touch the real `app.uz`. The guard test file
doubles as the specification: every allow/deny rule above has a case. CI runs the same command
(`.github/workflows/tooling.yml`) whenever `.ai/hooks/**` or `.claude/settings.json` changes.

Manual pipe-test of any hook (what Claude Code does):

```bash
echo '{"tool_name":"Read","tool_input":{"file_path":"backend/.env"},"cwd":"'"$PWD"'"}' \
  | CLAUDE_PROJECT_DIR="$PWD" python3 .ai/hooks/guard_paths.py
echo '{"source":"startup"}' | CLAUDE_PROJECT_DIR="$PWD" python3 .ai/hooks/session_context.py | jq -r '.hookSpecificOutput.additionalContext'
```

## Known limits (by design — the hooks are a safety net, not a sandbox)

- Shell variables are expanded only for `$HOME`, `$CLAUDE_PROJECT_DIR`, `$PWD` and assignments made earlier
  in the same command (`R=/x; cd "$R"`). Paths hidden in other variables, in interpreter one-liners
  (`php -r`, `python -c`) or in heredoc bodies are not seen.
- Segments are split on `| || && ; & $( ) \`` and newlines without a real shell parser; quotes that span an
  operator fall back to whitespace tokenisation.
- `permissions.deny` rules in `.claude/settings.json` are the second layer for the Read/Edit tools
  (`Read(**/.env)`, generated files such as `backend/AGENTS.md`, Wayfinder output, `.claude/skills/**`).
- To silence the hooks on one machine temporarily, put `"disableAllHooks": true` into
  `.claude/settings.local.json` (gitignored) — never into the committed file.

## Other agents

Codex, Gemini CLI and Grok have their own hook formats and are configured in Phase 4 D6 (waiting for the
developer). The scripts read the same JSON shape Claude Code sends (`tool_name`, `tool_input`, `cwd`) and can
be reused from a thin adapter; keep the logic here, not in per-agent copies.
