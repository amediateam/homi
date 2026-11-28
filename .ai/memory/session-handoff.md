---
updated: 2026-11-28 (WP-44 personal lists, reports, surveys in review on `feat/wp-44-personal-lists`; WP-43 merged as #133 `d3c96aa`, env #132 `86a1a95`; DEC-112)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track**. The production track's state is in `docs/ai/reports/production-notes.md`.

## Developer's standing instruction
- 2026-11-09 … 2026-11-23 (verbatim in earlier handoffs and `docs/migration/decisions/`): «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.»; rule 6; no new dependencies, staging or production without the first developer; «задай все свои вопросы по одному и с вариантами ответа».
- 2026-11-21, **in force** (rule 8 of `docs/migration/wave-1/README.md`): «мы достаточно детальный план разработки сделали! так что не нужно ждатьь моего одоброение надо без останоки по плану делать! Ели только вопросы не возникнуть!».
- 2026-11-26: «тебе самом сложно проверить .env делай сам не срашивай» (check env values with `php artisan config:show <key>`); «продолжай по плану WP-41»; DEC-104 … DEC-109 (`docs/migration/decisions/2026-11-26-developer-answers.md`).
- 2026-11-27: on #128/#129 «Сливай оба (Рекомендуется)»; on the previews' wait «Ждать до 4 с, без пропусков (Рекомендуется)» = DEC-110; on #130/#131 «Сливай оба (Рекомендуется)»; on `backend/lang` «Создать backend/lang (Рекомендуется)» = DEC-111 (`docs/migration/decisions/2026-11-27-developer-answers.md`). The developer's «q» of the same day was answered with a question (stop or not) and not answered; work went on.
- 2026-11-28: on #132/#133 «Сливай оба (Рекомендуется)»; on the vote floor «3 голосующих + пороги 4.0/4.5» = DEC-112 (`docs/migration/decisions/2026-11-28-developer-answers.md`).

## State at handoff
- `main` = `d3c96aa` (#133 WP-43, #132 its env keys). Open: the WP-44 PR #134 (`feat/wp-44-personal-lists`, worktree `.worktrees/wp44`; no env PR — WP-44 has no env key); `gh pr merge --delete-branch` removes the worktree. Review snapshots `.worktrees/wp44review-{a,b,c}` are plain directories (gitignored): delete them after the merge.
- **Two development sessions (DEC-109).** This one: WP-44, then **WP-45** (radars) in queue order. **The second session: WP-62** (frontend only) from `docs/handoff/second-developer-prompt.md`; read its state from its PR (`gh pr list`; none open on 2026-11-28).
- **Waiting for the production track:** WP-42 — the two migrations before the code serves, `AUTHOR_KEY_SECRET`, the photo location; WP-43 — the call page's nginx location before the deploy, `CALL_LINK_SIGNING_KEY`, the bot's token and username; WP-44 — its eight additive migrations before the code serves (spec "Handoff" of each). No flag changes.
- Verify (from the worktree's `backend/`, no `.env` there): `APP_KEY=base64:$(php -r 'echo base64_encode(random_bytes(32));') php artisan test --compact` (3 634 tests, 3 608 passed, 26 skipped) **and** with `DB_CONNECTION=pgsql DB_DATABASE=homi_test DB_HOST=127.0.0.1 DB_USERNAME=$USER DB_PASSWORD=` (3 634 passed), `--testsuite=Pgsql --fail-on-skipped` (26 passed); `vendor/bin/phpstan analyse` (0 errors); `APP_ENV=testing APP_NAME=HOMI` + the pgsql variables: `migrate:fresh --force`, `composer openapi:check` (exit 0).

## Done this session
- WP-43 merged as #133 `d3c96aa` (env #132 `86a1a95`) after green CI on both.
- WP-44 built in two stages by subagents (tables, resolver, lists, blocks, overlay; votes, survey, IDOR matrix), each read by a security-reviewer subagent on a snapshot with its own probes, a fix round each, then a narrow re-review of every fix and one more fix round: 2 medium, 12 low and 12 info findings over the three reviews; every fix has a test that failed before it; 8 low/info items recorded in the spec's "Handoff". The integrator's own fix: legacy files the merge a preview answers. The integrator re-ran every suite above on `28b52b5`.
- DEC-112 recorded; AM-128 … AM-131 in `docs/ai/reports/phase-3-notes.md` §AM; the API README describes the personal methods and the `{number}` format.
- Not run: the e2e suite locally (CI runs it), a walk of the Mini App on the fixtures — the developer's database misses migrations.

## Waiting for the developer (do NOT start on your own)
1. **The merge of #134** (asked with options when CI is green); the click on the permission prompt of `gh pr merge`.
2. **`php artisan migrate` on the local dev database** (`homi_db`: 14 pending — 4 of WP-10/WP-40, 2 of WP-42, 8 of WP-44 after the merge) — the developer's database, not migrated by an agent. Locally `sources.native_stubs` is on, so the overlay and the personal services do not touch it until then.
3. **The env keys of WP-42 and WP-43 in the local `backend/.env`** (`make dev-check` lists them missing; blank values are the defaults): `! printf '\nLEGACY_MEDIA_PUBLIC_URL=\nLEGACY_MEDIA_HOSTS=\nLEGACY_PREVIEWS_MAX_WAIT_MS=\nLEGACY_PREVIEWS_BACKGROUND_WAIT_MS=\nLEGACY_PREVIEWS_DEADLINE_MS=\nLEGACY_CACHE_FILL_WAIT_MS=\nAUTHOR_KEY_SECRET=\nLEGACY_CONTACT_MODE=\nLEGACY_CONTACT_LINK_HOSTS=\nLEGACY_TRANSLATION_VIA=\nLEGACY_TRANSLATION_NAME=\nCALL_LINK_SIGNING_KEY=\nCALL_LINK_SIGNING_KEY_PREVIOUS=\nCONTACT_SOFT_LIMIT=\nCONTACT_HARD_LIMIT=\n' >> backend/.env`. WP-44 adds none.
4. **One real `initData` of the dev bot** checked with `php <scratchpad>/wp40/check-initdata.php <file>` (pass/fail only).
5. **Production track:** WP-40's needs; WP-41's key and env keys; WP-42's migrations, secret and photo location; WP-43's call-page nginx location (before the deploy), signing key and bot settings; WP-44's eight migrations.
6. **Product owner:** the values of `config/votes.php` (DEC-112 proposals) and the reviewer's further proposals (spec "Handoff" of WP-44).
7. **Forwarding the prompt** `docs/handoff/second-developer-prompt.md`; **CLAUDE.md** (tests on PostgreSQL in CI, the WP-40 … 44 sentences) and a pointer to the prompt in `HANDOFF.md` §7 / `setup.md`: shared-file PRs, proposed, not opened.
8. **Dependabot #5, #57 … #60** and **`chore/php-8.6`**: only with the first developer.

## Gotchas learned this session
- The cache refuses objects (`serializable_classes => false`): cache v1 arrays and rehydrate through `fromArray()` (AM-120); Redis returns numbers as strings (AM-119).
- A review snapshot is a plain directory under `.worktrees/` (Pest refuses a path whose folder starts with digits, so not the scratchpad) with `vendor` cloned by `cp -Rc` — a symlinked vendor loads `App\` from the real worktree. Reviewers run SQLite only: parallel PostgreSQL runs on `homi_test` interfere.
- On macOS the scratchpad is case-insensitive: `review-c.md` overwrote `REVIEW-C.md`.
- After any inline fix run the whole suite, not the filtered tests: the preview's merge filing broke two precondition asserts elsewhere.
- In a worktree `migrate:fresh` needs `APP_ENV=testing` and `openapi:check` needs `APP_NAME=HOMI`; `$?` after `cmd | tail` is `tail`'s status.
- Next numbers: AM-132, KI-73, ADR 0021, DEC-113. The second session takes the next free numbers too (DEC-109): grep its open PRs before a push.

## Active subagent work at handoff
- None running.
