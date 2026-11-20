---
updated: 2026-11-20 (WP-34 merged as #92 `5949365`; WP-35, the second catch-up package, in review as #93; next: WP-36, WP-38 (WP-37 any time), then WP-31)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19, the order of work: «По релизам, код до WP-31» — intake `index-CBlEKxdL` (#89) → intake `index-CIa0Ldj2` (#90) → the owner-cabinet plan (#91) → the catch-up packages WP-34 … WP-38 → WP-31.
- 2026-11-20: «Дальше по очереди WP-34»; «Продолжим по плану»; «сливай #92».

## State at handoff
- `main` = `5949365` (#92). Open: #93, branch `wp-35-catch-up-card-filters-price`: `61fd4bf` code and tests, `93cdf16` review fixes, then the docs and memory commit.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (exit 0 on `61fd4bf`; app 216 files, 3 553 tests after `93cdf16`); e2e each spec alone, e.g. `cd frontend && pnpm exec playwright test --project=miniapp app/e2e/feed.spec.ts`.

## Done this session
- **#92 merged** on «сливай #92» (`5949365`, merge commit, CI green on `25133c4`); WP-34 is WAITING (spec and queue row say so in #93).
- **WP-35** (#93): the card's and the radar strip's age from `posted.at` (`minuteClock.ts`, `CardAge.tsx`); the floor words; the badge kinds and the compact shield (`ShieldCheck` in `@homi/ui`); `Photo` resets on a new `src`; the daily-rent mini title (DEC-66); area for every deal (DEC-62), pets for long-term rent only (`dev017PetsLongRentOnly`, on, DEC-58), rooms «до N»; the `$` of the dollar field and the сум field without grouping; the tab tint and the disabled primary button. Baseline rows 1, 2, 11, 12, 20, 26, 31, 32, 38 – 42 marked closed; the parity notes in WP-22 … WP-27, WP-30 and WP-33 say "WP-35 closed it".
  - Review subagent of `61fd4bf`: the floor word was cut off in its tile, the tab tint no longer faded — both fixed in `93cdf16` (the value wraps, hyphenated; `color 0.2s`).
  - Checks: `pnpm test` → every project green (app 216 files, 3 553 tests); `pnpm -r lint`, `pnpm -r typecheck` exit 0; `make ci-frontend` exit 0; e2e alone `feed` 23, `listing-open` 18, `filters` 22, `map` 18, `shell` 16 passed (cookie and header); four mutation checks fail their new tests.
  - Not run green here: `radars.spec.ts` (radars off here, KI-65); its two new cases run in CI.

## Waiting for the developer (do NOT start on your own)
1. **CI of #93**, then **«сливай #93»**.
2. **Then WP-36** (listing states, gates and the Telegram shell; depends on WP-35), WP-38 (WP-37 any time), then **WP-31**; the cabinet's code (WP-80 …) after WP-32.
3. **The operator texts**: the first request (WP-02 Part A, points 1 … 13) and the addendum (points 14 … 28, `docs/migration/decisions/2026-11-14-operator-request.md`) — handed over by the developer, never sent from the connected Gmail.
4. **Production track:** WP-27/28 need `CSP_TILE_HOSTS=https://tile.openstreetmap.org` before the deploy; WP-29, WP-30, #88, #89, #90, WP-34 and WP-35 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51); the checklists of WP-34 and WP-35 inside Telegram on staging. For the cabinet later: PostGIS on the production DB, `TELESCOPE_RECORD_ALL`, the CDN purge of `owner/`, upload limits, a private app–DB link, the backup contradiction of DEC-72.
5. **Dependabot #5, #57 … #60**: only with the first developer.
6. **Reviewer questions:** #93's choices (the clock's snapshot read from the device clock, the badge's legacy kind as `tone`, the tint in `styles/shell.css`, the key-fact values wrapping in equal columns); #92's (the bottom marks, the drag frame); earlier ones in their PRs.

## Gotchas learned this session
- `useSyncExternalStore` reads the snapshot before it subscribes: a store whose snapshot only an interval refreshes shows a stale value to the first render and to readers that never subscribe; read the source (the clock) in the snapshot.
- `data-tone` is the market chip's attribute in the card tests and specs; a second element with it (the badge) broke `querySelector("[data-tone]")` — the badge writes `data-badge-tone`.
- `filtersSummary` puts «Посуточно» right after the place, not at the end.
- `Bash` blocks a leading `sleep`; between e2e specs (KI-32) the next spec's build takes long enough.
- Playwright's `page.clock.install({ time })` before the launch lets time flow from there; `fastForward` fires the 15 s check once.
- Next numbers: AM-102, KI-67, ADR 0021; ids: DEC-89, DEV-064, RK-40, SCR-064, BR-APP-112, LB-APP-084, TMA-048, API-056, BOT-092, BR-API-198, LB-API-058, Q-APP-031, Q-API-091, Q-BOT-052, Q-DATA-052, Q-SEC-022, F-OWNER-010, F-CONTACT-004, F-FEED-005, F-RADAR-012, ENT-064, SEC-041, SEC-REQ-054, KV-BE-052.

## Active subagent work at handoff
- None running.
