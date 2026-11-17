---
updated: 2026-11-17 (WP-26 in review as #81 on `wp-26-listing`; WP-25 merged as #79 + docs #80, `main` = `3b98be2`; WP-25 … WP-10 merged and WAITING; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-17 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-17, this session: «сливай #79»; «сливай #80»; «Погнали WP-26»; the two WP-26 answers — stub fixtures «В PR WP-26», `splitMaskedPhones` «lib приложения» (phase-3 notes §X).

## State at handoff
- `main` = `3b98be2` (#80 merged on «сливай #80»; docs only).
- `wp-26-listing` → PR #81 (WP-26, listing screen): 13 commits `8d8b8f1` … `9aa4aa5` plus this status commit; it waits for CI and «сливай #81».
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (root) and `cd backend && composer ci:check`.

## Done this session
- **WP-26** built in waves of plain subagents (at most three at a time, disjoint files), orchestrator gates between waves:
  - `make ci-frontend` → exit 0 on `fed314d` (app 153 files / 2304 + 1 todo; search 238, testing 95, ui 121, i18n 111, api-client 14, utils 2);
  - `composer ci:check` → clean on `fed314d` (Pint, PHPStan 0, Pest 745 passed / 4 skipped, openapi:check);
  - e2e, each of the 18 files alone against `next start` of the `99b032a` build: 180 passed (city, gates, csp, data on a rerun alone; W4's four new specs with single-test reruns) — details in the spec's Handoff.
- Two review rounds (behaviour/React, security, conformance; then test strength, cross-module flows), each finding verified by a refuting agent: B1, B2, X1, X3, T1–T6 fixed; X2 swipe guard + KI-56; SEC-1, T7 rejected.
- Spec corrected to the code (rule 6), Handoff filled; KI-41 partly done, KI-42 resolved for the listing layer, KI-56 … KI-58; phase-3 notes §X with AM-71 … AM-79; WP-12 catalogue count; app README rows.
- A WP-25 flake fixed in `ca5f5a2` (`FiltersSheetRoute.test.tsx`: `scrollIntoView` stub).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #81»** once `frontend`, `backend` and `frontend-e2e` of PR #81 are green; then the after-merge docs PR (status WAITING, queue row, `CLAUDE.md`, `.ai/memory/current-state.md` — 20 base stub listings — and this memory).
2. **#81 reviewer questions** (spec Handoff "Open for the reviewer"): the D-5 share fallback; uz «rieltor»/«makler» and «ham»; the X2 direct-load normalisation (needs a spec/ADR line); KI-57; the legacy departures list.
3. **#79 reviewer questions** (WP-25 Handoff) and the earlier items: #71's area on cards; KI-44 small PR; KI-32 limit; KI-28's rest; #75's 12 s bound.
4. The first developer's list and the production track's deploys of WP-03 … WP-25, plus the Telegram checks on staging.
5. The next queue package (WP-27, map GL) only on the developer's word.

## Gotchas learned this session
- A hand-started `next start` must get `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"`, else every sign-in stays `booting` (the app server cannot reach `https://api.homi.loc`); Playwright adds it only to the server it starts itself.
- Machine load (vitest runs of agents, another project's test suite) also leaves sign-ins at `booting`, apart from KI-32: run e2e only while no agent runs tests; check `uptime`.
- Workflow/subagents cannot write report files to the scratchpad: their final message is the report; save it yourself.
- `pnpm -r test` can fail on a missing `node_modules/.vitest-cache` file (two package runs racing); rerun.
- `composer ci:check` runs `vp check`, which also formats `backend/resources/fixtures/**/*.json` (trailing zeros of numbers).
- Next numbers: AM-80, KI-59, ADR 0021.

## Active subagent work at handoff
- None running.
