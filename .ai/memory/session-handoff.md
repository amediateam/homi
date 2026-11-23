---
updated: 2026-11-23 (WP-33 part 4 — the performance budget — in PR #121 on feat/wp-33-perf-budgets; DEC-103; WP-40 next after the merge)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-22 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!».
- 2026-11-23: «обнови гит и продолжим разработку по плану». DEC-103 (rows 7–9 of the budget): «Позже, перед шагами 14–15» (`docs/migration/decisions/2026-11-23-developer-answers.md`).

## State at handoff
- `main` = `792afbd` (#120). Branch `feat/wp-33-perf-budgets` from it, pushed, PR #121 open: `1f2e028` (warm-up fix), `929d82f` (perf specs, budgets, check), `94a3da7` (docs), `21e3995` and `8a513d2` (review fixes), and this save.
- CI of #121 on `94a3da7`: `ci` pass, `e2e` pass (runs 45103656209, 45103656267). The review-fix commits re-run CI on push; check `gh pr checks 121`.
- **Merge #121 only on the developer's word** (`gh pr merge 121 --merge`; bypass mode shows no prompt). Then WP-40 starts at once (DEC-102), on a new branch from `main`.
- Verify: `HOMI_E2E_API_PORT=8090 make perf` (24 passed, every row within its limit); in `frontend/`: `make ci-frontend` parts — `pnpm --filter app lint`, `typecheck`, `pnpm test`.

## Done this session
- `git pull --ff-only`: `main` `52dfc73` → `792afbd` (371 commits). `composer install`, `pnpm install` → up to date; `php artisan migrate:status` → nothing pending.
- WP-33 part 4 (PR #121): `perf` project (manual run), `e2e/perf/*`, `e2e/support/perf.ts`, `perf-budgets.json`, `check-budgets.mjs` + tests, CI steps, `make perf`, `docs/testing/wave-1-telegram-pass.md`, the route-interception rule (13 kept, 9 for a follow-up). Verified: `chunks.spec.ts --repeat-each 10` → 80 passed; analytics run → 30 passed; `make perf` → 24 passed twice; map specs `--repeat-each 2` → 118 passed; app unit tests 4 378 passed; lint, typecheck, `e2e-coverage.mjs`, `collect_ids.py --check` → exit 0.
- Found and fixed: the map warm-up asked for ~313 KB of map code before the first card on a throttled first launch; it now waits for the list's first content (8 s at most). WP-27 corrected.
- First measurement (local, Apple Silicon): rows 1/2 273 674 bytes, row 7 p75 1 380 ms, row 8 p75 1 644 ms, row 9 0.7 %, rows 3–6 and 10: 0.
- AM-102 (`next analyze` chunk names ≠ `next build`'s), AM-103 (stubs end at 45 cards) in `docs/ai/reports/phase-3-notes.md` §AH.
- Two independent reviews (code; warm-up + docs): no high; mediums fixed in `21e3995`, `8a513d2`.

## Waiting for the developer (do NOT start on your own)
1. **«сливай #121»** — then WP-40 (DEC-102).
2. **The manual `full` run before steps 14–15** (DEC-103): its "Performance budget" log gives the runner's rows 7–9; a small PR writes them and drops `provisional`.
3. **Five runs in a row on `main`** of the PR projects after #121 (WP-33 Handoff item 1) — can run locally without asking, ~25 min each.
4. **Production track:** the WAITING rows of the queue; WP-33 steps 14–15.
5. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.

## Gotchas learned this session
- nginx listens on 8080 on this machine: run `scripts/dev/e2e-local.sh` and `make perf` with `HOMI_E2E_API_PORT=8090`.
- `frontend/app` is CommonJS for Playwright: e2e support modules use `__dirname`, not `import.meta`.
- A route-fulfilled answer is not throttled by DevTools; under slow 4G Chromium reports `effectiveType` `3g` (small photos).
- `next analyze --output` does not build; its chunk names do not match `next build`'s.
- Playwright empties `test-results/` at each run: `check-budgets.mjs` must run right after the run it judges.
- The guard hook denies even a count of `.env.local` keys; check a built bundle instead (`rg phc_ .next/static`).
- Next numbers: AM-104, KI-71, ADR 0021, DEC-104.

## Active subagent work at handoff
- None running.
