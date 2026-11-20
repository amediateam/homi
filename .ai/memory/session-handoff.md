---
updated: 2026-11-20 (WP-35 merged as #93 `989d041`; WP-36, the third catch-up package, in review as #94; next: WP-38 (WP-37 any time), then WP-31)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19, the order of work: «По релизам, код до WP-31» — intake `index-CBlEKxdL` (#89) → intake `index-CIa0Ldj2` (#90) → the owner-cabinet plan (#91) → the catch-up packages WP-34 … WP-38 → WP-31.
- 2026-11-20: «Дальше по очереди WP-34»; «Продолжим по плану»; «сливай #92»; «Продолжим» (WP-36); «запустил nginx» (the developer started nginx by hand for the e2e runs).

## State at handoff
- `main` = `989d041` (#93). Open: #94, branch `wp-36-catch-up-listing-gates-shell`: `006cb5a` code and tests, `5ef3961` review fixes, `c9ecd02` docs and memory, `028a144` the leave after a slid-back swipe and the animations read in the browser, then the final docs commit.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`. Ignored Playwright output in `frontend/test-results/` and `frontend/playwright-report/`.
- Verify: `make ci-frontend` (exit 0 on `028a144`, app 217 files, 3 629 tests); e2e each spec alone, e.g. `pnpm exec playwright test --project=miniapp app/e2e/listing-open.spec.ts` (nginx must be up: `sudo nginx`, by hand).

## Done this session
- **WP-36** (#94): the "gone" and day-limit states (`ApiError.reason`, `ApiFailure.reason: "daily"`); one close of the listing layer (`ListingLayer`'s `close`, `takeOverBack`, the leave by insets, the overlay copy's entrance); `FallbackClose`; the mini chrome under a listing over the feed; `paused`; `s_seo_en` / `s_seo_uz`; the launch mark in `sessionStorage`; `tg` in `app_launch`; `body.subpage-open`; the spot map's boxes `isolate`. Baseline rows 5, 6, 8, 9, 10, 15, 17, 18, 19, 28, 29 closed; the parity notes of WP-21 … WP-28 and WP-33 say "WP-36 closed it"; WP-35's row is WAITING.
  - Row 10 checked on Leaflet with red tiles: the panes (z-index 400) covered the controls and the mini map covered the fullscreen map; `isolate` fixes it; the e2e case fails without it (checked).
  - Review subagent of `006cb5a`: the direct-load «Скрыть» regression, the leave's transform moving the CTA bar, the depth-0 leave flash, the slow-replace settle, the i18n tables — fixed in `5ef3961`. Running the tests also showed `cn` kept both animation classes; fixed. The swipe's own jump is KI-67.
  - Checks: `make ci-frontend` exit 0 on `028a144`; e2e on `028a144`: `listing-open` 21 (with `listing-in` / `listing-out` read in the browser), `shell` 19, `listing-actions` 22, `spot-map` 14, `back` 11; `pnpm -r lint`, `pnpm -r typecheck` exit 0; six mutation checks fail their tests; e2e on `5ef3961`: `listing-open` 21, `listing-actions` 22, `spot-map` 14, `shell` 19, `back` 11, `saved` 10, `gates` 11, `launch` 6, `photo-viewer` 6, `map` 18 passed; 12 more specs green on `006cb5a` (WP-36 Handoff lists them).
  - Not green here: `foundation` (its radar case), `feed-radar`, `follow-nudge`, `return-nudge` need radars on (KI-65); `radar-forms`, `radar-subscribe`, `radars` not run.

## Waiting for the developer (do NOT start on your own)
1. **CI of #94**, then **«сливай #94»**.
2. **Then WP-38** (feed continuity; depends on WP-36's close path and launch module), WP-37 any time, then **WP-31**; the cabinet's code (WP-80 …) after WP-32.
3. **The operator texts** (WP-02 Part A and the addendum, `docs/migration/decisions/2026-11-14-operator-request.md`) — handed over by the developer, never sent from the connected Gmail.
4. **Production track:** WP-27/28 need `CSP_TILE_HOSTS=https://tile.openstreetmap.org` before the deploy; WP-29, WP-30, #88, #89, #90, WP-34, WP-35 and WP-36 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51); the checklists of WP-34 … WP-36 inside Telegram on staging (WP-36: a reload inside one launch, a client on Leaflet).
5. **Dependabot #5, #57 … #60**: only with the first developer.
6. **Reviewer questions of #94:** `isolate` instead of legacy's z-index 1000; the leave by insets (layout per frame for 200 ms, none in lite); `closeListing` without a leave on a directly loaded listing; the layer taking no taps while it leaves (legacy).

## Gotchas learned this session
- `position: fixed` creates a stacking context, `relative` without a z-index does not: Leaflet's pane z-indices escape a `relative` box up to the nearest fixed layer. Leaflet's OSM tiles render translucent here, so a "hide it and compare pixels" check passes even when covered; read the stacking chain.
- `getByRole` no longer finds an element once it is `visibility: hidden`: keep an `elementHandle()` across such a toggle.
- `cn` (tailwind-merge) does not drop `animate-listing-in` when `animate-listing-out` is added; never rely on it for custom animation utilities.
- A transform on a layer that scrolls itself moves its `fixed` children by the scroll offset; animate insets instead.
- `sessionStorage` survives `vi.resetModules()`: clear it in `afterEach` of tests that touch the launch mark. A new Playwright page has a fresh `sessionStorage`.
- One `next build` per e2e batch: `next start -p 3001` with `API_URL`, `CSP_TILE_HOSTS`, `NODE_EXTRA_CA_CERTS=$(mkcert -CAROOT)/rootCA.pem`; Playwright reuses the server (`reuseExistingServer`); a 40 s pause between specs kept the stub user under its limit (KI-32).
- The local build has no `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (the inlined value is empty): bot-link e2e cases take their no-bot branch.
- Next numbers: AM-102, KI-68, ADR 0021; ids unchanged from the last handoff (DEC-89, DEV-064, RK-40, SCR-064, BR-APP-112, …).

## Active subagent work at handoff
- None running.
