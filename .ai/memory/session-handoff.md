---
updated: 2026-11-19 (WP-27 … WP-30 merged as #83 … #86, all WAITING for deploys; the after-merge docs PR `docs/wp-27-30-after-merge` waits for «сливай»; next: the legacy release intake, then the owner-cabinet plan)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19: «сливай #83»; «сделай все что нужно погнали» — read as «сливай» for #84, #85 and #86, each merged only after its own green CI; it does not cover this docs PR or the next ones.
- 2026-11-19, legacy releases past the pin (`index-BnFvC-Ft`, prod 14 Nov; `index-CBlEKxdL`, prod 17 Nov — «Вид карточек» and the owner cabinet «Сдать квартиру»), the developer's answers: the owner cabinet goes into **Wave 1**, HOMI owners' listings in **native** tables mixed into the feed; legacy gate-mode listings: **relay the contact request to kvadro** through the service key (ask the operator in parallel); **two PRs after #83 … #86** — the release intake first, then the cabinet plan; owner phone stored **in plain text** with the listing, as legacy (so Q-SEC-021 gates real owners); **post-moderation**; the cabinet's behaviour fixes on by decision; a legacy listing with a hidden number shown with a neutral note until the relay works; the owner sees the seeker's Telegram name, kept and deleted with the response; «Проверенный хозяин» by HOMI's own check; price estimate from own medians over kvadro's cards (and ask the operator); city and district from own PostGIS boundaries (PostGIS on the production DB: production track); an edit of a published listing visible at once, the last button «Готово»; «Вид карточек»: both styles in Wave 1, «Новый» from the legacy mock-ups, no «Новое» pill.

## State at handoff
- `main` = `a818440` (#86's merge; #83 `4e35154`, #84 `0ab4417`, #85 `ee5f7cd`). Open: the after-merge docs PR (`docs/wp-27-30-after-merge`). No package branch is open; `wp-27-map-gl`, `wp-28-map-leaflet-lasso`, `wp-29-saved` and `wp-30-radars` are deleted.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- The intake drafts (A: release deltas and 12 parity fixes in built code; B/C: the cabinet audit, owner and seeker side; D: the cabinet plan, 10 new packages; the answers) were written in the session scratchpad only — not in the repository. Their proposed ids collide (B and C) and must be renumbered from the last ids: DEC-56, SCR-047, BR-APP-073, LB-APP-050, TMA-045, DEV-052, Q-APP-026, Q-API-066, RK-32, `API-035`.
- Verify: `make ci-frontend` (root); e2e from `frontend/` against a hand-started `next start`, each file alone.

## Done this session
- **#83 … #86 merged** with merge commits, each remote branch deleted:
  - #83 on `94a414d`: `frontend` 44196889825, `frontend-e2e` 44196889879 (198 passed).
  - #84 retargeted to `main` (`gh pr edit 84 --base main`; the base change starts no run, and the merge tree equals the tree its CI checked): `frontend` 44254527108, `frontend-e2e` 44254527223 (237); `main` after it: `frontend` 44410445948 green.
  - #85 after `main` merged in (`e3b24f3`, docs conflicts only): `frontend` 44410780522, `frontend-e2e` 44410780607 (247).
  - #86 after `main` merged in (`f47019b`; docs and code conflicts kept both sides; WP-29's two screen tests now mock the radar subscribe flow): `make ci-frontend` → exit 0 (app 215 files / 3461 + 1 todo); CI on it failed one e2e case (`feed-radar.spec.ts`, header mode: the reload restored the scroll and loaded page two), fixed in `4abd8d0` (scroll to the top first; locally 6 of 6, the file 10 passed); `frontend` 44459187188, `frontend-e2e` 44459187243 (350 passed; `@radars-off` 14 passed) on `4abd8d0`.
- The after-merge docs PR: the four `WAITING` rows and statuses, phase-3 "Merged" lines §Y … §AB, `CLAUDE.md` and `current-state.md` for WP-27 … WP-30, this file.

## Waiting for the developer (do NOT start on your own)
1. **«сливай»** for the after-merge docs PR (`docs/wp-27-30-after-merge`).
2. **Production track:** WP-27/28 need `CSP_TILE_HOSTS=https://tile.openstreetmap.org` in the app's environment before the deploy (later the PMTiles file and an nginx cache rule for `/map-fonts/`); WP-29 and WP-30 only the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51), so the radar tab shows "soon" until WP-57. Then the checks inside Telegram on staging (WP-28: one low-end Android in lite mode).
3. **The release-intake PR** (re-pin to `index-CBlEKxdL`, audit, specs, fixtures, the legacy catalogue re-import), then **the cabinet-plan PR** (DECs, the new packages, `24`/`25` edits, the operator request text handed to the developer — never sent from the connected Gmail), then a small parity-fix package — each its own branch and PR from `main`, merged on its own «сливай».
4. **Reviewer questions:** #83's, #84's, #85's, #86's (their PRs and the WP-30 Handoff).
5. **Earlier:** #81's and #79's questions; #71's area on cards; KI-44 small PR; KI-32 limit; KI-28's rest; #75's 12 s bound.
6. **WP-31** (settings and nudges) only on the developer's word.

## Gotchas learned this session
- Changing a PR's base does not start its `pull_request` workflows; compare `git rev-parse <merge>^{tree}` with the tree CI checked instead of re-running.
- `frontend.yml` cancels a running `main` run on the next push (`cancel-in-progress`): watch the last merge's run.
- A text-clean merge can still break: after merging `main` into a package branch run `make ci-frontend` (here WP-29's tests reached WP-30's Server Actions through `FeedEmpty` → `FewResultsNote` → `next/root-params`).
- `page.reload()` restores the scroll: a spec that counts cards after a reload scrolls to the top first.
- Local e2e with parallel workers hits `throttle:api` (`429` on `/me`, KI-32): `--workers=1` and a minute's pause.
- zsh does not split `$VAR` into words: loop over `git diff --name-only` with `while IFS= read -r f`.
- Next numbers: AM-100, KI-67, ADR 0021.

## Active subagent work at handoff
- None running.
