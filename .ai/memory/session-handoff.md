---
updated: 2026-11-15 (WP-21 merged as #55 with shared files #54, WAITING for the production track; WP-20 and WP-10 … WP-13 merged and WAITING for the production track; WP-03, WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail); «тебе можно править .env пока я сам не запрещу» (the committed deny `Edit(**/.env)` and the guard hook still block the agent; never bypass, never print values); «сделай все сам и добав все что не хватает»; each PR merged on its own «сливай #N», each follow-up docs PR opened on «погнали, открывай docs-PR»; «бери WP-20» … «сливай #53»; «бери WP-21»; «сливай #54»; «сливай #55»; «погнали, открывай docs-PR».

## State at handoff
- `main` = `31b53f4`: **WP-21** merged — #54 (ADR-0020 + the app's server-only `.env.example` keys, `68751f3`) and #55 (the package, steps 1–10, `31b53f4`), both after green `frontend` + `frontend-e2e`; `frontend` green on `main` after each merge (runs 43731715684, 43732411072). Both branches deleted. WP-21 is `WAITING` for the production track (steps 11–12); the status, `CLAUDE.md` and this memory are on `docs/wp-21-after-merge` (follow-up docs PR #56).
- WP-21, WP-20, WP-10 … WP-13 merged and `WAITING` for the production track; WP-03, WP-00, WP-01, WP-02 `WAITING`. Other open PRs: Dependabot #5 (not to be merged, KI-4).
- Local only: `homi_test` on Homebrew PostgreSQL; Playwright's Chromium; the local API on stubs behind nginx (`https://api.homi.loc`, used by the e2e sign-in); sanctum tokens of the stub user created by local runs.
- Verify (on `main`): `make ci-frontend` → exit 0 (run on #55's branch before the merge); `cd frontend && pnpm test:e2e --project=miniapp` → 51 passed (one `✘` is the guard's expected failure; needs the local API).

## Done this session
- **WP-21** steps 1–10, tests first, mutation-checked (each deliberate break caught): ADR-0020 from a measured spike; `lib/telegram/*` (adapter `tg`); `lib/storage.ts`, `lib/graphics.ts`; `boot/*` + `BootGuard`; `@homi/testing` additions and `launchApp`; `dev/telegram-emulator.ts`; `/bff/session` + `lib/session/*`; `lib/navigation/*` + `TelegramButtons`; `lib/deeplinks/*`, `LaunchRedirector`, `LocaleGuard`, `FragmentGuard`; `lib/security/csp.ts` + `proxy.ts`; the e2e API service in `frontend-e2e.yml`. AM-57 in `docs/ai/reports/phase-3-notes.md` §R. Checked with `make ci-frontend` (exit 0) and Playwright `miniapp` (51 passed). Merged #54 and #55 on the developer's word after green CI.

## Waiting for the developer (do NOT start on your own)
1. **The follow-up docs PR #56** (`docs/wp-21-after-merge`: WP-21 `WAITING`, `CLAUDE.md`, memory): merge only on «сливай #56» after green CI.
2. **The developer's local `backend/.env`** lacks `SOURCES_ALLOW_STUB`, `TELESCOPE_RECORD_ALL`, `TELEGRAM_SUPPORT_USERNAME`, `RADAR_CREATION_ENABLED`: `! printf '\nSOURCES_ALLOW_STUB=true\nTELESCOPE_RECORD_ALL=false\nTELEGRAM_SUPPORT_USERNAME=\nRADAR_CREATION_ENABLED=true\n' >> backend/.env`.
3. **Production track:** WP-21 (steps 11–12) request in the spec's Handoff (no `X-Frame-Options`, no document caching, `Host` and `Set-Cookie` through, the app env `API_URL` / `CSP_*` / bot username, `CSP_REPORT_ONLY=1` first, the Mini App address per bot), then staging checks in Telegram on four clients; WP-20 deploy; WP-13 deploy + staging check; WP-12 deploy + `sources:publish-stub-media`; WP-11 `TELEGRAM_SUPPORT_USERNAME`; WP-10 migration approval, `/docs/api` basic auth, `sources:list`; WP-03 deploy.
4. **Operator request** from the project's own mailbox (WP-02 Part A; never the connected Gmail).
5. **First developer:** accept ADR-0016 … 0020, answer the questions of #30 (WP-01); WP-00 counts, migration approval, deploy; reviewer decisions of #37.
6. **WP-22** (data layer) only on the developer's word.

## Gotchas learned this session
- `cacheComponents`' static shell carries no CSP nonce; the root layout reads `headers()` with `instant = false` (ADR-0020). Unknown addresses then answer `200` + `noindex`.
- React 19 hoists a layout's `<script async src>` above inline scripts: insert order-sensitive scripts from an inline script.
- The App Router's patched `history.replaceState` ignores the URL when `data` carries its `__NA`; pass `null`. It can also bring back the first entry's fragment later (`FragmentGuard`).
- A native `replaceState` + router push in one tick leaves one entry; replace through the router and push after the address updated.
- A `load` event never reaches `window` (capture on `document`); Playwright's route handler is not called for a redirect target; `route.fetch()` stores `Set-Cookie` in the context; an init script may run before `<html>` exists.
- Chromium logs a console error for `browsing-topics` in `Permissions-Policy`; the CSP blocks a test `fetch` to an external host before the network guard sees it.
- `pnpm install --offline` fails the supply-chain check here, so adding even a workspace link needs an online install (a dependency change). Next numbers: AM-58, KI-29, ADR 0021.

## Active subagent work at handoff
- None.
