---
updated: 2026-11-17 (WP-24 merged as #71 and its docs PR #76, WAITING; Grok's #72 … #75 merged (KI-38, KI-28 narrowed, KI-39, KI-40), `main` = `11c75b2`; this docs PR on `docs/grok-ki-fixes`; WP-23 … WP-10 merged and WAITING; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-16 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-16/17, this session: «Погнали WP-24»; «давай, продолжай»; «как там часть C, есть результаты?»; «Пока ты работает какую большие и механические хадачи можем отдат grok 4.6 ?»; «давай 1 и 3, подготовь детальный промт для Grok главное чтобы он помог нам ускориться не мешат»; «Дай короткий промпт для grok ссо сыдкой»; «grok закончил оба задачи принимай»; «сливай #70»; «Какую след задачу можем дат grok»; «да, подготовь промты для 1–3 и 4»; «сливай #71»; «сливай #76»; «сливай #72»; «сливай #73»; «сливай #74»; «сливай #75».

## State at handoff
- `main` = `780aea9`: **#71 merged** on «сливай #71» (WP-24, feed and listing card; merge commit, branch deleted). Before it: `frontend` run 43966127819, `frontend-e2e` run 43966127916 (104 passed) and `backend` run 43966127625 green on `6ae7331`; after it on `main`: `frontend` 44002675075 and `backend` 44002675246 green (`gh run view`).
- `main` = `11c75b2`: after #71, the docs PR **#76** (`157790d`) and Grok's **#72** (KI-38, `265f475`), **#73** (KI-28, `4041d4c`), **#74** (KI-39, `c390374`), **#75** (KI-40, `11c75b2`), each on its own «сливай #N». CI on `main`: `backend` 44011150612 (#72) and 44015741988 (#73), `frontend` 44016146059 (#74) and 44016720103 (#75) green (`gh run view`).
- `docs/grok-ki-fixes` (from `11c75b2`): this follow-up — KI-38, KI-39, KI-40 resolved, KI-28 narrowed (the tmp bucket bound open), phase-3-notes §V, this memory. Docs only. No Grok worktree is left (`git worktree list`).

## Done this session
- **WP-24** in three parts plus the docs pass, each an ultracode workflow with review, fix and verify stages; checks in the spec Handoff (`make ci-frontend` exit 0 on `f58cf88`; `feed.spec.ts` 19 passed; CI of #71 green, see above). Merged on the developer's word.
- **Grok work reviewed and merged:** #70 (KI-29) and #72 … #75. Each was checked here: merged in pairs onto `780aea9` (backend 725 passed, 4 skipped, Pint and PHPStan clean; app 1407 tests, lint and typecheck clean), each fix reverted → its new tests fail, and a security review of #72 (approve) and #73 (approve with follow-ups). Plus a read-only audit of WP-25 … WP-33 (applied in #71).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #N»** for this docs PR (`docs/grok-ki-fixes`).
2. **KI-28's rest** (presigned POST with `content-length-range`, closing the tmp bucket bound and the race) and the #75 question (12 s bound vs a slow listing push, KI-40 row): on the developer's word.
3. **Reviewer questions of #71** (spec Handoff "Open for the reviewer"), first among them the area repeated on every card («2-комн. квартира, 54 м² · 54 м²»: shorten the contract's and fixtures' title, or drop the area in `factsLine`).
4. **KI-44** (the locale switch drops `fullscreen` and the dark theme; user-visible): a small fix PR on the developer's word. **KI-32** (the stub user's API limit for e2e) needs a decision.
5. Earlier items still open: reviewer questions of WP-22 and WP-23; the first developer's list (#63/#64 review, ADR-0016 … 0020, #30, #37, Dependabot #5, #57–#60 untouched); the production track's deploys of WP-03 … WP-24 (for WP-24 first the stub-photo check of its header) and the checks inside Telegram on staging.
6. **WP-25** only on the developer's word.

## Gotchas learned this session
- CI e2e photos: `NEXT_PUBLIC_CDN_URL` must be on the e2e step (CSP `img-src`); specs answer stub photos with `stubMedia(page)` of `@homi/testing/playwright` (no DNS for `cdn.homi.loc` in CI).
- One `feed.spec.ts` run uses ~100 of the stub user's 120 API requests a minute: run it alone, check ` 429 ` in the nginx API log (KI-32). Local php-fpm stalls: rerun (KI-46).
- Scramble types a source's cursor as `string`; `$x ?? null` in a typed local documents it nullable. A method docblock leaks into the OpenAPI description. Local OpenAPI export with an unreachable DB host: KI-47.
- The router refreshes only when the launch signed in (`SessionState.renewed`, AM-66); `useSearchState` reads the saved city through `useSyncExternalStore`, so it arrives one render after hydration (AM-67).
- A filtered Vitest run: KI-52. `gh pr merge --delete-branch` also switches the local checkout to `main` and deletes the local branch, and removes a local worktree of that branch. In a scratch worktree with symlinked `node_modules`, `pnpm exec` starts a `pnpm install` (it failed, nothing changed): call `node_modules/.bin/*` directly.
- Grok runs in its own worktree from `origin/main` with a file brief (no servers, no e2e, no files of an open branch, no `.env*`); review its PR with a probe, never trust its summary.
- Next numbers: AM-70, KI-54, ADR 0021.

## Active subagent work at handoff
- None. All Grok work is merged; no Grok session is briefed.
