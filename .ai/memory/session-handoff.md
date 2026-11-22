---
updated: 2026-11-22 (the development track changes hands: WP-33 parts 1–3 merged, #113 as a9e8955; part 4 not started; composer updates #117 and #119; merged branches, local and on GitHub, deleted)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**: from 2026-11-22 another developer, possibly on another machine. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-20 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; «По релизам, код до WP-31»; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!». DEC-98, DEC-99.
- 2026-11-22: «продолжай по плану» (several times). DEC-100: «По запросу, без расписания (Рекомендуется)». DEC-101: «Весь набор в каждом PR (Рекомендуется)» (`docs/migration/decisions/2026-11-22-developer-answers.md`).
- 2026-11-22, the handoff: «Передадим продолжение другому разработчику у нас все закомичено ? он сразу поймет откуда продолжить ?». On the uncommitted PHP 8.6 files: «Запушить веткой, без PR (Рекомендуется)». Then «сливай #114». DEC-102, when WP-40 starts: «Сразу после части 4 (Рекомендуется)».
- 2026-11-22, the cleanup: «удали worktree deps-update», «удали и ветку chore/deps-update если он не нужен», on the uncommitted `backend/composer.lock` «надо все сommit psuh main» (done through PR #117, because the rule against a direct push stands), «удали worktree php-8-6 если он больше не нужен», «удали старые слитые локальные ветки», «удали и слитые ветки в GitHub», «сохрани сессию», «оформи composer.lock так же как #117».

## State at handoff
- `main` holds the last application-code merge #113 (`a9e8955`), the handoff documents (#114 … #116), the composer update #117 (`a3bdb52`: `backend/composer.lock` and the regenerated registry; `composer.json` unchanged), this session save (documents only) and the second composer update #119 (`guzzlehttp/guzzle` 8.5.4 → 8.5.5, `guzzlehttp/psr7` 3.5.1 → 3.6.0, lock and registry only). The open PRs are Dependabot's (#5, #57 … #60).
- **Branches on GitHub:** `main`, `chore/php-8.6` and the five Dependabot heads, nothing else (`git ls-remote --heads origin`). Every branch already merged into `main` was deleted on 2026-11-22; branch names in older reports and specifications are history, their commits are in `main`, and a merged PR's page can restore its branch.
- **WP-33 parts 1–3 are merged:** #111 `61d78c6` (projects, session-mode checks, scenarios, bundle check), #112 `27142e3` (the passes over all addresses, screen annotations, `e2e-coverage.mjs`), #113 `a9e8955` (the eight journeys, `e2e/journeys/`). #113: `gh pr checks 113` → `ci` pass, `e2e` pass (runs 45002838031, 45002837960).
- **Next: WP-33 part 4** (step 13 of `docs/migration/wave-1/WP-33-frontend-acceptance.md`): `e2e/perf/`, the `perf` project, `check-budgets.mjs`, `perf-budgets.json`. None of them exists. Fetch, then a new branch from `origin/main` (`feat/wp-33-perf-budgets`, by the pattern of rule 3 of the queue), one PR; the nine steps are in the specification's "Handoff". Steps 14–15 of WP-33 are run with the production track; steps 16–17 come back to this track.
- **Then WP-40, right after part 4 is merged (DEC-102).** It does not wait for steps 14–17 of WP-33, although rule 1 of the queue would make it wait; a defect that the pass inside Telegram finds is fixed ahead of the queue.
- Reading order: `CLAUDE.md` (or `AGENTS.md`) → `HANDOFF.md` → `docs/migration/wave-1/README.md` (rules 1–8, the queue) → the WP-33 specification: "Performance budget", "As built", "Handoff".
- **`chore/php-8.6` (`8464516`) is not the development track's work.** It is a WIP pushed without a PR: the PHP pin 8.5 → 8.6 (`composer.json`, both CI workflows, ADR-0004's amendment, CLAUDE.md, `docs/handoff`). `composer.lock` is not in it, nothing was run on it, and it starts at `ee33352`. The first developer decides on it (toolchain pin).
- Verify: `make ci-frontend`; `scripts/dev/e2e-local.sh` (both projects); `make bundle-check`; from `frontend/`: `node app/scripts/e2e-coverage.mjs`.

## Done this session
- WP-33 part 2 merged as #112 and part 3 as #113. Part 3, reported in #113 and not re-run here: the full local strict run 919 passed in 25.3 min, journeys `--repeat-each 5` 630 passed, `@radars-off` 20, `@analytics` 8; two review rounds, the second with nothing at medium or above.
- The handoff (#114 … #116): the queue row of WP-33, the specification's "Handoff", this file, `current-state.md`, and the first steps of `HANDOFF.md`, which sent a new agent to T1. A reader with no context was given the repository alone and named part 4 from `main` as the next task; the places that confused it are fixed.
- `chore/php-8.6`: nine files that were uncommitted in a worktree, committed as they were and pushed (`git ls-remote --heads origin chore/php-8.6` → `8464516`).
- Composer update #117: the developer's `composer update` of 2026-11-22 01:21, 28 packages (Laravel 13.42 → 13.43), none added or removed, the lock's `content-hash` unchanged. `make registry-check` → `package registry is current`; `make ci-backend` on PHP 8.6.0 → Vite+ check, `tsc`, Pint, PHPStan pass, Pest 850 passed and 4 skipped, `openapi:check` not run locally (see "Gotchas"); the `backend` run 45042261086 on PHP 8.5 → pass, `openapi:check` included. Review: nothing at medium or above. Not deployed.
- Composer update #119: a second local `composer update` at 21:32 (+05), after #117 was merged and not run by the agent, committed on the developer's word the same way: 2 packages (`guzzlehttp/guzzle` 8.5.5, `guzzlehttp/psr7` 3.6.0), the lock's `content-hash` unchanged, `vendor/` matching it. `make registry-check` → current; `make ci-backend` → the same result as for #117 (Pest 850 passed and 4 skipped, `openapi:check` not run locally); the `backend` job of #119 is the proof. Not deployed.
- Cleanup, each checked first (clean tree, every commit on GitHub, no open PR on the branch): the worktrees `.claude/worktrees/deps-update` and `.worktrees/php-8-6` removed (`git worktree list` → the main checkout only); 42 merged local branches deleted with `git branch -d`; 37 merged branches deleted on GitHub (`git for-each-ref refs/remotes/origin --merged origin/main` → only `main`); `chore/deps-update` and the #117 branch too. `chore/php-8.6` kept, locally and on GitHub.

## Waiting for the developer (do NOT start on your own)
1. **The click on the permission prompt of `gh pr merge`** for every merge (Claude Code; rule 8).
2. **An explicit yes is still needed for:** e2e shards in CI; taking `gh pr merge` out of `ask`; the `/doctor` cleanup.
3. **Production track:** the WAITING rows of the queue (the regular deploy, which now carries the composer updates #117 and #119; `CSP_TILE_HOSTS`, `CSP_PRIVATE_MEDIA_HOSTS`; `OWNER_CABINET_ENABLED` unset on the servers, DEC-81); WP-33 steps 14–15 (what they find comes back to this track as step 16).
4. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.
5. **On the previous machine only** (nothing to do on a fresh clone): KI-70, narrowed on 2026-11-22: its PHP 8.6.0 now loads `redis` and `imagick` (`class_exists("Redis")` → `true`), while `main` still pins PHP 8.5.

## Gotchas learned this session
- A new machine: `backend/.env.example` leaves `OWNER_CABINET_ENABLED` empty; set it to `true` in the local `backend/.env` to see the owner cabinet. `e2e-local.sh` and CI set it themselves.
- Never edit spec files, `@homi/testing` or `playwright.config.ts` while a Playwright run is going: a restarted worker loads the new code.
- After a scroll of the feed the chrome is mini: a first tap on a tab or the view toggle only expands it. Expand it first.
- A layer can keep a hidden copy of the listing screen: every lookup inside a layer takes the visible copy.
- `route.fetch` stores the answer's cookies in the context: header mode's strip must finish before anything reads them.
- A `useSyncExternalStore` server snapshot must be what the server rendered, never the live store (React error 418).
- A client module that imports from a module importing JSON catalogues ships them: keep client hooks apart.
- The stub profile's saved language wins over the address (locale guard): `uz` and `en` are scenarios of `GET /me`.
- Reviews: start the independent review together with CI; a reviewer reads through `git show <sha>:path` and runs no Vitest while branches are switched (a stale `node_modules/.vitest-cache` breaks `make ci-frontend`; `pnpm exec vitest --clearCache`). Merge when a narrow round finds nothing at medium or above.
- Stage named paths, never `git add backend`: a developer's own `composer.lock` was swept into WP-80 once.
- `make ci-backend` ends with `openapi:check`, which reads the PostgreSQL database of `backend/.env`: when that host is unreachable it fails with `SQLSTATE[08006]` after the tests have passed.
- Removing the worktree the agent's shell stands in makes the next command fail once; the shell then falls back to the main checkout. Leave the worktree before removing it.
- Next numbers: AM-102, KI-71, ADR 0021, DEC-103.

## Active subagent work at handoff
- None running.
