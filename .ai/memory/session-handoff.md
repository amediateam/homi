---
updated: 2026-11-22 (the development track changes hands: WP-33 parts 1–3 merged, #113 as a9e8955; part 4 not started; no development branch open)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**: from 2026-11-22 another developer, possibly on another machine. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-20 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; «По релизам, код до WP-31»; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!». DEC-98, DEC-99.
- 2026-11-22: «продолжай по плану» (several times). DEC-100: «По запросу, без расписания (Рекомендуется)». DEC-101: «Весь набор в каждом PR (Рекомендуется)» (`docs/migration/decisions/2026-11-22-developer-answers.md`).
- 2026-11-22, the handoff: «Передадим продолжение другому разработчику у нас все закомичено ? он сразу поймет откуда продолжить ?». On the uncommitted PHP 8.6 files: «Запушить веткой, без PR (Рекомендуется)». Then «сливай #114».

## State at handoff
- `main` holds the last code merge #113 (`a9e8955`) and this handoff (#114 and its follow-up, documents only). No development branch is open; the open PRs are Dependabot's (#5, #57 … #60). `git log --branches --not --remotes` on the previous machine → empty: no commit exists on that disk only.
- **WP-33 parts 1–3 are merged:** #111 `61d78c6` (projects, session-mode checks, scenarios, bundle check), #112 `27142e3` (the passes over all addresses, screen annotations, `e2e-coverage.mjs`), #113 `a9e8955` (the eight journeys, `e2e/journeys/`). #113: `gh pr checks 113` → `ci` pass, `e2e` pass (runs 45002838031, 45002837960).
- **Next: WP-33 part 4** (step 13 of `docs/migration/wave-1/WP-33-frontend-acceptance.md`): `e2e/perf/`, the `perf` project, `check-budgets.mjs`, `perf-budgets.json`. None of them exists. Fetch, then a new branch from `origin/main` (`wp-33d-perf` continues the earlier names), one PR; the nine steps are in the specification's "Handoff". Steps 14–15 of WP-33 are run with the production track; steps 16–17 come back to this track.
- **WP-40 after part 4 is an open question for the developer.** Rule 1 of the queue and the specification's "Exit to stage C" make it wait until WP-33 is `DONE`; under rule 8 WP-33 itself was built on `WAITING` packages. Ask before starting it.
- Reading order: `CLAUDE.md` (or `AGENTS.md`) → `HANDOFF.md` → `docs/migration/wave-1/README.md` (rules 1–8, the queue) → the WP-33 specification: "Performance budget", "As built", "Handoff".
- **`chore/php-8.6` (`8464516`) is not the development track's work.** It is a WIP pushed without a PR: the PHP pin 8.5 → 8.6 (`composer.json`, both CI workflows, ADR-0004's amendment, CLAUDE.md, `docs/handoff`). `composer.lock` is not in it, nothing was run on it, and it starts at `ee33352`. The first developer decides on it (toolchain pin).
- Verify: `make ci-frontend`; `scripts/dev/e2e-local.sh` (both projects); `make bundle-check`; from `frontend/`: `node app/scripts/e2e-coverage.mjs`.

## Done this session
- WP-33 part 2 merged as #112 and part 3 as #113. Part 3, reported in #113 and not re-run here: the full local strict run 919 passed in 25.3 min, journeys `--repeat-each 5` 630 passed, `@radars-off` 20, `@analytics` 8; two review rounds, the second with nothing at medium or above.
- The handoff (#114 and its follow-up): the queue row of WP-33, the specification's "Handoff", this file, `current-state.md`, and the first steps of `HANDOFF.md`, which sent a new agent to T1. A reader with no context was given the repository alone and named part 4 from `main` as the next task; the places that confused it are fixed in the follow-up.
- `chore/php-8.6`: nine files that were uncommitted in a worktree, committed as they were and pushed (`git ls-remote --heads origin chore/php-8.6` → `8464516`).

## Waiting for the developer (do NOT start on your own)
1. **The click on the permission prompt of `gh pr merge`** for every merge (Claude Code; rule 8).
2. **An explicit yes is still needed for:** starting WP-40 before WP-33 is `DONE`; e2e shards in CI; taking `gh pr merge` out of `ask`; the `/doctor` cleanup.
3. **Production track:** the WAITING rows of the queue (the regular deploy; `CSP_TILE_HOSTS`, `CSP_PRIVATE_MEDIA_HOSTS`; `OWNER_CABINET_ENABLED` unset on the servers, DEC-81); WP-33 steps 14–17.
4. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.
5. **On the previous machine only** (nothing to do on a fresh clone): KI-70, narrowed on 2026-11-22: its PHP 8.6.0 now loads `redis` and `imagick` (`class_exists("Redis")` → `true`), while `main` still pins PHP 8.5; a modified `backend/composer.lock` in the working tree, never staged; the worktrees `.worktrees/php-8-6` and `.claude/worktrees/deps-update` (#26, merged), which their owner removes.

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
- Next numbers: AM-102, KI-71, ADR 0021, DEC-102.

## Active subagent work at handoff
- None running.
