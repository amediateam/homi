---
updated: 2026-11-09 (kvadro² legacy audit and migration plan written, PR #9 open; next task KV-BE-002)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09, work split: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» Production/staging belongs to the first developer: «Не включай настройку production-среды в задачи коллеги».
- 2026-11-09, new goal (master prompt, kept local as `writing-block.md`): move kvadro² (`@KvadroAppBot`, `app.kvadro.app`, `kvadro.app`) onto HOMI 1:1. «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» Plan before code; no real passwords, tokens or personal data in docs or tests.
- 2026-11-09: «в homi.uz мы будем исправлят старые ошибки и логические не верные решение» — legacy bugs and wrong decisions are fixed, not ported (`docs/migration/README.md`, Migration policy).
- 2026-11-09: «да, закоммить и открой PR, writing-block.md не коммить».
- Gates that need the first developer's OK: dependency changes, new tools, anything on staging/production, `HANDOFF.md` §4 items marked **gate**. 2026-11-08: «безопасность не важно сейчас» — about the app.uz findings (card C0) only.

## State at handoff
- **Where to continue:** read `docs/migration/22-agent-handoff.md`, then `docs/migration/21-development-master-plan.md` §20. Next task: **KV-BE-002**, the Media ownership fix (KI-25; `docs/migration/tasks/backend/KV-BE-002-media-ownership-fix.md`), test-first, on its own branch `fix/media-ownership` from `main`. Before PR #9 merges, branch from `docs/kvadro-migration-audit` instead. Start code only after the developer's OK.
- Branch `docs/kvadro-migration-audit`: `b6aa0e6` plus this save commit, on top of `main` `bb844ca` (PR #8, production track). **PR #9** (github.com/amediateam/homi/pull/9) is open and waits for the first developer's review. It is docs only: `docs/migration/` and `scripts/migration/`. No CI runs on it (`gh pr checks 9` → none; the workflows filter on code paths).
- `writing-block.md` stays untracked on purpose (machine paths).
- The legacy checkout `kvadro.uz` (SVN) is read through `KVADRO_ROOT` in `.ai/local.env`. It is set on this machine only; add it on a new machine. The guard hook does not protect that tree (KI-26).
- No application code has changed since `main`. `make ci-backend` / `make dev-check` were not re-run this session after T0.
- Verify the plan: `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check` (both exit 0 at `b6aa0e6`).

## Done this session
- T0 on the second machine: PR #7 merged as `591ceb4` (KI-21…KI-24, AM-37, AM-38; `docs/testing/verification-log.md`).
- kvadro² audit and plan in `docs/migration/`:
  - documents 01–23, 383 task files (KV-BE 103, FE 126, TG 61, DB 37, INF 33, QA 23), registers in `data/`;
  - written with subagents, their `path:line` claims spot-checked;
  - an independent coverage pass (`23`) found no high misses.
- Checks on the plan: `collect_ids.py --check` → exit 0, 2 188 IDs; `task_graph.py --check` → exit 0, 0 broken refs, 0 cycles, 143/144 features covered (F-LANDING-011, a P3 drop candidate, has no task); path and secret scan of both folders → no hits.
- Legacy tree untouched: `svn status` identical to the start, and no file newer than the start marker (checked before the commit).
- Reconciled with PR #8 before the commit (AM-45): database names, DEC-27 answered, notes on KV-INF-015/019/023.
- Found KI-25 (Media ownership) and KI-26 (guard does not know `KVADRO_ROOT`). Both re-read in code at handoff.
- AM-44: the collectors do not push into HOMI (reported by `reference-reader`, not re-run).

## Waiting for the developer (do NOT start on your own)
1. First developer: review PR #9. The author merges after approval. Open points in the PR description: the shared Redis `maxmemory-policy`, and re-scoping KV-INF-023 on top of `homi-deploy`.
2. Developer's OK to start code with KV-BE-002. In parallel (21 §20): KV-QA-001 (PostgreSQL test DB) and KV-TG-001 (webhook secret and host).
3. First developer: the M0 ADR batch (KV-BE-001, KV-DB-004, KV-DB-005, KV-BE-120); decisions DEC-01…30 (`docs/migration/10` §8, who decides: `20` §1); dependency approvals DEC-23 through `scripts/packages/proposed.json`; FD-2; the 52 DEV deviations (`09`).
4. Product owner (`20` §1): legacy schema and DB dump (Q-DATA-001…005), contract freeze date, legal basis for moving personal data, custody of `@KvadroAppBot` and the kvadro domains.
5. Small shared-file PRs, each reviewed by the other developer:
   - `KVADRO_ROOT` in `.ai/local.env.example` and in the guard's `REFERENCE_KEYS` (KI-26);
   - `HANDOFF.md` §4 per `docs/migration/10` §9;
   - a `CLAUDE.md` pointer to `docs/migration/`.
6. Still open from before: T1 tunnel tool, T7 OPQ-1…5, AI vendor, T9–T11 items (`HANDOFF.md` §4).

## Gotchas learned this session
- Never build, run `npm` or start the dev server in the legacy `kvadro.uz` tree: it proxies to production and sends analytics there. Open legacy files only at the `path:line` that `docs/migration` cites.
- `main` moved mid-session (PR #8). `git fetch` and re-check server facts before committing docs about infrastructure.
- `collect_ids.py`: an ID is *defined* only in the first table cell, a heading or a bold list item of its owner doc. Mention it in plain text elsewhere, or `--check` reports a duplicate.
- `task_graph.py`: in `Dependencies`, name only prerequisites. Put other tasks after "related:" or "used by", or `--check` reports cycles.
- BSD `sed` has no `\|`; use `grep -E` or `perl`. When the 5-hour usage limit stops a subagent, resume it with SendMessage.
- Next numbers after this session: AM-46, KI-27. The production track shares the counters, so check `main` first.

## Active subagent work at handoff
- None.
