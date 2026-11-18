---
updated: 2026-11-18 (WP-28 in review as #84, stacked on #83 = WP-27 on `wp-27-map-gl`; `main` = `d4c0d88` with WP-26 merged; WP-27 … WP-10 merged or in review, WAITING for deploys)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-17 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-17/18, this session: «сливай #81»; «сливай #82»; «Погнали WP-27»; the label fonts «Поставить fonttools» (a throwaway venv only); «Следующий пакет — WP-28» (given while #83 was open, so #84 is stacked on it).

## State at handoff
- `main` = `d4c0d88`. `wp-27-map-gl` → PR #83 (WP-27, CI green on `94a414d`), waits for «сливай #83».
- `wp-28-map-leaflet-lasso` (from `94a414d`) → PR #84 with base `wp-27-map-gl`: 14 commits `7d57dc7` … `fc93076` and the docs commits. After #83 merges: `gh pr edit 84 --base main`, wait for CI, then «сливай #84». Review commits on #83, if any, are merged into `wp-28-map-leaflet-lasso` (no rebase).
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (root); e2e from `frontend/` against a hand-started `next start` (see Gotchas), each file alone.

## Done this session
- **WP-27 / #83** opened, CI green (frontend 44196889825, frontend-e2e 44196889879, 198 in one run).
- **WP-28 / #84** (Leaflet engine, lasso on both engines, spot map): a vertical slice checked on `next start`, a skeleton of stub hooks, three builders at a time on disjoint files (build, follow-ups, e2e), two review rounds with refuting verifiers (round 1: 3 of 4 confirmed and fixed; round 2: 1 of 1), rule-6 corrections, Handoff, AM-87 … AM-93, KI-61, KI-62.
  - `make ci-frontend` on `f7ba4b2`: types, lint, typecheck, build passed; the test step hit a `.vitest-cache` `ENOENT` once in `@homi/search`, then `pnpm test` passed (app 183 files / 2831 + 1 todo; search 238 + 1 todo, testing 95, ui 121, i18n 112, api-client 14, utils 2).
  - e2e on a `next start` of the `f7ba4b2` build, each of 22 files alone: 237 passed (also 237 on `f4a7c5b`).
  - Each review fix's test shown failing against the unfixed code by the orchestrator; the builders' own mutation checks are reported, not re-run.
- #84's CI on `fc93076`: `frontend` 44251346950 success; `frontend-e2e` 44251347049 failed once on an unrelated foundation test (KI-63), the rerun passed 237. Before that, 44249016942 on `eb9369e`: 2 failed — a race in the new `spot-map.spec.ts` (fixed in `fc93076`) and the shell pull test (KI-63).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #83»**, then retarget #84 to `main`, its green CI, **«сливай #84»**; then the after-merge docs PR (`WAITING` for WP-27 and WP-28, `CLAUDE.md` current state, `current-state.md`).
2. **The production track before WP-27/28 deploy:** `CSP_TILE_HOSTS=https://tile.openstreetmap.org` on staging and production; build only through `pnpm -r build`; later the PMTiles file (KV-INF-021) with its origin in `CSP_TILE_HOSTS` (and missing tiles as 204 for a template, KI-62); nginx cache for `/map-fonts/`. WP-28 asks nothing new (AM-91). Staging checklist: iOS, Android with one lite device, Desktop (mouse drawing), Web.
3. **The developer's own `.env.local`** needs `CSP_TILE_HOSTS=https://tile.openstreetmap.org` (the agent may not edit it).
4. **Reviewer questions:** #83's (uz texts, the palette, the prefetch zoom, KI-59, KI-60); #84's (lite animations on Leaflet, the dark raster filter, the spot circle colour, no spinner on the fullscreen spot map, a spot-map GL failure moving the session, KI-61, KI-62).
5. **Earlier:** #81's questions; #79's; #71's area on cards; KI-44 small PR; KI-32 limit; KI-28's rest; #75's 12 s bound.
6. **WP-29** (favourites and history) only on the developer's word.

## Gotchas learned this session
- Leaflet 1.9.4 is UMD only and sets `window.L`; markercluster and protomaps-leaflet read it: load through `loadLeaflet()`. `divIcon` takes an element as `html`. Leaflet's `remove()` leaves a zoom-end timer, a pinch frame and the wheel debounce timer: use `removeLeafletMap()`.
- Both map libraries' CSS give the container `position: relative`: size the container with `size-full` inside a positioned box, never insets on the container itself (bit the search map in WP-27 and the spot map in WP-28).
- protomaps-leaflet 5.1.0 reports no tile failure; `watchVectorErrors` wraps `layer.views`.
- Three e2e writers at once against one server: sign-ins stuck at `booting` (KI-32) and shared `test-results` collided; give each its own `--output` and rerun files alone.
- `pnpm -r test` once failed with `ENOENT` on `node_modules/.vitest-cache` (parallel packages sharing the cache); rerun.
- A hand-started `next start` for e2e: `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" CSP_TILE_HOSTS=https://tile.openstreetmap.org pnpm exec next start -p 3001`.
- Next numbers: AM-94, KI-64, ADR 0021.

## Active subagent work at handoff
- None running.
