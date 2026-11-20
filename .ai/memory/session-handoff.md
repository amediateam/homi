---
updated: 2026-11-20 (WP-34, the first catch-up package, in review as #92; #91 the owner-cabinet plan merged as `bcc7aa0`; next: WP-35 … WP-38, then WP-31)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19, the order of work: «По релизам, код до WP-31» — intake `index-CBlEKxdL` (#89) → intake `index-CIa0Ldj2` (#90) → the owner-cabinet plan (#91) → the catch-up packages WP-34 … WP-38 → WP-31.
- 2026-11-20: «сливай все» → #91 merged (Dependabot #5, #57 … #60 left: dependency changes need the first developer); then «Дальше по очереди WP-34».

## State at handoff
- `main` = `bcc7aa0` (#91). Open: #92, branch `wp-34-catch-up-feedback-flags-reports`: `08c07e9` code and tests, `68d6ada` review fixes, then the docs and memory commit.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (exit 0 on this branch: app 215 files, 3 501 tests); e2e each spec alone, e.g. `cd frontend && pnpm exec playwright test --project=miniapp app/e2e/listing-actions.spec.ts`.

## Done this session
- **#91 merged** (`bcc7aa0`, merge commit, docs only, no CI run by the path filters).
- **WP-34** (#92): flags at the pin's defaults (DEC-58: `dev010AgentMarkedToast`, `dev014TashkentDates`, `dev016ErrorToastOnFailure`, `dev051RentedUndo` on; `dev016SuccessToastOnDestructive` new, off); `failed({ toast })` (the heart toasts, contacts and the language picker do not; the picker shows a line); `unreportListing` behind «Вернуть» of «Уже сдано»; «Показывать у меня»; the realtor toast by `agent_marked`; the realtor reason only for a phone author; `toast.reportedAgentReview` removed; the toast's touch drag and its offsets by the bottom marks (`lib/ui/shellState.ts`). Baseline rows 4, 21 – 25, 27, 30 marked closed.
  - Checks: `make ci-frontend` → exit 0; app unit 3 501 passed; e2e alone `listing-actions.spec.ts` 20 passed, `feed.spec.ts` 19 passed (cookie and header); mutation checks: contact `toast: false` (4 fail), the toggle and CTA marks (5 fail).
  - Not run green here: `radars.spec.ts` (radars off in this machine's backend env, KI-65); the full suite together meets KI-32. CI runs both.
  - One review subagent: no user-facing bug; two fixes taken (touch cancel, tests of the real marks).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #92»** after green CI (`frontend`, `frontend-e2e`).
2. **Then WP-35** (card, facts, filters and price input; it edits `lib/flags.ts` after WP-34), WP-36, WP-38 (WP-37 any time), then **WP-31**; the cabinet's code (WP-80 …) after WP-32.
3. **The operator texts**: the first request (WP-02 Part A, points 1 … 13) and the addendum (points 14 … 28, `docs/migration/decisions/2026-11-14-operator-request.md`) — handed over by the developer, never sent from the connected Gmail.
4. **Production track:** WP-27/28 need `CSP_TILE_HOSTS=https://tile.openstreetmap.org` before the deploy; WP-29, WP-30, #88, #89, #90 and WP-34 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51); WP-34's checklist inside Telegram on staging. For the cabinet later: PostGIS on the production DB, `TELESCOPE_RECORD_ALL`, the CDN purge of `owner/`, upload limits, a private app–DB link, the backup contradiction of DEC-72 (`16` SEC-REQ-038).
5. **Dependabot #5, #57 … #60**: only with the first developer.
6. **Reviewer questions:** #92's two choices (the bottom marks, the drag frame); #91's integrator defaults, the switch's closed methods, backups vs DEC-72; #90's, #89's, #88's, #83 … #86's; earlier ones in their PRs.

## Gotchas learned this session
- The toast's `animate-rise-in` fills `both` and holds `transform: none`; an inline transform on the same element does nothing, so the drag moves a wrapper.
- Playwright's webServer and `make ci-frontend` both build `frontend/app/.next`: never run them at the same time.
- Locally, specs run together hit the API limiter (KI-32) and sessions stay `booting`; wait a minute and run each spec alone.
- Next numbers: AM-102, KI-67, ADR 0021; ids: DEC-89, DEV-064, RK-40, SCR-064, BR-APP-112, LB-APP-084, TMA-048, API-056, BOT-092, BR-API-198, LB-API-058, Q-APP-031, Q-API-091, Q-BOT-052, Q-DATA-052, Q-SEC-022, F-OWNER-010, F-CONTACT-004, F-FEED-005, F-RADAR-012, ENT-064, SEC-041, SEC-REQ-054, KV-BE-052.

## Active subagent work at handoff
- None running.
