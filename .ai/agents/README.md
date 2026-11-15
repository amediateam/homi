# `.ai/agents/` — HOMI subagent definitions (canonical)

Claude Code loads these through the `.claude/agents → ../.ai/agents` symlink (verified 2026-11-08 with a
one-shot session). Other agent CLIs get adapters in Phase 4 D6; the content stays here, in English, with
Russian trigger words in each description because the developer writes Russian.

| Agent | Use it for | Tools | Source |
|---|---|---|---|
| `reference-reader` | every look into `app.uz`, the collectors and the nginx mirrors — read-only, reports facts with `path:line`, never secrets | Read, Grep, Glob, Bash | HOMI (master prompt §4) |
| `telegram-bot-engineer` | radar bot: webhook, dedup, FSM, keyboards, broadcasts, deep links, locale | Read, Edit, Write, Bash, Grep, Glob | app.uz `agents-archive/elmarket/telegram-bot-engineer.md`, adapted; 5 sample bugs fixed |
| `intake-pipeline-engineer` | intake API and event contract, idempotency, failure handling, source onboarding | same | `ingestion-engineer.md`, adapted; all anti-bot/evasion content removed |
| `listing-matching-engineer` | duplicate detection and merging of listings, review queue, shadow log, benchmarks | same | `catalog-matching-engineer.md`, adapted to housing; tier-2 auto-merge contradiction fixed |
| `postgis-geo-engineer` | migrations, indexes, partitioning, EXPLAIN, PostGIS for the map | same | `postgres-architect.md` (PostgreSQL rules); PostGIS rules are HOMI's own and marked "verify" |
| `security-reviewer` | reviews auth, personal data, uploads, detectors; STRIDE; ЗРУ-547 checklist | Read, Grep, Glob, Bash (no edits) | `security-engineer.md`, adapted; law section marked "verify with a lawyer" |

Conventions
- Frontmatter: `name`, `description` ("Use when …" + boundaries + Russian triggers), `tools`, `model`
  (`inherit` for engineering agents, `sonnet` for the reader). The frontmatter must be strict YAML: a
  `description` that contains ": " (for example `Триггеры: …`) goes in double quotes, with `\` and `"`
  escaped. Claude Code tolerates the unquoted form, but Grok silently drops such an agent (`grok inspect`
  listed 1 of 6 project agents until 2026-11-16). Supported fields per the Claude Code docs:
  also `disallowedTools`, `permissionMode`, `skills`, `memory`, `hooks`, `maxTurns`, `color`.
- Body skeleton: mandate → HOMI context (verified facts, dated) → numbered rules → scope boundaries →
  output format → "not inherited" (what the source got wrong or what does not apply). Rules carry the
  numbers and thresholds; prose stays short.
- Agents inherit the session hooks (`.ai/hooks`), so the path guard and the formatter apply to them too.
- The developer's standing instruction applies to every agent: no application code until they say so.
  The engineering agents exist so that Phase 3+ work starts with the rules in place.
- Provenance: the five source personas were read by a read-only subagent on 2026-11-08
  (`docs/reference-codebase/c-agent-config.md`, C4); no text was copied verbatim, only rules and
  thresholds. The source's e-commerce content, R-rule labels, Octane rationale and evasion techniques
  were dropped on purpose.
