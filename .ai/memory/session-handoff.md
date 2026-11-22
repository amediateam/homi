---
updated: 2026-11-22 (WP-81 … WP-83 merged; WP-33 part 1 merged as #111 61d78c6; part 2 on wp-33b-coverage, PR after its review)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-20 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; «По релизам, код до WP-31»; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!». DEC-98, DEC-99.
- 2026-11-22: «продолжай по плану» (several times). DEC-100: «По запросу, без расписания (Рекомендуется)». DEC-101, asked twice after a wrong estimate: «Весь набор в каждом PR (Рекомендуется)» (`docs/migration/decisions/2026-11-22-developer-answers.md`).

## State at handoff
- `main` = `61d78c6` (#107 WP-81, #108/#109 WP-82, #110 WP-83, #111 WP-33 part 1).
- **WP-33 part 1** merged as PR #111 (`wp-33-acceptance`, `61d78c6`): projects, session-mode checks, scenarios, the bundle check. Two review rounds, the second clean.
- **WP-33 part 2** on `wp-33b-coverage` (stacked on part 1): `e2e/support/pages.ts`, `e2e/coverage/{routes,render,version-gates,brand}.spec.ts`, screen annotations per describe (per test where a describe mixes screens), `app/scripts/e2e-coverage.mjs` and its CI step, the `en` profile scenario, the owner form's aborted reads. PR after its review.
- **Next:** part 3 (the eight journeys, `e2e/journeys/`), part 4 (`e2e/perf/`, `check-budgets.mjs`, `perf-budgets.json`); then WP-40. Steps 14–17 of WP-33 (staging, the pass inside Telegram) are the production track's.
- Not ours, untouched: `backend/composer.lock` modified in the working tree (never stage it).
- Verify: `make ci-frontend`; `scripts/dev/e2e-local.sh` (both projects); `make bundle-check`; `node frontend/app/scripts/e2e-coverage.mjs` (from `frontend/`: `node app/scripts/e2e-coverage.mjs`).

## Done this session
- WP-81, WP-82 (two PRs), WP-83 merged after independent reviews and green CI (PR bodies have the verification).
- WP-33 part 1: the checks found and fixed React error 418 of the demo marker, the raw catalogues of all locales in a client chunk, the gallery chunk and the scenario names in production. Local strict run: 566 passed; `@radars-off` 20; `@analytics` 8 (reported in #111).
- WP-33 part 2: `e2e-coverage.mjs` → "all 63 screens have an end-to-end test" before the review; re-run it after the review's annotation and `shows` fixes.

## Waiting for the developer (do NOT start on your own)
1. **The click on the permission prompt of `gh pr merge`** for every merge.
2. **KI-70:** PHP 8.6.0 on the developer machine has no `redis` extension; backend commands run with `TELESCOPE_ENABLED=false CACHE_STORE=array QUEUE_CONNECTION=sync SESSION_DRIVER=array PULSE_ENABLED=false`.
3. **Local `.env`:** `OWNER_CABINET_ENABLED=true` (the agent may not read the file).
4. **An explicit yes is still needed for:** e2e shards in CI; taking `gh pr merge` out of `ask`; the `/doctor` cleanup.
5. **Production track:** the WAITING rows (WP-31, 32, 37, 80, 81 with `CSP_PRIVATE_MEDIA_HOSTS`, 82, 83): the regular deploy, `OWNER_CABINET_ENABLED` unset on the servers (DEC-81); WP-33 steps 14–17.
6. **Dependabot #5, #57 … #60**: only with the first developer.

## Gotchas learned this session
- Never edit spec files, `@homi/testing` or `playwright.config.ts` while a Playwright run is going: a restarted worker loads the new code.
- `route.fetch` stores the answer's cookies in the context: header mode's strip must finish before anything reads them.
- A `useSyncExternalStore` server snapshot must be what the server rendered, never the live store (React error 418).
- A client module importing anything from a module that imports JSON catalogues ships them: keep client hooks apart.
- `bffFetch` rethrows the caller's abort: a `void read().then(...)` needs a rejection handler.
- The stub profile's saved language wins over the address (locale guard): `uz` and `en` are scenarios of `GET /me`.
- Next numbers: AM-102, KI-71, ADR 0021, DEC-102.

## Active subagent work at handoff
- None running.
