---
updated: 2026-11-16 (WP-22 merged as #61, WAITING for the deploy; its follow-up docs PR merged; WP-21, WP-20, WP-10 … WP-13 WAITING for the production track; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail); «тебе можно править .env пока я сам не запрещу» (the committed deny `Edit(**/.env)` and the guard hook still block the agent; never bypass, never print values); «сделай все сам и добав все что не хватает»; each PR merged on its own «сливай #N», each follow-up docs PR opened on «погнали, открывай docs-PR»; «бери WP-20» … «сливай #53»; «бери WP-21»; «сливай #54»; «сливай #55»; «погнали, открывай docs-PR»; «сливай #56»; «бери WP-22».
- 2026-11-16 (end of the day): «на сегожня все завтра продолжим! все commit push main» — read as: everything committed and pushed, the work into `main` through its PRs (never a direct push, per the rule above): #61 merged, its follow-up docs PR merged.

## State at handoff
- `main` holds **WP-22** (#61, merge commit `e8c8f9e`; `frontend` + `frontend-e2e` green on `3bb7831`, e2e 56 passed; `frontend` on `main`: run 43768797356, green) and this follow-up (status `WAITING`, `CLAUDE.md`, KI-29, memory). No feature branch is open; the tree is clean.
- WP-22, WP-21, WP-20, WP-10 … WP-13 merged and `WAITING` for the production track; WP-03, WP-00, WP-01, WP-02 `WAITING`. Open PRs: Dependabot #5 (not to be merged, KI-4) and #57–#60 (next/react, posthog-js, maplibre-gl, lucide-react bumps — dependency changes, the first developer's call; untouched).
- Local only: `homi_test` on Homebrew PostgreSQL; Playwright's Chromium; the local API on stubs behind nginx (`https://api.homi.loc`, used by the e2e sign-in); sanctum tokens of the stub user created by local runs.
- Verify (on `main`): `make ci-frontend` → exit 0 (run on the WP-22 branch before the merge); `cd frontend && pnpm test:e2e --project=miniapp` → 56 passed in CI (needs the local API when run here).

## Done this session
- **WP-21 closed out:** #54, #55, #56 merged on «сливай #N» after green CI.
- **WP-22** steps 1–14 (#61): `lib/api/*` + `/bff/[...path]`, `lib/actions/*`, `lib/data/{useResource,sessionMaps}`, `lib/reference/*`, `lib/search/*`, `lib/money/useMoney`, `onForbidden`, stub scenarios, the proof on the feed and map, `e2e/data.spec.ts`; `@homi/search` and `@homi/i18n/format` by two subagents (spot-checked; their test and mutation numbers re-run here: search 238 + 1 todo, i18n 108). Verified: `make ci-frontend` → exit 0; `data.spec.ts` 5 passed (15 with `--repeat-each=3`); `API_URL=http://127.0.0.1:9/api/v1 pnpm --filter app build` → exit 0; a counting proxy showed only `/reference` and `/cities` cached; app mutation check 53/53 caught. AM-58 in `docs/ai/reports/phase-3-notes.md` §S; KI-29 (ESLint skips `packages/*`).

## Waiting for the developer (do NOT start on your own)
1. **WP-23** (gates and shell) only on the developer's word.
2. **Reviewer questions of WP-22** (spec Handoff): «{city} целиком» also in the collapsed title?; uz/en wording of the whole-city label; strict price-input parsing; KI-29 fix as a small shared-file PR.
3. **The developer's local `backend/.env`** lacks `SOURCES_ALLOW_STUB`, `TELESCOPE_RECORD_ALL`, `TELEGRAM_SUPPORT_USERNAME`, `RADAR_CREATION_ENABLED`: `! printf '\nSOURCES_ALLOW_STUB=true\nTELESCOPE_RECORD_ALL=false\nTELEGRAM_SUPPORT_USERNAME=\nRADAR_CREATION_ENABLED=true\n' >> backend/.env`.
4. **Production track:** WP-22 deploy (nothing beyond WP-21's `API_URL`); WP-21 steps 11–12 (the request in its spec's Handoff, staging in report-only mode, the checks inside Telegram on four clients, then production); WP-20 deploy; WP-13 deploy + staging check; WP-12 deploy + `sources:publish-stub-media`; WP-11 `TELEGRAM_SUPPORT_USERNAME`; WP-10 migration approval, `/docs/api` basic auth, `sources:list`; WP-03 deploy.
5. **Operator request** from the project's own mailbox (WP-02 Part A; never the connected Gmail).
6. **First developer:** accept ADR-0016 … 0020; answer the questions of #30 (WP-01); WP-00 counts, migration approval, deploy; reviewer decisions of #37; Dependabot #57–#60.

## Gotchas learned this session
- `cacheComponents` reports `crypto.randomUUID()` / `Date.now()` in a Server Component "while prerendering": `await io()` of `next/cache` first (`io.md`).
- The router may keep an earlier copy of a route hidden in `<Activity>`: an e2e locator for an element of the page needs `.filter({ visible: true })`.
- Vitest here has no `globals`, so Testing Library does not clean up by itself: call `cleanup()` in `afterEach`.
- `AbortSignal.timeout` ignores Vitest's fake timers; a `setTimeout` + `AbortController` does not.
- `pnpm install --offline` fails the supply-chain check here; an online `pnpm install` for workspace links changes only the importers (check the lockfile diff).
- zsh: never name a loop variable `path` (it is tied to `PATH`). A `brew upgrade` in the developer's terminal can break `node` for minutes (simdutf); wait, do not touch brew. Next numbers: AM-59, KI-31, ADR 0021 (KI-30 taken by the dev-check fix, branch `fix/dev-check-app-locale-redirect`).

## Active subagent work at handoff
- None (the two WP-22 subagents finished; their files are on `main`).
