---
updated: 2026-11-15 (WP-20 in REVIEW, PR #52; WP-10 … WP-13 merged and WAITING for the production track; WP-03 WAITING deploy; WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail); «тебе можно править .env пока я сам не запрещу» (the committed deny `Edit(**/.env)` and the guard hook still block the agent; never bypass, never print values); «сделай все сам и добав все что не хватает»; «бери WP-12» … «сливай #51» (each PR merged on its own word, each follow-up docs PR opened on «погнали, открывай docs-PR»); «бери WP-20».

## State at handoff
- `main` = `2628435` (#51 merged). **WP-20** is on `feat/wp-20-app-foundation`, PR **#52** open (`REVIEW (#52)` in the queue); CI of #52 not yet read when this was written — check `gh pr checks 52`.
- WP-10 … WP-13 merged and `WAITING` for the production track; WP-03, WP-00, WP-01, WP-02 `WAITING`, unchanged. Other open PRs: only Dependabot #5 (not to be merged, KI-4).
- Local only: `homi_test` on Homebrew PostgreSQL (`127.0.0.1`); Playwright's Chromium in `~/Library/Caches/ms-playwright`; the copied legacy locale files and the importer report in the session scratchpad (not in the repository).
- Verify: `make ci-frontend` → exit 0; `cd frontend && pnpm exec playwright test --project miniapp` → 20 passed; `make ci-backend` → exit 0 (Pest 720 passed, 4 skipped, last run for WP-13).

## Done this session
- **WP-10 … WP-13** (stage A): the 39 `/api/v1` methods on stubs, merged as #42 … #51; AM-52 … AM-55 in `docs/ai/reports/phase-3-notes.md` §M … §P.
- **WP-20** steps 1–17, tests first (mutation-checked where a test passed at once): `@homi/i18n` with the importer and the legacy layer of `index-DY_DH7h-.js` (476 keys per locale, own commit `5c403e9`), the `homi` layer, runtime rules and label tables; `@homi/ui` tokens, themes, lite, motion and base components; the route tree with `proxy.ts`, next-intl, routes, brand, flags, facades and the demo marker. `make ci-frontend` → exit 0 (app 135, i18n 30, ui 24 passed); Playwright `miniapp` → 20 passed. AM-56 in §Q; the specification corrected and its "Handoff" filled (rule 6).

## Waiting for the developer (do NOT start on your own)
1. **#52 (WP-20):** review and «сливай #52» after green checks; then the follow-up PR with the shared files: `frontend/app/.env.example` (comment that `lib/brand` reads `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, empty hides bot links), the `CLAUDE.md` "Layout" and current-state paragraphs (`@homi/i18n`, the app's route tree), WP-20 `WAITING` (deploy only).
2. **The developer's local `backend/.env`** lacks `SOURCES_ALLOW_STUB`, `TELESCOPE_RECORD_ALL`, `TELEGRAM_SUPPORT_USERNAME`, `RADAR_CREATION_ENABLED`: `! printf '\nSOURCES_ALLOW_STUB=true\nTELESCOPE_RECORD_ALL=false\nTELEGRAM_SUPPORT_USERNAME=\nRADAR_CREATION_ENABLED=true\n' >> backend/.env`.
3. **Production track:** WP-13 deploy + staging check (`GET /radars` → `[]`, `POST /radars` → `403 radars_disabled`); WP-12 deploy + `sources:publish-stub-media` on staging and production; WP-11 `TELEGRAM_SUPPORT_USERNAME` + deploy; WP-10 migration approval, deploy, `/docs/api` basic auth, `sources:list`; WP-03 deploy; WP-20 deploy (placeholders on staging and production).
4. **Operator request** from the project's own mailbox (WP-02 Part A; never the connected Gmail).
5. **First developer:** accept ADR-0016 … 0019, answer the PR-size and deploy questions of #30 (WP-01); WP-00 counts, migration approval, deploy; reviewer decisions of #37.
6. **WP-21** (Telegram layer and session) only on the developer's word.

## Gotchas learned this session
- Next.js 16 + `cacheComponents`: a page left by navigation stays in the DOM inside a hidden `<Activity>`; after Back a sheet is hidden, not removed (`preserving-ui-state.md`). Test visibility (`locator.filter({ visible: true })`).
- `next build` refuses two catch-alls of the same shape in sibling folders (`[...catchAll]` in a slot next to `[locale]/[...rest]`); name them alike.
- next-intl 4.15: read the locale from `next/root-params` in `i18n/request.ts` (`setRequestLocale` is deprecated); its middleware cannot express "cookie, else default, never Accept-Language". Client hooks (`onError`, `getMessageFallback`) must be set in a Client Component provider.
- `notFound()` under `<Suspense>` (runtime params) renders the not-found UI with status `200`.
- No `@testing-library/jest-dom`: assert attributes. In the jsdom project use `import.meta.dirname`, not `new URL(…, import.meta.url)`. A stale `.next/dev/types` from a dev server breaks `next build`'s type check: delete `.next`.
- Tailwind 4: `rounded-s` is a logical-corner utility, so the radius tokens are `rounded-small/medium/large/photo/pill`; tailwind-merge needs them in `extendTailwindMerge`.
- Earlier: Scramble typing rules, Pennant and Pest gotchas are in `docs/ai/reports/phase-3-notes.md` §M … §P. Next numbers: AM-57, KI-29, ADR 0020.

## Active subagent work at handoff
- None.
