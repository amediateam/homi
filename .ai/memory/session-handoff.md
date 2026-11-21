---
updated: 2026-11-21 (WP-81 #107 through three review rounds; merges into main on green CI; WP-82 next on a branch stacked on it)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-20 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; «По релизам, код до WP-31»; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!». DEC-98: «Внутри текущей e2e (Рекомендуется)». DEC-99 (WP-81's size): «Один PR, отклонение записать (Рекомендуется)».
- 2026-11-21: «продолжай по плану».

## State at handoff
- `main` = `1c549c9` (#102 WP-37, #104 WP-80, #105, #103 WP-32, #106 CLAUDE.md).
- **WP-81** = PR #107 (`wp-81-owner-form`), the whole package (DEC-99: one PR, about 8 000 lines). Three independent review rounds: round 1 (data/security: 1 high, 3 medium; UI/flow: 6 medium), round 2 (2 medium), round 3 (nothing at medium or above); every finding fixed or recorded in the PR body. Merge on green CI.
- **WP-82** next, on a branch stacked on WP-81 (seams in its PR: `SettingsScreen` has only a comment for the owner slot; the row `count` is to be checked in `SettingsParts.tsx`; `stats.daily` is typed `string[]` by Scramble — fix at the resource).
- Not ours, untouched: `backend/composer.lock` modified in the working tree (never stage it); worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (exit 0, app 4 194 tests on `0503c5d`); `scripts/dev/e2e-local.sh app/e2e/owner-form.spec.ts app/e2e/shell.spec.ts app/e2e/radar-subscribe.spec.ts app/e2e/gates.spec.ts app/e2e/launch.spec.ts` → 60 passed; `E2E_RADARS_OFF=1 scripts/dev/e2e-local.sh app/e2e/owner-off.spec.ts` → 2 passed.

## Done this session
- **WP-80 (#104)**, **WP-32 (#103)**, **#105**, **#106** merged (details in the earlier handoff, git history and the PR bodies).
- **WP-81 (#107)**: the owner form — the `--owner` dictionary import (207 keys), routes and shell, `tg.requestContact`, the owner actions and `/bff` reads with `ApiFailure.detail`, the questionnaire with its autosave controller, photos over XHR (`/bff/owner/listings/{id}/photos`, `CSP_PRIVATE_MEDIA_HOSTS`), the place picker on both engines, demand and usual price, the phone step and poll, mode, publish, done and the celebration, the launch links, the three events, `@owner-off`. Verified as in *State at handoff*; the full local e2e before the reviews: 452 passed + 2 fixed (`owner=owners` is a search filter: only `owner=new` is a launch parameter).

## Waiting for the developer (do NOT start on your own)
1. **Nothing blocks the queue** (rule 8): WP-82, WP-83, WP-33.
2. **The click on the permission prompt of `gh pr merge`** for every merge (an `ask` rule of the shared `.claude/settings.json`).
3. **KI-70:** PHP 8.6.0 on the developer machine has no `redis` extension — `pecl install redis` or PHP 8.5 back; until then `vendor/bin/pest` with the env overrides of KI-70.
4. **Local `.env`:** `OWNER_CABINET_ENABLED=true` (the line was handed to the developer; the agent may not read the file).
5. **An explicit yes is still needed for:** e2e shards in CI; taking `gh pr merge` out of `ask`; the `/doctor` cleanup.
6. **Production track:** the WAITING rows (WP-31, WP-32, WP-37, WP-80, WP-81 …): the regular deploy; `OWNER_CABINET_ENABLED` stays unset on the servers (DEC-81); WP-81 needs `CSP_PRIVATE_MEDIA_HOSTS`.
7. **Dependabot #5, #57 … #60**: only with the first developer.

## Gotchas learned this session
- Never `git add backend` or `-A`: stage named paths and check `git show --stat HEAD | grep composer.lock`.
- A backend fixture change can break e2e far away (the map's stacks); a new launch parameter can strip a search filter of the same name (`owner=owners`): run the whole local e2e before pushing a package.
- An effect cleanup that closes a controller kept in `useState` must reopen it in the setup: StrictMode and `<Activity>` run cleanup and setup again on the same instance.
- After an await, check `currentAddress()` before navigating: Back may have closed the layer meanwhile.
- Wait on the gates' own rules (`needsLanguage`, `needsCity`), never on `me`'s flags: with one city the city page never shows and `city_chosen` never changes.
- The React Compiler lint refuses a ref passed into a `useState` initialiser and a synchronous `setState` in an effect: hand callbacks to a controller from an effect (`setHandlers`).
- Next numbers: AM-102, KI-71, ADR 0021, DEC-100.

## Active subagent work at handoff
- None running.
