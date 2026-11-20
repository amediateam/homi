---
updated: 2026-11-20 (WP-36 merged as #94 `d03a34f`; the intake of legacy release `index-YX9bFVws` in review on branch `feat/intake-index-YX9bFVws`, docs and the `legacy` catalogue only; next: the landing intake, then WP-38)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19: «По релизам, код до WP-31». 2026-11-20: «сливай #94».
- 2026-11-20, asked whether the plan needs correcting after the new legacy updates: «задай все свои вопросы по одному и с вариантами ответа»; nine answers (verbatim in `docs/migration/decisions/2026-11-20-developer-answers.md`, DEC-89 … DEC-94); «Приём, WP-38, WP-39, WP-31 (рекомендую)»; the landing «Отдельным PR сейчас»; «первый — приём приложения»; «Начинать сейчас».

## State at handoff
- `main` = `d03a34f` (#94). Branch `feat/intake-index-YX9bFVws`: `41b291c` catalogue, `b3ac399` decisions + WP-39 + specifications, `a15ad09` audit + registers, `7abd3cc`, `8075488` intake-log row, `122781d` review fixes, `46547da` notes and memory, then the PR number; pushed, **PR #95** (open, CI pending).
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- The intake drafts (legacy delta, HOMI map, plan state, id map, answers) are kept outside the repository, in the user-level Claude project folder; the relay memory names them.
- Verify: `python3 scripts/migration/collect_ids.py --check` (exit 0, 2 549 ids, final tree); `make ci-frontend` (exit 0 on the tree of `8075488`; only docs changed after).

## Done this session
- **The intake of `index-YX9bFVws.js`** (prod 20 Nov by the legacy documents; SVN r38 source, r39 docs): no contract or stub change; the `legacy` catalogue re-imported (591 names, 10 new; `pnpm --filter @homi/i18n test` → 116 passed); DEC-89 … DEC-94; the catch-up package **WP-39** (motion and small UX, rows 44 – 54 of `baseline.md`, about 2 100 lines); the cabinet's specifications take the invitations, the landlord block (two buttons, DEC-91), the upload progress (Q-APP-031, recommended an XHR to an allow-listed `/bff` write) and `owner.entry` (DEC-94; WP-80, WP-42, WP-86); WP-11 / WP-32 two events; WP-23 … WP-30 notes; WP-33 the 17 parity scenarios; WP-36 WAITING; the landing intake's row in the queue; the pin moved; `docs/ai/reports/phase-3-notes.md` §AF.
  - Audit by two subagent writers on disjoint files from a fixed id map; references refreshed by id. Reviews: 104 audit claims against the legacy source, 100 agreed (reported, not re-run; three re-read in the main session); decisions against specifications, 22 findings. All fixed in `122781d`.

## Waiting for the developer (do NOT start on your own)
1. **CI of #95**, then «сливай #95».
2. **Then the landing intake** (legacy landing releases `b1b9a919ecc4`, `d9bbbc696337` of 19 Nov; `03b`, WP-61; the owners' page needs a legacy landing sync first), its own docs PR; then **WP-38**, **WP-39**, **WP-31** (WP-37 any time).
3. **The operator texts** (WP-02 Part A and the addendum) — handed over by the developer, never sent from the connected Gmail.
4. **Production track:** WP-27/28 need `CSP_TILE_HOSTS`; WP-29, WP-30, #88 … #90, WP-34 … WP-36 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51); the Telegram checklists of WP-34 … WP-36 on staging.
5. **Dependabot #5, #57 … #60**: only with the first developer.
6. **Reviewer questions of the intake PR:** lite follows legacy (LB-APP-086 not adopted); WP-39's skip rule for a route hidden by `<Activity>`, the radar sheet's no-leave close, the ring keyed by the toast id; `owner.entry` nested and counting every tier; WP-82's texts and two fallbacks, LB-APP-090 not adopted; WP-81's `/bff` write (amends `25` §3.5); DEC-90 keeping "not with the few-results note".

## Gotchas learned this session
- `collect_ids.py` has no `--help`: any argument other than `--check` runs it and rewrites `ids.csv`. Run it once, after every audit edit; `20-open-questions.md` has a generated block (`build_open_questions.py`).
- Parallel audit writers: fix the ids first (an id map), give each writer disjoint files, refresh line references by id definition (not by offset) only after the target document is final, and re-run the refresh after any later edit.
- A shell redirect to a bad path gives `$?` 1 without running the command; read a check's exit code from a plain run.
- Next numbers: AM-102, KI-68, ADR 0021; DEC-95, BR-APP-122, LB-APP-092, Q-APP-032, TMA-049, DEV-067, F-OWNER-012, baseline row 56; free WP numbers 49, 62–69, 72–79, 90–99.

## Active subagent work at handoff
- None running.
