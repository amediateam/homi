---
updated: 2026-11-15 (WP-03 merged in #39, WAITING for the deploy; step 11 in PR docs/wp-03-after-merge; WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail for project mail); «бери WP-03»; «открой PR со статусом в main»; «сливай #40»; «потверждаю» (the WP-03 package list of #39); «сливай #39».

## State at handoff
- `main` = `3af66f9` (#39 merged on «сливай #39»; `frontend` and `backend` green on `main`; the WP-03 branch is deleted). Follow-up branch `docs/wp-03-after-merge`: `CLAUDE.md` (step 11), WP-03 status `WAITING (merged in #39; deploy with the production track)` in the spec and the queue row. The shared working tree is on that branch.
- WP-00, WP-01, WP-02 — `WAITING`, unchanged (see the list below).
- Local only: database `homi_test` on this machine's Homebrew PostgreSQL (`127.0.0.1`); Playwright's Chromium in `~/Library/Caches/ms-playwright`.
- Verify: `make ci-frontend` → exit 0; `cd frontend && pnpm test:e2e` → 2 passed; `DB_HOST=127.0.0.1 DB_USERNAME=<os user> DB_PASSWORD= make test-pgsql` → 3 passed; `make ci-backend` → exit 0; `make registry-check` → current.

## Done this session
- **pgsql group** (step 10): red first, `make test-pgsql` → 3 passed; the race test fails on a non-atomic `fromStored()` (tried, reverted).
- **Package table confirmed** («потверждаю», recorded in the PR body) and **installed** (steps 3–4). `pnpm audit --prod` → no known vulnerabilities. The lockfile has 665 entries, and none of the 417 on `main` changed. Install scripts of `@parcel/watcher`, `@swc/core` and `core-js` are `false` in `allowBuilds` (AM-51).
- **Unit tests** (steps 5–6), each run first without its code to see it fail:
  - `vitest.config.mts`, `vitest.setup.ts` (rejects unmocked `fetch`), `@homi/testing`;
  - `pnpm test` → 89 + 2 passed, the same under `TZ=Asia/Tashkent`;
  - mutations caught: `displayTimeZone` removed, the `DeviceStorage` gate removed.
- **ESLint restriction** (step 7): a deliberate import in `app/app/page.tsx` → lint error (reverted).
- **Playwright** (step 8): `pnpm test:e2e` → 2 passed against the built app and against `https://app.homi.loc`, with only `pnpm --filter app dev` running (stopped after). Without `test.fail()`, the guard test fails with the blocked `telegram.org` URL.
- **CI** (step 9): `frontend.yml` gained the unit and Tashkent steps; `frontend-e2e.yml` is new; `make ci-frontend` runs `pnpm test` and exits 2 on a broken test; `make e2e` is new.
  - First CI round on `5722748`: backend, frontend and frontend-e2e green.
  - A Vite warning about the ESM config led to the `.mts` rename (`e7bfba7`).
  - Second round on `c0f4774`: backend, frontend (89 + 2 passed, Tashkent 89 + 2, no Vite warning) and frontend-e2e (2 passed) green.
- **Spec WP-03 corrected** (rule 6), Handoff filled; phase notes §L extended with AM-51.

## Waiting for the developer (do NOT start on your own)
1. **Merge of the follow-up PR** (`docs/wp-03-after-merge`: `CLAUDE.md` step 11 + status). Then WP-03 `DONE` after the production track's deploy (a no-op for users).
2. **Send the operator request** from the project's own mailbox (WP-02 spec, Part A; never the connected Gmail); then fill "Sent" in `docs/migration/decisions/2026-11-14-operator-request.md` and set WP-02 to `DONE`.
3. **First developer:** accept ADR-0016 … 0019 (then a `Status` PR) and answer the PR-size and deploy questions of #30; then WP-01 `DONE`.
4. **WP-00 (production track):** counts, migration approval, deploy, staging check; then `DONE`. Outbound addresses to the operator (#37).
5. Reviewer decisions of #37: `GET /listings/new`, the `503` on a malformed `count`, DEC-51 hiding, a WP-30 split. Unchanged: Q-API-059 … 062, Q-APP-025, DEC-13 / Q-SEC-021, DEC-47, WP-59 operators, DEC-08/12/19/20.
6. The next queue package after WP-03 only on the developer's word.

## Gotchas learned this session
- pnpm 11: `strictDepBuilds` fails an install while an install script is undecided; decide each one in `allowBuilds` (`true`/`false`). The minimum release age (24 h) also applies to transitive packages, and CI re-applies it to every lockfile entry.
- Vitest 5 looks for its config only in the working directory (scripts pass `--config`). Vite rewrites `new URL(…, import.meta.url)` inside test code into an asset URL, so build file paths with `node:path`. `tagsFilter` works from the config but is not typed; use a tag with `skip: true`.
- Playwright: a context route runs after page routes and after later routes, so it is the right place for a last-resort guard. `test.fail()` turns "the guard fails this test" into a green expected failure.
- The PostToolUse Pint hook removes imports that are unused at the moment of an edit. Closures in Pest tests must be unbound before `Concurrency` (`concurrently()` does it).
- Check `gh api repos/amediateam/homi/pulls/<n> --jq .merged` before acting on "слит". Next numbers: AM-52, KI-29, ADR 0020.

## Active subagent work at handoff
- None.
