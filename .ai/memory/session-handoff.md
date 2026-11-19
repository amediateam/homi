---
updated: 2026-11-19 (the intake of legacy release `index-CIa0Ldj2` in review as #90; #87, #88 and #89 merged; next: the owner-cabinet plan, then the catch-up packages WP-34 … WP-38, then WP-31)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19, the owner cabinet of `index-CBlEKxdL` (not yet in the repository; the owner-cabinet plan records them as `DEC` rows from DEC-69): the cabinet goes into **Wave 1**, HOMI owners' listings in **native** tables mixed into the feed; legacy gate-mode listings: **relay the contact request to kvadro** through the service key (ask the operator in parallel); owner phone stored **in plain text** with the listing (Q-SEC-021 gates real owners); **post-moderation**; the cabinet's behaviour fixes on by decision; a legacy listing with a hidden number shown with a neutral note until the relay works; the owner sees the seeker's Telegram name, kept and deleted with the response; «Проверенный хозяин» by HOMI's own check; price estimate from own medians over kvadro's cards (and ask the operator); city and district from own PostGIS boundaries (PostGIS on the production DB: production track); an edit of a published listing visible at once, the last button «Готово».
- 2026-11-19, the order of work: «По релизам, код до WP-31» — intake `index-CBlEKxdL` (#89, merged) → intake `index-CIa0Ldj2` (#90) → the owner-cabinet plan → the catch-up packages WP-34 … WP-38 → WP-31.
- 2026-11-19, eleven answers on `index-CIa0Ldj2` = DEC-58 … DEC-68 (decisions file); then «да, начинай приём index-CIa0Ldj2».

## State at handoff
- `main` = `eb82663` (#89). Open: #90, branch `feat/intake-index-CIa0Ldj2`: `69f4354` catalogue, `fdb2082` contract on stubs, `0156909` audit, `4fab9ca` decisions/specs/catch-up/pin, `0c0dcef` and `97e8155` review fixes, then this memory commit.
- The legacy checkout holds the pinned release (r37, source r33; `svn status` clean at 20:58 +0500).
- Drafts outside the repository (this machine's Claude project folder, `intake-drafts/2026-11-19/`): D (the cabinet plan, 10 packages; renumber from DEC-69 and WP-39; its ids are pre-#89 draft ids, translate with `ID-MAP-CBlEKxdL.md` §1.11) and the cabinet answers; the maps of #89 and #90.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `python3 -I scripts/migration/collect_ids.py --check` (2 456 ids), `task_graph.py --check`, `make ci-frontend`, `cd backend && composer ci:check`.

## Done this session
- **#89 merged** (`eb82663`) after green CI on `a339099` (`frontend` 44527296867; `frontend-e2e` 44527296911, attempt 2: 350 + 14; attempt 1 failed on the KI-63 flake).
- **Eleven questions** on `index-CIa0Ldj2` asked one at a time; answers recorded as DEC-58 … DEC-68.
- **Intake of `index-CIa0Ldj2` (#90)**: catalogue (581 names); contract on stubs (`composer ci:check` → exit 0, Pest 794 / 790 passed + 4 skipped; `make ci-frontend` → exit 0, app 3462 + 1 todo); 51 new audit ids; DEC-58 … DEC-68, DEV-053, F-FEED-004, F-RADAR-011; specifications; WP-34 … WP-38 (about 2 290 lines); two reviews (about 35 legacy claims checked, all agree; 13 + 27 findings fixed); `collect_ids.py --check` → exit 0; 279 questions; 1 139 line references valid.

## Waiting for the developer (do NOT start on your own)
1. **«сливай #90».**
2. **Confirm DEC-65's city**: the option said "the listing's city"; recorded is the feed's own city, as legacy does.
3. **The owner-cabinet plan** (next queue row), then **WP-34 … WP-38** in order (WP-37 any time), then **WP-31**. The operator request text (daily cap per service key, area for rent, map cap, the cabinet questions) is handed to the developer, never sent from the connected Gmail.
4. **Production track:** WP-27/28 need `CSP_TILE_HOSTS=https://tile.openstreetmap.org` before the deploy; WP-29, WP-30, #88, #89 and #90 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51).
5. **Reviewer questions:** #90's (its description), #89's, #88's, #83 … #86's; earlier: #81's and #79's, #71's area on cards, KI-44, KI-32, KI-28's rest, #75's 12 s bound.

## Gotchas learned this session
- A contract change on stubs can break the Mini App's build through the generated types (`ReportResult` required `agent_marked`): run `pnpm --filter app typecheck` after `pnpm types:generate`, and stage the regenerated files before `composer ci:check` (its last step diffs them).
- The remap of line references (`intake-drafts/2026-11-19/tools/remap_refs.py`) follows an id into a replaced block; run it with `BASE=HEAD` after edits that move lines once the main remap is done. Then fill placeholders from `ids.csv` and check `07`, `09` and `features.csv` (`repoint.py`).
- Four writers over one map invent names and counts independently: a consistency review (decisions × specifications, flags, row numbers, queue) finds more than a cross-reference review.
- The commit trailer is now `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Next numbers: AM-102, KI-67, ADR 0021; ids: DEC-69, DEV-054, RK-34, SCR-064, BR-APP-112, LB-APP-084, TMA-048, API-056, BOT-092, BR-API-198, LB-API-058, Q-APP-031, Q-API-087, Q-BOT-052, Q-SEC-022, F-FEED-005, F-RADAR-012; work packages from WP-39.

## Active subagent work at handoff
- None running.
