---
updated: 2026-11-14 (WP-00 in review as PR #27; WP-01 in review as eight PRs #29 … #36, none merged; queue rows WP-00 and WP-01 = REVIEW)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди там где ты остоновился он продолжит или там где он остоновился ты продоожиш»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Возьми первый пакет очереди со статусом не DONE. … Работай строго по спецификации: тесты сначала, затем код, затем чек-лист приёмки.» «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR и напиши об этом в описании PR.» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-14: «бери следующий пакет WP-01».

## State at handoff
- `main` = `68ad0b0` (PR #26 deps update merged). The shared working tree is on `feat/wp-00-media-ownership-fix` and clean; `main` was merged into it (`d3f1e92`).
- **WP-00** — PR #27, CI pass, `REVIEW`; PR #28 (draft, known issues) merges after #27 is deployed.
- **WP-01** — eight PRs from `origin/main`, `REVIEW`:
  - #29 guard key for `kvadro.uz` / `KVADRO_ROOT` (KI-26), plus the queue status and the spec Handoff;
  - #33 … #36 ADR-0016 … ADR-0019, all `Status: Proposed`;
  - #30 `parallel-work.md`, #31 `HANDOFF.md` §4, #32 `CLAUDE.md` and `AGENTS.md` (merge after #29).
  - The branch-to-PR table and the next steps are in the "Handoff" section of `docs/migration/wave-1/WP-01-adrs-and-shared-files.md`, on the #29 branch.
- Next package of the queue: **WP-02** (operator request and baseline pin). It reads the legacy tree, so wait until #29 is merged. WP-03 depends on WP-00 and WP-01.
- Verify:
  - `make ci-backend` (exit 0 on the merged WP-00 branch: Pest 92/92, PHPStan 0);
  - `make ai-hooks-test` on the #29 branch (55 tests OK);
  - `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check`.

## Done this session
- **WP-00 → `main` merged in after #26.** The working-tree `composer.lock` was byte-identical to `main`'s (`git hash-object` equals `git rev-parse origin/main:backend/composer.lock`), so I restored it and then merged. `make ci-backend` → exit 0.
- **WP-01 step 1:** guard tests written first (`LegacyTreeCase`); the old code gave 11 failures; after the change `make ai-hooks-test` → `Ran 55 tests OK`, and `tooling` CI on #29 passes. Pipe probe against this machine's real `.ai/local.env` (which has no `KVADRO_ROOT`): Edit under `…/kvadro.uz/…` → deny with the legacy reason, Read → allowed, `npm run dev` there → deny.
- **WP-01 steps 2–5:** four ADRs (52, 60, 70 and 58 lines). A reviewer agent checked them against 24 §8.1, 25, the answers and ADRs 0003, 0006, 0007 and 0013: no blocker, 8 traceability findings. I spot-checked its citations (`25:147-148`, `24:170`, `10:399`) and fixed every finding; each PR lists them.
- **WP-01 steps 6–8:** shared-file edits as in the spec. The first developer is asked in #30 about the PR size and about the deploy sentence for `docs/infrastructure/deployment.md`, which belongs to the production track and was not edited.
- **Spec and plan corrections (rule 6), each named in its PR:**
  - the legacy-specific deny reason (#29);
  - T0 among the unchanged tasks (#31);
  - the WP-21 CSP spike result goes into an ADR that amends 0018, in WP-21 step 1 and `25` §3.10 (#35).

## Waiting for the developer (do NOT start on your own)
1. **First developer:** review and approve #29 … #36.
   - On approval of an ADR PR, change `Status` to `Accepted` (in the file header and the index row), then merge.
   - After each ADR merge, merge `main` into the next ADR branch and fix the one-line conflict in the index rows.
2. **First developer's answers** (DEC-45, asked in #30): the Wave 1 PR size rule, and whether every merge is deployed to staging and production. Quote them here when they come (WP-01 acceptance checklist).
3. #29 is still **open** (the developer thought it was merged, but GitHub said `OPEN` with no review). The live probe was done before the merge, on the developer's choice «Проверить до слияния»: Edit and Write refused, npm and `svn commit` refused, Read, rg and cat allowed (details in #29). After the last WP-01 merge, update the ADR references in `current-state.md`, set WP-01 to `DONE` and run save-session.
4. **WP-00:** review and merge #27, then #28. The production track's counts, its migration approval and the deploy are listed in PR #27; after the deploy set WP-00 to `DONE`.
5. Unchanged from before: operator contact and service key (Q-SYS-009, Q-API-059 … 062), artwork (Q-APP-025), legal basis (DEC-13, Q-SEC-021), PostHog (DEC-47), support-bot operators (WP-59), DEC-08/12/19/20.

## Gotchas learned this session
- Work every WP-01 PR in its own `git worktree add --no-track <scratchpad>/wt-<name> -b <branch> origin/main`. `--no-track` stops the branch from tracking `origin/main`; push with `git push -u origin HEAD`.
- The four ADR PRs insert their index row at the same place, so expect one trivial conflict per merge.
- This machine's `.ai/local.env` has no `KVADRO_ROOT` and no legacy checkout. Only the `kvadro.uz` folder-name fallback applies here.
- A cross-session peer's socket can vanish (`ENOENT`); check `ListAgents` before replying.
- Next numbers: AM-51, KI-29 (PR #28 takes KI-27 and KI-28), ADR 0020 (0016–0019 are in #33 … #36).

## Active subagent work at handoff
- None (the ADR reviewer finished; its findings are fixed and listed in #33 … #35).
