---
updated: 2026-11-23 (WP-33 part 4 merged as #121 a27b277; the development track passes to a colleague; WP-40 is next)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** — from 2026-11-24 a colleague. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-22 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!».
- 2026-11-23: «обнови гит и продолжим разработку по плану»; DEC-103 «Позже, перед шагами 14–15»; «сливай #121 и все что осталось! На сегодня все завтра продолжим! коллега будет работать».

## State at handoff
- `main` = `a27b277` (#121, WP-33 part 4) plus this save's PR. `git ls-remote --heads origin` → `main`, `chore/php-8.6` and five Dependabot heads; no development branch open.
- CI of #121's last commit `909fb7f`: `ci` pass, `e2e` pass — 927 passed in 26.7 min, "Performance budget" rows 3–6 at 0, analytics run 10 passed and its budget step green (runs 45107265847, 45107265874).
- **Next: WP-40** (sign-in, users, settings, access gate, limits; `docs/migration/wave-1/WP-40-identity.md`, ~2 600 lines, security-sensitive: run the `security-reviewer` agent). Branch `feat/wp-40-identity` from `origin/main`. DEC-102: it does not wait for WP-33 steps 14–17.
- Reading order: `CLAUDE.md` → `HANDOFF.md` → `docs/migration/wave-1/README.md` (rules 1–8) → `WP-40-identity.md`; for the budget, WP-33's "As built" part 4 and "Handoff".
- Verify the tree: `make ci-frontend`; `HOMI_E2E_API_PORT=8090 make perf` → 24 passed, every row within its limit (on this machine nginx holds 8080).

## Done this session
- `git pull --ff-only`: `main` `52dfc73` → `792afbd` (371 commits); `composer install`, `pnpm install` → up to date; no pending migration.
- WP-33 part 4, merged as #121: the `perf` project, `e2e/perf/*`, `e2e/support/perf.ts`, `perf-budgets.json`, `check-budgets.mjs` + tests, two CI steps, `make perf`, the empty `docs/testing/wave-1-telegram-pass.md`, the route-interception rule (13 kept, 9 for a follow-up). Verified locally: `chunks.spec.ts --repeat-each 10` → 80 passed; analytics run → 30; `make perf` → 24 twice; map specs ×2 → 118; app unit tests 4 378; lint, typecheck, `e2e-coverage.mjs`, `collect_ids.py --check` → exit 0. CI as above.
- Fix found by the budget: the map warm-up waits for the list's first content (8 s at most) before its 2.5 s; WP-27 changed.
- First measurement (local, Apple Silicon): rows 1/2 273 674 bytes, row 7 p75 1 380 ms, row 8 p75 1 644 ms, row 9 0.7 %, rows 3–6, 10: 0.
- DEC-103; AM-102, AM-103 (`docs/ai/reports/phase-3-notes.md` §AH). Reviews: round 1 mediums fixed; round 2 nothing at medium or above.

## Waiting for the developer (do NOT start on your own)
1. **The manual `full` run before WP-33 steps 14–15** (DEC-103): `gh workflow run frontend-e2e.yml --ref main -f full=true` spends Actions minutes — on the developer's word. The `perf` project has never run on GitHub's runner; rows 1, 2, 10 are enforced there, rows 7–9 are provisional. A failed perf test skips the budget step, so no numbers would be printed.
2. **Production track:** the WAITING rows of the queue; WP-33 steps 14–15.
3. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.

Development-track work that needs no word (rule 8): WP-40; the five runs in a row on `main` of the PR projects (`scripts/dev/e2e-local.sh`, ~25 min each), recorded in WP-40's PR; WP-33 Handoff items 4–5 (nine interceptions, three lows) as small PRs.

## Gotchas learned this session
- nginx listens on 8080 on this machine: `HOMI_E2E_API_PORT=8090` for `scripts/dev/e2e-local.sh` and `make perf`.
- `frontend/app` is CommonJS for Playwright: e2e support modules use `__dirname`, not `import.meta`.
- A route-fulfilled answer is not throttled by DevTools; under slow 4G Chromium reports `effectiveType` `3g`.
- `next analyze --output` does not build; its chunk names do not match `next build`'s.
- Playwright empties `test-results/` at each run: `check-budgets.mjs` runs right after the run it judges.
- `collect_ids.py --check` rewrites `docs/migration/data/ids.csv`; commit it with the doc change. It does not index three-digit `DEC-` ids.
- Next numbers: AM-104, KI-71, ADR 0021, DEC-104.

## Active subagent work at handoff
- None running.
