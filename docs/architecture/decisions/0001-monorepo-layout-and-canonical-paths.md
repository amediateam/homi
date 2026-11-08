# ADR-0001: Monorepo layout and canonical paths

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D11, A)
- Source: `docs/ai/master-prompt.md` §5, §5.1, §21; `docs/ai/reports/phase-0.md` §1, §14

## Context

The repository started as a single commit (README) with untracked `backend/` (Laravel starter) and `frontend/{app,landing}` (Next.js starters), an empty `server/{local,staging,production}/host` tree, and no root standards files. The master prompt prescribes a layout with `infra/`, `docs/`, `.ai/`, `.claude/`, `scripts/`, and canonical places for ADRs, the package registry, skills and task contracts. `docs/about.md` is a preliminary product description; the developer asked for a documentation structure that is built incrementally and stays useful.

## Decision

One Git repository, independent applications, shared documentation and AI configuration at the root:

```text
homi.uz/
├── backend/                 Laravel API (+ frozen starter UI, see ADR-0002)
├── frontend/                pnpm workspace (ADR-0004)
│   ├── landing/  app/  arm/ Next.js apps
│   └── packages/            ui, api-client, types, utils, config
├── infra/                   nginx, systemd, scripts per environment: local/ staging/ production/
├── scripts/                 repo tooling (packages/registry, dev/*, agents/*, ai/*)
├── docs/                    documentation as code (see below)
├── .ai/                     platform-neutral AI assets: rules/ skills/ agents/ tasks/ memory/ templates/
├── .claude/                 Claude Code: agents/ rules/ skills/ settings.json hooks
├── .agents/                 adapters for other CLIs (generated)
├── AGENTS.md  CLAUDE.md  GEMINI.md
└── .gitignore .editorconfig .node-version
```

Canonical places (no duplicates):

| Thing | Path |
|---|---|
| ADRs | `docs/architecture/decisions/NNNN-slug.md` |
| Package registry (full) | `docs/backend/package-registry.md` (generated) |
| Package index (compact) | `.ai/memory/package-capabilities.md` (generated from the same source) |
| Reference codebase catalogue | `docs/reference-codebase.md` |
| Task contracts | `.ai/tasks/HOMI-<area>-<nnn>.md` |
| Phase reports | `docs/ai/reports/phase-<N>.md` |
| Engineering mandate | `docs/ai/master-prompt.md` (changed only via PR + ADR) |
| Environment configs | `infra/<env>/...` — the empty `server/` tree is deleted |
| Machine-specific values | `.ai/local.env` (gitignored), template `.ai/local.env.example` |

Documentation rules: a file exists only when it has real content (no empty placeholders); each `docs/` area has a README that lists what is there and what is planned; `docs/about.md` stays as the preliminary product description and is superseded by `docs/architecture/requirements.md` as requirements get confirmed; facts, decisions, assumptions and open questions are labelled as such.

## Consequences

- `server/` removed; `infra/` created when the first config lands (Phase 2).
- Root `.editorconfig` (copied from the Laravel starter) and `.node-version` apply to every subproject.
- Machine-specific absolute paths never appear in repository files; they go through `.ai/local.env`.
- Agents must check this table before creating a new top-level directory; new base folders need approval.

## Alternatives considered

- Separate repositories per app — rejected: two developers, shared API contract and shared AI configuration favour one repo.
- Turborepo/Nx — deferred until a measured need appears (master prompt §6.5).
