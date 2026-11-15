---
updated: 2026-11-16 (pull of WP-10 … WP-22 onto the developer's machine, local stack repaired; dev-check fix #63 and nginx fix #64 merged; WP-23 next on the developer's word)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail); «тебе можно править .env пока я сам не запрещу» (the guard hook still blocks the agent; never bypass, never print values); each PR merged on its own word («сливай #N»); «бери WP-22».
- 2026-11-16: «получи последную версию проекта с гит»; «да сделай все сам»; «да давай сделаем граомтно»; «конечно сделай чтобы все граомтно работало»; «сохрани сессию и commit push main сделай сво изминение» — read, as on 2026-11-16 before, as: into `main` through PRs with merge commits, never a direct push.

## State at handoff
- `main` = `59a34ad` (#64), on top of `d92f318` (#63) and WP-22 (#61, #62). Branch `docs/session-2026-11-16-local-tooling` holds this save; its PR goes into `main` on the same instruction (check `git log -1 origin/main`). No feature branch is open.
- WP-22, WP-21, WP-20, WP-10 … WP-13 merged and `WAITING` for the production track; WP-03, WP-00, WP-01, WP-02 `WAITING`. Open PRs: Dependabot #5 (not to be merged, KI-4) and #57–#60 (dependency bumps, the first developer's call; untouched).
- The developer's machine is current: `composer install`, `pnpm install` (links `@homi/search`), migrations `2026_11_14_150551_*` and `2026_11_14_224945_*` applied, the new `.env`/`.env.local` keys added by the developer from the templates, nginx master started from Terminal by `make dev-nginx-restart` at 04:03.
- Verify: `make dev-check` → `dev:check OK (0 warning(s))`, 24 PASS (run on `main` = `59a34ad`).

## Done this session
- **Pull.** `main` moved `3bf4f39` → `a86a41c` (166 + 18 commits, WP-00 … WP-22); `git pull --ff-only` both times.
- **#63, KI-30 (resolved):** `check.sh` follows the app's 307 to `/ru` and passes only on 200 on the same host. Verified: real `make dev-check` → OK; the loop cut from `check.sh` against a fake `curl` (foreign host, 000, redirect loop, empty output) → expected FAIL lines.
- **#64, KI-31:** `nginx.sh` `stop` waits for the root master and falls back to TERM; `start` is its own command; `reload` of a quitting master starts it; new `restart` and `make dev-nginx-restart`; the "Operation not permitted" diagnosis after start/reload and in `storage.sh check`; only the root master is signalled. Verified: stub harness, 15 scenarios as intended; real `nginx.sh check`, `storage.sh check` → PASS; the developer's `make dev-nginx-restart` → new master pid 10946, then `dev:check OK`.
- Phase document: `docs/ai/reports/phase-3-notes.md` §T.

## Waiting for the developer (do NOT start on your own)
1. **WP-23** (gates and shell) only on the developer's word.
2. **Reviewer questions of WP-22** (spec Handoff): «{city} целиком» also in the collapsed title?; uz/en wording of the whole-city label; strict price-input parsing; KI-29 fix as a small shared-file PR.
3. **First developer:** #63 and #64 were merged without a review, on the developer's instruction — a look afterwards; accept ADR-0016 … 0020; questions of #30 (WP-01); WP-00 counts, migration approval, deploy; reviewer decisions of #37; Dependabot #57–#60.
4. **Production track:** deploys of WP-22, WP-21 (steps 11–12), WP-20, WP-13, WP-12 (+ `sources:publish-stub-media`), WP-11 (`TELEGRAM_SUPPORT_USERNAME`), WP-10 (migration approval, `/docs/api` basic auth), WP-03.
5. **Operator request** from the project's own mailbox (WP-02 Part A; never the connected Gmail).

## Gotchas learned this session
- nginx answers 500 with "Operation not permitted" under `~/Documents` although it was started by `sudo nginx`: a reload does not help; `make dev-nginx-restart` from Terminal or iTerm does (KI-31). Root cause unknown.
- `gh pr merge --delete-branch` on the base of a stacked PR **closes** that PR instead of retargeting it. Merge the lower PR without deleting its branch, retarget the upper one with `gh pr edit <n> --base main`, then delete.
- The guard hook denies any shell write to `.env*` (even `>>`); hand the developer a `!` command built from the template's key names.
- A `make … | tail` over `services.sh start|restart` never returns: the detached servers keep the pipe open. Redirect to a file instead.
- nginx config for the Next hosts lives in `infra/local/nginx/snippets/` (`proxy-next-dev.conf` proxies HMR websockets); grep the snippets, not only `*.conf`.
- From earlier: `cacheComponents` needs `await io()` before `crypto.randomUUID()`/`Date.now()`; e2e locators need `.filter({ visible: true })`; Vitest has no `globals` (call `cleanup()`); `AbortSignal.timeout` ignores fake timers; `pnpm install --offline` fails the supply-chain check; a `brew upgrade` can break `node` for minutes (wait); zsh: no loop variable named `path`, no bare `echo ===`. Next numbers: AM-59, KI-32, ADR 0021.

## Active subagent work at handoff
- None. A peer Claude session (smartagent.uz) answered questions about the shared nginx; nothing is pending with it.
