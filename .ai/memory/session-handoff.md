---
updated: 2026-11-14 (WP-02 in review as PR #37, request not sent; WP-01 #29 and #32 merged, six WP-01 PRs open; WP-00 PR #27 open)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Возьми первый пакет очереди со статусом не DONE. … тесты сначала, затем код, затем чек-лист приёмки.» «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-14: «бери следующий пакет WP-01»; «#29 слит, сливай #32 и бери WP-02» (#29 was still open; the developer then chose «Слить #29, потом #32»); «сделай все сам»; «продолжай, открой PR когда агент закончит».

## State at handoff
- `main` = `6286ef4` (#29 guard, #32 pointers merged). The shared working tree is on `feat/wp-00-media-ownership-fix`, clean, with `main` merged in (`523b3f2`), so the new guard is live there.
- **WP-00** — PR #27, `REVIEW`; PR #28 waits until #27 is deployed.
- **WP-01** — `REVIEW`:
  - open: #30 (`parallel-work.md`), #31 (`HANDOFF.md`), #33 … #36 (ADR-0016 … 0019, `Proposed`);
  - the spec's Handoff has the next steps.
- **WP-02** — PR #37, `REVIEW`, docs only, no CI checks on that path. Branch `feat/wp-02-operator-request-and-baseline`, worktree `<scratchpad>/wt-wp02` (pushed). Part B is done; Part A is not sent. The spec's Handoff and the PR body list everything.
- `.ai/local.env` on this machine now has `KVADRO_ROOT`; the legacy checkout is in a `local/smart/kvadro.uz` folder.
- Verify:
  - in the WP-02 worktree: `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check` (both exit 0);
  - `make ai-hooks-test` (55 OK);
  - `make ci-backend` on WP-00 (exit 0 at the last code change).

## Done this session
- **Live hook probe before the merge** (#29's guard placed temporarily in the working tree): Edit and Write under `kvadro.uz` refused, `npm` and `svn commit` refused, Read, rg and cat allowed. Recorded in #29 and in the WP-01 Handoff.
- **Merged #29 and #32** (merge commits), then merged `main` into WP-00. The queue-row conflict was resolved. Afterwards `make ai-hooks-test` → 55 OK, `collect_ids --check` → 0, `task_graph --check` → 0.
- **WP-02 baseline:** `index-DY_DH7h-.js`, SVN r27. Releases read: Dbpp463V, BNLZFfL0, DY_DH7h- (new feature: return banner + `GET /api/feed/new` + in-feed radar card).
- **WP-02 audit and specifications** done in three subagent passes, reviewed by me:
  - claims spot-checked in the code (SCR-018 share-only label; LB-APP-048 crash on a missing `count`);
  - all remapped line references checked by content;
  - 06 completed by hand.
- **WP-02 registers:** `collect_ids.py` (+ `--check`), `build_open_questions.py` and `task_graph.py --check` all exit 0. The diff of 20 holds exactly 4 new questions plus Q-APP-024 answered.
- **Operator request:** an unsent Gmail draft with the full text. The recipient is unknown; it is the operator's contact, which only the product owner has (Q-SYS-009).

## Waiting for the developer (do NOT start on your own)
1. **Send the operator request.** Add the recipient to the draft and send it, or hand it to the product owner. Then fill "Sent" (date and sender) in `docs/migration/decisions/2026-11-14-operator-request.md` on the #37 branch. WP-02 becomes `DONE` when the request is sent and #37 is merged.
2. **Review #37.** Its PR body lists six decisions to check, among them the new `GET /listings/new`, the `503` on a malformed `count`, and DEC-51 hiding the banner and the card. Also decide whether WP-30 (about 3 700 lines) is split.
3. **WP-01:** review and merge #30, #31, #33 … #36. On approval of each ADR, set `Status: Accepted`; resolve the index-row conflicts by merging `main` in. The first developer's answers on the PR size and the deploy cadence are asked in #30.
4. **WP-00:** review and merge #27 and #28; then the production track's counts, migration approval and deploy.
5. **Production track:** the outbound addresses of the API hosts go to the operator directly (asked in #37).
6. Unchanged: Q-API-059 … 062, Q-APP-025, DEC-13 / Q-SEC-021, DEC-47, WP-59 operators, DEC-08/12/19/20.

## Gotchas learned this session
- The developer twice said a PR was merged when GitHub still showed it open. Check `gh api repos/amediateam/homi/pulls/<n> --jq .merged` before acting on "слит".
- Any insert into 02, 03, 06 or 08 shifts `path:line` references elsewhere (07, 09, `features.csv`, 14, 24, `tasks/**`, short forms like `06:930`). Remap them by matching the old line's content (`git show HEAD:<file>`), and watch for times such as `06:59` in the quiet-hours text.
- `collect_ids.py` without `--check` rewrites `data/ids.csv` (about 1 700 lines, mostly moved locations); commit the regenerated file once at the end.
- `rm -rf` under the scratchpad was refused by the permission rules: the probe folder `<scratchpad>/probe` stays.
- Next numbers: AM-51, KI-29 (PR #28 takes KI-27/28), ADR 0020; audit ids are in `docs/migration/data/ids.csv` on the #37 branch.

## Active subagent work at handoff
- None. The three WP-02 passes are finished and committed (`caedfe3`, `cfd0291`, `dc808b9`).
