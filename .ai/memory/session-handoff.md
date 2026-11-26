---
updated: 2026-11-26 (WP-41 legacy driver core in review on `feat/wp-41-legacy-driver`, env keys on `chore/wp-41-env-keys`; DEC-109: a second development session takes WP-62)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-23 (verbatim in earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6; no new dependencies, staging or production without the first developer; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!».
- 2026-11-26: «Продолжим где остоновились ?»; on WP-40 «Беру я, начинаю сейчас»; «продолжай по плану»; «тебе самом сложно проверить .env делай сам не срашивай» (check env values with `php artisan config:show <key>`); «сливай #124 и #125 после зелёного CI»; on the second session «да, обнови промпт под WP-62» and «Может сюда перенесем …/homi.uz/docs эту …/homi-new-developer-prompt.md»; «сливай #127 после ревью»; «продолжай по плану WP-41». DEC-104 … DEC-109 (`docs/migration/decisions/2026-11-26-developer-answers.md`).

## State at handoff
- `main` = `a93359d` (#127, DEC-109 and `docs/handoff/second-developer-prompt.md`). Open: the WP-41 PR (`feat/wp-41-legacy-driver`) and its env PR (`chore/wp-41-env-keys`, worktree `.worktrees/wp41-env` — remove it after the merge).
- **Two development sessions (DEC-109).** This one: WP-41, then the rest of stage C's backend in queue order — **WP-42** next (listings through legacy; depends on WP-41), WP-44 after it (both backend). **The second session: WP-62** (frontend only), from `docs/handoff/second-developer-prompt.md`; it does not edit this file, merges `main` into its branch, and numbers as `parallel-work.md` §5 says. Read its state from its PR and the "Handoff" of its specification (`gh pr list`).
- **WP-41 waits for the production track after its merge:** the key from the operator (WP-02), the env keys on staging, `legacy:ping` (spec "Handoff"). No flag changes.
- Verify: from `backend/` `php artisan test --compact` (1 546 tests, 1 534 passed, 12 skipped) **and** on PostgreSQL as CI runs it: `DB_CONNECTION=pgsql DB_DATABASE=homi_test DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD= php artisan test --compact` (1 546 passed); `vendor/bin/phpstan analyse` (0 errors); `composer openapi:check` after `migrate:fresh` on `homi_test` (no change).

## Done this session
- #127 merged `a93359d`: the second developer's prompt moved into the repository (English), DEC-109; `~/Documents/homi-new-developer-prompt.md` deleted (old version in the session scratchpad). Review: 3 medium + 5 low fixed, then one low and a nit of the narrow round, fixed (reported by a subagent, not re-run).
- WP-41 built: client, limiter, breaker, fixture server, golden fixtures, translators, reference source, `legacy:ping`, boot check, Telescope filter. A code review and a security review of `6d365a4` found 2 high (the breaker inert on Redis — AM-119; an unmapped `RequestException` quoting the body) and mediums; all fixed with tests (the reviews are subagent reports; the fixes are verified by the suites above).
- Step 8 of WP-41 could not run on the developer's database (4 migrations of `main` pending: `php artisan migrate:status`); the same path ran in `tinker` in `local` (fixtures through Redis).

## Waiting for the developer (do NOT start on your own)
1. **The click on the permission prompt of `gh pr merge`** for every merge.
2. **`php artisan migrate` on the local dev database** (`homi_db`, 4 pending migrations of WP-10 and WP-40) — the developer's database, not migrated by an agent.
3. **One real `initData` of the dev bot** checked with `php <scratchpad>/wp40/check-initdata.php <file>` (pass/fail only).
4. **Production track:** WP-40's needs; WP-41's key and env keys; the deploy carries #117, #119, #123.
5. **Forwarding the prompt** `docs/handoff/second-developer-prompt.md` to the second developer; **CLAUDE.md** (tests on PostgreSQL in CI, the WP-40/41 sentences) and a pointer to the prompt in `HANDOFF.md` §7 / `setup.md`: shared-file PRs, proposed, not opened.
6. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.

## Gotchas learned this session
- **Redis returns a stored number as a numeric string** (the array store of the tests returns the int): read cache numbers with `is_numeric` + cast; `increment()` returns an int on both (AM-119).
- **Laravel matches HTTP fakes in registration order:** a second `Http::fake()` in a test does not replace the first; drive one fake from a queue (`LegacyBreakerTest`). A fake that throws records no request.
- `env()` returns `''` for a blank `.env.example` line, not the default: config files map blank to the default (AM-117).
- CI's backend job runs the Feature suite on **PostgreSQL** (AM-113); the local PostgreSQL is on Asia/Tashkent and the `pgsql` connection sets UTC (AM-114); use `DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD=` for `homi_test`.
- Reading `backend/.env` is refused; read values with `php artisan config:show` (on a server `config:show legacy` would print the service key: use `legacy.auth`).
- zsh does not split `$FILES`: stage named paths.
- Next numbers: AM-120, KI-72, ADR 0021, DEC-110. The second session takes the next free numbers too (DEC-109): grep its open PRs before a push.

## Active subagent work at handoff
- None running.
