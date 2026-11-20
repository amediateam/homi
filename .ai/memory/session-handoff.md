---
updated: 2026-11-21 (the landing intake merged as #96 `efa4f9b`; WP-38 in review as PR #97 on `wp-38-catch-up-feed-continuity`; next: WP-39)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19: «По релизам, код до WP-31». 2026-11-20: «задай все свои вопросы по одному и с вариантами ответа»; «Приём, WP-38, WP-39, WP-31 (рекомендую)»; «Следующий по очереди» (the landing intake; answers in `docs/migration/decisions/2026-11-20-landing-answers.md`); «сливай #96».
- 2026-11-21: «Следующий по очереди WP-38».

## State at handoff
- `main` = `efa4f9b` (#96). Branch `wp-38-catch-up-feed-continuity`: `7856eb9` code and tests, `460a7cd` spec as built + baseline rows 13, 14, 16, 37 closed + the landing intake row WAITING, `3f2da7c` review follow-ups (`coversSearch`, the e2e spec on expanded chrome), then this memory; pushed, **PR #97** (open; CI started on push).
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (exit 0 on `460a7cd`: app 220 files, 3 698 tests); after `3f2da7c` `pnpm exec tsc --noEmit -p .` and `pnpm exec eslint` in `frontend/app` clean, the touched suites green.

## Done this session
- **#96 merged** (`efa4f9b`, «сливай #96»); its queue row is WAITING on the WP-38 branch.
- **WP-38 (feed continuity)**, frontend only:
  - the feed epoch as one more pull of the search shown (another search still adopts its server page one);
  - the long return through the visit tracker's `onLongReturn` and `features/feed/fresh.ts`; the fresh pill `FreshPill`;
  - the scroll memory per `FeedScreen` instance and list key (`feedScroll.ts`), the tab bar's arrival decided at the press;
  - the sale switch of a launch listing on close (DEC-65, `saleSwitch.ts`, `leaveListingRoute(number)`, `closeThen`);
  - the radar sheet's body and strip scrolls (DEC-64).
  - Mutation checks (each fails its tests): a global epoch in the key, `window.scrollY` read at the leave, no `feedBelow()`, no once-per-listing latch.
  - One advisor pass before the push. An independent read-only review subagent was started on the diff (see below).

## Waiting for the developer (do NOT start on your own)
1. **CI of #97** (`ci`, `e2e`), the review's findings, then «сливай #97».
2. **Then WP-39**, then **WP-31** (WP-37 any time). WP-62 and WP-61 stay at stage E.
3. **The owners' page** (DEC-97): when WP-61 starts, legacy's page if it is known, else HOMI's own text.
4. **The operator texts** (WP-02 Part A and the addendum) — handed over by the developer, never sent from the connected Gmail.
5. **Production track:** #96 and WP-38 the regular deploy; WP-27/28 need `CSP_TILE_HOSTS`; WP-29, WP-30, #88 … #90, WP-34 … WP-36 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51). WP-38's staging checks: a real six-hour return, and the Q-APP-030 measurement of the four tabs and the map.
6. **Dependabot #5, #57 … #60**: only with the first developer.
7. **Reviewer questions of #97:** the choices listed in the PR body (the epoch in the pull version, the instance key of the memory, the opaque pill, `pin` not covering, the radar sheet's `closest()`).

## Gotchas learned this session
- The local API answered `500` on 2026-11-21: `backend/.env` points the database at a LAN host that was unreachable (`No route to host`). `e2e/feed-continuity.spec.ts` has run only in CI. Not a repo issue; `.env` was not touched.
- A module that keeps `Date.now` as a reference (`deps.now ?? Date.now`) misses a clock installed later (Vitest fake timers, Playwright `page.clock`); read it through `Date` on each call.
- Layout effects run in tree order: the page's (`FeedScreen`) before `ShellBottom`'s (`TabBar`) in the same commit; decide a bar's arrival scroll at the press, not in its effect.
- Collapsed chrome clips the tab bar and the view toggle: an e2e press there must expand first (press the active tab).
- `newCount` lives in `features/nudges/newCount.ts`: importing `returnRules.ts` pulls the radar hooks and, in Vitest, the router.
- Next numbers: AM-102, KI-68, ADR 0021; DEC-98, LND-070, BR-LND-030, LB-LND-020, Q-LND-015, Q-SEO-023, URL-067, DEV-068, F-LANDING-014, BR-APP-122, LB-APP-092, Q-APP-032, TMA-049, F-OWNER-012, baseline row 56; free WP numbers 49, 63–69, 72–79, 90–99.

## Active subagent work at handoff
- One independent read-only review of the WP-38 frontend diff was running at the time of writing. Its findings go into PR #97 before the merge.
