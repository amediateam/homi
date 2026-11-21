---
updated: 2026-11-21 (#102 WP-37, #104 WP-80, #105, #103 WP-32 and #106 merged; WP-81 in progress on wp-81-owner-form, no PR yet)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-20 (verbatim in the earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6 (fix the spec in the same PR); no new dependencies, staging or production without the first developer; «Удали черновик gmail это не та почта который нужно использовать»; «По релизам, код до WP-31»; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!». DEC-98: «Внутри текущей e2e (Рекомендуется)».
- 2026-11-21, CI refused jobs over the account's billing; the developer: «Я исправлю оплату (Рекомендуется)», then «я исправил github actions».

## State at handoff
- `main` = `1c549c9`: #102 WP-37 (`820ff97`), #104 WP-80 (`984c9e8`), #105 owner env keys (`e70b6c6`), #103 WP-32 (`78722b8`), #106 CLAUDE.md (`1c549c9`).
- **WP-81** on `wp-81-owner-form` (pushed as a backup, **no PR yet**; `main` merged in): WIP 1–8 done and committed — the owner dictionary (`import-legacy.mjs --owner`, 207 keys) with the `homi` overrides (six brand keys, the limit texts with `{max}`), the routes and shell, `tg.requestContact`, the owner actions and `/bff` reads with `ApiFailure.detail`, the store, `normalize`, the off-redirect, `closeOwnerForm`, `OwnerNewRoute`, `OwnerFormLayer`, the route files of both trees, the questionnaire with its rules and autosave, the photos with the XHR transport `POST /bff/owner/listings/{id}/photos` and `CSP_PRIVATE_MEDIA_HOSTS`.
- **WP-81 left:** step 9 (the picker on both engines, `useSwipeBack` `edgeOnly`), 10 (demand, usual price), 11 (phone step, poll, rejection), 12 (mode, preview, publish, done, celebration), 13 (launch links, `LaunchRedirector`, the three events), 14 (component tests left, Playwright specs, `@owner-off` in `playwright.config.ts` and the workflow), 15 (checklist, queue row, spec "As built"). Step-1 notes for the PR body: the scratchpad file `wp81-step1.md` (lost with the scratchpad: redo from the spec's "Steps" 1).
- Not ours, untouched: `backend/composer.lock` modified in the working tree (never stage it); worktree `.claude/worktrees/deps-update`.
- Verify: `make ci-frontend` (exit 0, app 4 147 tests on `65b8faf`).

## Done this session
- **WP-80 (#104):** three review rounds; CI's 40 e2e failures came from the eight native stub entries splitting the map's four stacks of eleven — they now stand two at each address (`10000008` at its owner listing's point); `listing-open` takes a legacy card. CI 437 + 14.
- **WP-32 (#103):** twelve review rounds; the scrubber was rebuilt around a stated boundary (canonical form: percent and string escapes, at most three passes; a token, the cookie or launch data → the whole text `[redacted]`; numbers and e-mail in place, else redacted) with a table test of every secret form × every place; the `@analytics` replay case uses the stub scenario `replay` (`me/replay.json`). CI 450 + 14 + 4.
- **#105** owner env keys; **#106** `CLAUDE.md` state after WP-31, WP-37, WP-32, WP-80 (fact-checked).

## Waiting for the developer (do NOT start on your own)
1. **Nothing blocks the queue** (rule 8): finish WP-81, then WP-82, WP-83, WP-33.
2. **The click on the permission prompt of `gh pr merge`** for every merge (an `ask` rule of the shared `.claude/settings.json`).
3. **KI-70:** PHP 8.6.0 on the developer machine has no `redis` extension — `pecl install redis` or PHP 8.5 back; until then `vendor/bin/pest` with the env overrides of KI-70.
4. **Local `.env`:** `OWNER_CABINET_ENABLED=true` (the line was handed to the developer; the agent may not read the file).
5. **An explicit yes is still needed for:** e2e shards in CI; taking `gh pr merge` out of `ask`; the `/doctor` cleanup.
6. **Production track:** the WAITING rows (WP-31, WP-32, WP-37, WP-80 …): the regular deploy; `OWNER_CABINET_ENABLED` stays unset on the servers (DEC-81); WP-81 will need `CSP_PRIVATE_MEDIA_HOSTS`.
7. **Dependabot #5, #57 … #60**: only with the first developer.

## Gotchas learned this session
- Never `git add backend` or `-A`: the developer's `backend/composer.lock` rode into a commit once; stage named paths and check `git show --stat HEAD | grep composer.lock`.
- A backend fixture change can break e2e far away (the map's stacks): run `scripts/dev/e2e-local.sh` on the touched screens before pushing.
- Regex patches to a scrubber do not converge; state the boundary, judge on a canonical form, fail closed, and test secrets × places in one table.
- An e2e that patches `/bff/session` does not reach the server render after sign-in (it reads `/me` server to server): use a stub scenario cookie (`homi_stub_scenario`) instead.
- `gh pr merge` right after a push can answer «Base branch was modified»: retry with the current `headRefOid`.
- The React Compiler lint refuses a ref passed into a `useState` initialiser and a synchronous `setState` in an effect: hand callbacks to a controller from an effect (`setHandlers`), set state inside the frame.
- Next numbers: AM-102, KI-71, ADR 0021, DEC-99.

## Active subagent work at handoff
- None running.
