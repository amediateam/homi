---
updated: 2026-11-17 (WP-24 merged as #71, `main` = `780aea9`, WAITING; its follow-up docs PR on `docs/wp-24-after-merge`; Grok's PRs #72 … #75 for KI-38, KI-28, KI-39, KI-40 open, not yet reviewed; WP-23 … WP-10 merged and WAITING; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-16 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-16/17, this session: «Погнали WP-24»; «давай, продолжай»; «как там часть C, есть результаты?»; «Пока ты работает какую большие и механические хадачи можем отдат grok 4.6 ?»; «давай 1 и 3, подготовь детальный промт для Grok главное чтобы он помог нам ускориться не мешат»; «Дай короткий промпт для grok ссо сыдкой»; «grok закончил оба задачи принимай»; «сливай #70»; «Какую след задачу можем дат grok»; «да, подготовь промты для 1–3 и 4»; «сливай #71».

## State at handoff
- `main` = `780aea9`: **#71 merged** on «сливай #71» (WP-24, feed and listing card; merge commit, branch deleted). Before it: `frontend` run 43966127819, `frontend-e2e` run 43966127916 (104 passed) and `backend` run 43966127625 green on `6ae7331`; after it on `main`: `frontend` 44002675075 and `backend` 44002675246 green (`gh run view`).
- `docs/wp-24-after-merge` (from `780aea9`): the follow-up docs PR — WP-24 `WAITING` (spec and queue row), the Merged line, `CLAUDE.md` ("Current state", "Layout"), KI-44 … KI-53, the KI-29 (resolved, #70), KI-32 and KI-43 updates, phase-3-notes §V, this memory. Docs only.
- Grok's PRs, open and **not yet reviewed here**: #72 `fix/ki-38-me-401`, #73 `fix/ki-28-register-size-check`, #74 `fix/ki-39-location-bound`, #75 `fix/ki-40-launch-pending`.

## Done this session
- **WP-24** in three parts plus the docs pass, each an ultracode workflow with review, fix and verify stages; checks in the spec Handoff (`make ci-frontend` exit 0 on `f58cf88`; `feed.spec.ts` 19 passed; CI of #71 green, see above). Merged on the developer's word.
- **Grok work reviewed:** #70 (a probe file fails the package lint; merged, `d2a4722`) and a read-only audit of WP-25 … WP-33 (applied in #71; the rest in the WP-24 Handoff).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #N»** for the follow-up docs PR after its CI.
2. **Grok's #72 … #75**: review each like #70 (run the checks myself, a probe that must fail, no clash with open branches), a security review for #73 (KI-28) and #72 (auth answer); merge each only on its own «сливай #N».
3. **Reviewer questions of #71** (spec Handoff "Open for the reviewer"), first among them the area repeated on every card («2-комн. квартира, 54 м² · 54 м²»: shorten the contract's and fixtures' title, or drop the area in `factsLine`).
4. **KI-44** (the locale switch drops `fullscreen` and the dark theme; user-visible): a small fix PR on the developer's word. **KI-32** (the stub user's API limit for e2e) needs a decision.
5. Earlier items still open: reviewer questions of WP-22 and WP-23; the first developer's list (#63/#64 review, ADR-0016 … 0020, #30, #37, Dependabot #5, #57–#60 untouched); the production track's deploys of WP-03 … WP-24 (for WP-24 first the stub-photo check of its header) and the checks inside Telegram on staging.
6. **WP-25** only on the developer's word.

## Gotchas learned this session
- CI e2e photos: `NEXT_PUBLIC_CDN_URL` must be on the e2e step (CSP `img-src`); specs answer stub photos with `stubMedia(page)` of `@homi/testing/playwright` (no DNS for `cdn.homi.loc` in CI).
- One `feed.spec.ts` run uses ~100 of the stub user's 120 API requests a minute: run it alone, check ` 429 ` in the nginx API log (KI-32). Local php-fpm stalls: rerun (KI-46).
- Scramble types a source's cursor as `string`; `$x ?? null` in a typed local documents it nullable. A method docblock leaks into the OpenAPI description. Local OpenAPI export with an unreachable DB host: KI-47.
- The router refreshes only when the launch signed in (`SessionState.renewed`, AM-66); `useSearchState` reads the saved city through `useSyncExternalStore`, so it arrives one render after hydration (AM-67).
- A filtered Vitest run: KI-52. `gh pr merge --delete-branch` also switches the local checkout to `main` and deletes the local branch.
- Grok runs in its own worktree from `origin/main` with a file brief (no servers, no e2e, no files of an open branch, no `.env*`); review its PR with a probe, never trust its summary.
- Next numbers: AM-70, KI-54, ADR 0021.

## Active subagent work at handoff
- None. The Grok sessions have delivered #72 … #75.
