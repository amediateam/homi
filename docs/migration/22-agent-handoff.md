# 22 — Agent handoff: continuing the kvadro² migration

Read this first if you are an engineer or an agent (Claude Code, Codex, Gemini…) picking up the migration. It tells
you where everything is and how to continue **without re-auditing the legacy system**.

> **Amended on 2026-11-14 (`PROPOSED`).** The order of work is now three waves
> ([`24-three-wave-strategy.md`](24-three-wave-strategy.md)); the first target is the Wave 1 exit of
> [`25-wave-1-frontend-plan.md`](25-wave-1-frontend-plan.md), not stage S1. Until 24 §9 item 2 (the ADR) and DEC-33
> are settled, every prohibition of section 4 applies as written. After DEC-33, the second prohibition has one
> exception: a developer's manual `live` mode under 25 §6.3. Agents, tests and CI never call production.

## 1. Goal

Move the running product **kvadro²** onto the HOMI stack in this repository, 1:1 in capabilities, data and public
links:

- **What kvadro² is:** Telegram bot `@KvadroAppBot`, the Mini App `app.kvadro.app`, and the landing and 1 008 SEO
  pages on `kvadro.app`.
- **What is not carried over:** legacy bugs and logically wrong decisions are fixed, not reproduced (README,
  *Migration policy*).

The first target is release stage **S1**: HOMI's backend and bot serve the *unchanged* legacy Mini App and old bot
buttons on staging, with migrated data. The new HOMI frontends come later (S4).

## 2. Where things are

| What | Where |
| ---- | ----- |
| Legacy sources (read-only) | SVN working copy `kvadro.uz`; machine path in `.ai/local.env` → `KVADRO_ROOT` (add it if missing). Cited as `$KVADRO_ROOT/…` |
| Legacy backend, DB | **not available** (Python/FastAPI + PostgreSQL/PostGIS); see Q-SYS-001/002 |
| Audit and plan | `docs/migration/` — start with [`README.md`](README.md), then [`21-development-master-plan.md`](21-development-master-plan.md) |
| Tasks | `docs/migration/tasks/<track>/KV-*.md`; format in [`tasks/README.md`](tasks/README.md) |
| Registers | `docs/migration/data/`: `ids.csv` (every ID), `features.csv` (parity matrix), `tasks.csv` (task graph), `api-inventory.json`, `screens.json`, `bot-handlers.json`, `public-urls.json` |
| Tools | `scripts/migration/collect_ids.py`, `build_open_questions.py`, `task_graph.py` (section 6) |
| New project | this repository: `backend/` (Laravel 13), `frontend/` (Next.js 16 workspace). Conventions in `CLAUDE.md`, `HANDOFF.md`, `docs/handoff/parallel-work.md` |
| Collectors (read-only references) | `telegram.uz` (MTProto housing aggregator, no push to HOMI yet), `datahub.uz`, `geo.uz` (not housing). Read them only through the `reference-reader` agent |

## 3. Stack and key decisions

- **Stack:** Laravel 13 / PHP 8.5, PostgreSQL 18 (+ PostGIS, pending DEC-09), Redis + Horizon, Pest 4; Next.js 16.4
  apps `landing`, `app`, `arm` with shared packages.
- **Decisions (all `PROPOSED` until their ADRs are accepted):** [`10-target-architecture.md`](10-target-architecture.md)
  §3. The ones that shape everything:
  - **Legacy compatibility surface** (CF-001…003). Bare `/api/*` routes with legacy shapes, `{"detail"}` errors and
    `Authorization: tma <initData>`, on the legacy hosts only.
  - **Public listing numbers.** ULID keys plus a preserved integer `number`.
  - **Keyset cursors.**
  - **Money.** A normalised USD amount for filters and medians (CF-005).
  - **Listing acquisition.** Our own reader of the public channels first, `telegram.uz` after a side-by-side run
    (CF-007, DEC-02).
  - **Hosts and bot identity.** HOMI takes over `kvadro.app`, `app.kvadro.app` and `@KvadroAppBot` at the cut-over,
    with the token rotated (CF-008/009).
  - **Mini App.** The legacy Mini App files are served unchanged until the new Mini App ships (CF-011, DEC-06).

## 4. Prohibitions

- Never modify the legacy tree, never run builds or `npm` there, never run its dev server: it proxies to production
  and sends analytics there.
- Never call the production API or the production bot. Any read-only observation on production needs the developer's
  explicit approval each time.
- No secrets, tokens, `initData`, real phone numbers or Telegram ids in documents, tests or fixtures. No absolute
  machine paths in repository files.
- No new dependencies without the first developer's approval (`scripts/packages/proposed.json`). No changes to
  production-owned paths or servers (`docs/handoff/parallel-work.md`).
- Do not mark a feature migrated without passing its parity gate ([`15-testing-strategy.md`](15-testing-strategy.md)).
  Do not apply a `PROPOSED` deviation as if it were approved.
- The HOMI repository rules still apply: `CLAUDE.md`, the hooks, PR-only changes to `main`, the other developer
  reviews, English artefacts.

## 5. Current state

See [`21-development-master-plan.md`](21-development-master-plan.md) §1 for the numbers. In short:

- **Audit:** complete for every legacy source we have, independently re-checked ([`23-coverage-audit.md`](23-coverage-audit.md)).
- **Plan:** written: features, rules, architecture, roadmaps, tasks.
- **Code:** none yet.
- **Three-wave amendment (2026-11-14):** written as 24 and 25, `PROPOSED`, in review. Next step: stage W1-0 of 25.
- **Waiting for people:** see [`20-open-questions.md`](20-open-questions.md) §1 and `10` §8 (`DEC-01` … `DEC-30`);
  for the amendment, `24` §8 (`DEC-31` … `DEC-39`).

## 6. How to continue

1. Pick the next task: [`21-development-master-plan.md`](21-development-master-plan.md) §20 names the next one, and
   `data/tasks.csv` lists dependencies. Take a task whose `Dependencies` are done and whose blockers (`DEC-`/`Q-`)
   are answered, or that can proceed with stubs as the task says.
2. Read the task file, then only the audit sections it cites. Every claim there has a `path:line`, so you should
   not need to re-read the legacy sources broadly. Open a legacy file only at the cited lines.
3. Implement in a branch per task (`feat/<area>-<slug>`). Follow the HOMI conventions: artisan generators, Pest,
   Pint, PHPStan; read the Boost skill or domain agent the task names.
4. When done:
   - Tick the parity-gate items of the task's features.
   - Update the feature row in `09`/`data/features.csv` if its status changed.
   - Set the task `Status`.
5. Keep the registers consistent. Run:
   ```bash
   python3 scripts/migration/collect_ids.py --check        # IDs: no duplicates, no undefined references
   python3 scripts/migration/build_open_questions.py       # regenerate 20 §2
   python3 scripts/migration/task_graph.py --check         # tasks: no broken refs/cycles, P0/P1 features covered
   ```
6. When an answer to a `Q-…` or `DEC-…` arrives:
   - Record it in the source document (mark the question answered, with the date and who answered).
   - Update the affected rules and tasks, then regenerate.
   - A new fact about legacy behaviour gets a status label and evidence like everything else.
7. When legacy production ships a new release before the freeze, port the contract change into
   `$KVADRO_ROOT/docs/api.md`. The legacy team does this with `/sync_frontend_app`. Then update 08, the affected
   tasks and the golden fixtures.

## 7. How to check parity with legacy

- **Contract.** The golden fixtures per `API-…`, and the contract tests of the legacy surface (15).
- **Reference client.** Run the recovered legacy Mini App against the HOMI backend. Use a scratch copy, never the
  legacy tree; its proxy target is configurable (`VITE_API_PROXY`). See 15 and the KV-QA tasks.
- **Bot.** The conversation test kit: fake updates in, expected Bot API calls out, including legacy `callback_data`.
- **Data.** The migration validation suite: counts, checksums, referential and business-level checks (14).
- **Public URLs.** The URL regression suite from `data/public-urls.json`.

## 8. Running the project and the tests

The local environment is described in `docs/handoff/setup.md`:

```bash
make dev-start && make dev-check   # local stack
make ci-backend                    # Pint, PHPStan, Pest
make ci-frontend                   # lint, typecheck, build
```

## 9. Session discipline

- At the end of a working session, update this handoff (section 5) and the master plan's §1 status and §20 "next
  task" if they changed.
- Run the `save-session` skill for `.ai/memory/session-handoff.md`.
