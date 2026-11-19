---
updated: 2026-11-20 (the owner-cabinet plan in review as #91 — DEC-69 … DEC-81, WP-80 … WP-89; #90 merged; next: the catch-up packages WP-34 … WP-38, then WP-31)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19, the order of work: «По релизам, код до WP-31» — intake `index-CBlEKxdL` (#89) → intake `index-CIa0Ldj2` (#90) → the owner-cabinet plan (#91) → the catch-up packages WP-34 … WP-38 → WP-31.
- 2026-11-19/20, the owner cabinet: fourteen answers = DEC-69 … DEC-81 and the confirmation of DEC-65 (verbatim in `docs/migration/decisions/2026-11-19-developer-answers.md`, "Answers for the owner-cabinet plan"). 2026-11-20: «Город ленты, как в legacy (Recommended)» (DEC-65); «Да, выключатель (Recommended)» (DEC-81, `OWNER_CABINET_ENABLED`). Then «Продолжим по плану».

## State at handoff
- `main` = `13ebc52` (#90). Open: #91, branch `feat/owner-cabinet-plan`: `a6723e5` decisions/24/25/queue/operator addendum, `7e839e9` 09/06/07/08/16/tasks, `0cad0b3` the ten specifications and edits of merged ones, `688162f` review fixes, `9cf5c94` verification fixes, then this memory commit. Docs only.
- Drafts outside the repository (this machine's Claude project folder, `intake-drafts/2026-11-19/`): `ID-MAP-cabinet.md` (the map of #91), the verbatim cabinet answers; the review reports and `fix-decisions.md` (D1 … D12) are in the session scratchpad only.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `python3 -I scripts/migration/collect_ids.py --check` (2 510 ids), `python3 -I scripts/migration/task_graph.py --check` (157 features, 156 covered), `build_open_questions.py` (284).

## Done this session
- **#90 merged** (`13ebc52`) after green CI on `181d09b`; the post-merge `backend` (44591114076) and `frontend` (44591114107) runs on `main` passed.
- **Two questions** (DEC-65 city confirmed; DEC-81 the switch).
- **The owner-cabinet plan (#91)**: one map (an integrator subagent), five writers on disjoint files, three reviews (consistency 36, references 24, security 33 findings; 8 blockers), three fixers with the main session's cross-file decisions, a verification pass (all blockers fixed; 15 small leftovers fixed). Checks on `9cf5c94`: `collect_ids.py --check` → exit 0, 2 510 ids; `task_graph.py --check` → exit 0; 284 questions; `features.csv` 157 rows × 19; registers 63/77/167 unchanged; 1 195 id-carrying line references valid; all 60 specifications in the template. No `backend/` or `frontend/` file changed, so `composer ci:check` and `make ci-frontend` were not run.

## Waiting for the developer (do NOT start on your own)
1. **«сливай #91»** (docs only: no CI workflow runs on it, the workflows filter on `backend/**`, `frontend/**`, `.ai/hooks/**`).
2. **#91's questions** (its description, "For the reviewer to decide"): the plan's reading of DEC-81 (the group shows «Мои объявления» to an owner with listings); a realtor waitlist; DEV-060's reading (a new request after no answer, not after a decline); a 48 h release of an unhandled hold; "few" for small demand counts; silent acceptance instead of `request_closed`; «Это риелтор» on native bot cards; the consent text for the lawyer; the 32 integrator defaults.
3. **The operator texts**: the first request (WP-02 Part A, points 1 … 13) and the addendum of #91 (points 14 … 28, `decisions/2026-11-14-operator-request.md`) — handed over by the developer, never sent from the connected Gmail.
4. **Then WP-34 … WP-38** in order (WP-37 any time), then **WP-31**; the cabinet's code (WP-80 …) comes after WP-32.
5. **Production track:** WP-27/28 need `CSP_TILE_HOSTS=https://tile.openstreetmap.org` before the deploy; WP-29, WP-30, #88, #89 and #90 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51). For the cabinet later (in the packages' "Needs"): PostGIS on the production DB, `TELESCOPE_RECORD_ALL`, the CDN purge of `owner/`, upload limits, a private app–DB link, the backup contradiction of DEC-72 (`16` SEC-REQ-038).
6. **Reviewer questions:** #91's, #90's, #89's, #88's, #83 … #86's; earlier: #81's and #79's, #71's area on cards, KI-44, KI-32, KI-28's rest, #75's 12 s bound.

## Gotchas learned this session
- `collect_ids.py --check` and `task_graph.py --check` still rewrite `data/ids.csv`, `data/tasks.csv` and `13`; writers running them mid-edit must `git checkout --` those files, and the integrator regenerates them once at the end.
- KV task ids are defined only by their roadmap row (`11`/`11a`), not by the task file's `#` heading; the number range follows the milestone (KV-BE-001 … 099 = M0 … M3).
- Parallel fixers need the shared names fixed by the main session up front (photo path, hold reasons, events, env keys); otherwise they ask each other and drift.
- The verbatim text of past AskUserQuestion answers can be recovered from the session transcript (`toolUseResult.answers`).
- Next numbers: AM-102, KI-67, ADR 0021; ids: DEC-82, DEV-063, RK-40, SCR-064, BR-APP-112, LB-APP-084, TMA-048, API-056, BOT-092, BR-API-198, LB-API-058, Q-APP-031, Q-API-091, Q-BOT-052, Q-DATA-052, Q-SEC-022, F-OWNER-010, F-CONTACT-004, F-FEED-005, F-RADAR-012, ENT-064, SEC-041, SEC-REQ-054, KV-BE-052; work packages: the next free numbers of a stage (WP-14 …, WP-39, WP-49) or after WP-89.

## Active subagent work at handoff
- None running.
