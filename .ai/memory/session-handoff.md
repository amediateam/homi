---
updated: 2026-11-15 (WP-22 in REVIEW on feat/wp-22-data-layer; WP-21, WP-20 and WP-10 … WP-13 merged and WAITING for the production track; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail); «тебе можно править .env пока я сам не запрещу» (the committed deny `Edit(**/.env)` and the guard hook still block the agent; never bypass, never print values); «сделай все сам и добав все что не хватает»; each PR merged on its own «сливай #N», each follow-up docs PR opened on «погнали, открывай docs-PR»; «бери WP-20» … «сливай #53»; «бери WP-21»; «сливай #54»; «сливай #55»; «погнали, открывай docs-PR»; «сливай #56»; «бери WP-22».

## State at handoff
- `main` = `19048b4` (#56 merged: WP-21 `WAITING`, `CLAUDE.md`, memory). **WP-22** is in **REVIEW** on `feat/wp-22-data-layer` (one PR; see the queue row for its number): steps 1–14, spec corrected (rule 6), Handoff filled, AM-58 in `docs/ai/reports/phase-3-notes.md` §S. `CLAUDE.md` "Layout" (`@homi/search`, `@homi/i18n/format`) waits for the follow-up docs PR after the merge.
- WP-21, WP-20, WP-10 … WP-13 merged and `WAITING` for the production track; WP-03, WP-00, WP-01, WP-02 `WAITING`. Other open PRs: Dependabot #5 (not to be merged, KI-4).
- Local only: `homi_test` on Homebrew PostgreSQL; Playwright's Chromium; the local API on stubs behind nginx (`https://api.homi.loc`, used by the e2e sign-in); sanctum tokens of the stub user created by local runs.
- Verify (on the WP-22 branch): `make ci-frontend` → exit 0; `cd frontend && pnpm test:e2e --project=miniapp app/e2e/data.spec.ts` → 5 passed (needs the local API).

## Done this session
- **WP-22** steps 1–14, tests first, mutation-checked: `@homi/search` and `@homi/i18n/format` by two subagents (spot-checked: contract names, rounding, imports); `lib/api/*` + `/bff/[...path]`, `lib/actions/*`, `lib/data/{useResource,sessionMaps}`, `lib/reference/*`, `lib/search/*`, `lib/money/useMoney`, `onForbidden`, the stub-scenario cookie, the proof on the feed and map placeholders, `e2e/data.spec.ts`. Checked with `make ci-frontend` (exit 0), Playwright `data.spec.ts` (5 passed), a closed-port build (exit 0) and a counting proxy (only the reference cached).
- Merged #54, #55 and #56 (WP-21 and its follow-up) on the developer's word after green CI.

## Waiting for the developer (do NOT start on your own)
1. **The WP-22 PR:** merge only on «сливай #N» after green `frontend` + `frontend-e2e`; then the follow-up docs PR (status, `CLAUDE.md` "Layout" and current state, memory) on «погнали, открывай docs-PR». Reviewer questions are in the spec's Handoff (whole-city label in the collapsed title, uz/en wording, strict input parsing, no ESLint for `packages/*`).
2. **The developer's local `backend/.env`** lacks `SOURCES_ALLOW_STUB`, `TELESCOPE_RECORD_ALL`, `TELEGRAM_SUPPORT_USERNAME`, `RADAR_CREATION_ENABLED`: `! printf '\nSOURCES_ALLOW_STUB=true\nTELESCOPE_RECORD_ALL=false\nTELEGRAM_SUPPORT_USERNAME=\nRADAR_CREATION_ENABLED=true\n' >> backend/.env`.
3. **Production track:** WP-21 (steps 11–12) request in the spec's Handoff (no `X-Frame-Options`, no document caching, `Host` and `Set-Cookie` through, the app env `API_URL` / `CSP_*` / bot username, `CSP_REPORT_ONLY=1` first, the Mini App address per bot), then staging checks in Telegram on four clients; WP-20 deploy; WP-13 deploy + staging check; WP-12 deploy + `sources:publish-stub-media`; WP-11 `TELEGRAM_SUPPORT_USERNAME`; WP-10 migration approval, `/docs/api` basic auth, `sources:list`; WP-03 deploy.
4. **Operator request** from the project's own mailbox (WP-02 Part A; never the connected Gmail).
5. **First developer:** accept ADR-0016 … 0020, answer the questions of #30 (WP-01); WP-00 counts, migration approval, deploy; reviewer decisions of #37.
6. **WP-23** (gates and shell) only on the developer's word.

## Gotchas learned this session
- `cacheComponents`' static shell carries no CSP nonce; the root layout reads `headers()` with `instant = false` (ADR-0020). Unknown addresses then answer `200` + `noindex`.
- React 19 hoists a layout's `<script async src>` above inline scripts: insert order-sensitive scripts from an inline script.
- The App Router's patched `history.replaceState` ignores the URL when `data` carries its `__NA`; pass `null`. It can also bring back the first entry's fragment later (`FragmentGuard`).
- A native `replaceState` + router push in one tick leaves one entry; replace through the router and push after the address updated.
- A `load` event never reaches `window` (capture on `document`); Playwright's route handler is not called for a redirect target; `route.fetch()` stores `Set-Cookie` in the context; an init script may run before `<html>` exists.
- Chromium logs a console error for `browsing-topics` in `Permissions-Policy`; the CSP blocks a test `fetch` to an external host before the network guard sees it.
- `pnpm install --offline` fails the supply-chain check here; the online `pnpm install` added only workspace links for WP-22 (lockfile diff checked).
- `cacheComponents` reports `crypto.randomUUID()` / `Date.now()` in a Server Component "while prerendering": `await io()` of `next/cache` first (`io.md`).
- Vitest here has no `globals`, so Testing Library does not clean up by itself: call `cleanup()` in `afterEach`, or a mounted hook from the last test keeps writing.
- `AbortSignal.timeout` ignores Vitest's fake timers; a `setTimeout` + `AbortController` does not.
- zsh: never name a loop variable `path` (it is tied to `PATH`).
- A `brew upgrade` in the developer's terminal can break `node` for a few minutes (simdutf); wait, do not touch brew. Next numbers: AM-59, KI-29, ADR 0021.

## Active subagent work at handoff
- None.
