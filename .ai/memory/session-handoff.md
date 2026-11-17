---
updated: 2026-11-17 (WP-25 merged as #79, `main` = `f2f58cc`; its follow-up docs PR on `docs/wp-25-after-merge`; WP-25 … WP-10 merged and WAITING; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-17 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-17, this session: «Продолжим разработку по плану ? где мы остоновились»; «Погнали WP-25»; «сливай #79».

## State at handoff
- `main` = `f2f58cc`: #79 (WP-25: `c41d07c` package, `37ffd27` review fixes, `1b02049` + `0315987` docs) merged on «сливай #79» after green `frontend` (run 44048799579) and `frontend-e2e` (run 44048799675, 130 passed); branch deleted. `frontend` on `main` after the merge: run 44050535246, success.
- `docs/wp-25-after-merge`: WP-25 `WAITING`, queue row, `CLAUDE.md` (current state, `@homi/ui` layout), KI-55 resolved in #79, this memory. Docs only, PR #80; it waits for «сливай #80».
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (root) → exit 0 on `37ffd27` (app 120 files / 1731 tests).

## Done this session
- **WP-25** (filters, quick filter, sort, city), three subagents at most in parallel, two waves plus e2e; the orchestrator re-ran every part:
  - `make ci-frontend` → exit 0 on `c41d07c` (app 1713) and on `37ffd27` (app 1731; search 238, testing 95, ui 120, i18n 110, api-client 14, utils 2);
  - e2e alone against a local `next start`: foundation 19, back + launch 16, shell 16 (2 KI-32 reruns), feed 19, city 6, filters 20 on `c41d07c`; city 6, filters 20 (1 KI-32 rerun), feed 19 on `37ffd27`;
  - two read-only reviews (behaviour/React, security): every confirmed finding fixed in `37ffd27` except C-2 (KI-54); security: six requirements met, S-1/S-2 fixed.
- Spec corrected to the code (67 corrections by a subagent, five spot-checked here with `rg`), Handoff filled; AM-70 in phase-3 notes §W; KI-54 (low), KI-55 (resolved in #79: `AbortSignal.any` on Chrome 111–115 / Safari 16.4–17.3).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #80»** for the PR of `docs/wp-25-after-merge`.
2. **#79 reviewer questions** (spec Handoff "Open for the reviewer"): the flow line on a failed request, the sort pick dropping `from=map`, «1.000.000» in сум parsing to ~79 bn USD, appliances as one list, the deal heading, the nested drag haptic.
3. Earlier open items: #71's area repeated on cards (contract title vs `factsLine`); KI-44 (locale switch drops `fullscreen` and dark) as a small PR; KI-32 limit; KI-28's rest (presigned POST `content-length-range`); #75's 12 s bound.
4. The first developer's list (#63/#64 review, ADR-0016 … 0020, #30, #37, Dependabot #5, #57–#60) and the production track's deploys of WP-03 … WP-24, plus the checks inside Telegram on staging.
5. The next queue package (WP-26, listing screen) only on the developer's word.

## Gotchas learned this session
- Subagent idle reports arrive truncated: have each agent write its report to a scratch file and send one line.
- `closeThen` goes back first and replaces after: an e2e assertion on `/ru?` matches the old address; poll the whole final address.
- Playwright: `--project=miniapp` (with `=`); a server already on :3001 is reused locally, so build + `next start` once and run specs one at a time (KI-32). Rerun a spec that waits at `data-session="booting"`.
- `bfcacheId` survives the shallow `pick=city` pushState (proven by `e2e/city.spec.ts`).
- Next numbers: AM-71, KI-56, ADR 0021.

## Active subagent work at handoff
- None running. Idle teammates of this session (wp25-logic, wp25-sections-a, wp25-sections-b, wp25-review, wp25-security) end with it.
