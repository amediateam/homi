---
updated: 2026-11-18 (three PRs open: #83 WP-27 on `wp-27-map-gl`, #84 WP-28 stacked on it, #85 WP-29 on `wp-29-saved` from `main` = `d4c0d88`; WP-26 … WP-10 merged and WAITING for deploys)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-17 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-17/18: «сливай #81»; «сливай #82»; «Погнали WP-27»; «Поставить fonttools» (a throwaway venv only); «Следующий пакет — WP-28» (given while #83 was open, so #84 is stacked on it); «Следующий пакет — WP-29» (it depends only on WP-26, so #85 is cut from `main`).

## State at handoff
- `main` = `d4c0d88`. Open, each waiting for its own «сливай»:
  - #83 = WP-27 (`wp-27-map-gl`, CI green on `94a414d`);
  - #84 = WP-28 (`wp-28-map-leaflet-lasso`, base `wp-27-map-gl`, CI green on `9e9587e`): after #83 merges, `gh pr edit 84 --base main`, its CI, then «сливай #84»;
  - #85 = WP-29 (`wp-29-saved` from `d4c0d88`): code `fcba4ca` plus the docs commit.
- Docs overlap between the three: `docs/migration/wave-1/README.md` rows, `docs/ai/reports/phase-3-notes.md` (§Y on #83, §Z on #84, §AA on #85), this file, `known-issues.md` (KI-59 … KI-63 live on #83/#84 only). Whichever lands later merges `main` in (no rebase) and resolves by keeping every row and section in letter order.
- `frontend/app/public/maplibre/` is WP-27's prebuild output (ignored there, untracked on `main`): moved to the session scratchpad, not deleted; WP-27's `prebuild` writes it again.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (root); e2e from `frontend/` against a hand-started `next start` (see Gotchas), each file alone.

## Done this session
- **WP-29 / #85** (favourites and history): built, reviewed, fixed in `fcba4ca`; spec rule-6 corrections (AM-94, AM-95) and Handoff; phase-3 notes §AA; the app README row.
  - `make ci-frontend` on `fcba4ca` passed: app 157 files / 2405 + 1 todo, search 238 + 1 todo, testing 95, ui 121, i18n 111, api-client 14, utils 2.
  - e2e on a `next start` of the `fcba4ca` build, each of 19 files alone: 190 passed.
  - Mutation checks of the four review fixes run by the orchestrator: each new test fails on the unfixed code.
- Earlier in the session: WP-27 / #83 and WP-28 / #84 opened with green CI (their PR bodies and §Y/§Z hold the details).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #83»**, then retarget #84 to `main`, its CI, **«сливай #84»**; **«сливай #85»** in any order with them (docs merge by hand, above). Then one after-merge docs PR: `WAITING` rows, `CLAUDE.md` current state, `current-state.md`, the phase-3 merged lines.
2. **The production track before WP-27/28 deploy:** `CSP_TILE_HOSTS=https://tile.openstreetmap.org` on staging and production; build only through `pnpm -r build`; later the PMTiles file (KV-INF-021) with its origin in `CSP_TILE_HOSTS` (missing tiles as 204, KI-62); nginx cache for `/map-fonts/`. WP-29 needs only the regular deploy. Staging checklists inside Telegram: iOS, Android (one lite device), Desktop, Web.
3. **The developer's own `.env.local`** needs `CSP_TILE_HOSTS=https://tile.openstreetmap.org` for WP-27/28 (the agent may not edit it).
4. **Reviewer questions:** #83's (uz texts, the palette, the prefetch zoom, KI-59, KI-60); #84's (lite animations on Leaflet, the dark raster filter, the spot circle colour, no spinner on the fullscreen spot map, a spot-map GL failure moving the session, KI-61, KI-62); #85's (a silent failed clear with DEV-016 off, LB-APP-027; a pull after a clear on stubs; every entry of a saved page reads anew, unlike the feed).
5. **Earlier:** #81's questions; #79's; #71's area on cards; KI-44 small PR; KI-32 limit; KI-28's rest; #75's 12 s bound.
6. **WP-30** (radars) only on the developer's word.

## Gotchas learned this session
- Under `partialPrefetching` the cookie and headers resolve in the runtime shell stage: a random value or time drawn right after them aborts the runtime prefetch and logs an error. `await io()` first (as `serverApi` and `readSaved` do).
- Next keeps up to three routes under `<Activity>`: entering a preserved page again keeps its client state, and a new server render's props arrive into the old state. Re-create on purpose (WP-29's `renderId`).
- A native `disabled` on the focused button drops the keyboard focus to the body in Chromium; use `aria-disabled` plus a guard while a request runs.
- The machine's data volume is nearly full (about 5 GiB free on 2026-11-18); `next build` and Playwright still ran.
- `pnpm -r test` once failed with `ENOENT` on `node_modules/.vitest-cache` (parallel packages sharing the cache); rerun.
- A hand-started `next start` for e2e: `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" pnpm exec next start -p 3001` (WP-27/28 branches also need `CSP_TILE_HOSTS=https://tile.openstreetmap.org`).
- Next numbers: AM-96, KI-64, ADR 0021.

## Active subagent work at handoff
- None running.
