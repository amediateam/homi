---
updated: 2026-11-14 (three-wave migration order set by the developer; strategy and Wave 1 plan written, PR #25 open; next step stage W1-0)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09, work split: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» Production/staging belongs to the first developer: «Не включай настройку production-среды в задачи коллеги».
- 2026-11-09, goal: move kvadro² (`@KvadroAppBot`, `app.kvadro.app`, `kvadro.app`) onto HOMI 1:1. «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» Plan before code; no real passwords, tokens or personal data in docs or tests.
- 2026-11-09: «в homi.uz мы будем исправлят старые ошибки и логические не верные решение» — legacy bugs and wrong decisions are fixed, not ported (`docs/migration/README.md`, Migration policy).
- 2026-11-14, new order (prompt kept local as `prompt.md`): «Разработку разделим на три волны. Основной принцип — постепенный переход на новую архитектуру без остановки работающего сайта и нарушения существующей функциональности.» Wave 1: «переносим весь существующий фронтенд на Next.js (React)», «Полностью сохранить текущий интерфейс — максимально близко к оригиналу (1:1)», «Не менять поведение сайта на этом этапе», «Все API-запросы направлять через прокси к существующему Production Backend». Wave 2: «метод за методом», «API Gateway / Proxy Layer с возможностью переключения каждого endpoint отдельно». Wave 3: full switch, legacy retired.
- 2026-11-14: «да, закоммить и открой PR»; «да, сохрани сессию».
- Gates that need the first developer's OK: dependency changes, new tools, anything on staging/production, `HANDOFF.md` §4 items marked **gate**. 2026-11-08: «безопасность не важно сейчас» — about the app.uz findings (card C0) only.

## State at handoff
- **Where to continue (changed later on 2026-11-14 — this bullet overrides the older lines below):** the developer answered 43 questions (`docs/migration/decisions/2026-11-14-developer-answers.md`) and the plan was rewritten: HOMI ships a NEW product under its own bot and brand, frontend → `/api/v1` only, a source driver per method (stub / legacy via service key / native). Read `docs/migration/24-three-wave-strategy.md`, then `25-wave-1-plan.md`, then the queue `docs/migration/wave-1/README.md`. `25-wave-1-frontend-plan.md`, stages W1-0…W1-9 and the nginx gateway no longer exist.
- **Unfinished:** only 9 of 44 work-package specifications are written (WP-00…03, 20, 23, 25, 27, 30), drafted by subagents and NOT reviewed; the session hit the usage limit. Next step: write the other 35 (`wave-1/README.md` lists them; template there), review all 44 against `25`, run the three scripts, then rewrite this handoff fully with `save-session`. No code before that and before the developer's OK.
- Branch `docs/three-wave-plan`: `cf4d325` plus this save commit, on top of `main` `596d0db`. **PR #25** (github.com/amediateam/homi/pull/25) is open, `MERGEABLE`, and waits for the first developer's review. Docs only; no CI runs on it (`gh pr checks 25` → none).
- `main` is at `596d0db` (last merge PR #24). PR #9, the audit and plan, is merged (`b583d3d`).
- `prompt.md` and `writing-block.md` stay untracked on purpose (machine paths). Both were found staged at session start (cause unverified) and were unstaged before the commit.
- The legacy checkout `kvadro.uz` (SVN) is read through `KVADRO_ROOT` in `.ai/local.env`. The guard hook does not protect that tree (KI-26).
- No application code has changed. `make ci-backend`, `make ci-frontend` and `make dev-check` were not run this session.
- Verify the plan: `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check` (both exit 0 at this commit).

## Done this session
- Local `main` fast-forwarded from `bb844ca` to `596d0db` (42 commits, `git pull --ff-only`).
- `24`: the three waves, the gateway (one route table, default legacy, per-route switch and rollback), the mapping onto 21 / 18 / 22, DEC-31…DEC-39, seven questions, RK-24…RK-28.
- `25`: the Wave 1 plan — client-rendered route group `(miniapp)`, `frontend/app/miniapp/` mirroring the legacy `src/`, inventory by stage, proxy and `live`-mode rules, the parity run, stages W1-0…W1-9 with exit criteria. It reuses 87 KV-FE tasks (weight 147) and replaces their 38 KV-BE prerequisites by the legacy API (counted from `data/tasks.csv`).
- Notes in `README.md`, `21` (top and §20) and `22` (top and §5) point at the amendment.
- Facts came from three Explore subagents. Spot-checked in the legacy tree: the dev proxy (`vite.config.js:51-64`), the dependency list, 177 modules / 18 330 lines / 27 CSS files, 472 i18n keys per locale, and every cited line number.
- Checks: `collect_ids.py --check` → exit 0, 2 209 IDs (21 new); `build_open_questions.py` → 242 questions; `task_graph.py --check` → exit 0; path and IP scan of 24 and 25 → no hits.
- Legacy tree only read: no `svn`, `npm` or build command was run there, and legacy production was not called. `find -newermt` for today lists only `.svn/wc.db*` and `.idea/workspace.xml` (IDE metadata).

## Waiting for the developer (do NOT start on your own)
1. First developer: review PR #25; the author merges after approval. Then an ADR for DEC-31 and DEC-35 (next free number 0016; it amends ADR-0013) in its own small PR.
2. Developer: DEC-32 (port the recovered code or rebuild from the audit), DEC-33 (rules for reaching legacy production from development; until it is answered the prohibitions of `22` §4 stand), DEC-36 (which legacy defects are fixed in Wave 1), DEC-37, DEC-38.
3. Product owner: operator contact, a launch path on `@KvadroAppBot`, limits and custody (Q-SYS-009, DEC-34, DEC-35); legacy database, schema and source (DEC-39, RK-24) — Wave 2 cannot be planned without them.
4. First developer: dependency approvals (KV-FE-005, DEC-23): eight runtime packages and the test runners (`25` §12).
5. After the plan is approved: task files for N1…N9 (`25` §11), the `Dependencies` cells of the 87 tasks, the rewrite of KV-FE-177.
6. Possible without a decision, but only after the developer's OK (`25` §15): baseline pin (N3), guard for the legacy tree (N4, KI-26), KV-FE-005, the KV-FE-002 spike.
7. Still open from before: KV-BE-002 (KI-25; independent of the waves), the M0 ADR batch, DEC-01…30, the shared-file PRs (`HANDOFF.md` §4, a `CLAUDE.md` pointer to `docs/migration/`), T1 tunnel tool, T9–T11.

## Gotchas learned this session
- Legacy production ships a Mini App release every one to three days. The audit describes `index-plF_TOcT.js`; the legacy tree already holds two later ones (Q-APP-024). Read `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md` before trusting 03 or 08.
- `12` §1 rule 5 says "port behaviour, not code"; `25` §8.1 recommends the opposite for Wave 1. Do not start porting before DEC-32 is answered.
- The handoff can be days old: PR #9 was merged and `main` moved 42 commits between sessions. `git fetch` first.
- Unstage `prompt.md` and `writing-block.md` before every commit (`git restore --staged`); neither is ignored by git.
- A new migration document must not start a table row, heading or bold list item with an existing ID. After adding questions run `collect_ids.py`, then `build_open_questions.py`.
- `$PIPESTATUS` is empty in zsh: read `$?` of the script itself, not of a pipe.
- Next numbers: AM-50, KI-27 (the production track used AM-46…49), ADR 0016. Check `main` first.

## Active subagent work at handoff
- None.
