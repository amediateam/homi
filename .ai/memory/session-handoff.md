---
updated: 2026-11-18 (WP-27 in review as #83 on `wp-27-map-gl`; `main` = `d4c0d88` with WP-26 merged as #81 and its docs as #82; WP-27 … WP-10 merged or in review, WAITING for deploys)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-17 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-17/18, this session: «сливай #81»; «сливай #82»; «Погнали WP-27»; the label fonts «Поставить fonttools» (installed only in a throwaway venv in the session scratchpad; phase-3 notes §Y).

## State at handoff
- `main` = `d4c0d88` (#82 merged: WP-26 `WAITING`). The earlier note "the docs PR waits" is done.
- `wp-27-map-gl` → PR #83, 9 commits `bca55ab` … `af9f702` plus this docs commit; waits for «сливай #83» after green CI (`frontend`, `frontend-e2e`; no backend change).
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (root); e2e from `frontend/` against a hand-started `next start` (see Gotchas).

## Done this session
- **WP-26 / #82** merged on «сливай #81» / «сливай #82».
- **WP-27** (map, MapLibre GL engine): a vertical slice checked on `next start`, then two build waves and an e2e wave of plain subagents (≤ 3 at a time, disjoint files), two review rounds with refuting verifiers (round 1: 6 of 11 confirmed and fixed; round 2: 3 of 3), rule-6 spec corrections, Handoff, AM-80 … AM-86, KI-59, KI-60, KI-43's map part.
  - `make ci-frontend` on `782216a` → clean: app 168 files / 2608 + 1 todo; search 238 + 1 todo, testing 95, ui 121, i18n 112, api-client 14, utils 2.
  - e2e on a `next start` of the `782216a` build, each file alone: 198 passed in 19 files; two map tests needed `192f285` (they waited too little under load), then `map.spec.ts` 17/17 alone.
  - Fix tests shown failing against the broken code by their builders (reported by the builders, not re-run).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #83»** (WP-27) once CI is green; then the after-merge docs PR (`WAITING`, `CLAUDE.md` current state, `current-state.md`).
2. **The production track before WP-27 deploys:** `CSP_TILE_HOSTS=https://tile.openstreetmap.org` on staging and production (else pins on an empty background); build only through `pnpm -r build` (its `prebuild` writes `public/maplibre/<version>/`); later the PMTiles file (KV-INF-021) with its origin in `CSP_TILE_HOSTS`; nginx cache for `/map-fonts/`.
3. **The developer's own `.env.local`** needs `CSP_TILE_HOSTS=https://tile.openstreetmap.org` for the local map (the agent may not edit it).
4. **#83 reviewer questions** (spec Handoff "Open for the reviewer"): uz texts of the three keys, the designed palette, the prefetch zoom, KI-59, KI-60, the non-automated list.
5. **Earlier:** #81's questions (D-5 share fallback; uz «rieltor»/«makler», «ham»; KI-56's direct-load fix; KI-57; legacy departures); #79's questions; #71's area on cards; KI-44 small PR; KI-32 limit; KI-28's rest; #75's 12 s bound.
6. **WP-28** (Leaflet, lasso, spot map) only on the developer's word — DEC-45 expects it right after WP-27, because non-GL devices see «Карта на этом устройстве пока недоступна» until then.

## Gotchas learned this session
- MapLibre 6: the worker must be served from `public/maplibre/<version>/` (Turbopack drops `maplibre-gl-shared.mjs`); its CSS gives the container `position: relative`; a same-origin worker takes its own response's CSP (the proxy sets it); `setStyle(…, { diff: true })` diffs runtime GeoJSON data too.
- Headless Chromium (SwiftShader) passes the WebGL2 caveat probe: GL is the default in e2e; use `?map=leaflet` for the unavailable state; the e2e guard answers OSM tiles with a blank PNG; the e2e server needs `CSP_TILE_HOSTS`.
- A hand-started `next start` for e2e: `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" CSP_TILE_HOSTS=https://tile.openstreetmap.org pnpm exec next start -p 3001`.
- Machine load (another project; load average up to 55) leaves sign-ins at `booting` and slows the first map: rerun a file alone after a minute.
- Next numbers: AM-87, KI-61, ADR 0021.

## Active subagent work at handoff
- None running.
