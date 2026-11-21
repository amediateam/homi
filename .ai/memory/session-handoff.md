---
updated: 2026-11-21 (WP-38 merged as #97; the queue runs without waiting for a word; three PRs open on stacked branches: #98, #99, #100 (WP-39); next: WP-31)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-20 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; «По релизам, код до WP-31»; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21: «Следующий по очереди WP-38»; «сливай #97».
- 2026-11-21, **in force — replaces "the next package only on the developer's word" and "merge only on «сливай #N»"**: «Настрой все граомтно! Чтобы ускорилас разработка без потери качеста»; asked whether the agent may work one package ahead: «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!». It is rule 8 of `docs/migration/wave-1/README.md`.

## State at handoff
- `main` = `a0a618d` (#97). Three open PRs, each branch from the one before it, to be merged in this order:
  1. **#98** `chore/pipeline-speed` → `main`: the local e2e runner, the session audit script, rule 8. No workflow runs on it.
  2. **#99** `fix/ki-63-foundation-reload-locator` → `chore/pipeline-speed`: the reload check of `foundation.spec.ts`.
  3. **#100** `wp-39-catch-up-motion` → `fix/ki-63-foundation-reload-locator`: WP-39. GitHub moves a PR's base to `main` when the branch below it is merged and deleted.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend`; `scripts/dev/e2e-local.sh app/e2e/motion.spec.ts` (10 passed); the checks and CI run ids are in each PR's description.

## Done this session
- **#97 merged** (`a0a618d`). **`/doctor`**: findings reported, nothing applied (declined). **Audit of the 24 hours to 2026-11-21 03:15 local** (`scripts/audit/session_audit.py`): of 23 h of HOMI session time the model and the tools took 5:38, waiting for the developer 8:55, for CI 4:11.
- **#98 pipeline tooling:** `scripts/dev/e2e-local.sh` (the CI job's API on a developer machine: `php -S`, SQLite, array cache, `CI=1`); `scripts/audit/session_audit.py`; rule 8; one independent review, its findings fixed in `b671c67`.
- **#99 KI-63, the `foundation.spec.ts` case:** the cause is KI-54's remount of the filters form when the profile's city arrives (two copies for the length of the exit); the check takes the copy that stays. Not reproduced locally (40 + 30 repeats passed).
- **#100 WP-39 (motion):** every step of its specification, rows 44 – 54 of `baseline.md` closed; the specification's "As built" lists the points decided in code.

## Waiting for the developer (do NOT start on your own)
1. **Nothing blocks the queue** (rule 8): after WP-39 comes **WP-31** (settings; about 2 800 lines), then WP-37 (any time), on stacked branches. WP-62 and WP-61 stay at stage E.
2. **The click on the permission prompt of `gh pr merge`** for #98, #99, #100, in that order (an `ask` rule of the shared `.claude/settings.json`); nothing goes around it.
3. **An explicit yes is still needed for:** e2e shards in CI (private repository on the free plan: more billed Actions minutes); taking `gh pr merge` out of `ask` (shared file, the first developer reviews); the `/doctor` cleanup.
4. **The owners' page** (DEC-97); **the operator texts** (WP-02 Part A and the addendum), never sent from the connected Gmail.
5. **Production track:** #96, WP-38, WP-39 and the earlier WAITING rows — the regular deploy; WP-27/28 need `CSP_TILE_HOSTS`; `RADAR_CREATION_ENABLED` stays unset (DEC-51). Staging checks inside Telegram: WP-38 (a six-hour return, Q-APP-030) and WP-39's acceptance checklist.
6. **Dependabot #5, #57 … #60**: only with the first developer.

## Gotchas learned this session
- A layout effect of a child runs before the ref of its parent element is attached: a hook inside a component that needs the parent's node reads it through one of its own elements (`closest`), or uses a passive effect.
- Next keeps a hidden route in the document: a portalled sheet stays in `body` with `display: none`, its layout effects cleaned up. "Gone" is "removed or no longer shown".
- Two siblings with the same React key (a keyed icon and a keyed burst) leave the old element in the document; a test that counts the elements finds it.
- jsdom rewrites `calc()` in inline styles: compare through a probe element's style, not with the literal.
- A push to a PR that touches `frontend/**` re-runs the whole e2e job (about 21 min) even for docs: CI run ids go into the PR description (`gh pr edit`).
- The guard hook denies a whole Bash call that pipes `grep -o '^[A-Z_]*=' backend/.env` into another command.
- `scripts/dev/e2e-local.sh` needs port 3001 free and gives a spec's result in under a minute; the shared local API (`backend/.env`'s database) was unreachable all session and was not needed.
- Next numbers: AM-102, KI-68, ADR 0021; DEC-98, LND-070, BR-LND-030, LB-LND-020, Q-LND-015, Q-SEO-023, URL-067, DEV-068, F-LANDING-014, BR-APP-122, LB-APP-092, Q-APP-032, TMA-049, F-OWNER-012, baseline row 56; free WP numbers 49, 63–69, 72–79, 90–99.

## Active subagent work at handoff
- None running (the review of the WP-39 diff has finished; its findings are fixed or listed in the PR).
