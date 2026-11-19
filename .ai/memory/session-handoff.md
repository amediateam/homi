---
updated: 2026-11-19 (the intake of legacy release `index-CBlEKxdL` is in review as #89; a third release, `index-CIa0Ldj2`, waits for its intake; #87 and #88 merged)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-18 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-19, the owner cabinet of `index-CBlEKxdL` (answers not yet in the repository; the owner-cabinet plan records them as `DEC` rows from DEC-58): the cabinet goes into **Wave 1**, HOMI owners' listings in **native** tables mixed into the feed; legacy gate-mode listings: **relay the contact request to kvadro** through the service key (ask the operator in parallel); owner phone stored **in plain text** with the listing, as legacy (so Q-SEC-021 gates real owners); **post-moderation**; the cabinet's behaviour fixes on by decision; a legacy listing with a hidden number shown with a neutral note until the relay works; the owner sees the seeker's Telegram name, kept and deleted with the response; «Проверенный хозяин» by HOMI's own check; price estimate from own medians over kvadro's cards (and ask the operator); city and district from own PostGIS boundaries (PostGIS on the production DB: production track); an edit of a published listing visible at once, the last button «Готово».
- 2026-11-19, the order of work: «Разбить по релизам», then, after the third release appeared, «По релизам, код до WP-31» (`docs/migration/decisions/2026-11-19-developer-answers.md`): intake `index-CBlEKxdL` → intake `index-CIa0Ldj2` → the owner-cabinet plan → the catch-up packages → WP-31.

## State at handoff
- `main` = `eb36036` (#88). Open: #89, branch `feat/intake-index-CBlEKxdL`: `371c553` (catalogue), `f725147` (audit, registers, moved line references), `edf01cc` (pin, specifications, queue), `60e5fff` (review fixes), then this memory commit.
- The legacy checkout is one release past the new pin: r37, source at r33 = `index-CIa0Ldj2.js` (read 2026-11-19 15:57 +0500, `svn status` clean).
- Drafts outside the repository, in this machine's Claude project folder (`intake-drafts/2026-11-19/` beside the session transcripts): D (the cabinet plan, 10 packages) and the developer's answers; E, F1, F2 (the third release: 62 items, each mapped to built HOMI); the id map of this intake. A, B and C are consumed by #89.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `python3 -I scripts/migration/collect_ids.py --check` (2 405 ids), `python3 -I scripts/migration/task_graph.py --check`, `make ci-frontend`.

## Done this session
- **#87 merged** (`83fef19`) and **#88 merged** (`eb36036`, intake of `index-BnFvC-Ft`) after green CI on `f318405` (`backend` 44487499748, `frontend` 44487499658, `frontend-e2e` 44487499785: 350 passed and the `@radars-off` run 14 passed); `main` after it: `backend` 44491608203 and `frontend` 44491607150 green.
- **The third release analysed, read-only**: 97 points against `main`: 35 already the same, 37 differences in built code (about 2 000 lines, none large), 6 contract changes (one new route, 41 pairs), 8 specification-only, 3 not applicable, 4 decisions. Five `DEV` flags (010 wording, 014, 016 error half, 017, 051) are legacy behaviour now.
- **Intake of `index-CBlEKxdL` (#89)**: the catalogue re-imported (563 names; today's locale files with the next release's diffs reverse-applied are byte-identical to the copy used; `make ci-frontend` on `371c553` → exit 0, app 215 files / 3461 + 1 todo, i18n 114); 141 new audit ids (SCR-049 … 062, BR-APP-075 … 103, LB-APP-054 … 078, API-037 … 054, BR-API-159 … 189, BOT-086 … 091 and others) written by three subagents over one id map and checked by two reviewers (1 214 cross-references read against their targets: none wrong; ten small findings fixed in `60e5fff`); 988 line references moved; `collect_ids.py --check` → exit 0, 2 405 ids; `build_open_questions.py` → 267 questions; `task_graph.py --check` → exit 0; all 497 rule rows of `07` and the 312 id-carrying references of `09` point at the defining line.

## Waiting for the developer (do NOT start on your own)
1. **«сливай #89».**
2. **The intake of `index-CIa0Ldj2`** (next queue row): before it, ask the developer its questions one at a time with options — a daily limit on opening listings (`429`), the `paused` gate, the `?radar=` link, «Площадь» for rent, the five `DEV` flags, the radar sheet under a listing, feed memory against Next's three kept routes, the sale switch under a launch listing, the session mark against SEC-REQ-007, the daily-rent title against D-SH-3. The PR: audit, pin (source r33), catalogue (587 keys), the contract on stubs, specifications, and the catch-up packages with their rows.
3. **The owner-cabinet plan**, then **the catch-up packages** (also the 11 open rows of `baseline.md`, "Built code behind the pin"), then **WP-31**. The operator request text is handed to the developer, never sent from the connected Gmail.
4. **Production track:** WP-27/28 need `CSP_TILE_HOSTS=https://tile.openstreetmap.org` before the deploy; WP-29, WP-30 and #88 the regular deploy; `RADAR_CREATION_ENABLED` stays unset (DEC-51).
5. **Reviewer questions:** #89's, #88's, #83 … #86's; earlier: #81's and #79's, #71's area on cards, KI-44, KI-32, KI-28's rest, #75's 12 s bound.

## Gotchas learned this session
- The legacy checkout moves almost daily (five releases in eight days). Read a release when it appears, record `svn info`, and copy the locale files outside the tree at once: after the next sync the old state is readable only by reverse-applying the next release's `delta/units` diffs.
- The guard hook refuses a command that names a legacy path beside `patch` or a `>`: copy the inputs to the scratchpad (`cp` is allowed) and work there.
- Rows inserted into `02` … `08` move the lines that `07`, `09`, `features.csv`, `20` and the task files cite (about 1 000 references). Move only the tokens `main` already had, once (the move is not idempotent), and resolve new placeholders after the move: nine of 31 resolved before it were moved again.
- `collect_ids.py` takes a heading, a bold list item or the first cell of a table row as the definition of an id: outside its owning document never start a row with an audit id.
- Draft ids and final ids overlap after renumbering: check every cross-reference of copied text by the target's title, not by the script.
- `gh pr merge --delete-branch` switches the local checkout to `main` when the merged branch is checked out.
- Next numbers: AM-101, KI-67, ADR 0021; ids: DEC-58, DEV-053, RK-34, SCR-063, BR-APP-104, LB-APP-079, TMA-047, API-055, BOT-092, BR-API-190, LB-API-057, Q-APP-029, Q-API-079, Q-BOT-050.

## Active subagent work at handoff
- None running.
