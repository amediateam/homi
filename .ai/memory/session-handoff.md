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
- `main` = `c180b0b`: #98 the pipeline tooling (`41cf7ea`), #99 the KI-63 spec fix (`53a4959`) and #100 WP-39 (`c180b0b`, CI green on `dc6b97b`: 402 + 14), all merged 2026-11-21.
- **#101** `wp-31-settings` → `main` (WP-31): two independent reviews, their findings fixed; CI green on `e3ab1b3`; the head `198b931` (second review fixes) waits for its CI. Merge it at its head once green, without `--delete-branch`, then retarget #102 to `main`.
- **#102** `wp-37-catch-up-map` → `wp-31-settings` (WP-37, stacked): every step done and tested; its review runs next.
- Not ours, untouched: `backend/composer.lock` modified in the working tree; worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend`; `scripts/dev/e2e-local.sh app/e2e/settings.spec.ts app/e2e/settings-language.spec.ts app/e2e/settings-hidden.spec.ts app/e2e/home-nudge.spec.ts`.

## Done this session
- **#97 merged** (`a0a618d`). **`/doctor`**: findings reported, nothing applied (declined). **Audit of the 24 hours to 2026-11-21 03:15 local** (`scripts/audit/session_audit.py`): of 23 h of HOMI session time the model and the tools took 5:38, waiting for the developer 8:55, for CI 4:11.
- **#98 pipeline tooling:** `scripts/dev/e2e-local.sh` (the CI job's API on a developer machine: `php -S`, SQLite, array cache, `CI=1`); `scripts/audit/session_audit.py`; rule 8; one independent review, its findings fixed in `b671c67`.
- **#99 KI-63, the `foundation.spec.ts` case:** the cause is KI-54's remount of the filters form when the profile's city arrives (two copies for the length of the exit); the check takes the copy that stays. Not reproduced locally (40 + 30 repeats passed).
- **#100 WP-39 (motion):** every step of its specification, rows 44 – 54 of `baseline.md` closed; the specification's "As built" lists the points decided in code.
- **WP-31 (settings), #101:** the tab, the eight sub-pages, «О приложении» and the home-screen offer; checked in the browser first that a locale switch renders in place. Two reviews fixed (`e3ab1b3`, `198b931`). `make ci-frontend` exit 0 (app 3 852); the settings, map and nudge specs 45 passed locally. KI-68.
- **WP-37 (map catch-up), #102:** the cut note, the view's error boundary, the camera memory per engine and search. The e2e camera case leaves the map through four routes so Next drops its route; with the memory off it fails (checked).

## Waiting for the developer (do NOT start on your own)
1. **Nothing blocks the queue** (rule 8): after WP-37 the next row of the queue that is `TODO`, on stacked branches. WP-62 and WP-61 stay at stage E.
2. **The click on the permission prompt of `gh pr merge`** for #101, then #102 (an `ask` rule of the shared `.claude/settings.json`); nothing goes around it. Merge a stacked PR without `--delete-branch`, retarget the next one to `main`, then delete the branch (rule 8; #99 was closed once by a deleted base).
3a. **`CLAUDE.md`** still says the settings tab renders the WP-20 placeholder: a small shared-file PR once WP-31 is merged.
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
- Next keeps up to three routes mounted (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`): an e2e case that must prove a fresh mount goes through four other routes and checks that a DOM mark is gone.
- The React Compiler lint knows a ref only by a name ending in `Ref`: a ref passed in an input object as `memory` is "a value that cannot be modified".
- `open(p,'w').write(open(p).read())` empties the file (the write truncates first): it emptied `useMapInstance.ts` once; `git checkout --` restored it.
- Deleting a merged branch closes the PRs whose base it is; GitHub does not retarget them. Retarget first (`gh pr edit N --base main`).
- A layout effect cleanup also runs when a route is hidden under `<Activity>`: state that must not outlive a hidden screen (a save phase, a heart's last tap) resets there.
- `scripts/dev/e2e-local.sh` needs port 3001 free and gives a spec's result in under a minute; the shared local API (`backend/.env`'s database) was unreachable all session and was not needed.
- Next numbers: AM-102, KI-68, ADR 0021; DEC-98, LND-070, BR-LND-030, LB-LND-020, Q-LND-015, Q-SEO-023, URL-067, DEV-068, F-LANDING-014, BR-APP-122, LB-APP-092, Q-APP-032, TMA-049, F-OWNER-012, baseline row 56; free WP numbers 49, 63–69, 72–79, 90–99.

## Active subagent work at handoff
- None running (the review of the WP-39 diff has finished; its findings are fixed or listed in the PR).
