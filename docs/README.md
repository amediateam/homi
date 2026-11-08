# HOMI documentation

Documentation is code: it lives next to the source, changes in the same PR as the code it describes, and is written in English (team conversations may be in Russian). Every statement is one of: **fact** (verified, with a command or path), **decision** (an ADR), **assumption** (labelled), or **open question** (tracked). Generated files say so in their first lines and are never edited by hand.

## Reading order

| Who | Read first |
|---|---|
| New developer | `development/getting-started.md` → `architecture/overview.md` → `infrastructure/environments.md` |
| AI agent starting a session | `/CLAUDE.md` → `.ai/memory/current-state.md` → `.ai/memory/session-handoff.md` → the ADR index |
| Anyone changing architecture | `architecture/decisions/README.md` (write a new ADR, do not edit old ones) |
| Anyone adding a backend dependency | `backend/package-registry.md` §Proposed, then master prompt §3 |

## Map

| Path | Content | State |
|---|---|---|
| `about.md` | Preliminary product description (Russian). Requirements are extracted and labelled in `architecture/requirements.md`. | preliminary |
| `architecture/overview.md` | System context, containers, backend module boundaries, listing data flow | living |
| `architecture/requirements.md` | Functional / non-functional requirements and entities derived from `about.md`, each labelled CONFIRMED / ASSUMED / OPEN | living |
| `architecture/decisions/` | ADRs (index in its README) | living |
| `development/getting-started.md` | Prerequisites and local setup | draft until Phase 2 ships `make dev-setup` |
| `development/workflows.md` | Git, PR, commit, task and documentation workflows | living |
| `backend/package-registry.md` | **Generated** Composer registry (`scripts/packages/registry`) | generated |
| `infrastructure/environments.md` | Domain matrix, hosts, ports, services per environment | living |
| `infrastructure/local-development.md`, `cdn.md`, `telegram-webhook.md`, `deployment.md`, `backup-recovery.md` | Planned for Phases 2, 3, 6 — created only when the described setup exists | planned |
| `api/` | OpenAPI spec + envelope examples — created with the first endpoint (Phase 3) | planned |
| `testing/` | Test strategy and `verification-log.md` (Phase 7) | planned |
| `reference-codebase.md` | Catalogue of reusable modules from `app.uz` with port plans | Phase 1 |
| `ai/master-prompt.md` | Engineering mandate v3.1 (changed only via PR + ADR) | fixed |
| `ai/reports/phase-N.md` | Phase reports in the mandate's §26 format | append per phase |
| `ai/orchestration.md`, `model-routing.md`, `skills.md`, `context-management.md` | Planned for Phase 4 | planned |

## Rules

- No placeholder files: a document is created when the thing it describes exists.
- Each document starts with a one-line purpose and, when it depends on an environment, says which.
- Secrets, tokens, internal admin URLs and personal data never appear here; environment variable **names** are fine.
- Long documents (>300 lines) are split by concern; memory files in `.ai/memory/` stay under ~150 lines.
- Russian-language sources (`about.md`, team docs in sibling projects) are summarised in English here, with a pointer to the original.
