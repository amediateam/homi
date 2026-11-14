---
updated: 2026-11-15 (WP-01 and WP-02 merged into main, both WAITING; WP-00 PR #27 open; next in queue WP-03 waits for WP-00)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Возьми первый пакет очереди со статусом не DONE. … тесты сначала, затем код, затем чек-лист приёмки.» «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-14: «бери следующий пакет WP-01»; «#29 слит, сливай #32 и бери WP-02» (#29 was still open; the developer then chose «Слить #29, потом #32»); «сделай все сам»; «продолжай, открой PR когда агент закончит»; 2026-11-15: «сливай #37 и все PR WP-01».

## State at handoff
- `main` = `3bced89`. Merged on 2026-11-15 with merge commits: #30 `5b6377a`, #31 `ada15b9`, #33 `c0e8732`, #34 `f893d08`, #35 `a70179d`, #36 `77e0c6d`, #37 `3bced89`. Before each ADR merge, `main` was merged into the ADR branch to fix the index-row conflicts.
- The shared working tree is on `feat/wp-00-media-ownership-fix`, with `main` merged in (`dc055cf`).
- **WP-00** — PR #27 `REVIEW`; #28 waits until #27 is deployed.
- **WP-01** — `WAITING`: ADR-0016 … 0019 are on `main` with `Status: Proposed`. The first developer has to accept them; then each needs a one-line `Status` change (header and index row) in a small PR. The DEC-45 answers asked in #30 are still open.
- **WP-02** — `WAITING`: the baseline is on `main` and the audit describes `index-DY_DH7h-.js`. The operator request is an unsent Gmail draft, so WP-02 is not `DONE` until it is sent.
- **Next in the queue: WP-03.** It depends on WP-00, which is not merged. It also installs dependencies, which needs the first developer's approval.
- Verify:
  - `make ai-hooks-test` → 55 OK;
  - `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check` → 0 and 0 on the #37 branch before the merge;
  - `make ci-backend` on WP-00 → exit 0 at its last code change.

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
1. **Send the operator request.** Add the recipient (the operator's contact, which only the product owner has, Q-SYS-009) to the Gmail draft and send it. Then fill "Sent" in `docs/migration/decisions/2026-11-14-operator-request.md` (date and sender) in a small PR, and set WP-02 to `DONE`.
2. **First developer:** accept ADR-0016 … 0019. After that, a small PR changes `Status: Proposed` → `Accepted` in each file header and index row. They also answer the PR-size and deploy-cadence questions of #30; quote the answers here, then set WP-01 to `DONE`.
3. **WP-00:** review and merge #27, then #28 after the production track's counts, migration approval and deploy.
4. **Production track:** the outbound addresses of the API hosts go to the operator directly (asked in #37).
5. **Reviewer decisions taken in #37** (listed in its body): `GET /listings/new`, the `503` on a malformed `count`, DEC-51 hiding the banner and the feed card, and whether WP-30 (about 3 700 lines) is split before it starts.
6. Unchanged: Q-API-059 … 062, Q-APP-025, DEC-13 / Q-SEC-021, DEC-47, WP-59 operators, DEC-08/12/19/20.

## Gotchas learned this session
- The developer twice said a PR was merged when GitHub still showed it open. Check `gh api repos/amediateam/homi/pulls/<n> --jq .merged` before acting on "слит".
- Any insert into 02, 03, 06 or 08 shifts `path:line` references elsewhere (07, 09, `features.csv`, 14, 24, `tasks/**`, short forms like `06:930`). Remap them by matching the old line's content (`git show HEAD:<file>`), and watch for times such as `06:59` in the quiet-hours text.
- `collect_ids.py` without `--check` rewrites `data/ids.csv` (about 1 700 lines, mostly moved locations); commit the regenerated file once at the end.
- `rm -rf` under the scratchpad was refused by the permission rules: the probe folder `<scratchpad>/probe` stays.
- Next numbers: AM-51, KI-29 (PR #28 takes KI-27/28), ADR 0020; audit ids are in `docs/migration/data/ids.csv` on the #37 branch.

## Active subagent work at handoff
- None. All three WP-02 passes are merged with #37.
