---
updated: 2026-11-27 (WP-42 listings through legacy in review on `feat/wp-42-listings-legacy`, env keys on `chore/wp-42-env-keys`; WP-41 merged; DEC-110)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-23 (verbatim in earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6; no new dependencies, staging or production without the first developer; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!».
- 2026-11-26: «тебе самом сложно проверить .env делай сам не срашивай» (check env values with `php artisan config:show <key>`); «продолжай по плану WP-41»; DEC-104 … DEC-109 (`docs/migration/decisions/2026-11-26-developer-answers.md`).
- 2026-11-27: on #128/#129 «Сливай оба (Рекомендуется)»; on the previews' wait «Ждать до 4 с, без пропусков (Рекомендуется)» = DEC-110 (`docs/migration/decisions/2026-11-27-developer-answers.md`).

## State at handoff
- `main` = `1096636` (#129; WP-41 merged as #128 `84a4387`). Open: the WP-42 PR #131 (`feat/wp-42-listings-legacy`, worktree `.worktrees/wp42`) and its env PR #130 (`chore/wp-42-env-keys`, worktree `.worktrees/wp42-env`); remove both worktrees after the merge.
- **Two development sessions (DEC-109).** This one: WP-42, then **WP-43** (contact, translation, share; depends on WP-42) and WP-44 in queue order. **The second session: WP-62** (frontend only) from `docs/handoff/second-developer-prompt.md`; read its state from its PR (`gh pr list`).
- **WP-42 waits for the production track after its merge**, in order: the two migrations (`listing_refs`, `listing_views`) **before the code serves** — staging and production run the overlay on stubs; `AUTHOR_KEY_SECRET`; the nginx photo location and `LEGACY_MEDIA_PUBLIC_URL` (spec "Handoff"). No flag changes.
- Verify (from the worktree's `backend/`, no `.env` there): `APP_KEY=base64:$(php -r 'echo base64_encode(random_bytes(32));') php artisan test --compact` (2 731 tests, 2 714 passed, 17 skipped) **and** with `DB_CONNECTION=pgsql DB_DATABASE=homi_test DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD=` (2 731 passed), `--testsuite=Pgsql --fail-on-skipped` (17 passed); `vendor/bin/phpstan analyse` (0 errors); `APP_ENV=testing APP_NAME=HOMI` + the pgsql variables: `migrate:fresh --force`, `composer openapi:check` (exit 0).

## Done this session
- WP-41 merged (#128, #129) after green CI; KI-63's pull test failed once on each (recorded) and passed on rerun.
- WP-42 built in three stages by subagents (fixtures and translators; the source, cursor and preview pool; refs, overlay and views), each reviewed by an independent subagent, then a narrow review of all fixes: 3 high and 11 medium findings, all fixed with tests (list in the spec's "As built"). The integrator re-ran every suite above on `e804673` and the narrow review's masker probes (0 regressions against `main`'s masker, 0 idempotence failures, 540 KB in 0.01 s).
- DEC-110 recorded; AM-120 … AM-123 in `docs/ai/reports/phase-3-notes.md` §AK; the API README lists the overlay and the legacy gaps.
- Not run: step 9 of WP-42 (a walk of the Mini App on the fixtures) — the developer's database misses migrations.

## Waiting for the developer (do NOT start on your own)
1. **The merge of #130 and #131** (asked with options when CI is green); the click on the permission prompt of `gh pr merge`.
2. **`php artisan migrate` on the local dev database** (`homi_db`: 4 migrations of WP-10/WP-40 and the 2 of WP-42 after the merge) — the developer's database, not migrated by an agent. Locally `sources.native_stubs` is on, so the overlay does not touch the new tables until then.
3. **The 7 new env keys in the local `backend/.env`** after #130 merges (`make dev-check` lists them missing; blank values are the defaults): `! printf '\nLEGACY_MEDIA_PUBLIC_URL=\nLEGACY_MEDIA_HOSTS=\nLEGACY_PREVIEWS_MAX_WAIT_MS=\nLEGACY_PREVIEWS_BACKGROUND_WAIT_MS=\nLEGACY_PREVIEWS_DEADLINE_MS=\nLEGACY_CACHE_FILL_WAIT_MS=\nAUTHOR_KEY_SECRET=\n' >> backend/.env`.
4. **One real `initData` of the dev bot** checked with `php <scratchpad>/wp40/check-initdata.php <file>` (pass/fail only).
5. **Production track:** WP-40's needs; WP-41's key and env keys; WP-42's migrations, secret and photo location.
6. **Forwarding the prompt** `docs/handoff/second-developer-prompt.md`; **CLAUDE.md** (tests on PostgreSQL in CI, the WP-40/41/42 sentences) and a pointer to the prompt in `HANDOFF.md` §7 / `setup.md`: shared-file PRs, proposed, not opened.
7. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.

## Gotchas learned this session
- The cache refuses objects (`serializable_classes => false`): cache v1 arrays and rehydrate through `fromArray()` (AM-120); Redis returns numbers as strings (AM-119).
- A masker regex fix is easy to make weaker than before: compare against a frozen copy of the old masker (`tests/Support/LegacyPhoneMaskerOfWp12.php`) over generated texts, not only against examples.
- `ListingOverlay` is `scoped`: a test that rebinds `OverlayData` after it was resolved calls `app()->forgetScopedInstances()`; the router caches controllers, so take the overlay per call.
- In a worktree `migrate:fresh` needs `APP_ENV=testing` (else it runs as production and refuses) and `openapi:check` needs `APP_NAME=HOMI` (else the title changes).
- `$?` after `cmd | tail` is `tail`'s status: capture a command's exit code before piping.
- Next numbers: AM-124, KI-73, ADR 0021, DEC-111. The second session takes the next free numbers too (DEC-109): grep its open PRs before a push.

## Active subagent work at handoff
- None running.
