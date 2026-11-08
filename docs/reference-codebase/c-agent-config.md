# `app.uz` module cards C — agent configuration (`.claude`, `.ai`, hooks, settings)

Index and rules: [`../reference-codebase.md`](../reference-codebase.md). Read-only inventory by a subagent on 2026-11-08; paths are relative to `app.uz/`. Nothing was copied. Secrets seen in the source were **not** reproduced here.

## C0 — Security findings (reported to the developer, action is theirs)

- `.claude/settings.local.json` is **versioned in SVN**. 18 of its 71 `permissions.allow` entries embed a plaintext `PGPASSWORD=…` for four database users and target a remote PostgreSQL host; it also allows `Read(~/.ssh/**)`, `Bash(ssh:*)`, `Bash(psql:*)`. → rotate those passwords, remove the file from version control, add `settings.local.json` to the ignore list.
- `backend/.claude/settings.local.json` is versioned too: five `curl … /auth/login` entries carry an inline admin password of a sibling project, plus `Read(~/**)`, `Bash(sudo nginx:*)`.
- No settings file denies reading `.env*`, although `AGENTS.md` says "never commit secrets".
- HOMI response: `.claude/settings.local.json` is gitignored at the root and in `backend/`; a deny list for `.env*`, `envprod`, `key.md` and writes under `$APPUZ_ROOT` is part of the pending hooks/permissions batch (Phase 4 D7).

## C1 — Project settings (`.claude/settings.json`, 11 KB)

- `allow` is blanket (`Bash(*)`, `Edit(*)`, `Write(*)`, `WebFetch(domain:*)`, `mcp__*`) — **do not copy**.
- `deny` (13): `rm -rf *`, `artisan db:wipe|migrate:fresh|migrate:reset|migrate:rollback`, `svn commit|revert|delete|merge|switch`, `composer remove *`, `composer update`, `npm uninstall *`.
- `ask` (22): `rm`, `rmdir`, `shred`, `unlink`, `dd`, `mkfs`, `fdisk`, `chmod`, `chown`, `npm`, `pip`, `pip3`, `yarn`, `pnpm`, `docker`, `kubectl`, `firebase`, `gcloud`, `wget`, `kill`, `killall`, `pkill`.
- `enabledPlugins`: `frontend-design` (HOMI has it). No `env`, `model`, `statusLine`, `outputStyle`.
- **Status: NEEDS_ADAPTATION** — keep the artisan/composer denies and the `ask` list; replace SVN denies with git ones (`push --force`, `reset --hard`, `clean -fd`, `branch -D`); add `Read(**/.env*)`, `envprod`, `key.md` denies and a write deny under the reference codebase; no blanket allows.

## C2 — Hooks (`.claude/hooks/`, `settings.json`)

| Hook | What it does | Status |
|---|---|---|
| `scripts/session-context.sh` (SessionStart, 5 s) | emits `additionalContext`: a hardcoded "red lines" block + the full `docs/vault/index.md`; needs `jq`, fails silently | **NEEDS_ADAPTATION, high value** — inject HOMI's red lines + `.ai/memory/session-handoff.md` (or the latest phase report summary) |
| `format-on-edit.sh` (PostToolUse `Edit|Write`) | `vendor/bin/pint --format agent <file>` for `backend/*.php`, `oxlint --fix` for `frontend/arm`; swallows errors, exit 0; **hardcoded repo path** | NEEDS_ADAPTATION — `$CLAUDE_PROJECT_DIR`; Pint for `backend/**/*.php`; eslint `--fix` via pnpm for the three Next apps; Vite+ fmt for `backend/resources/js` |
| `verify-md-structure.sh` (PostToolUse) | warns on `[[wikilinks]]`, odd code-fence count, H2→H4 skips, TODO/FIXME; stderr + exit 0 (likely invisible to the model); hardcoded path; cites a missing rules file; contradicts the vault's wikilink requirement | NEEDS_ADAPTATION (low) — if kept, return JSON `additionalContext` or exit 2 |
| `scripts/hooks.py` + `sounds/` (68 audio files, 6.4 MB) + `config/hooks-config.json` + `HOOKS-README.md` (27 events) | sound notifications per hook event; optional full-payload logging to `.claude/hooks/logs/` | NOT_PORTABLE for the repo — personal preference, binaries, payload logging; user-level settings if wanted |
| agent-scoped hooks in `weather-agent.md` frontmatter | sounds per agent | pattern reference only |

## C3 — Skills

| Skill | Origin | Status |
|---|---|---|
| `better-accessibility`, `better-ui`, `better-typography`, `better-colors` (`.agents/skills/`, symlinked into `.claude/skills/`; `skills-lock.json` pins `jakubkrehel/skills` by hash; MIT) | third-party | **READY (optional vendoring)** — accessibility fills a gap in HOMI's set; `better-ui/typography/colors` partly duplicate `frontend-design` + Vercel skills |
| `save-session.md` (flat file, RU) | custom | **NEEDS_ADAPTATION** — turn into `save-session/SKILL.md` (English, frontmatter): session log → `docs/ai/reports`, decisions → ADRs, memory keeps 2–4-line stubs pointing at canon. HOMI already follows the rule; the skill would make it a one-word routine |
| `boss-panel.md`, `frontend-spa.md`, `new-http-app.md`, `shop-platform.md` (flat files, RU) | custom | NOT_PORTABLE — app.uz products, Vue SPA, `HTTP_APP` multi-tenancy; not valid skill folders |
| `agent-browser` | third-party CLI | NOT_PORTABLE — duplicates the `playwright` plugin / claude-in-chrome |
| `presentation/*`, `time-skill`, `weather-*` | upstream "claude-code-best-practice" demo | NOT_PORTABLE — targets missing files |
| `backend/.claude/skills` (19 Boost skills) | generated | 12 already in HOMI; `activitylog`, `fortify`, `laravel-backup`, `laravel-permission`, `medialibrary`, `octane` appear automatically once the package is installed (dependency approval); `inertia-vue` N/A |

## C4 — Agents (`.claude/agents/`, `agents-archive/elmarket/`)

- Loadable agents are all upstream demos (`presentation-*`, `weather-agent`, `time-agent`, `workflow-*`, `development-workflows-research-agent` — the last runs with `permissionMode: bypassPermissions`): **NOT_PORTABLE**. `weather-agent.md` is a useful frontmatter example (tool allowlist, `skills:` preload, `memory: project`, agent hooks).
- `agents/old/*` (9, no frontmatter) and `agents-archive/elmarket/*` (20, 15–24 KB each) are Elmarket.uz price-aggregator personas, never loaded. Worth mining as **sources for HOMI subagent definitions** (`.ai/agents/`, Phase 4):
  - `telegram-bot-engineer` — `update_id` dedup, Redis FSM, validated `callback_data`, broadcast throttling, deep links, Uzbek apostrophes → radar bot. Strip Elmarket R-rules/Octane.
  - `catalog-matching-engineer` — no-false-positive matching, confidence thresholds, multilingual synonyms/stop-words, shadow log + revert, A/B before mass apply → listing dedup.
  - `ingestion-engineer` — streaming, per-item poison-pill handling, backoff with jitter, sanitisation → intake pipeline. **Drop** TLS fingerprinting / Playwright stealth / proxy rotation (anti-bot evasion; not needed for public Telegram channels; ToS risk).
  - `security-engineer` — only the Uzbek personal-data law (547-V) section is new vs `laravel-owasp-security`.
  - `postgres-architect` — PostGIS parts for the map; the rest duplicates `laravel-database-optimization`.
  - `qa-test`, `seo-geo-aeo`, `system-architect` — duplicates of vendored/plugin skills; e-commerce agents — NOT_PORTABLE.

## C5 — Siblings

- `CLAUDE.md` (10 KB, RU): vault-first, multi-project, DB, auth, API format, SPA, stack, commands, red lines, defaults, context system. Rules that carry over (most already hold in HOMI): read a code map by module, never whole (context budget); architecture changes update the map/index in the same commit; Pint on explicit paths after PHP edits; Boost-generated files read-only; reusable-first shared packages; jsonb `{ru,uz,en}` from day one (ADR-0006); envelope via base `ApiController` (ADR-0007); canon in the repo, memory holds stubs (HOMI's model); never commit secrets, new vars go to `.env.example`. Product-only: SVN, icon source file, light theme, desktop-first.
- `AGENTS.md` (2.5 KB) thin pointer; `.ai/` contains only `mcp/mcp.json` with absolute paths (NOT_PORTABLE); `backend/.mcp.json` = Boost (HOMI has it); `backend/GEMINI.md` is an older Boost generation; `frontend/lendo/CLAUDE.md` imports `AGENTS.md` (same pattern as HOMI's Next apps).

## Status (developer's go on 2026-11-08: "items 1–6, properly"; app.uz security findings deferred by the developer)

| # | Item | HOMI result |
|---|---|---|
| 1 | `settings.json` deny/ask baseline (C1) | **Applied** — `.claude/settings.json`: `ask` for sudo, force-push, hard reset, destructive artisan, dependency changes, kills, ssh/scp/rsync/psql; `deny` for `.env*`/`envprod*`/`key.md`/private-key reads, `php artisan serve`, `brew services start|restart nginx` (KI-13), edits of generated files; a small `allow` list of verification commands. No blanket allows. |
| 2 | `session-context.sh` (C2) | **Applied as `.ai/hooks/session_context.py`** — injects the mandate rules tooling cannot enforce, git state, latest reports, high-severity known issues, next AM/KI numbers, environment warnings and `session-handoff.md` verbatim. |
| 3 | `format-on-edit.sh` (C2) | **Applied as `.ai/hooks/format_on_edit.py`** — Pint for `backend/**/*.php`, `eslint --fix` for the three Next apps, `vp fmt` for the frozen Inertia UI; reports rewrites and failures to the model. Sounds and md-structure checks dropped. Plus `.ai/hooks/guard_paths.py` (PreToolUse): reference codebases read-only, secrets never printed — 46 unit tests, `make ai-hooks-test`, CI `tooling.yml`. |
| 4 | `save-session` (C3) | **Applied as `.ai/skills/save-session/SKILL.md`** (HOMI's first first-party skill; synced by Boost like the vendored ones). |
| 5 | `better-accessibility` (C3) | **Applied** — vendored from `jakubkrehel/skills` `157da6201633` (MIT) via `boost:add-skill`; `better-ui/typography/colors` not vendored (overlap). |
| 6 | Archive personas as sources (C4) | **Applied** — `.ai/agents/{telegram-bot-engineer,intake-pipeline-engineer,listing-matching-engineer,postgis-geo-engineer,security-reviewer}.md` written in English from a read-only digest (no verbatim text), plus `reference-reader`. Evasion content excluded; nine bugs in the source samples corrected (see each agent's "Not inherited"). The source had no real PostGIS guidance — HOMI's PostGIS rules are marked "verify". |

Nothing else from `app.uz/.claude` is worth copying. Never copy any `settings.local.json`.
