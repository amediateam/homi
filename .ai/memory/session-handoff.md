---
updated: 2026-11-19 (four PRs open: #83 WP-27, #84 WP-28 stacked on it, #85 WP-29 and #86 WP-30, the last two cut from `main` = `d4c0d88`; WP-26 … WP-10 merged and WAITING for deploys)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-17 (verbatim in the earlier handoffs and `docs/migration/decisions/2026-11-14-developer-answers.md`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; each PR merged on its own «сливай #N».
- 2026-11-17/18: «сливай #81»; «сливай #82»; «Погнали WP-27»; «Поставить fonttools» (a throwaway venv only); «Следующий пакет — WP-28» (#84 stacked on #83); «Следующий пакет — WP-29» (#85 from `main`); «Следующий пакет — WP-30» (#86 from `main`; it depends on WP-25 and WP-26 only).
- 2026-11-19: «192.168.0.14:5432 рвёт соединения, потому что свет отклбчили локальный база не доступен» — the local database host was down (power cut).

## State at handoff
- `main` = `d4c0d88`. Open, each waiting for its own «сливай»: #83 (WP-27), #84 (WP-28, base `wp-27-map-gl`: after #83 merges, `gh pr edit 84 --base main`, its CI), #85 (WP-29), #86 (WP-30, `wp-30-radars`: `7c573de` … `0eafcf8` plus the docs commit).
- Docs overlap of the four: `docs/migration/wave-1/README.md` rows, `docs/ai/reports/phase-3-notes.md` (§Y #83, §Z #84, §AA #85, §AB #86), `known-issues.md` (KI-59 … KI-63 on #83/#84, KI-64 … KI-66 on #86), `frontend/app/README.md` rows, this file. Whichever lands later merges `main` in (no rebase) and keeps every row and section in order.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`. `frontend/app/public/maplibre/` (WP-27's prebuild output) sits in the session scratchpad.
- Verify: `make ci-frontend` (root); e2e from `frontend/` against a hand-started `next start` (Gotchas), each file alone.

## Done this session
- **WP-30 / #86** (radars): four builder stages, one e2e stage, three review lenses with refuting verifiers, one fix round; spec rule-6 corrections (AM-96 … AM-99) and Handoff, phase-3 notes §AB, KI-64 … KI-66, app README rows.
  - `make ci-frontend` on `0eafcf8` → exit 0: app 181 files / 2833 + 1 todo, search 241 + 1 todo, testing 95, ui 138, i18n 112, api-client 14, utils 2.
  - e2e before the fixes (stage writers, each file at least twice): every default file green; `radars-soon` 14 on a radars-off app. After the fixes, on the `0eafcf8` build: `radars.spec.ts` 31 passed (its 7 former `fixme` included), back 11, boot-failure 6, city 6; then the local DB host went down and the run stopped. The full suite is CI's (its own SQLite).
- WP-29 / #85 earlier in this session (see its PR).

## Waiting for the developer (do NOT start on your own)
1. **«сливай #83»** → retarget #84 → **«сливай #84»**; **«сливай #85»**; **«сливай #86»** — docs merge by hand (above). Then one after-merge docs PR: the `WAITING` rows, `CLAUDE.md` current state, `current-state.md`, the phase-3 merged lines.
2. **Production track:** WP-27/28 need `CSP_TILE_HOSTS` before deploy; WP-29 and WP-30 only the regular deploy. `RADAR_CREATION_ENABLED` stays unset (DEC-51): the radar tab shows its "soon" state until WP-57.
3. **The developer's own env:** `.env.local` needs `CSP_TILE_HOSTS` for WP-27/28; the backend env has radars off on this machine (KI-65; `RADAR_CREATION_ENABLED=true` to see radars locally).
4. **Reviewer questions:** #83's, #84's, #85's (their PRs); #86's in the WP-30 Handoff (new key texts, the sheet header, the shared `useResource` and `Switch` changes, the nudge "hide" reading, the `TabBar` other-tab rule, the untested bot links, the size and the optional split of steps 14–16).
5. **Earlier:** #81's and #79's questions; #71's area on cards; KI-44 small PR; KI-32 limit; KI-28's rest; #75's 12 s bound.
6. **WP-31** (settings and nudges) only on the developer's word.

## Gotchas learned this session
- Never `SendMessage` an agent that runs inside a workflow: it resumes a second copy, and both write the same files.
- A background `php -S` is stopped by the harness after a while (exit 124): start it detached, `(cd backend/public && nohup php -S … &)`; use `PHP_CLI_SERVER_WORKERS=6` when several Playwright runs share it. The process env overrides `backend/.env` (`RADAR_CREATION_ENABLED=true php -S …`).
- A cached read before any request data in a page that also has a sheet beside it logs "Unexpected cache miss after cache warming" in `next build`; read the cookie first (WP-30 `readRadarTab`).
- macOS is case-insensitive: `followNudge.ts` hides `FollowNudge.tsx` (TS1149); rules modules are `*Rules.ts`.
- Parallel Playwright runs clear each other's `test-results/`: pass `--output=<own folder>`.
- A route of `/bff/radars` must answer the API envelope (`{ success: true, data: [], meta }`); a bare `[]` reads as a failure.
- Next numbers: AM-100, KI-67, ADR 0021.

## Active subagent work at handoff
- None running.
