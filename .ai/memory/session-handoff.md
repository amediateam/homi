---
updated: 2026-11-21 (WP-38 merged as #97 `a0a618d`; the queue now runs without waiting for a word; tooling on `chore/pipeline-speed`; next: WP-39)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-20 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; «По релизам, код до WP-31»; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21: «Следующий по очереди WP-38»; «сливай #97».
- 2026-11-21, **new — replaces "the next package only on the developer's word" and "merge only on «сливай #N»"**: «Настрой все граомтно! Чтобы ускорилас разработка без потери качеста»; asked whether the agent may work one package ahead: «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!». It is rule 8 of `docs/migration/wave-1/README.md`.

## State at handoff
- `main` = `a0a618d` (#97). Branch `chore/pipeline-speed` (from `main`): the commit of this handoff, pushed, PR open against `main`. It changes scripts, docs and memory only, so no workflow runs on it.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `scripts/dev/e2e-local.sh app/e2e/smoke.spec.ts app/e2e/session.spec.ts` (9 passed, 25 s, with the shared local API answering `500`); `python3 scripts/audit/session_audit.py --hours 24`.

## Done this session
- **#97 merged** (`a0a618d`); the WP-38 queue row is WAITING on this branch.
- **`/doctor`** health check: findings reported, nothing applied (the developer declined the cleanup and the auto permission mode).
- **Audit of the 24 hours to 2026-11-21 03:15 local** (`session_audit.py`, run on that window; one uncued subagent read the raw numbers and ranked the causes the same way): of 23 h of HOMI session time the model and the tools took 5:38, waiting for the developer 8:55, for CI 4:11, for subagents 1:59, for local background commands 1:54. Seven PRs merged (#91 … #97); 11 e2e runs of about 21 min, 4 failed. Request latency did not grow with context size (median 6–7 s) and no API error was recorded.
- **Tooling for the pipeline** (this branch): `scripts/dev/e2e-local.sh`; `scripts/audit/session_audit.py`; rule 8 of the queue README; rows in `docs/infrastructure/local-development.md`; the way around KI-32.

## Waiting for the developer (do NOT start on your own)
1. **Nothing blocks the queue** (rule 8): WP-39, then WP-31 (WP-37 any time) are taken without a word, on stacked branches. WP-62 and WP-61 stay at stage E.
2. **The click on the permission prompt of `gh pr merge`** (an `ask` rule of the shared `.claude/settings.json`); nothing goes around it.
3. **An explicit yes is still needed for:** e2e shards in CI (the repository is private on the free plan: more billed Actions minutes); taking `gh pr merge` out of `ask` (shared file, the first developer reviews); the `/doctor` cleanup.
4. **The owners' page** (DEC-97); **the operator texts** (WP-02 Part A and the addendum), never sent from the connected Gmail.
5. **Production track:** #96, WP-38 and the earlier WAITING rows — the regular deploy; WP-27/28 need `CSP_TILE_HOSTS`; `RADAR_CREATION_ENABLED` stays unset (DEC-51). WP-38's staging checks: a real six-hour return, the Q-APP-030 measurement.
6. **Dependabot #5, #57 … #60**: only with the first developer.

## Gotchas learned this session
- A push to a PR that touches `frontend/**` re-runs the whole e2e job (about 21 min) even when the push holds only docs: the path filter looks at the PR, not at the push. Put CI run ids into the PR description.
- The shared local API answers `500` when the database host of `backend/.env` is unreachable; `scripts/dev/e2e-local.sh` does not need it. Port 3001 must be free for it (`make dev-stop`).
- The guard hook denies a whole Bash call that pipes `grep -o '^[A-Z_]*=' backend/.env` into another command: run that grep alone, or not at all.
- `gh pr merge` waits for the developer's click (13 s … 11 min on 2026-11-20): keep it off the critical path, work on the stack meanwhile.
- A subagent launch and a background `gh` watch return at once; their cost is the idle time after them. Start the review with the CI run.
- Next numbers: AM-102, KI-68, ADR 0021; DEC-98, LND-070, BR-LND-030, LB-LND-020, Q-LND-015, Q-SEO-023, URL-067, DEV-068, F-LANDING-014, BR-APP-122, LB-APP-092, Q-APP-032, TMA-049, F-OWNER-012, baseline row 56; free WP numbers 49, 63–69, 72–79, 90–99.

## Active subagent work at handoff
- None running.
