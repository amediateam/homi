---
updated: 2026-11-20 (the intake of `index-YX9bFVws` merged as #95 `3f9baa0`; the intake of the legacy landing in review on branch `feat/intake-landing-d9bbbc696337`: docs and the landing contract on stubs; next: WP-38)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19: «По релизам, код до WP-31». 2026-11-20: «задай все свои вопросы по одному и с вариантами ответа»; «Приём, WP-38, WP-39, WP-31 (рекомендую)»; «первый — приём приложения»; «сливай #95».
- 2026-11-20, landing intake: «Следующий по очереди»; four answers verbatim in `docs/migration/decisions/2026-11-20-landing-answers.md` (DEC-95 … DEC-97 and «Поменять контракт в этом PR»).

## State at handoff
- `main` = `3f9baa0` (#95). Branch `feat/intake-landing-d9bbbc696337`: `78b7a4d` contract on stubs, `f3ea168` line references moved, `7bb94a6` decisions + WP-62 + specifications, `5abcc94` audit + registers, `c1c544e` and `2e3e57b` review fixes, then notes, memory and the PR number; pushed, **PR #96** (open, CI pending).
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `python3 scripts/migration/collect_ids.py --check` (exit 0, 2 577 ids); `cd backend && composer ci:check` (green on `78b7a4d` except `openapi:check`, which passes once the export is committed); `make ci-frontend` (exit 0 on the code of `78b7a4d`; only docs after).

## Done this session
- **#95 merged** (`3f9baa0`, «сливай #95»); its queue row is DONE on the branch.
- **The landing intake**, four landing releases since the audit's `c63da0e3476a`, pinned at `d9bbbc696337` (`baseline.md`, "The landing pin"):
  - contract on stubs: `showcase.{rent,sale}` lists of `{district_code, count}` in `GET /landing/live`, nullable pin `floor` (`composer ci:check`: Pest 792 passed; `openapi:check`, `types:check` exit 0);
  - DEC-95 (the whole showcase, its links into the Mini App), DEC-96 (the language of `/` with the hint bar, DEV-038 without a flag), DEC-97 (the owners' page waits for legacy until WP-61); the new package **WP-62** (launch with a search filter, stage E before WP-61);
  - `03b` and the registers by two subagent writers; two read-only reviews (03b: about 285 claims, 280 agreed — reported, the footer count re-counted here; specifications: WP-62's gate and pending rules rewritten against the code). All findings fixed.
  - The claim of #95 that a landing sync would bring the owners' page was wrong: the sync downloads no backend page (`tools/sync/fetch.mjs:6-8`); corrected in DEC-91's note, WP-61, the queue.

## Waiting for the developer (do NOT start on your own)
1. **CI of #96**, then «сливай #96».
2. **Then WP-38**, **WP-39**, **WP-31** (WP-37 any time). WP-62 and WP-61 stay at stage E.
3. **The owners' page** (DEC-97): when WP-61 starts, legacy's page if it is known (the developer may bring a copy of `kvadro.app/sdat-kvartiru/`), else HOMI's own text.
4. **The operator texts** (WP-02 Part A and the addendum) — handed over by the developer, never sent from the connected Gmail.
5. **Production track:** the landing PR is a regular deploy (stubs only); WP-27/28 need `CSP_TILE_HOSTS`; WP-29, WP-30, #88 … #90, WP-34 … WP-36 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51).
6. **Dependabot #5, #57 … #60**: only with the first developer.
7. **Reviewer questions of the landing PR:** WP-62's skip of the city picker and the replace (not push) of a filter target; WP-59's blocked support thread kept on erasure; the four-room label kept for 5+ rooms (LB-LND-017, Q-LND-013); the server clock for the showcase ages (LB-LND-018); the no-JavaScript search through a `303` and `form-action https://t.me`; `showcase` without legacy's `total` and `owners`.

## Gotchas learned this session
- `collect_ids.py` **always** rewrites `ids.csv`; `--check` only sets the exit code (the note of the previous handoff was wrong). Regenerate once at the end, then `build_open_questions.py`, then `collect_ids.py --check` again.
- The legacy landing has its own changelog and pin; check `demo/landing/docs/CHANGELOG.md` next to the app's at every intake.
- A legacy landing line map: the hunk headers of `docs/releases/*/delta/diffs/*.diff` give old→new lines without copying code; RECOVERY, scenarios and the server have no diffs — re-point those by content.
- `composer openapi:check` diffs the export against the git index: stage `docs/api/openapi.json` before running it.
- Never run `git stash` in a tree that holds the foreign `backend/composer.lock` change (it stashes it too; restored with `git stash pop` this session).
- Adding lines to `02` breaks the 197 line citations of `07`; keep the line count or re-point them.
- Next numbers: AM-102, KI-68, ADR 0021; DEC-98, LND-070, BR-LND-030, LB-LND-020, Q-LND-015, Q-SEO-023, URL-067, DEV-068, F-LANDING-014, BR-APP-122, LB-APP-092, Q-APP-032, TMA-049, F-OWNER-012, baseline row 56; free WP numbers 49, 63–69, 72–79, 90–99.

## Active subagent work at handoff
- None running (the two writers and two reviewers of the landing intake have finished).
