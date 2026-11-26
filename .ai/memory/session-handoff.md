---
updated: 2026-11-26 (WP-40 merged as #124 a987ecd, env keys #125 d650cac; two development sessions since DEC-109: WP-41 here, WP-62 for the second)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-23 (verbatim in earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6; no new dependencies, staging or production without the first developer; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!».
- 2026-11-26: «Продолжим где остоновились ?»; on WP-40 «Беру я, начинаю сейчас»; on the lock «Отдельный PR, как #117 (Рекомендуется)»; «продолжай по плану»; «тебе самом сложно проверить .env делай сам не срашивай» (check env values with `php artisan config:show <key>`); «сливай #124 и #125 после зелёного CI»; on the second session «да, обнови промпт под WP-62» and «Может сюда перенесем …/homi.uz/docs эту …/homi-new-developer-prompt.md». DEC-104 … DEC-109 (`docs/migration/decisions/2026-11-26-developer-answers.md`).

## State at handoff
- `main` = `60d30dc` (#126, the last save) plus the PR of `docs/second-developer-prompt`; #124 `a987ecd`, #125 `d650cac`, #123 `cabee17`. `git ls-remote --heads origin` → `main`, `chore/php-8.6`, five Dependabot heads. No worktree besides the main checkout.
- **WP-40 is WAITING** for the production track (spec "Needs from the production track": three migrations, the env keys of #125, `TRUSTED_PROXIES` = the addresses the Next servers reach the API from, the `show timezone` check, `TELESCOPE_RECORD_ALL` off, the scheduler; then the checks inside Telegram).
- **Two development sessions (DEC-109).** This one: **WP-41** next (legacy driver core, reference data and cities; `docs/migration/wave-1/WP-41-legacy-driver.md`), branch `feat/wp-41-legacy-driver` from `origin/main`, then the rest of stage C's backend in queue order (WP-44 after WP-41: same backend files). **The second session: WP-62** (frontend only), started from `docs/handoff/second-developer-prompt.md`; it does not edit this file and numbers from AM-150, KI-90, DEC-150 up. Read its state from its PR and the "Handoff" of its specification (`gh pr list`).
- Verify: from `backend/` `php artisan test --compact` (1 362 tests, 1 350 passed, 12 skipped) **and** the same suite on PostgreSQL as CI runs it: `DB_CONNECTION=pgsql DB_DATABASE=homi_test DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD= php artisan test --compact` (1 362 passed); `DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD= make test-pgsql` (12); `make ci-frontend`; `HOMI_E2E_API_PORT=8090 scripts/dev/e2e-local.sh` (927).

## Done this session
- `git pull --ff-only` 792afbd → f428d15; nothing new from the colleague on GitHub since #122 (`gh pr list`, `gh run list`, repo events).
- #123: the developer's `composer update` (25 bumps, Laravel 13.44.1, Guzzle 8.6.0), `make ci-backend` exit 0, review clean, merged `cabee17`.
- WP-33 Handoff item: five runs in a row of `scripts/dev/e2e-local.sh` on `main` `cabee17` → 927 passed ×5 (recorded in #124).
- The second developer's prompt moved from outside the repository (`~/Documents`, Russian) into `docs/handoff/second-developer-prompt.md` (English), WP-62 instead of the stale WP-33 part 4 → WP-40; DEC-109 recorded.
- WP-40 in five stages, each implemented, checked by an independent reviewer and fixed; whole-package security review (STRIDE, no high) and spec-compliance review; final narrow rounds clean (reviews reported by subagents, not re-run). Local: the counts above; e2e 927 + `@radars-off` 20 on `f958082`. CI of `cca81c2` green (e2e on attempt 2, KI-63). Merged #124 and #125.

## Waiting for the developer (do NOT start on your own)
1. **The click on the permission prompt of `gh pr merge`** for every merge.
2. **One real `initData` of the dev bot** checked with `php <scratchpad>/wp40/check-initdata.php <file>` (pass/fail only; the script is not in the repo — rewrite it from WP-40's "As built" if the scratchpad is gone). Until then the `signature` rule is pinned by an independent Python fixture only.
3. **Production track:** WP-40's needs (above); the WAITING rows of the queue; the deploy carries #117, #119, #123.
4. **Forwarding the prompt** `docs/handoff/second-developer-prompt.md` to the second developer (no mail from the agent).
5. **CLAUDE.md** still says tests run on SQLite and has no WP-40 sentence: a shared-file PR (proposed, not opened).
6. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.

## Gotchas learned this session
- CI's backend job runs the Feature suite on **PostgreSQL** (`backend.yml` `ci:check` sets `DB_CONNECTION=pgsql`): a test with an expected-to-fail statement needs a savepoint (`DB::transaction`), and the local run on SQLite does not show it (AM-113).
- The local PostgreSQL is on Asia/Tashkent; the `pgsql` connection now sets UTC (AM-114). The env file's DB host has no `homi_test`: use `DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD=`.
- `composer openapi:export` needs a migrated database: `DB_CONNECTION=pgsql DB_DATABASE=homi_test DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD= php artisan migrate:fresh --force` first, so the developer's dev database is not migrated by a branch.
- Reading `backend/.env` is refused (the permission layer denied even `grep -o '^[A-Z_]*='`, which the hook itself allows) and the hook refuses creating one in a worktree: a worktree has no env file (tests need `APP_KEY=…` in the environment). Read values with `php artisan config:show`.
- `SortedMiddleware` reorders only middleware in the priority list; WP-40 anchors its chain after `Authorize` (`bootstrap/app.php`).
- zsh does not split `$FILES`: stage with `git status --short | awk '{print $2}' | xargs git add --`.
- Next numbers of this session: AM-115, KI-72, ADR 0021, DEC-110 (the second session: AM-150, KI-90, DEC-150 up).

## Active subagent work at handoff
- None running.
