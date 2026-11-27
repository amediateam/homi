---
updated: 2026-11-27 (WP-43 contact, translation, share in review on `feat/wp-43-contact-translation-share`, env keys on `chore/wp-43-env-keys`; WP-42 merged; DEC-110, DEC-111)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-23 (verbatim in earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6; no new dependencies, staging or production without the first developer; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!».
- 2026-11-26: «тебе самом сложно проверить .env делай сам не срашивай» (check env values with `php artisan config:show <key>`); «продолжай по плану WP-41»; DEC-104 … DEC-109 (`docs/migration/decisions/2026-11-26-developer-answers.md`).
- 2026-11-27: on #128/#129 «Сливай оба (Рекомендуется)»; on the previews' wait «Ждать до 4 с, без пропусков (Рекомендуется)» = DEC-110; on #130/#131 «Сливай оба (Рекомендуется)»; on `backend/lang` «Создать backend/lang (Рекомендуется)» = DEC-111 (`docs/migration/decisions/2026-11-27-developer-answers.md`). The developer's «q» of the same day was answered with a question (stop or not) and not answered; work went on.

## State at handoff
- `main` = `e2c6361` (#131 WP-42, #130 its env keys). Open: the WP-43 PR #133 (`feat/wp-43-contact-translation-share`, worktree `.worktrees/wp43`) and its env PR #132 (`chore/wp-43-env-keys`, worktree `.worktrees/wp43-env`); `gh pr merge --delete-branch` removes both worktrees.
- **Two development sessions (DEC-109).** This one: WP-43, then **WP-44** (personal lists, reports, surveys; binds the real `OverlayData`) in queue order. **The second session: WP-62** (frontend only) from `docs/handoff/second-developer-prompt.md`; read its state from its PR (`gh pr list`).
- **Waiting for the production track:** WP-42 — the two migrations **before the code serves**, `AUTHOR_KEY_SECRET`, the photo location; WP-43 — the call page's nginx location **before the deploy** (else call tokens reach the access log), `CALL_LINK_SIGNING_KEY`, the bot's token and username (spec "Handoff" of each). No flag changes.
- Verify (from the worktree's `backend/`, no `.env` there): `APP_KEY=base64:$(php -r 'echo base64_encode(random_bytes(32));') php artisan test --compact` (3 061 tests, 3 041 passed, 20 skipped) **and** with `DB_CONNECTION=pgsql DB_DATABASE=homi_test DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD=` (3 061 passed), `--testsuite=Pgsql --fail-on-skipped` (20 passed); `vendor/bin/phpstan analyse` (0 errors); `APP_ENV=testing APP_NAME=HOMI` + the pgsql variables: `migrate:fresh --force`, `composer openapi:check` (exit 0).

## Done this session
- WP-41 merged (#128, #129) after green CI; KI-63's pull test failed once on each (recorded) and passed on rerun.
- WP-42 built in three stages by subagents (fixtures and translators; the source, cursor and preview pool; refs, overlay and views), each reviewed by an independent subagent, then a narrow review of all fixes: 3 high and 11 medium findings, all fixed with tests (list in the spec's "As built"). The integrator re-ran every suite above on `e804673` and the narrow review's masker probes (0 regressions against `main`'s masker, 0 idempotence failures, 540 KB in 0.01 s).
- DEC-110 recorded; AM-120 … AM-123 in `docs/ai/reports/phase-3-notes.md` §AK; the API README lists the overlay and the legacy gaps.
- WP-42 merged as #131 `e2c6361` (env #130 `e8f05d9`) after green CI on both.
- WP-43 built in two stages by subagents (contact; translation and share), each read by a security-reviewer subagent, two fix rounds, then a narrow re-review: 2 medium, 1 medium-low, 20 low and 4 info findings over the three reviews, all fixed with tests (list in the spec's "As built"). The integrator re-ran every suite above on `8f6fc45`.
- Not run: step 9 of WP-42 (a walk of the Mini App on the fixtures) — the developer's database misses migrations.

## Waiting for the developer (do NOT start on your own)
1. **The merge of #132 and #133** (asked with options when CI is green); the click on the permission prompt of `gh pr merge`.
2. **`php artisan migrate` on the local dev database** (`homi_db`: 6 pending — 4 of WP-10/WP-40, 2 of WP-42) — the developer's database, not migrated by an agent. Locally `sources.native_stubs` is on, so the overlay and the WP-43 services do not touch it until then.
3. **The new env keys in the local `backend/.env`** (`make dev-check` lists them missing; blank values are the defaults): WP-42's seven (merged) and, after #132 merges, WP-43's eight: `! printf '\nLEGACY_MEDIA_PUBLIC_URL=\nLEGACY_MEDIA_HOSTS=\nLEGACY_PREVIEWS_MAX_WAIT_MS=\nLEGACY_PREVIEWS_BACKGROUND_WAIT_MS=\nLEGACY_PREVIEWS_DEADLINE_MS=\nLEGACY_CACHE_FILL_WAIT_MS=\nAUTHOR_KEY_SECRET=\nLEGACY_CONTACT_MODE=\nLEGACY_CONTACT_LINK_HOSTS=\nLEGACY_TRANSLATION_VIA=\nLEGACY_TRANSLATION_NAME=\nCALL_LINK_SIGNING_KEY=\nCALL_LINK_SIGNING_KEY_PREVIOUS=\nCONTACT_SOFT_LIMIT=\nCONTACT_HARD_LIMIT=\n' >> backend/.env`.
4. **One real `initData` of the dev bot** checked with `php <scratchpad>/wp40/check-initdata.php <file>` (pass/fail only).
5. **Production track:** WP-40's needs; WP-41's key and env keys; WP-42's migrations, secret and photo location; WP-43's call-page nginx location (before the deploy), signing key and bot settings.
6. **Forwarding the prompt** `docs/handoff/second-developer-prompt.md`; **CLAUDE.md** (tests on PostgreSQL in CI, the WP-40/41/42 sentences) and a pointer to the prompt in `HANDOFF.md` §7 / `setup.md`: shared-file PRs, proposed, not opened.
7. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.

## Gotchas learned this session
- The cache refuses objects (`serializable_classes => false`): cache v1 arrays and rehydrate through `fromArray()` (AM-120); Redis returns numbers as strings (AM-119).
- A masker regex fix is easy to make weaker than before: compare against a frozen copy of the old masker (`tests/Support/LegacyPhoneMaskerOfWp12.php`) over generated texts, not only against examples.
- `ListingOverlay` is `scoped`: a test that rebinds `OverlayData` after it was resolved calls `app()->forgetScopedInstances()`; the router caches controllers, so take the overlay per call.
- In a worktree `migrate:fresh` needs `APP_ENV=testing` (else it runs as production and refuses) and `openapi:check` needs `APP_NAME=HOMI` (else the title changes).
- `$?` after `cmd | tail` is `tail`'s status: capture a command's exit code before piping.
- Next numbers: AM-128, KI-73, ADR 0021, DEC-112. The second session takes the next free numbers too (DEC-109): grep its open PRs before a push.

## Active subagent work at handoff
- None running.
