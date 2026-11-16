---
updated: 2026-11-17 (WP-24 in REVIEW as PR #71 on `feat/wp-24-feed`; KI-29 merged as #70, `main` = `d2a4722`; Grok briefed for KI-38/39/40 and KI-28; WP-23 … WP-10 merged and WAITING; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-16 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-16/17, this session: «Погнали WP-24»; «давай, продолжай»; «как там часть C, есть результаты?»; «Пока ты работает какую большие и механические хадачи можем отдат grok 4.6 ?»; «давай 1 и 3, подготовь детальный промт для Grok главное чтобы он помог нам ускориться не мешат»; «Дай короткий промпт для grok ссо сыдкой»; «grok закончил оба задачи принимай»; «сливай #70»; «Какую след задачу можем дат grok»; «да, подготовь промты для 1–3 и 4».

## State at handoff
- `main` = `d2a4722`: **#70 merged** on «сливай #70» (KI-29: the workspace packages are linted with the app's rules; written by Grok, reviewed here). Branch deleted, Grok's worktrees removed.
- **WP-24** on `feat/wp-24-feed`, **PR #71** open (status `REVIEW (#71)`): `f9cc818` (in progress), A `8b64b19`, API `9163d26` (nullable `meta.next_cursor`, AM-65), B `1d1c964`, C `f58cf88`, docs `1ef7ebb`, merge of `main` `5fd06c9`, then the commit naming #71. CI of #71 not yet seen green.
- Verify (orchestrator, on `f58cf88`, from the root): `make ci-frontend` → exit 0 (app 102 files / 1402 tests, search 238, testing 95, ui 112, i18n 110, api-client 14, utils 2); `env -u CI pnpm exec playwright test app/e2e/feed.spec.ts --project=miniapp --workers=1` → 19 passed; csp + smoke → 4 passed. After the merge (`5fd06c9`): `pnpm -r lint` → exit 0 (8 packages linted), `pnpm -r typecheck` → exit 0. Every other e2e file alone: green in the part C verify run (reported, not re-run; shell needed a rerun after a `429`).
- Grok: two sessions briefed (prompt files in this session's scratchpad, not durable): KI-38, KI-39, KI-40 (one PR each) and KI-28 (one PR). No PR from them seen yet.

## Done this session
- **WP-24** in three parts plus the docs pass, each an ultracode workflow with review, fix and verify stages; every acceptance line mapped to its tests in the #71 description; the spec Handoff lists decisions, reviewer questions, KI candidates and what later specs WP-24 makes wrong. Screenshots at 390 px (ru/uz/en, light/dark) looked at here.
- **Grok work reviewed:** #70 (a probe file fails the package lint; this branch's package files pass it) and a read-only audit of WP-25 … WP-33 (applied: WP-24 spec, WP-21/22/23 notes, 25 §3.4; the rest in the WP-24 Handoff).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #71»** after green `frontend` and `frontend-e2e`. Then the follow-up docs PR: status `WAITING`, queue row, `CLAUDE.md` (WP-24 sentence; KI-29 phrase in "Layout"), KI-44 onward from the Handoff's candidates, KI-29 resolved, the KI-43 update, memory.
2. **Reviewer questions of #71** (spec Handoff), among them: the area repeated on every card («2-комн. квартира, 54 м² · 54 м²»: fix the contract/fixtures' short title or the card); the header chips and mini title show Tashkent until `me` is known on a city-less address (audit F4); the stronger cursor guard; serial `/me` → `/listings`.
3. **Found, not WP-24:** after a `LocaleGuard` locale switch `<html>` loses `fullscreen` and a dark Telegram turns light (KI candidate, user-visible) — a small fix PR on the developer's word; KI-32 (raise the stub user's API limit for e2e) needs a decision.
4. **Grok PRs** for KI-38, KI-39, KI-40, KI-28: review each like #70 (run the checks, probe), security review for KI-28; merge only on «сливай #N».
5. Earlier items still open: reviewer questions of WP-22 and WP-23; the first developer's list (#63/#64 review, ADR-0016 … 0020, #30, #37, Dependabot #57–#60); the production track's deploys of WP-03 … WP-23 and the checks inside Telegram on staging.
6. **WP-25** only on the developer's word.

## Gotchas learned this session
- CI e2e photos: `NEXT_PUBLIC_CDN_URL` must be on the e2e step (CSP `img-src`); specs answer stub photos with `stubMedia(page)` of `@homi/testing/playwright` (no DNS for `cdn.homi.loc` in CI).
- One `feed.spec.ts` run uses ~100 of the stub user's 120 API requests a minute: run it alone, check ` 429 ` in the nginx API log (KI-32). Local php-fpm stalled twice (`/bff/session` unanswered ~15 s): rerun.
- Scramble types a source's cursor as `string`; `$x ?? null` in a typed local documents it nullable. A method docblock leaks into the OpenAPI description. Local `composer openapi:export` with an unreachable DB host: `DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_DATABASE=homi_test DB_USERNAME=<os user> DB_PASSWORD= php artisan scramble:export` (byte-identical).
- The router refreshes only when the launch signed in (`SessionState.renewed`, AM-66); `useSearchState` reads the saved city through `useSyncExternalStore`, so it arrives one render after hydration (AM-67).
- `pnpm --filter app test -- <path>` does not filter; use `pnpm exec vitest run --config ../vitest.config.mts --project app <paths>` from `frontend/app`.
- Grok runs in its own worktree from `origin/main` with a file brief (hard rules: no servers, no e2e, no files of the open branch, no `.env*`); review its PR with a probe, never trust its summary.
- Next numbers: AM-70, KI-44, ADR 0021.

## Active subagent work at handoff
- None in this session. Two external Grok sessions may be running (KI-38/39/40, KI-28).
