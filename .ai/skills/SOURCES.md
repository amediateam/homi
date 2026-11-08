# Vendored third-party skills — sources and provenance

This directory is the **canonical skill store** for every agent (master prompt §10, Phase 4). Skills here are
third-party content vendored into the repository on purpose: a fresh clone gets exactly the guidance the team
reviewed, and updates arrive as reviewable diffs. Agent directories (`.claude/skills`, `.agents/skills`,
`.grok/skills`, …) are generated from here by `php artisan boost:update` (run in `backend/`; `backend/.ai` is a
symlink to this `.ai/`) and are gitignored. Never edit a vendored skill in place — re-vendor or write a HOMI skill.

Official Laravel Boost skills (Laravel, Pest, Horizon, Pulse, Telescope, Scout, Socialite, Pennant, Wayfinder,
Inertia React, Echo, Tailwind, Scramble, MCP, AI SDK) are **not** stored here: Boost copies them from `vendor/`
on every `boost:update`, version-matched to `composer.lock`.

Re-vendor / add: `cd backend && BOOST_GITHUB_TOKEN="$(gh auth token)" php artisan boost:add-skill <owner/repo> --skill=<name> [--force]`
(the token is passed for the command only; Boost runs a security audit before writing). Then `php artisan boost:update`.

Adopted 2026-11-08 (Phase 4, developer-approved list). Install counts are from skills.laravel.cloud / skills.sh on that date.

| Skill (directory) | Source repository | Commit | Licence | Installs | Why HOMI uses it |
|---|---|---|---|---|---|
| `laravel-testing` | [asyrafhussin/agent-skills](https://github.com/asyrafhussin/agent-skills) | `1aa0ff717c10` | MIT | 972 | Pest 4 / PHPUnit 12 feature tests, factories, HTTP and Sanctum testing |
| `laravel-queues` | asyrafhussin/agent-skills | `1aa0ff717c10` | MIT | 739 | job design (idempotency, `ShouldBeUnique`, batching, failure handling) for Media/Bot/Intake |
| `laravel-database-optimization` | asyrafhussin/agent-skills | `1aa0ff717c10` | MIT | 1.1k | indexes, N+1, chunking, query review (rules mention MySQL/PostgreSQL — read with PostgreSQL in mind) |
| `laravel-owasp-security` | asyrafhussin/agent-skills | `1aa0ff717c10` | MIT | 1.06k | OWASP Top 10 for Laravel + React APIs (mandate §15) |
| `php-best-practices` | asyrafhussin/agent-skills | `1aa0ff717c10` | MIT | 3.8k | PHP 8.x patterns, PSR, SOLID — review baseline |
| `code-slop` | asyrafhussin/agent-skills | `1aa0ff717c10` | MIT | 831 | detects AI-generated anti-patterns in PHP/Laravel and TypeScript/React (review gate) |
| `test-guard` | [amelnagdy/guard-skills](https://github.com/amelnagdy/guard-skills) | `ffa26036b7b5` | MIT | 4.3k | reviews generated/changed tests before they ship (rule 7) |
| `docs-guard` | amelnagdy/guard-skills | `ffa26036b7b5` | MIT | 4.1k | reviews READMEs/API docs/ADRs before they ship (§21) |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `1a2c79d4e6c4` | MIT (README) | 880k | React 19 / Next.js performance guidelines from Vercel Engineering |
| `vercel-composition-patterns` | vercel-labs/agent-skills | `1a2c79d4e6c4` | MIT (README) | 443k | React composition patterns for `@homi/ui` |
| `next-bundle-optimizer` | [vercel/next.js](https://github.com/vercel/next.js/tree/canary/skills) (`skills/`, branch `canary`) | `0153fe1b4073` | MIT | — | audit/reduce client bundles — requested by the developer |
| `nextjs-app-router-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `9c61ab243def` | MIT | 33.6k | App Router: layouts, server/client boundaries, streaming (written for Next 14+; Next 16 docs in `node_modules/next/dist/docs` win on conflicts) |
| `nextjs-cache-architecture` | [mohamed-hossam1/nextjs-skills](https://github.com/mohamed-hossam1/nextjs-skills) | `80d20aaf2aab` | MIT | 5.1k | `"use cache"` / cache tags / invalidation for Next 16 (`cacheComponents` is enabled in all three apps); ships `scripts/audit.mjs` (static, read-only, zero deps) |
| `seo-audit` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `96798cf38736` | MIT | 249k | technical SEO audit checklist for the SSR pages (ADR-0013) |
| `ai-seo` | coreyhaines31/marketingskills | `96798cf38736` | MIT | 160k | GEO/AEO: being cited by answer engines |
| `programmatic-seo` | coreyhaines31/marketingskills | `96798cf38736` | MIT | 158k | listing/district pages at scale |
| `schema` | coreyhaines31/marketingskills | `96798cf38736` | MIT | 87k | JSON-LD / structured data |
| `site-architecture` | coreyhaines31/marketingskills | `96798cf38736` | MIT | 131k | URL hierarchy, internal linking, sitemaps |

Notes
- `asyrafhussin/laravel-best-practices` was installed and **removed**: it shares its name with the official Boost
  skill `laravel-best-practices` and shadowed it in every agent directory. The official, version-matched skill wins.
- `vercel-labs/agent-skills` repositories name their skills `vercel-*` in frontmatter while the directories are
  `react-best-practices` / `composition-patterns`; Boost wrote both — the directory-named duplicates were removed.
- Non-Markdown files present: `metadata.json` (asyrafhussin), `evals/evals.json` (marketingskills), `agents/openai.yaml`
  (guard-skills), `scripts/audit.mjs` + `assets/*.ts(x)` (nextjs-cache-architecture). Reviewed on vendoring: no network
  calls, no package installs, no destructive commands.
- `coreyhaines31/marketingskills` has 52 skills; only the five above were vendored. The developer decides on the rest
  (see `docs/ai/reports/phase-4-plan.md` D8).
- Considered and not vendored (overlap with official Boost skills or deferred): `tailwind-4-docs`, `nextjs-performance`,
  `web-design-guidelines`, Playwright skills (Phase 6), TypeScript module skills, PostgreSQL vendor skills.
