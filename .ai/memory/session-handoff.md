---
updated: 2026-11-17 (session end: WP-24 merged #71 + docs #76, WAITING; Grok's #72 … #75 merged (KI-38, KI-39, KI-40 resolved, KI-28 narrowed) + docs #77, `main` = `a4c388c`; this memory on `docs/session-2026-11-17`; WP-23 … WP-10 merged and WAITING; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-16 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-16/17, this session: «Погнали WP-24»; «давай, продолжай»; «Пока ты работает какую большие и механические хадачи можем отдат grok 4.6 ?»; «давай 1 и 3, подготовь детальный промт для Grok главное чтобы он помог нам ускориться не мешат»; «grok закончил оба задачи принимай»; «Какую след задачу можем дат grok»; «да, подготовь промты для 1–3 и 4»; «сливай #70», «#71», «#76», «#72», «#73», «#74», «#75», «#77» (each its own message); «запомни где остоноились завтра продолжим».

## State at handoff
- `main` = `a4c388c` (`git log -1`), no open PR of ours (`gh pr list`: only Dependabot #5, #57–#60). Merged this session, each on its own «сливай #N»:
  - #70 (KI-29, `d2a4722`);
  - #71 (WP-24, `780aea9`);
  - #76 (WP-24 docs, `157790d`);
  - #72 (KI-38, `265f475`);
  - #73 (KI-28 narrowed, `4041d4c`);
  - #74 (KI-39, `c390374`);
  - #75 (KI-40, `11c75b2`);
  - #77 (their docs, `a4c388c`).
- CI on `main` was green after each code merge: `frontend` 44002675075, 44016146059 and 44016720103; `backend` 44002675246, 44011150612 and 44015741988 (`gh run view`). #71 itself had green `frontend-e2e` (run 43966127916, 104 passed).
- `docs/session-2026-11-17`: this memory, the current-state line for #77 and a phase-3-notes line. Docs only; it waits for «сливай #N».
- Worktrees: only `.claude/worktrees/deps-update` (not ours, do not touch). No Grok session is briefed.

## Done this session
- **WP-24** (feed and listing card) in three parts plus docs, each an ultracode workflow with review, fix and verify. Checks: `make ci-frontend` exit 0 on `f58cf88`; CI of #71 green. Its docs PR #76 was checked by three read-only reviewers, whose 5 findings were fixed. KI-44 … KI-53 were added.
- **Grok:** KI-29 (#70), KI-38/39/40/28 (#72 … #75) and a spec audit. Each PR was checked here:
  - merged in pairs onto `780aea9`: backend 725 passed, 4 skipped, Pint and PHPStan clean; app 1407 tests, lint and typecheck clean;
  - each fix reverted, and its new tests failed;
  - a security review approved #72, and approved #73 with follow-ups.

  Their docs PR #77 was fact-checked, and its 4 findings were fixed.

## Waiting for the developer (do NOT start on your own)
1. **«сливай #N»** for the PR of `docs/session-2026-11-17`.
2. **KI-28's rest:** the tmp bucket's size bound and the replace race, to be closed by a presigned POST with `content-length-range`. Do it?
3. **#75's 12 s bound** (KI-40 row): on a first launch, a listing push slower than 12 s meets the city gate. Not decided.
4. **Reviewer questions of #71** (spec Handoff "Open for the reviewer"). First among them: the area repeated on every card («2-комн. квартира, 54 м² · 54 м²»). Shorten the contract's and fixtures' title, or drop the area in `factsLine`?
5. **KI-44** (the locale switch drops `fullscreen` and the dark theme; user-visible) needs a small fix PR on the developer's word. **KI-32** (the stub user's API limit for e2e) needs a decision.
6. Earlier items still open:
   - the reviewer questions of WP-22 and WP-23;
   - the first developer's list: #63/#64 review, ADR-0016 … 0020, #30, #37, Dependabot #5 and #57–#60 (untouched);
   - the production track's deploys of WP-03 … WP-24 (for WP-24, first the stub-photo check of its header) and the checks inside Telegram on staging.
7. **WP-25** (filters) only on the developer's word. It is the next package in the queue.

## Gotchas learned this session
- CI e2e photos: `NEXT_PUBLIC_CDN_URL` must be on the e2e step (CSP `img-src`). Specs answer the stub photos with `stubMedia(page)` of `@homi/testing/playwright`.
- One `feed.spec.ts` run makes ~100 of the stub user's 120 API requests a minute: run it alone (KI-32). For local php-fpm stalls, rerun (KI-46). For the local OpenAPI export with an unreachable DB host, see KI-47. For a filtered Vitest run, see KI-52.
- `gh pr merge --delete-branch` switches the checkout to `main` and deletes the local branch and its worktree. Docs-only PRs get no CI checks.
- In a scratch worktree with symlinked `node_modules`, `pnpm exec` starts a `pnpm install`: call `node_modules/.bin/*` directly. Backend tests run only in the main checkout, because `vendor` autoloads from its real path.
- Grok works in its own worktree from `origin/main` with a file brief. Review its PRs with a probe, never trust its summary. It made worktree `.env` files from `.env.example`, against the brief.
- If the developer says «сливай #N» for a PR that does not exist yet, say so, open it and wait for a fresh «сливай #N».
- Next numbers: AM-70, KI-54, ADR 0021.

## Active subagent work at handoff
- None.
